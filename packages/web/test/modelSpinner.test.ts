// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: накладка ожидания модели. Проверяем то, ради чего она сделана —
// мастерская за ней видна, вращение идёт средствами CSS (значит продолжается,
// пока главный поток занят расчётом), подпись меняется по ходу сборки.

import { ModelSpinner } from "../src/modelSpinner";

describe("Накладка «Собираем модель»", () => {
    test("зарегистрирована как пользовательский элемент", () => {
        expect(customElements.get("chili-model-spinner")).toBe(ModelSpinner);
    });

    test("не закрывает мастерскую наглухо и лежит ниже экрана загрузки", () => {
        const el = new ModelSpinner();
        expect(el.style.position).toBe("fixed");
        expect(el.style.background).toContain("rgba");
        expect(Number(el.style.zIndex)).toBeLessThan(9999);
    });

    test("вращение задано анимацией CSS, а не таймером", () => {
        const el = new ModelSpinner();
        const style = el.querySelector("style");
        expect(style?.textContent).toContain("@keyframes chili-model-spin");
        expect(style?.textContent).toContain("animation:");
    });

    test("подпись меняется по ходу сборки", () => {
        const el = new ModelSpinner();
        expect(el.textContent).toContain("Собираем модель");
        el.setText("Собираем детали… 2 из 5");
        expect(el.textContent).toContain("2 из 5");
    });
});
