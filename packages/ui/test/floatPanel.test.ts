// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { I18nKeys } from "@chili3d/core";
import { describe, expect, test } from "@rstest/core";

// Set up global app mock before any imports that reference it
Object.defineProperty(globalThis, "app", {
    configurable: true,
    writable: true,
    value: { mainWindow: undefined },
});

// Mock CSS modules
rs.mock("../src/floatPanel.module.css", () => ({
    root: "fp-root",
    header: "fp-header",
    title: "fp-title",
    closeButton: "fp-close",
    content: "fp-content",
    resizeHandle: "fp-resize",
}));

// Mock element helpers
import "./_helpers/mockElement";

// Mock Localize
rs.mock("@chili3d/core", () => {
    const actual = rs.hoisted(() => require("@chili3d/core"));
    const { LocalizeMock } = rs.hoisted(() => require("./_helpers/coreMocks"));
    return {
        ...actual,
        Localize: LocalizeMock,
    };
});

import { FloatPanel } from "../src/floatPanel";

describe("FloatPanel", () => {
    describe("constructor defaults", () => {
        test("should set default width when not specified", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            expect(panel.style.width).toBe("300px"); // DEFAULT_WIDTH
        });

        test("should set custom width from options", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
                width: 500,
            });
            expect(panel.style.width).toBe("500px");
        });

        test("should set default height when not specified", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            expect(panel.style.height).toBe("200px"); // DEFAULT_HEIGHT
        });

        test("should set custom height from options", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
                height: 400,
            });
            expect(panel.style.height).toBe("400px");
        });

        test("should set default position (20, 20) when not specified", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            expect(panel.style.left).toBe("20px");
            expect(panel.style.top).toBe("20px");
        });

        test("should set custom position from options", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
                x: 100,
                y: 200,
            });
            expect(panel.style.left).toBe("100px");
            expect(panel.style.top).toBe("200px");
        });

        test("should set minWidth and minHeight from options", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
                minWidth: 250,
                minHeight: 150,
            });
            expect(panel.style.minWidth).toBe("250px");
            expect(panel.style.minHeight).toBe("150px");
        });

        test("should default minWidth to 150px when not specified", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            expect(panel.style.minWidth).toBe("150px");
        });

        test("should default minHeight to 100px when not specified", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            expect(panel.style.minHeight).toBe("100px");
        });
    });

    describe("DOM structure", () => {
        test("should contain header element with title class", () => {
            const panel = new FloatPanel({
                title: "Settings" as I18nKeys,
                content: document.createElement("div"),
            });
            const header = panel.querySelector('[class*="header"]');
            expect(header).not.toBeNull();
        });

        test("should contain content area", () => {
            const content = document.createElement("div");
            content.id = "my-content";
            const panel = new FloatPanel({ title: "Test" as I18nKeys, content });
            expect(panel.innerHTML).toContain("my-content");
        });

        test("should contain resize handle element", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            const handle = panel.querySelector('[class*="resize"]');
            expect(handle).not.toBeNull();
        });

        test("should contain close button in the header", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            const header = panel.querySelector('[class*="header"]');
            const closeBtn = header?.querySelector('[class*="close"]');
            expect(closeBtn).not.toBeNull();
        });
    });

    describe("dispose", () => {
        function dispatchKeydown(panel: FloatPanel): boolean {
            let stopped = false;
            const event = new KeyboardEvent("keydown", { key: "a", bubbles: true });
            Object.defineProperty(event, "stopImmediatePropagation", {
                value: () => {
                    stopped = true;
                },
            });
            panel.dispatchEvent(event);
            return stopped;
        }

        test("should remove the keydown listener on dispose", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            // listener active before dispose
            expect(dispatchKeydown(panel)).toBe(true);

            panel.dispose();
            expect(dispatchKeydown(panel)).toBe(false);
        });

        test("should be idempotent — second dispose keeps listeners removed", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            panel.dispose();
            panel.dispose();

            expect(dispatchKeydown(panel)).toBe(false);
        });
    });

    describe("keyboard event interception", () => {
        test("should have tabIndex set for keyboard focus", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            expect(panel.tabIndex).toBe(-1);
        });

        test("should stop keydown propagation", () => {
            const panel = new FloatPanel({
                title: "Test" as I18nKeys,
                content: document.createElement("div"),
            });
            let stopped = false;
            const event = new KeyboardEvent("keydown", { key: "a", bubbles: true });
            Object.defineProperty(event, "stopImmediatePropagation", {
                value: () => {
                    stopped = true;
                },
            });
            panel.dispatchEvent(event);

            expect(stopped).toBe(true);
        });
    });
});

// Палец вместо мыши (B-276). Браузера в тестах нет, но захват указателя happy-dom
// поддерживает по-настоящему (`setPointerCapture`/`hasPointerCapture`), поэтому
// проверяем не текст исходника, а поведение: кто держит указатель и куда уезжает окно.
describe("FloatPanel: окно тянется пальцем", () => {
    const окно = () => new FloatPanel({ title: "Test" as I18nKeys, content: document.createElement("div") });

    const шапка = (панель: FloatPanel) => панель.querySelector('[class*="header"]') as HTMLElement;
    const уголок = (панель: FloatPanel) => панель.querySelector('[class*="resize"]') as HTMLElement;
    const жест = (тип: string, init: PointerEventInit) =>
        new PointerEvent(тип, { bubbles: true, pointerId: 7, pointerType: "touch", ...init });

    test("палец забирает указатель себе и ведёт окно", () => {
        const панель = окно();
        const начало = панель.getBoundingClientRect();
        const заголовок = шапка(панель);

        заголовок.dispatchEvent(жест("pointerdown", { clientX: 100, clientY: 100 }));
        // Без захвата палец, сойдя с заголовка, уводит события сцене под ним.
        expect(заголовок.hasPointerCapture(7)).toBe(true);

        заголовок.dispatchEvent(жест("pointermove", { clientX: 160, clientY: 140 }));
        expect(панель.style.left).toBe(`${начало.left + 60}px`);
        expect(панель.style.top).toBe(`${начало.top + 40}px`);
    });

    test("палец отпущен — захват снят, окно больше не едет", () => {
        const панель = окно();
        const заголовок = шапка(панель);

        заголовок.dispatchEvent(жест("pointerdown", { clientX: 100, clientY: 100 }));
        заголовок.dispatchEvent(жест("pointermove", { clientX: 160, clientY: 140 }));
        const где = панель.style.left;
        заголовок.dispatchEvent(жест("pointerup", { clientX: 160, clientY: 140 }));

        expect(заголовок.hasPointerCapture(7)).toBe(false);
        заголовок.dispatchEvent(жест("pointermove", { clientX: 400, clientY: 400 }));
        expect(панель.style.left).toBe(где);
    });

    test("системный жест оборвал указатель — окно не липнет к пальцу", () => {
        const панель = окно();
        const заголовок = шапка(панель);

        заголовок.dispatchEvent(жест("pointerdown", { clientX: 100, clientY: 100 }));
        // `pointerup` после `pointercancel` не приходит: убирать за собой должен он сам.
        заголовок.dispatchEvent(жест("pointercancel", { clientX: 100, clientY: 100 }));
        const где = панель.style.left;

        заголовок.dispatchEvent(жест("pointermove", { clientX: 400, clientY: 400 }));
        expect(панель.style.left).toBe(где);
    });

    test("второй палец не перехватывает окно у первого", () => {
        const панель = окно();
        const начало = панель.getBoundingClientRect();
        const заголовок = шапка(панель);

        заголовок.dispatchEvent(жест("pointerdown", { clientX: 100, clientY: 100 }));
        заголовок.dispatchEvent(жест("pointerdown", { pointerId: 8, clientX: 300, clientY: 300 }));
        заголовок.dispatchEvent(жест("pointermove", { pointerId: 8, clientX: 340, clientY: 300 }));
        // Второй палец окно не двигает: поля отсчёта заняты первым.
        expect(панель.style.left).toBe("20px");

        заголовок.dispatchEvent(жест("pointermove", { clientX: 150, clientY: 100 }));
        expect(панель.style.left).toBe(`${начало.left + 50}px`);
    });

    test("мышь работает ровно как раньше", () => {
        const панель = окно();
        const начало = панель.getBoundingClientRect();
        const заголовок = шапка(панель);
        const мышь = (тип: string, init: PointerEventInit) =>
            жест(тип, { pointerId: 1, pointerType: "mouse", ...init });

        заголовок.dispatchEvent(мышь("pointerdown", { clientX: 100, clientY: 100 }));
        заголовок.dispatchEvent(мышь("pointermove", { clientX: 130, clientY: 120 }));
        expect(панель.style.left).toBe(`${начало.left + 30}px`);
        expect(панель.style.top).toBe(`${начало.top + 20}px`);

        заголовок.dispatchEvent(мышь("pointerup", { clientX: 130, clientY: 120 }));
        заголовок.dispatchEvent(мышь("pointermove", { clientX: 200, clientY: 200 }));
        expect(панель.style.left).toBe(`${начало.left + 30}px`);
    });

    test("нажатие на значок крестика не начинает перетаскивание", () => {
        const панель = окно();
        const заголовок = шапка(панель);
        const значок = заголовок.querySelector("svg") as Element;

        // Пальцем попадают по значку внутри кнопки, а не по самой кнопке. Захвати мы
        // тут указатель — клик уехал бы на заголовок и окно перестало бы закрываться.
        значок.dispatchEvent(жест("pointerdown", { clientX: 100, clientY: 100 }));
        expect(заголовок.hasPointerCapture(7)).toBe(false);

        заголовок.dispatchEvent(жест("pointermove", { clientX: 200, clientY: 200 }));
        expect(панель.style.left).toBe("20px");
    });

    test("уголок тянется пальцем и держит указатель", () => {
        // Пределы занижены нарочно: getBoundingClientRect в happy-dom нулевой, и при
        // обычных 150×100 итог упёрся бы в минимум и ничего не проверил.
        const панель = new FloatPanel({
            title: "Test" as I18nKeys,
            content: document.createElement("div"),
            minWidth: 10,
            minHeight: 10,
        });
        const начало = панель.getBoundingClientRect();
        const ручка = уголок(панель);

        ручка.dispatchEvent(жест("pointerdown", { clientX: 0, clientY: 0 }));
        expect(ручка.hasPointerCapture(7)).toBe(true);

        ручка.dispatchEvent(жест("pointermove", { clientX: 60, clientY: 40 }));
        expect(панель.style.width).toBe(`${Math.max(10, начало.width + 60)}px`);
        expect(панель.style.height).toBe(`${Math.max(10, начало.height + 40)}px`);

        ручка.dispatchEvent(жест("pointerup", { clientX: 60, clientY: 40 }));
        expect(ручка.hasPointerCapture(7)).toBe(false);
    });

    test("жесты по заголовку и уголку браузер не забирает себе", () => {
        // Стили в тестах подменены моком, проверить их поведением нечем — читаем файл.
        // Без `touch-action: none` браузер на планшете разберёт ведение пальца как
        // прокрутку страницы и события до окна не дойдут.
        const css = readFileSync(path.resolve(__dirname, "../src/floatPanel.module.css"), "utf8");
        expect(css.split(".header {")[1]?.split("}")[0]).toContain("touch-action: none");
        expect(css.split(".resizeHandle {")[1]?.split("}")[0]).toContain("touch-action: none");
    });

    test("dispose снимает и слушатели указателя", () => {
        const панель = окно();
        const заголовок = шапка(панель);
        панель.dispose();

        заголовок.dispatchEvent(жест("pointerdown", { clientX: 100, clientY: 100 }));
        expect(заголовок.hasPointerCapture(7)).toBe(false);
        expect(панель.style.left).toBe("20px");
    });
});

describe("showFloatPanel constructor equivalent", () => {
    test("should create a FloatPanel and verify defaults", () => {
        const panel = new FloatPanel({
            title: "Test" as I18nKeys,
            content: document.createElement("div"),
        });
        expect(panel.style.width).toBe("300px");
        expect(panel.style.height).toBe("200px");
        panel.remove();
    });
});
