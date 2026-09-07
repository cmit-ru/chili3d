// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Общий приём для двух рисовальщиков списка шрифтов — панели свойств
// (property/selectProperty.ts) и панели активной команды (ribbon/commandContext.ts):
// если подпись пункта совпадает с именем уже загруженного шрифта (app/src/text/fonts.ts
// регистрирует их в document.fonts под собственным именем), нарисовать пункт этим же
// шрифтом, чтобы ребёнок выбирал глазами, а не по названию вслепую. На остальные списки
// (не про шрифты) это не влияет — их подписи ни с одним загруженным шрифтом не совпадают.

/** Стиль для `<option>`: `fontFamily`, если `метка` — имя загруженного шрифта, иначе пусто. */
export function fontPreviewStyle(метка: string): { fontFamily?: string } {
    return шрифтЗагружен(метка) ? { fontFamily: `"${метка}", sans-serif` } : {};
}

function шрифтЗагружен(имя: string): boolean {
    if (typeof document === "undefined" || !document.fonts?.check) return false;
    try {
        return document.fonts.check(`16px "${имя}"`);
    } catch {
        return false;
    }
}
