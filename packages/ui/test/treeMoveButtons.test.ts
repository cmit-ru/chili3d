// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

/**
 * Кнопки «Выше»/«Ниже» в дереве модели заведены ради касания: HTML5 drag and drop
 * для пальца спецификацией не определён, и порядок деталей на планшете было не
 * поменять вообще (B-276, шаг 5).
 *
 * Здесь сторожится не поведение кнопок (оно в `tree.test.ts`), а **цена на
 * ноутбуке**. Мишень в 24 px в каждой строке поднимает строку с 24 до 32 px, то
 * есть режет видимое дерево на четверть — ради задачи, которой у мыши нет. Ровно
 * этот размен отвергнут в ADR `2026-09-14-1530`. Поведение живёт в CSS, а CSS
 * апстрим переписывает, поэтому проверка читает файл текстом: браузера в наборе нет.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@rstest/core";

// Комментарии срезаются до разбора, и это не аккуратность: в комментариях к этим же
// правилам объяснено, почему выбран `display: none`, — проверка ловила объяснение
// вместо правила и проходила на сломанном файле.
const CSS = readFileSync(path.resolve(__dirname, "../src/project/tree/treeItem.module.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
);

// Часть файла до первого `@media` — правила, действующие на любом устройстве.
const БЕЗ_УСЛОВИЙ = CSS.split("@media ")[0];

/** Тело блока `@media <условие>` — до закрывающей скобки в начале строки. */
const приУсловии = (условие: string) => {
    const кусок = CSS.split("@media ").find((ч) => ч.startsWith(условие));
    return кусок ? кусок.split(/^\}/m)[0] : "";
};

describe("кнопки перестановки дерева включаются касанием", () => {
    test("без касания кнопок нет вовсе", () => {
        const базовый = /\.moveButton \{([^}]*)\}/.exec(БЕЗ_УСЛОВИЙ)?.[1];
        expect(базовый).toBeTruthy();
        expect(базовый).toMatch(/display:\s*none/);
    });

    test("любой грубый указатель — кнопки появляются", () => {
        // Гейт `any-pointer`, а не `pointer`: у ноутбука с сенсорным экраном основной
        // указатель точный, но пальцем по дереву он попробует.
        expect(приУсловии("(any-pointer: coarse)")).toMatch(/\.moveButton\s*\{[^}]*display:\s*inline-flex/);
    });

    test("основной указатель грубый — мишень 44×44, как у глазка", () => {
        const блок = приУсловии("(pointer: coarse)");
        expect(блок).toMatch(/\.moveButton\s*\{[^}]*min-width:\s*44px/);
        expect(блок).toMatch(/\.moveButton\s*\{[^}]*min-height:\s*44px/);
    });
});
