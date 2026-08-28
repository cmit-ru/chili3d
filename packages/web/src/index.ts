// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: загрузка плагинов и файлов по параметрам URL удалена целиком
// (INV-006). В upstream `?plugin=`, `?url=` и `?model=` исполняли и открывали
// произвольный код и файлы на том же origin, где живёт сессия ребёнка.

import { AppBuilder } from "@chili3d/builder";
import type { IApplication } from "@chili3d/core";
import type { CloudStorage } from "@chili3d/storage";
import { SaveIndicator } from "@chili3d/ui";
import { Loading } from "./loading";

const loading = new Loading();
document.body.appendChild(loading);

function attachSaveIndicator(app: IApplication) {
    const storage = app.storage as unknown as CloudStorage;
    if (typeof storage?.onStateChange !== "function") return;

    const indicator = new SaveIndicator();
    document.body.appendChild(indicator);
    storage.onStateChange((state, info) => indicator.setState(state, info));

    // Обе ветки разбора расхождения сначала сохраняют копию текущих правок:
    // ребёнок не должен потерять работу ни одним нажатием (ТЗ, acceptance 5).
    indicator.onResolveConflict = async (keepMine: boolean) => {
        const document = app.activeView?.document;
        const body = document ? document.serialize() : undefined;
        const copy = await storage.saveAsCopy(body);
        if (keepMine) {
            indicator.setState(copy ? "saved" : "error");
            if (copy) window.location.search = `?project=${copy.id}`;
            return;
        }
        window.location.reload();
    };
}

function handleApplicaionBuilt(app: IApplication) {
    loading.dispose();
    document.body.removeChild(loading);
    attachSaveIndicator(app);
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
        // Экран «не загрузилось» вместо системного alert без объяснений
        loading.showError(err?.message ?? String(err));
    });
