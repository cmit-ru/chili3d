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

import { Document } from "@chili3d/app";
import { AppBuilder } from "@chili3d/builder";
import { type IApplication, PubSub } from "@chili3d/core";
import { type CloudStorage, projectIdFromLocation } from "@chili3d/storage";
import { SaveIndicator } from "@chili3d/ui";
import { AutoSave } from "./autoSave";
import { CoreGuard } from "./coreGuard";
import { type LessonCard, LessonPanel } from "./lessonPanel";
import { Loading } from "./loading";
import { ScreenLock } from "./screenLock";
import { UserBadge } from "./userBadge";

const loading = new Loading();
document.body.appendChild(loading);

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

async function openProject(app: IApplication, autoSave: AutoSave) {
    const id = projectId();
    if (!id) return;

    const meta = await fetchMeta(id);

    // Работа могла быть ещё не начата (в облаке пусто) или сохранена другой
    // версией формата — тогда открывать нечего, начинаем с чистой сцены.
    // Без этого ребёнок попадал на домашний экран Chili3D вместо своей работы.
    let doc = await Document.open(app, id).catch(() => undefined);
    if (!doc) {
        doc = await app.newDocument(meta?.title ?? "Моя работа");
        await doc.save();
    }

    autoSave.watch(doc);
    autoSave.attachUnloadGuard(doc);

    // Домашний экран редактора скрываем: список работ живёт в кабинете оболочки.
    PubSub.default.pub("displayHome", false);

    if (meta?.user) {
        new UserBadge({
            name: meta.user.name,
            avatar: meta.user.avatar,
            role: meta.user.role,
            readOnly: Boolean(meta.readOnly),
        });
    }
    if (meta?.card?.steps?.length) {
        new LessonPanel(meta.card, id);
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

    if (meta?.user && meta.user.role === "student") {
        new ScreenLock({
            minutes: meta.lockMinutes ?? 10,
            userName: meta.user.name,
            userAvatar: meta.user.avatar,
            hasUnsaved: () => autoSave.hasPending(),
            flush: () => autoSave.saveNow(doc),
        });
    }
}

async function handleApplicaionBuilt(app: IApplication) {
    const autoSave = new AutoSave(app);
    attachSaveIndicator(app, autoSave);

    try {
        await openProject(app, autoSave);
    } catch (error) {
        console.warn("[project]", error);
    }

    loading.dispose();
    loading.remove();
}

// prettier-ignore
new AppBuilder()
    .useCloudStorage()
    .useWasmOcc()
    .useThree()
    .useUI()
    .build()
    .then(handleApplicaionBuilt)
    .catch((err) => {
        // Экран «не загрузилось» с понятным текстом вместо системного alert
        loading.showError(err?.message ?? String(err));
    });
