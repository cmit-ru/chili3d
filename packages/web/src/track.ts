// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: события метрик из редактора (ТЗ §9).
//
// Имена событий фиксированы каталогом оболочки (`src/events.js`): незнакомое
// имя она отбрасывает с предупреждением в журнал, поэтому придумывать здесь
// новые нельзя. Аналитика никогда не мешает работе: ошибку запроса глотаем.

import { projectIdFromLocation } from "@chili3d/storage";

export function sendEvent(event: string, props: Record<string, unknown> = {}): void {
    // Вне работы (песочница, домашний экран) событий нет: они привязаны к
    // работе, а оболочка о песочнице узнаёт своими средствами.
    const id = projectIdFromLocation();
    if (!id) return;
    void fetch("/api/events", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            events: [{ event, props, projectId: Number(id), ts: new Date().toISOString() }],
        }),
    }).catch(() => undefined);
}
