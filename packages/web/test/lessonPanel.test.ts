// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: панель шагов урока сворачивается по клику в заголовок.
// Тест стоит здесь, потому что поломка была невидимой для типов: `hidden`
// проставлялся, а список оставался на экране — инлайновый `display: grid`
// сильнее правила браузера `[hidden] { display: none }`.

import { LessonPanel } from "../src/lessonPanel";

const card = {
    slug: "brelok",
    title: "Брелок",
    steps: ["Поставь коробку", "Скругли углы"],
    minutes: 40,
};

describe("Панель шагов урока", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        localStorage.clear();
    });

    test("клик по заголовку сворачивает и разворачивает список", () => {
        new LessonPanel(card, "42");
        const header = document.querySelector("aside button") as HTMLButtonElement;
        const list = document.querySelector("aside ol") as HTMLOListElement;

        expect(list.style.display).toBe("grid");

        header.click();
        expect(list.hidden).toBe(true);
        expect(list.style.display).toBe("none");

        header.click();
        expect(list.hidden).toBe(false);
        expect(list.style.display).toBe("grid");
    });
});
