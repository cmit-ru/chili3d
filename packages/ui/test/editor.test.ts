// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: боковая панель тянется пальцем (B-276). Рукоятка — полоска в 6 px,
// палец сходит с неё сразу, поэтому растягивание держится на захвате указателя.
// Планшета в тестах нет, но захват happy-dom поддерживает по-настоящему
// (`setPointerCapture`/`hasPointerCapture`), так что проверяем поведение, а не текст
// исходника: кто держит указатель, куда едет ширина и что мышь работает как прежде.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { IApplication, Ribbon } from "@chili3d/core";
import { describe, expect, test } from "@rstest/core";

rs.mock("../src/editor.module.css", () => ({
    root: "ed-root",
    content: "ed-content",
    sidebar: "ed-sidebar",
    sidebarItem: "ed-sidebar-item",
    sidebarResizer: "ed-resizer",
    viewport: "ed-viewport",
    viewportContainer: "ed-viewport-container",
    statusbar: "ed-statusbar",
}));

// Общий мок `@chili3d/element` доносит до элемента только onclick/onchange/onkeydown/
// onblur, а рукоятка ресайза висит на onpointerdown — его добавляем здесь. Заодно
// строчный `style`: настоящий помощник кладёт такую строку в cssText, а общий мок
// умеет только объект.
rs.mock("@chili3d/element", () => {
    const { createElementMocks } = rs.hoisted(() => require("./_helpers/elementMocks"));
    const mocks = createElementMocks();
    return {
        ...mocks,
        // biome-ignore lint/suspicious/noExplicitAny: тестовый мок фабрики элементов
        div: (props: any, ...children: any[]) => {
            const строчныйСтиль =
                props && typeof props === "object" && typeof props.style === "string"
                    ? props.style
                    : undefined;
            const el = mocks.div(строчныйСтиль ? { ...props, style: undefined } : props, ...children);
            if (строчныйСтиль) el.style.cssText = строчныйСтиль;
            if (props && typeof props === "object" && typeof props.onpointerdown === "function") {
                el.onpointerdown = props.onpointerdown;
            }
            return el;
        },
    };
});

// Соседние части редактора к растягиванию панели отношения не имеют. Классы простые,
// не наследники HTMLElement: happy-dom запрещает `new` для зарегистрированных
// customElements, а детей-не-узлов фабрика `div` просто пропускает.
rs.mock("../src/project", () => ({ ProjectView: class {} }));
rs.mock("../src/property", () => ({ PropertyView: class {} }));
rs.mock("../src/property/material", () => ({ MaterialDataContent: class {}, MaterialEditor: class {} }));
rs.mock("../src/ribbon", () => ({ RibbonUI: class {} }));
rs.mock("../src/ribbon/commandContext", () => ({ CommandContext: class {} }));
rs.mock("../src/statusbar", () => ({ Statusbar: class {} }));
rs.mock("../src/viewport", () => ({
    LayoutViewport: class {
        classList = { add: () => {} };
    },
}));

import { Editor } from "../src/editor";

describe("Editor: боковая панель тянется пальцем", () => {
    const редактор = () => {
        // Окно приложения нарочно оставлено вне документа: иначе редактор при вставке
        // подпишется на PubSub и потащит за собой всё остальное.
        const окноПриложения = document.createElement("div");
        const app = { mainWindow: окноПриложения } as unknown as IApplication;
        const editor = new Editor(app, {} as Ribbon);
        return {
            окноПриложения,
            панель: editor.querySelector("#editor-sidebar") as HTMLElement,
            рукоятка: editor.querySelector(".ed-resizer") as HTMLElement,
        };
    };

    const жест = (тип: string, init: PointerEventInit) =>
        new PointerEvent(тип, { bubbles: true, pointerId: 5, pointerType: "touch", ...init });

    test("рукоятка забирает указатель себе и ведёт ширину", () => {
        const { панель, рукоятка } = редактор();
        expect(панель.style.width).toBe("360px");

        рукоятка.dispatchEvent(жест("pointerdown", { clientX: 360 }));
        // Без захвата палец уже на первом движении окажется над сценой, и тянуть панель
        // будет нечем — события достанутся сцене.
        expect(рукоятка.hasPointerCapture(5)).toBe(true);

        рукоятка.dispatchEvent(жест("pointermove", { clientX: 200 }));
        expect(панель.style.width).toBe("200px");
    });

    test("ход указателя слушает рукоятка, а не окно приложения", () => {
        const { окноПриложения, панель, рукоятка } = редактор();
        рукоятка.dispatchEvent(жест("pointerdown", { clientX: 360 }));

        окноПриложения.dispatchEvent(жест("pointermove", { clientX: 200 }));
        expect(панель.style.width).toBe("360px");

        рукоятка.dispatchEvent(жест("pointermove", { clientX: 200 }));
        expect(панель.style.width).toBe("200px");
    });

    test("палец отпущен — захват снят, ширина больше не едет", () => {
        const { панель, рукоятка } = редактор();
        рукоятка.dispatchEvent(жест("pointerdown", { clientX: 360 }));
        рукоятка.dispatchEvent(жест("pointermove", { clientX: 200 }));
        рукоятка.dispatchEvent(жест("pointerup", { clientX: 200 }));

        expect(рукоятка.hasPointerCapture(5)).toBe(false);
        рукоятка.dispatchEvent(жест("pointermove", { clientX: 500 }));
        expect(панель.style.width).toBe("200px");
    });

    test("системный жест оборвал указатель — панель не липнет к пальцу", () => {
        const { панель, рукоятка } = редактор();
        рукоятка.dispatchEvent(жест("pointerdown", { clientX: 360 }));
        // После `pointercancel` никакого `pointerup` не будет: убирать за собой должен он.
        рукоятка.dispatchEvent(жест("pointercancel", { clientX: 360 }));

        рукоятка.dispatchEvent(жест("pointermove", { clientX: 200 }));
        expect(панель.style.width).toBe("360px");
    });

    test("второй палец не вмешивается в растягивание", () => {
        const { панель, рукоятка } = редактор();
        рукоятка.dispatchEvent(жест("pointerdown", { clientX: 360 }));
        рукоятка.dispatchEvent(жест("pointerdown", { pointerId: 6, clientX: 500 }));

        рукоятка.dispatchEvent(жест("pointermove", { pointerId: 6, clientX: 500 }));
        expect(панель.style.width).toBe("360px");

        рукоятка.dispatchEvent(жест("pointermove", { clientX: 200 }));
        expect(панель.style.width).toBe("200px");
    });

    test("узкие пределы панели сохранились", () => {
        const { панель, рукоятка } = редактор();
        рукоятка.dispatchEvent(жест("pointerdown", { clientX: 360 }));

        рукоятка.dispatchEvent(жест("pointermove", { clientX: 10 }));
        expect(панель.style.width).toBe("75px");
    });

    test("жест по рукоятке браузер не забирает себе", () => {
        // Стили в тестах подменены моком, проверить их поведением нечем — читаем файл.
        // Без `touch-action: none` браузер на планшете разберёт ведение пальца как
        // прокрутку и `pointermove` до рукоятки просто не дойдёт.
        const css = readFileSync(path.resolve(__dirname, "../src/editor.module.css"), "utf8");
        const правило = css.split(".sidebarResizer {")[1]?.split("}")[0];
        expect(правило).toContain("touch-action: none");
    });

    test("мышью панель тянется ровно как раньше, вместе с курсором окна", () => {
        const { окноПриложения, панель, рукоятка } = редактор();
        const мышь = (тип: string, init: PointerEventInit) =>
            жест(тип, { pointerId: 1, pointerType: "mouse", ...init });

        рукоятка.dispatchEvent(мышь("pointerdown", { clientX: 360 }));
        expect(окноПриложения.style.cursor).toBe("ew-resize");

        рукоятка.dispatchEvent(мышь("pointermove", { clientX: 240 }));
        expect(панель.style.width).toBe("240px");

        рукоятка.dispatchEvent(мышь("pointerup", { clientX: 240 }));
        expect(окноПриложения.style.cursor).toBe("");
        рукоятка.dispatchEvent(мышь("pointermove", { clientX: 500 }));
        expect(панель.style.width).toBe("240px");
    });
});
