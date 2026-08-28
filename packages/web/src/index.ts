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
import { Loading } from "./loading";

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

async function openProject(app: IApplication, autoSave: AutoSave) {
    const id = projectId();
    if (!id) return;

    const document = await Document.open(app, id);
    if (!document) return;

    autoSave.watch(document);
    autoSave.attachUnloadGuard(document);

    // Домашний экран редактора скрываем: список работ живёт в кабинете оболочки.
    PubSub.default.pub("displayHome", false);
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
