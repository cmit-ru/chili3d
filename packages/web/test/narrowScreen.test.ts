// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: заглушка узкого экрана (B-275, ТЗ §9). Мастерская моделей на
// телефоне не работает — фигуру крутят мышью, панель шире экрана. Браузером это
// не проверить: редактор на таком экране по замыслу не поднимается, гонять по
// нему спеку нечем. Читаем исходники текстом — как это делает оболочка
// (`cad-app/test/circuits-narrow.test.js`).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "@rstest/core";

const корень = path.resolve(__dirname, "../../..");
const читать = (...p: string[]) => readFileSync(path.join(корень, ...p), "utf8");

describe("мастерская моделей на телефоне: заглушка вместо непригодного экрана", () => {
    test("разметка заглушки стоит в самой странице, а не рисуется бандлом", () => {
        const страница = читать("public", "index.html");
        expect(страница).toContain('class="narrow"');
        expect(страница).toContain('id="narrow-go"');
    });

    test("по умолчанию заглушка скрыта, показывает её медиазапрос", () => {
        const css = читать("public", "index.css");
        expect(css).toMatch(/\.narrow \{\s*display: none;\s*\}/);
        const блок = css.split("@media ").find((ч) => ч.includes("narrow-go"));
        expect(блок).toBeDefined();
        // Ребёнок настоял — редактор поднимается, заглушка уходит.
        expect(блок).toContain("html.narrow-off .narrow");
    });

    test("порог в скрипте и в стилях — один и тот же", () => {
        const изСкрипта = /window\.matchMedia\(\s*"([^"]+)"\s*\)/.exec(
            читать("packages", "web", "src", "index.ts"),
        );
        expect(изСкрипта).not.toBeNull();
        const css = читать("public", "index.css");
        const блок = css.split("@media ").find((ч) => ч.includes("narrow-go"));
        const изСтилей = /^([^{]+?)\s*\{/.exec(блок as string);
        expect(изСкрипта?.[1].replace(/\s+/g, " ")).toBe(изСтилей?.[1].replace(/\s+/g, " "));
    });

    test("на узком экране редактор не поднимается сам", () => {
        const код = читать("packages", "web", "src", "index.ts");
        // Сборка приложения обязана быть внутри функции, а не на верхнем уровне:
        // иначе ядро геометрии поедет грузиться ещё до проверки экрана.
        expect(код).toMatch(/function запустить\(\)[\s\S]*?new AppBuilder\(\)/);
        expect(код).toMatch(/if \(телефон\(\)\)[\s\S]{0,400}запустить\(\)/);
    });
});
