// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, test } from "@rstest/core";

// Mock CSS module under test
rs.mock("../src/statusbar/statusbar.module.css", () => ({
    panel: "sb-panel",
    tip: "sb-tip",
    left: "sb-left",
    right: "sb-right",
}));

// SnapConfig pulls in the whole snap checkbox stack — replace it with a plain stub;
// it has its own test file (snapConfig.test.ts).
rs.mock("../src/statusbar/snapConfig", () => ({
    SnapConfig: class {},
}));

// Recorded collaborators for the core mock. Factories may only reference
// rs.hoisted-created values.
const pubSubRecorder = rs.hoisted(() => {
    const { createPubSubRecorder } = require("./_helpers/coreMocks");
    return createPubSubRecorder();
});

const i18nSetMock = rs.hoisted(() => rs.fn());

const configChanged = rs.hoisted(() => {
    const handlers = new Set<(prop: string) => void>();
    return {
        instance: {
            onPropertyChanged: (h: (prop: string) => void) => handlers.add(h),
        },
        emit: (prop: string) => handlers.forEach((h) => h(prop)),
        clear: () => handlers.clear(),
    };
});

rs.mock("@chili3d/core", () => {
    const actual = rs.hoisted(() => require("@chili3d/core"));
    return {
        ...actual,
        Config: { instance: configChanged.instance },
        // `translate` подменяется вместе со всем namespace: без него конструктор
        // падает на подписи навигации, и в этом файле не проходил ни один тест.
        I18n: { set: i18nSetMock, translate: (key: string) => key },
        Navigation3D: {
            navigationKeyMap: () => ({ pan: "Middle", rotate: "Shift+Middle" }),
        },
        PubSub: pubSubRecorder.stub,
    };
});

// Mock element helpers
import "./_helpers/mockElement";

import type { I18nKeys } from "@chili3d/core";
import { Statusbar } from "../src/statusbar/statusbar";
import { mustQuery } from "./_helpers/domHelpers";

// Кнопки мыши называются словами через i18n (7503f0a5), а `translate` здесь подменён
// тождеством — поэтому в подсказке ждём ключи, а не «Middle».
const DEFAULT_TIP_ARGS = [
    "textContent",
    "prompt.default{0}{1}",
    "navigation.middle",
    "navigation.shiftMiddle",
];

describe("Statusbar", () => {
    beforeEach(() => {
        pubSubRecorder.reset();
        i18nSetMock.mockClear();
        // handlers accumulate per constructed Statusbar — drop stale instances
        configChanged.clear();
    });

    describe("constructor", () => {
        test("should set panel class with the provided className", () => {
            const bar = new Statusbar("test-bar");
            expect(bar.className).toBe("sb-panel test-bar");
        });

        test("should set the default tip from the navigation key map", () => {
            const bar = new Statusbar("test-bar");
            expect(i18nSetMock).toHaveBeenCalledWith(bar.tip, ...DEFAULT_TIP_ARGS);
        });

        test("should render the tip label in the left section", () => {
            const bar = new Statusbar("test-bar");
            const left = mustQuery(bar, ".sb-left");
            expect(left.contains(bar.tip)).toBe(true);
            mustQuery(bar, ".sb-right");
        });

        test("should subscribe to statusBarTip and clearStatusBarTip", () => {
            new Statusbar("test-bar");
            expect(pubSubRecorder.handlers.has("statusBarTip")).toBe(true);
            expect(pubSubRecorder.handlers.has("clearStatusBarTip")).toBe(true);
        });
    });

    describe("tip updates", () => {
        test("should show the published tip and restore the default on clear", () => {
            const bar = new Statusbar("test-bar");
            i18nSetMock.mockClear();

            const tipHandler = pubSubRecorder.handlers.get("statusBarTip");
            expect(tipHandler).toBeDefined();
            tipHandler!("command.create.box" as I18nKeys);
            expect(i18nSetMock).toHaveBeenCalledWith(bar.tip, "textContent", "command.create.box");

            const clearHandler = pubSubRecorder.handlers.get("clearStatusBarTip");
            expect(clearHandler).toBeDefined();
            clearHandler!();
            expect(i18nSetMock).toHaveBeenCalledWith(bar.tip, ...DEFAULT_TIP_ARGS);
        });

        test("should refresh the default tip when navigation3D config changes", () => {
            const bar = new Statusbar("test-bar");
            i18nSetMock.mockClear();

            configChanged.emit("navigation3D");

            expect(i18nSetMock).toHaveBeenCalledWith(bar.tip, ...DEFAULT_TIP_ARGS);
        });

        test("should keep a custom tip when navigation3D config changes", () => {
            new Statusbar("test-bar");
            const tipHandler = pubSubRecorder.handlers.get("statusBarTip");
            expect(tipHandler).toBeDefined();
            tipHandler!("command.create.box" as I18nKeys);
            i18nSetMock.mockClear();

            configChanged.emit("navigation3D");

            // the tip is no longer the default one — config change must not reset it
            expect(i18nSetMock).not.toHaveBeenCalled();
        });

        test("should ignore unrelated config changes", () => {
            new Statusbar("test-bar");
            i18nSetMock.mockClear();

            configChanged.emit("language");

            expect(i18nSetMock).not.toHaveBeenCalled();
        });
    });
});

/**
 * Подсказка обязана обрезаться многоточием внутри своей половины полосы.
 *
 * Она сделана элементом `<label>`, а у строчного бокса `overflow` и `text-overflow`
 * не действуют: без `display: block` длинная русская подсказка печаталась поверх
 * привязок — две надписи в одних и тех же пикселях (реестровый снимок 3.7, 15.09.2026).
 * Правило живёт в CSS, браузера в наборе нет — читаем файл текстом, как в
 * `treeMoveButtons.test.ts`. Комментарии срезаем: в них те же слова, что в правилах.
 */
describe("подсказка в строке состояния обрезается, а не налезает", () => {
    const CSS = readFileSync(
        path.resolve(__dirname, "../src/statusbar/statusbar.module.css"),
        "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const блокTip = /\.tip \{([^}]*)\}/.exec(CSS)?.[1];

    test("подсказка — блочный бокс, иначе обрезка не работает", () => {
        expect(блокTip).toBeTruthy();
        expect(блокTip).toMatch(/display:\s*(block|inline-block|flex)/);
    });

    test("длинная подсказка уходит в многоточие, а не переносится и не вылезает", () => {
        expect(блокTip).toMatch(/white-space:\s*nowrap/);
        expect(блокTip).toMatch(/overflow:\s*hidden/);
        expect(блокTip).toMatch(/text-overflow:\s*ellipsis/);
    });

    test("левая половина полосы даёт себя сжать", () => {
        // Без `min-width: 0` флекс-элемент не сжимается ниже своего содержимого,
        // и подсказка выдавила бы привязки за правый край (B-276).
        expect(/\.left \{([^{]*)\{/.exec(CSS)?.[1]).toMatch(/min-width:\s*0/);
    });
});
