// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: лента последних действий для отзыва (B-134) — что человек делал
// перед тем, как нажал «Что-то не так?». Без неё поломку разбирают по одному кадру
// экрана: видно, что сломалось, и не видно, после чего.
//
// Лента живёт только в памяти страницы: ушёл со страницы — ленты нет. Ни в браузере,
// ни на сервере между заходами она не хранится.
//
// Названия действий — закрытый список, заданный кодом. Произвольную строку сюда не
// положить: `отметить` молча отбрасывает всё, чего нет в `КОДЫ`, а имя команды ядра
// превращается в код по `кодКоманды` — незнакомая команда не даёт ничего. Поэтому в
// отзыв не могут попасть ни имя работы, ни имя узла, ни имя файла: лента говорит,
// ЧТО человек делал, а не над чем. По-русски коды называет оболочка
// (таблица `ДЕЙСТВИЯ` в cad-app `src/routes/feedback.js`).

/** Что умеет отметить мастерская 3D. Больше кодов — только вместе с оболочкой. */
export const КОДЫ: ReadonlySet<string> = new Set([
    "shape_add",
    "shape_edit",
    "shape_delete",
    "boolean",
    "measure",
    "plane",
    "import",
    "export",
    "undo",
    "redo",
    "save",
    "download",
    "open",
]);

/** Больше десяти уже не читают, а письмо растёт. Столько же держит оболочка. */
const ГЛУБИНА = 10;

let лента: string[] = [];

/** Отметить действие. Незнакомый код — не ошибка, просто ничего не происходит. */
export function отметить(код: string): boolean {
    if (!КОДЫ.has(код)) return false;
    лента.push(код);
    if (лента.length > ГЛУБИНА) лента.shift();
    return true;
}

/** Хвост ленты для отзыва — копией, чтобы её нельзя было испортить снаружи. */
export function лентаДействий(): string[] {
    return лента.slice();
}

/** Забыть ленту (нужно тестам; на странице её и так уносит перезагрузка). */
export function забытьДействия(): void {
    лента = [];
}

/**
 * Имя команды ядра → код действия. Разбираем по началу имени, а не перечисляем сто
 * команд поимённо: список команд растёт с апстримом, и забытая команда должна просто
 * не попасть в ленту, а не попасть в неё своим именем.
 *
 * Что не названо здесь (вид камеры, привязки, выбор) — не действие над работой,
 * и в ленте ему нечего делать.
 */
export function кодКоманды(имя: string): string | null {
    if (имя === "edit.undo") return "undo";
    if (имя === "edit.redo") return "redo";
    if (имя === "doc.save") return "save";
    if (имя === "doc.saveToFile") return "download";
    if (имя === "doc.open" || имя === "doc.new") return "open";
    if (имя === "file.import") return "import";
    if (имя === "file.export") return "export";
    if (имя.startsWith("create.")) return "shape_add";
    if (имя.startsWith("boolean.")) return "boolean";
    if (имя.startsWith("measure.")) return "measure";
    if (имя.startsWith("workingPlane.")) return "plane";
    if (имя.startsWith("convert.")) return "shape_edit";
    if (имя.startsWith("modify.")) {
        return имя.startsWith("modify.delete") || имя.startsWith("modify.remove")
            ? "shape_delete"
            : "shape_edit";
    }
    return null;
}

/** Отметить выполненную команду ядра. Незнакомая — молча мимо ленты. */
export function отметитьКоманду(имя: unknown): boolean {
    const код = typeof имя === "string" ? кодКоманды(имя) : null;
    return код ? отметить(код) : false;
}
