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
import type { CloudStorage } from "@chili3d/storage";
import { SaveIndicator } from "@chili3d/ui";
import { AutoSave } from "./autoSave";
import { type LessonCard, LessonPanel } from "./lessonPanel";
import { Loading } from "./loading";
import { ScreenLock } from "./screenLock";

const loading = new Loading();
document.body.appendChild(loading);

function projectId(): string | null {
    const value = new URLSearchParams(window.location.search).get("project");
    return value && /^\d+$/.test(value) ? value : null;
}

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
            window.location.search = `?project=${copy.id}`;
            return;
        }
        window.location.reload();
    };
}

interface ProjectMeta {
    card: LessonCard | null;
    user: { name: string; avatar: string; role: string };
    lockMinutes: number;
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

    const doc = await Document.open(app, id);
    if (!doc) return;

    autoSave.watch(doc);
    autoSave.attachUnloadGuard(doc);

    // Домашний экран редактора скрываем: список работ живёт в кабинете оболочки.
    PubSub.default.pub("displayHome", false);

    const meta = await fetchMeta(id);
    if (meta?.card?.steps?.length) {
        new LessonPanel(meta.card, id);
    }
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
