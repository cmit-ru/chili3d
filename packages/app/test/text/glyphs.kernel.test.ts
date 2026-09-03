// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Разбор настоящих букв из настоящих файлов шрифтов. Синтетические квадраты в
// textShape.test.ts проверяют правило, а здесь проверяется, что правило сходится
// с тем, как устроены реальные контуры: «О» должна остаться с дыркой, «В» — с
// двумя, «Й» — распасться на букву и краткую, а не слипнуться.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "@rstest/core";
import { parse } from "opentype.js/dist/opentype.mjs";
import { контурыЗнака, сгруппировать } from "../../src/text/textShape";

const КАТАЛОГ = join(__dirname, "../../src/text/fonts");

function шрифт(файл: string) {
    const данные = readFileSync(join(КАТАЛОГ, файл));
    return parse(данные.buffer.slice(данные.byteOffset, данные.byteOffset + данные.byteLength));
}

/** Группы контуров для одного знака при кегле 1000. */
function группыЗнака(файл: string, знак: string) {
    const пути = шрифт(файл).getPaths(знак, 0, 0, 1000);
    return сгруппировать(контурыЗнака(пути[0], { x: 0, y: 0 }, 0.01));
}

// «О» у Bad Script нарисована одним росчерком пера: петля незамкнутая, дырки
// внутри нет. Это свойство рукописного шрифта, а не промах разбора, поэтому
// ожидание для него отдельное.
describe.each([
    ["PT_Sans-Web-Regular.ttf", 2],
    ["PT_Serif-Web-Regular.ttf", 2],
    ["PTM55FT.ttf", 2],
    ["BadScript-Regular.ttf", 1],
    ["RuslanDisplay-Regular.ttf", 2],
])("%s", (файл, контуровВО) => {
    test("«О» — одна грань, дырка по рисунку шрифта", () => {
        const группы = группыЗнака(файл, "О");
        expect(группы).toHaveLength(1);
        expect(группы[0]).toHaveLength(контуровВО);
    });

    test("«В» — одна грань с двумя дырками", () => {
        const группы = группыЗнака(файл, "В");
        expect(группы).toHaveLength(1);
        expect(группы[0]).toHaveLength(3);
    });

    test("«Й» — буква и краткая остаются разными гранями", () => {
        const группы = группыЗнака(файл, "Й");
        expect(группы.length).toBeGreaterThanOrEqual(2);
    });

    test("«A» латинская — грань с одной дыркой", () => {
        const группы = группыЗнака(файл, "A");
        expect(группы).toHaveLength(1);
        expect(группы[0]).toHaveLength(2);
    });

    test("в алфавите «Макетки» нет пропущенных знаков", () => {
        const алфавит =
            "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя" +
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
            ".,!?-—«»№:;()";
        const ф = шрифт(файл);
        const нет = [...алфавит].filter((з) => ф.charToGlyphIndex(з) === 0);
        expect(нет).toEqual([]);
    });
});
