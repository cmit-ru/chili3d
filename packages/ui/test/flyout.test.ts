// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: поле ввода размера и экранная клавиатура (B-276).
// Клавиатуры у happy-dom нет, `visualViewport` он не реализует, а планшета под
// рукой нет тем более — поэтому подменяем `visualViewport` заглушкой и меряем
// то единственное, что решает дело: подняли записку над клавиатурой или нет.

import { PubSub, Result } from "@chili3d/core";
import { afterEach, describe, expect, test } from "@rstest/core";
import { Flyout } from "../src/viewport/flyout/flyout";

/** Видимая часть окна: высота, отступ сверху и подписчики, как у настоящей. */
function подменитьВидимуюЧасть(height: number, offsetTop = 0) {
    const подписки = new Map<string, Set<(e: Event) => void>>();
    const часть = {
        height,
        offsetTop,
        addEventListener(type: string, fn: (e: Event) => void) {
            if (!подписки.has(type)) подписки.set(type, new Set());
            подписки.get(type)?.add(fn);
        },
        removeEventListener(type: string, fn: (e: Event) => void) {
            подписки.get(type)?.delete(fn);
        },
        /** Клавиатура выехала или уехала. */
        сообщить(type: string) {
            подписки.get(type)?.forEach((fn) => {
                fn(new Event(type));
            });
        },
        сколькоПодписок(type: string) {
            return подписки.get(type)?.size ?? 0;
        },
    };
    Object.defineProperty(window, "visualViewport", { value: часть, configurable: true });
    return часть;
}

/** Записка стоит там, где ткнули пальцем: happy-dom своих размеров не считает. */
function поставитьЗаписку(flyout: Flyout, top: number, height = 40) {
    flyout.getBoundingClientRect = () =>
        ({ top, bottom: top + height, height, left: 0, right: 120, width: 120 }) as DOMRect;
}

let записка: Flyout | undefined;

function открытьВвод(top: number, height = 40) {
    записка = new Flyout();
    document.body.append(записка);
    поставитьЗаписку(записка, top, height);
    PubSub.default.pub("showInput", "5", () => Result.ok("5"));
    return записка;
}

afterEach(() => {
    записка?.remove();
    записка = undefined;
    Reflect.deleteProperty(window, "visualViewport");
});

describe("поле ввода размера и экранная клавиатура", () => {
    test("клавиатура закрыла поле — записка поднимается ровно над ней", () => {
        const часть = подменитьВидимуюЧасть(400);
        const flyout = открытьВвод(500);

        часть.сообщить("resize");

        // 540 (низ записки) + 8 (просвет) − 400 (низ видимой части) = 148.
        expect(flyout.style.transform).toBe("translateY(-148px)");
    });

    test("страница подъехала под клавиатуру — считаем от верха видимой части", () => {
        const часть = подменитьВидимуюЧасть(400, 60);
        const flyout = открытьВвод(500);

        часть.сообщить("scroll");

        // 548 − (60 + 400) = 88.
        expect(flyout.style.transform).toBe("translateY(-88px)");
    });

    test("поле и так видно — записку не трогаем", () => {
        const часть = подменитьВидимуюЧасть(900);
        const flyout = открытьВвод(500);

        часть.сообщить("resize");

        expect(flyout.style.transform).toBe("");
    });

    test("выше верхнего края видимой части не поднимаем — там тоже не видно", () => {
        // Клавиатура съела почти всё окно: подняться «сколько нужно» некуда.
        const часть = подменитьВидимуюЧасть(100);
        const flyout = открытьВвод(20, 120);

        часть.сообщить("resize");

        // Нужно 48, но выше 20 — уже за верхним краем видимой полосы.
        expect(flyout.style.transform).toBe("translateY(-20px)");
    });

    test("ввод закрылся — сдвиг снят и подписок не осталось", () => {
        const часть = подменитьВидимуюЧасть(400);
        const flyout = открытьВвод(500);
        часть.сообщить("resize");

        PubSub.default.pub("clearInput");

        expect(flyout.style.transform).toBe("");
        expect(часть.сколькоПодписок("resize")).toBe(0);
        expect(часть.сколькоПодписок("scroll")).toBe(0);
    });

    test("записку убрали вместе с видом — подписок не осталось", () => {
        const часть = подменитьВидимуюЧасть(400);
        const flyout = открытьВвод(500);

        flyout.remove();

        expect(часть.сколькоПодписок("resize")).toBe(0);
        expect(часть.сколькоПодписок("scroll")).toBe(0);
    });

    test("браузер без видимой части окна — ввод всё равно открывается", () => {
        const flyout = открытьВвод(500);

        expect(flyout.querySelector("input")).not.toBeNull();
    });
});
