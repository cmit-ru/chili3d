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
//   • подключены автосохранение и каркас мастерской (B-103).

import { AppBuilder } from "@chili3d/builder";
import {
    type IApplication,
    type IDocument,
    type INode,
    type INodeLinkedList,
    PubSub,
    Serializer,
    VisualNode,
} from "@chili3d/core";
import {
    type CloudStorage,
    projectIdFromLocation,
    sandboxFromLocation,
    takeDeferredNodes,
} from "@chili3d/storage";
import { AiOps } from "./aiOps";
import { AutoSave } from "./autoSave";
import { openConflictDialog } from "./conflictDialog";
import { CoreGuard } from "./coreGuard";
import { enableEconomyIfNeeded } from "./economy";
import { subscribeCoreErrors } from "./errorBanner";
import { Feedback } from "./feedback";
import { FirstHint } from "./firstHint";
import { type CopyAnswer, FrameBar } from "./frameBar";
import { GuestSave } from "./guestSave";
import { type LessonCard, LessonPanel } from "./lessonPanel";
import { Loading } from "./loading";
import { ModelSpinner } from "./modelSpinner";
import { SandboxNotice } from "./sandboxNotice";
import { ScreenLock } from "./screenLock";
import { SourceNotice } from "./sourceNotice";
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

interface ProjectMeta {
    title?: string;
    card: LessonCard | null;
    user: { id?: number | string; name: string; avatar: string; role: string };
    lockMinutes: number;
    /** Куда ведёт знак «Макетка»: решает сервер, а не роль (регрессия 31.08). */
    backTo?: string;
    readOnly?: boolean;
    showHint?: boolean;
    sharedPc?: boolean;
    economyMode?: boolean;
    viewingOthers?: boolean;
    isExample?: boolean;
    ownerName?: string;
}

/** Открытая работа: каркас собран раньше неё и спрашивает её через эту ссылку. */
let currentDoc: IDocument | undefined;
/** Окна, которые каркас только открывает: заводит их `openProject`. */
let feedbackWindow: Feedback | undefined;
let guestWindow: GuestSave | undefined;

/** Подпись возврата рядом со знаком; у запасного `/home` её нет. */
const BACK_LABELS: Record<string, string> = {
    "/projects": "← Мои работы",
    "/projects/examples": "← К примерам",
    "/teach": "← К группам",
};

/** Все фигуры работы: «Скачать» берёт работу целиком, выделение не требуется. */
function allVisualNodes(doc: IDocument): VisualNode[] {
    const found: VisualNode[] = [];
    const walk = (node: INode | undefined) => {
        let current = node;
        while (current) {
            if (current instanceof VisualNode) found.push(current);
            const child = (current as { firstChild?: INode }).firstChild;
            if (child) walk(child);
            current = current.nextSibling;
        }
    };
    walk(doc.modelManager.rootNode.firstChild);
    return found;
}

/** «Сделать копию», «Забрать себе» и кнопка плашки просмотра — одна ручка. */
async function copyWork(id: string): Promise<CopyAnswer> {
    try {
        const response = await fetch(`/api/projects/${id}/copy`, {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
        });
        const answer = (await response.json().catch(() => null)) as {
            id?: number;
            title?: string;
            message?: string;
        } | null;
        // 409 — упёрлись в предел числа работ. Текст отказа пишет сервер: там
        // сказано, сколько работ и что с ними делать.
        if (response.status === 409 && answer?.message) return { refused: answer.message };
        if (!response.ok || !answer?.id) return null;
        // Номер работы приезжает строкой (`bigserial` + драйвер `pg`): приводим
        // сразу, чтобы дальше его можно было сравнивать с номером из адреса.
        return { id: Number(answer.id), title: answer.title ?? "Копия" };
    } catch {
        return null;
    }
}

/**
 * Каркас собирается до открытия работы: полоса с именем и состоянием должна
 * стоять на месте, даже если работа откроется не сразу или не откроется вовсе.
 * Всё, что зависит от документа, каркас спрашивает через `currentDoc`.
 */
function mountFrame(app: IApplication, autoSave: AutoSave, meta: ProjectMeta | null): FrameBar {
    const id = projectId();
    const sandbox = !id && sandboxFromLocation();
    const storage = app.storage as unknown as CloudStorage;
    const viewing = Boolean(meta?.viewingOthers || meta?.isExample);

    const frame = new FrameBar({
        projectId: id,
        // В песочнице работы ещё нет — и имени у неё нет тоже.
        title: sandbox ? "Проба" : (meta?.title ?? "Моя работа"),
        user: meta?.user ?? null,
        viewing,
        isExample: Boolean(meta?.isExample),
        sandbox,
        sharedPc: Boolean(meta?.sharedPc),
        saveNow: async () => {
            if (currentDoc) await autoSave.saveNow(currentDoc);
        },
        hasPending: () => autoSave.hasPending(),
        openConflict: (info) =>
            openConflictDialog({
                info,
                // Обе ветки сначала сохраняют копию: нажатием работу не потерять.
                saveCopy: () => storage.saveAsCopy(currentDoc?.serialize()),
            }),
        copy: id ? () => copyWork(id) : undefined,
        // Имя живёт ещё и в теле работы: переносим туда ответ сервера.
        applyTitle: (title) => {
            if (currentDoc) currentDoc.name = title;
        },
        feedback: () => feedbackWindow?.open(),
        guestSave: () => guestWindow?.open("register"),
        download: {
            workTitle: () => currentDoc?.name ?? meta?.title ?? "Работа",
            selectedCount: () => app.activeView?.document.selection.getSelectedNodeLength() ?? 0,
            exportModel: async (type, onlySelected) => {
                const doc = app.activeView?.document;
                if (!doc) return undefined;
                const nodes = onlySelected ? doc.selection.getSelectedVisualNodes() : allVisualNodes(doc);
                if (nodes.length === 0) return undefined;
                return app.dataExchange.export(type, nodes);
            },
            screenshot: () => app.activeView?.toImage(),
            workFile: () => (currentDoc ? JSON.stringify(currentDoc.serialize()) : undefined),
        },
    });

    if (typeof storage?.onStateChange === "function") {
        storage.onStateChange((state, info) => {
            frame.setSaveState(state, info);
            // После расхождения дальше решает ребёнок: продолжать писать поверх
            // чужой свежей версии нельзя (ТЗ, acceptance 5).
            if (state === "conflict") autoSave.stop();
        });
    }

    // Знак «Макетка» — обычная ссылка, но уход через неё тоже сначала досылает
    // правки: одно правило на все двери.
    const sign = document.querySelector<HTMLAnchorElement>('a[data-frame-zone="знак"]');
    if (sign) frame.guardLink(sign);

    return frame;
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
    if (!doc) doc = await app.newDocument("Проба");
    currentDoc = doc;

    // Собранное в песочнице можно забрать себе, не уходя со страницы (B-096):
    // регистрация и вход происходят в оверлее поверх мастерской, а сцена
    // уезжает на сервер тем же движением. Ссылки, уводившие на /auth/register,
    // теряли её вместе со страницей.
    const scene = doc;
    const guest = new GuestSave({ scene: () => scene.serialize() });
    // Тот же оверлей открывает пункт «Сохранить работу» в меню работы.
    guestWindow = guest;
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
    frame: FrameBar,
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
    // Источник правды имени — `projects.title` в оболочке: тело работы могло
    // остаться со старым именем, переименование туда не переносится.
    if (meta?.title) doc.name = meta.title;
    currentDoc = doc;

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
            isExample: meta.isExample,
            canEdit: !meta.readOnly,
            onEdit: () => {
                editingEnabled = true;
                frame.startEditing();
                startSaving();
                sendGrant();
                window.setInterval(sendGrant, 5 * 60_000);
            },
            onCopy: async () => {
                const answer = await copyWork(id);
                return answer && "id" in answer ? answer.id : null;
            },
        });
    } else {
        startSaving();
    }

    if (meta?.card?.steps?.length) {
        // Ключ отметок привязан к ученику: на общем компьютере класса следующий
        // ребёнок не должен видеть чужие галочки.
        new LessonPanel(meta.card, id, String(meta.user?.id ?? "гость"));
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
        // Тот же отзыв открывает пункт «Что-то не так?» в меню человека.
        feedbackWindow = new Feedback({
            projectId: id,
            // Роль отправителя пишет оболочка по сессии — слову клиента тут веры нет.
            context: () => ({
                rev: storage?.currentRevision?.(id) ?? 0,
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
    // Системное окно браузера «Изменения могут не сохраниться» ставит апстримный
    // `app/src/application.ts:85` — и показывает его всегда, даже когда всё
    // сохранено. Оно пугает ребёнка чужими словами и приучает нажимать «Уйти»,
    // не читая; про несохранённое у нас говорит каркас своими словами.
    window.onbeforeunload = null;

    // Ошибки ядра — баннером с крестиком, а не тостом на три секунды: тост
    // уезжает раньше, чем ребёнок успевает прочитать, что не построилось.
    subscribeCoreErrors(PubSub.default);

    const autoSave = new AutoSave(app);
    const frame = mountFrame(app, autoSave, earlyMeta);

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
        await openProject(app, autoSave, earlyMeta, frame, spinner);
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
    // Куда ведёт знак «Макетка» — знает лента, а она собирается вместе с
    // приложением. Поэтому адрес кладём в глобальную переменную до сборки:
    // пакет `ui` про нашу оболочку не знает и знать не должен.
    if (meta?.backTo) {
        (globalThis as { MAKETKA_BACK_TO?: { href: string; label?: string } }).MAKETKA_BACK_TO = {
            href: meta.backTo,
            label: BACK_LABELS[meta.backTo],
        };
    }
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
