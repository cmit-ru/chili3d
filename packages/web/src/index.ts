// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: загрузка плагинов и файлов по параметрам URL удалена целиком
// (INV-006). В upstream `?plugin=`, `?url=` и `?model=` исполняли и открывали
// произвольный код и файлы на том же origin, где живёт сессия ребёнка.

import { AppBuilder } from "@chili3d/builder";
import type { IApplication } from "@chili3d/core";
import { Loading } from "./loading";

const loading = new Loading();
document.body.appendChild(loading);

function handleApplicaionBuilt(_app: IApplication) {
    document.body.removeChild(loading);
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
