// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: экран загрузки переписан — вместо бесконечной крутилки
// движущаяся полоса с подписью этапа и честный экран ошибки. Тесты проверяют
// то, ради чего это сделано: ребёнок видит движение и понятный текст, а не
// замерший круг, который он нажимает повторно.

import { Loading } from "../src/loading";

describe("Экран загрузки мастерской", () => {
    const created: Loading[] = [];

    function makeLoading() {
        const el = new Loading();
        created.push(el);
        return el;
    }

    afterEach(() => {
        // Таймер полосы живёт до dispose: без остановки он тикает между тестами.
        created.splice(0).forEach((el) => el.dispose());
    });

    test("зарегистрирован как пользовательский элемент", () => {
        expect(customElements.get("chili-loading")).toBe(Loading);
    });

    test("накрывает страницу целиком", () => {
        const el = makeLoading();
        expect(el).toBeInstanceOf(HTMLElement);
        expect(el.style.position).toBe("fixed");
        expect(el.style.zIndex).toBe("9999");
    });

    test("показывает подпись этапа и полосу, а не крутилку", () => {
        const el = makeLoading();
        const label = el.children[0] as HTMLElement;
        expect(label.textContent).toContain("Готовим мастерскую");

        const track = el.children[1] as HTMLElement;
        const bar = track.children[0] as HTMLElement;
        expect(bar.style.width).toBe("0%");
    });

    test("на ошибке объясняет по-русски и даёт куда вернуться", () => {
        const el = makeLoading();
        el.showError("WebAssembly.instantiate(): out of memory");

        expect(el.textContent).toContain("Не получилось загрузить мастерскую");
        expect(el.textContent).toContain("скажи преподавателю");
        // Технический текст оставляем — он для преподавателя.
        expect(el.textContent).toContain("out of memory");

        const back = el.querySelector("a");
        expect(back?.getAttribute("href")).toBe("/projects");
    });

    test("dispose можно звать дважды", () => {
        const el = makeLoading();
        el.dispose();
        expect(() => el.dispose()).not.toThrow();
    });
});
