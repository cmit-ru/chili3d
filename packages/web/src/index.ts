// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: точка входа редактора.
//
// Отличия от upstream:
//   • загрузка плагинов и файлов по параметрам URL удалена целиком (INV-006):
//     `?plugin=`, `?url=` и `?model=` исполняли и открывали произвольный код
//     на том же origin, где живёт сессия ребёнка;
//   • работа открывается сразу по адресу, который передала оболочка, —
//     домашний экран Chili3D не показывается: он дублировал бы кабинет;
//   • подключены автосохранение и индикатор состояния.

import { AppBuilder } from "@chili3d/builder";
import { type IApplication, type IDocument, type INodeLinkedList, Serializer } from "@chili3d/core";
import {
    type CloudStorage,
    projectIdFromLocation,
    sandboxFromLocation,
    takeDeferredNodes,
} from "@chili3d/storage";
import { SaveIndicator } from "@chili3d/ui";
import { AiOps } from "./aiOps";
import { AutoSave } from "./autoSave";
import { CoreGuard } from "./coreGuard";
import { enableEconomyIfNeeded } from "./economy";
import { Feedback } from "./feedback";
import { FirstHint } from "./firstHint";
import { GuestSave } from "./guestSave";
import { type LessonCard, LessonPanel } from "./lessonPanel";
import { Loading } from "./loading";
import { ModelSpinner } from "./modelSpinner";
import { SandboxNotice } from "./sandboxNotice";
import { ScreenLock } from "./screenLock";
import { SourceNotice } from "./sourceNotice";
import { UserBadge } from "./userBadge";
import { ViewBanner } from "./viewBanner";
import { cachedSceneVolumeMm3 } from "./volume";

const loading = new Loading();
document.body.appendChild(loading);

// AGPL §13: предложение исходников должно быть на странице всегда, а не только
// когда работа успешно открылась. Поэтому — сразу, до сборки приложения.
new SourceNotice();

// Номер работы читаем тем же способом, что и хранилище: после удаления
// страницы-обёртки адрес работы — это путь `/3d/6`, а не `?project=6`.
// Пока здесь смотрели только на параметр запроса, openProject молча выходил:
// ребёнок видел домашний экран Chili3D, без имени, шагов урока и автосохранения.
const projectId = projectIdFromLocation;

function attachSaveIndicator(app: IApplication, autoSave: AutoSave) {
    const storage = app.storage as unknown as CloudStorage;
    if (typeof storage?.onStateChange !== "function") return;

    const indicator = new SaveIndicator();
    document.body.appendChild(indicator);

    storage.onStateChange((state, info) => {
        indicator.setState(state, info);
        // После расхождения дальше решает ребёнок: продолжать писать поверх
        // чужой свежей версии нельзя (ТЗ, acceptance 5).
        if (state === "conflict") autoSave.stop();
    });

    indicator.onResolveConflict = async (keepMine: boolean) => {
        const active = app.activeView?.document;
        const body = active ? active.serialize() : undefined;
        // Обе ветки сначала сохраняют копию: нажатием работу не потерять.
        const copy = await storage.saveAsCopy(body);
        if (keepMine && copy) {
            // Копия — отдельная работа со своим адресом; доступ к ней оболочка
            // проверит тем же подзапросом, что и к исходной.
            window.location.assign(`/3d/${copy.id}`);
            return;
        }
        window.location.reload();
    };
}

interface ProjectMeta {
    title?: string;
    card: LessonCard | null;
    user: { name: string; avatar: string; role: string };
    lockMinutes: number;
    readOnly?: boolean;
    showHint?: boolean;
    sharedPc?: boolean;
    economyMode?: boolean;
    viewingOthers?: boolean;
    ownerName?: string;
}

async function fetchMeta(id: string): Promise<ProjectMeta | null> {
    try {
        const response = await fetch(`/api/projects/${id}`, { credentials: "same-origin" });
        if (!response.ok) return null;
        return (await response.json()) as ProjectMeta;
    } catch {
        return null;
    }
}

/**
 * Песочница с лендинга (без входа): открывается модель-образец, сохранение
 * отключено хранилищем, баннер зовёт зарегистрироваться. Ни автосейва, ни
 * бейджа, ни замка — сессии нет, терять нечего.
 */
async function openSandbox(app: IApplication, spinner?: ModelSpinner) {
    let doc = await app.openDocument("sandbox").catch(() => undefined);
    if (!doc) doc = await app.newDocument("Моя модель");

    // Собранное в песочнице можно забрать себе, не уходя со страницы (B-096):
    // регистрация и вход происходят в оверлее поверх мастерской, а сцена
    // уезжает на сервер тем же движением. Ссылки, уводившие на /auth/register,
    // теряли её вместе со страницей.
    const scene = doc;
    const guest = new GuestSave({ scene: () => scene.serialize() });
    const notice = new SandboxNotice({
        onSave: () => guest.open("register"),
        onLogin: () => guest.open("login"),
    });
    const storage = app.storage as unknown as CloudStorage;
    if (storage) storage.onSandboxSave = () => notice.nudge();

    await addDeferredNodes(doc, spinner);
}

/** Отдаём кадр браузеру: спиннер продолжает крутиться, сцену можно вертеть. */
const nextFrame = () =>
    new Promise<void>((resolve) => {
        requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });

/**
 * Долгие детали образца добавляются по одной, с передышкой между ними. Каждая
 * считается секунды, поэтому разом они превращали мастерскую в замерший экран
 * на четверть минуты (замер — в `cloudStorage.ts`, рядом с отбором таких узлов).
 */
async function addDeferredNodes(doc: IDocument, spinner?: ModelSpinner) {
    const pending = takeDeferredNodes();
    if (pending.length === 0) return;

    for (const [index, data] of pending.entries()) {
        spinner?.setText(`Собираем детали… ${index + 1} из ${pending.length}`);
        await nextFrame();
        try {
            const node = Serializer.deserializeObject(doc, data);
            const parentId = data?.parentId;
            const parent = parentId
                ? (doc.modelManager.findNode((n) => n.id === parentId) as INodeLinkedList | undefined)
                : undefined;
            (parent ?? doc.modelManager.rootNode).add(node);
        } catch (error) {
            // Одна не собравшаяся деталь не должна ронять всю мастерскую.
            console.warn("[sandbox] деталь не добавилась", error);
        }
    }
}

async function openProject(
    app: IApplication,
    autoSave: AutoSave,
    earlyMeta: ProjectMeta | null,
    spinner?: ModelSpinner,
) {
    const id = projectId();
    if (!id) {
        if (sandboxFromLocation()) await openSandbox(app, spinner);
        return;
    }

    const meta = earlyMeta ?? (await fetchMeta(id));

    // Работа могла быть ещё не начата (в облаке пусто) или сохранена другой
    // версией формата — тогда открывать нечего, начинаем с чистой сцены.
    // Без этого ребёнок попадал на домашний экран Chili3D вместо своей работы.
    //
    // Именно app.openDocument, а не Document.open: статический метод только
    // читает документ, но не создаёт 3D-вид. Сохранённая работа открывалась без
    // сцены — пустой экран, а любая команда отвечала «No active document».
    let doc = await app.openDocument(id).catch(() => undefined);
    if (!doc) {
        doc = await app.newDocument(meta?.title ?? "Моя работа");
        await doc.save();
    }

    // Чужая работа открывается в просмотре: автосохранение включается только
    // после явного «Править» — случайная перезапись детской работы невозможна.
    let editingEnabled = !meta?.viewingOthers;
    const startSaving = () => {
        autoSave.watch(doc);
        autoSave.attachUnloadGuard(doc);
    };
    // «Передана на правку» — серверная отметка для помощника (tz-ai.md §5):
    // ставится кнопкой «Править», живёт 30 минут, продлевается активностью вкладки.
    const sendGrant = () =>
        void fetch(`/api/projects/${id}/grant`, {
            method: "POST",
            credentials: "same-origin",
        }).catch(() => undefined);
    if (meta?.viewingOthers) {
        new ViewBanner({
            ownerName: meta.ownerName || "ученик",
            canEdit: !meta.readOnly,
            onEdit: () => {
                editingEnabled = true;
                startSaving();
                sendGrant();
                window.setInterval(sendGrant, 5 * 60_000);
            },
            onCopy: async () => {
                try {
                    const response = await fetch(`/api/projects/${id}/copy`, {
                        method: "POST",
                        credentials: "same-origin",
                    });
                    if (!response.ok) return null;
                    return ((await response.json()) as { id: number }).id;
                } catch {
                    return null;
                }
            },
        });
    } else {
        startSaving();
    }

    if (meta?.user) {
        new UserBadge({
            name: meta.user.name,
            avatar: meta.user.avatar,
            role: meta.user.role,
            readOnly: Boolean(meta.readOnly),
            sharedPc: Boolean(meta.sharedPc),
        });
    }
    if (meta?.card?.steps?.length) {
        new LessonPanel(meta.card, id);
    }
    // Первый вход: три шага «куда нажимать». Отметку ставим сразу по закрытию —
    // если запрос не дошёл, подсказка повторится, и это лучше, чем потерять её.
    if (meta?.showHint) {
        new FirstHint(() => {
            void fetch("/api/hint-seen", { method: "POST", credentials: "same-origin" }).catch(
                () => undefined,
            );
        });
    }
    // Объём модели уезжает с каждым сохранением (B-045): нужен разбору
    // помощника, проверкам карточек и 3D-печати.
    const storage = app.storage as unknown as CloudStorage;
    // Кэш 20 секунд: точный расчёт после пакета прогревает его, автосейв
    // не гоняет полный обход тел каждые несколько секунд (B-051).
    if (storage) storage.volumeProvider = () => cachedSceneVolumeMm3(doc, 20_000);

    // Исполнитель пакетов построения ИИ-помощника (фаза Б): модель собирается
    // на глазах у того, кто открыл работу. Строит только вкладка с правом
    // записи; в просмотре виден лишь прогресс.
    if (!meta?.readOnly) {
        new AiOps(
            app,
            doc,
            id,
            () => editingEnabled,
            () => autoSave.saveNow(doc),
        );
    }

    // Страховка от падения ядра: сохраняем перед рискованной операцией и
    // честно объясняем ребёнку, если геометрия всё-таки не получилась.
    new CoreGuard(
        app,
        () => autoSave.saveNow(doc),
        (event, props) => {
            void fetch("/api/events", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    events: [{ event, props, projectId: Number(id), ts: new Date().toISOString() }],
                }),
            }).catch(() => undefined);
        },
    );

    // Отзыв прямо из мастерской (B-101): «Что-то не так?» в углу, рядом с
    // «Открытым кодом». Гостю кнопку не показываем — отзыв привязан к учётке,
    // иначе его нечем ограничить от потока и некому отвечать.
    if (meta?.user) {
        const role = meta.user.role;
        new Feedback({
            projectId: id,
            context: () => ({
                rev: storage?.currentRevision?.(id) ?? 0,
                роль: role,
                карточка: meta?.card?.title ?? "",
            }),
            // 700 px: рендерер отдаёт JPEG, как только кадр крупнее, — иначе
            // полноразмерный PNG не пролез бы в ограничение отзыва.
            shot: () => app.activeView?.toImage(700) ?? null,
        });
    }

    if (meta?.user && meta.user.role === "student") {
        new ScreenLock({
            minutes: meta.lockMinutes ?? 30,
            // Автовыход к «Кто ты?» — только на общем компьютере класса (ТЗ §4);
            // дома замок информационный и никого не выкидывает.
            autoExitMinutes: meta.sharedPc ? (meta.lockMinutes ?? 10) : 0,
            userName: meta.user.name,
            userAvatar: meta.user.avatar,
            hasUnsaved: () => autoSave.hasPending(),
            flush: () => autoSave.saveNow(doc),
        });
    }
}

async function handleApplicaionBuilt(app: IApplication, earlyMeta: ProjectMeta | null) {
    const autoSave = new AutoSave(app);
    attachSaveIndicator(app, autoSave);

    // Мастерская уже собрана — показываем её, а ожидание модели переносим на
    // накладку со спиннером. Раньше экран загрузки держался до готовности сцены,
    // и на тяжёлой работе ребёнок видел замершую полосу вместо редактора.
    loading.dispose();
    loading.remove();
    const spinner = new ModelSpinner();
    document.body.appendChild(spinner);
    // Без передышки браузер не успеет нарисовать ни мастерскую, ни спиннер:
    // расчёт геометрии идёт в том же потоке и начнётся раньше первой отрисовки.
    await nextFrame();

    try {
        await openProject(app, autoSave, earlyMeta, spinner);
    } catch (error) {
        console.warn("[project]", error);
    }

    spinner.remove();
}

// Мета грузится ДО сборки приложения: флаг «общие компьютеры класса» должен
// успеть включить экономный режим до создания рендерера и мешеров (B-052).
// Лишние ~100 мс на старте несравнимы с загрузкой wasm-ядра.
const earlyMeta: Promise<ProjectMeta | null> = (async () => {
    const id = projectId();
    const meta = id ? await fetchMeta(id) : null;
    enableEconomyIfNeeded(Boolean(meta?.economyMode));
    return meta;
})();

// prettier-ignore
earlyMeta
    .then((meta) =>
        new AppBuilder()
            .useCloudStorage()
            .useWasmOcc()
            .useThree()
            .useUI()
            .build()
            .then((app) => handleApplicaionBuilt(app, meta)),
    )
    .catch((err) => {
        // Экран «не загрузилось» с понятным текстом вместо системного alert
        loading.showError(err?.message ?? String(err));
    });
