// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CommandKeys, IApplication, PushButton, Ribbon } from "@chili3d/core";
import { CommandStore, PubSub, RibbonGroup, RibbonTab } from "@chili3d/core";
import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";

// CSS modules under test (plus those of the ribbon buttons pulled in transitively)
rs.mock("../src/ribbon/ribbon.module.css", () => ({
    root: "r-root",
    titleBar: "r-title-bar",
    left: "r-left",
    appIcon: "r-app-icon",
    icon: "r-icon",
    backLabel: "r-back-label",
    commandsRow: "r-commands-row",
    toolBar: "r-tool-bar",
    toolButton: "r-tool-button",
    center: "r-center",
    right: "r-right",
    tabContentPanel: "r-tab-content-panel",
    groupPanel: "r-group-panel",
    disabled: "r-disabled",
}));

rs.mock("../src/ribbon/ribbonGroup.module.css", () => ({
    ribbonGroup: "rg-group",
    content: "rg-content",
    headerContainer: "rg-header-container",
    header: "rg-header",
    arrow: "rg-arrow",
    collapsedDropdown: "rg-collapsed-dropdown",
    collapsedDropdownItem: "rg-collapsed-item",
    collapsedDropdownIcon: "rg-collapsed-icon",
    collapsedDropdownText: "rg-collapsed-text",
}));

rs.mock("../src/ribbon/ribbonStack.module.css", () => ({
    root: "rs-root",
}));

rs.mock("../src/ribbon/ribbonButton.module.css", () => ({
    normal: "rb-normal",
    small: "rb-small",
    icon: "rb-icon",
    smallIcon: "rb-small-icon",
    largeButtonText: "rb-large-text",
    smallButtonText: "rb-small-text",
    checked: "rb-checked",
}));

rs.mock("../src/ribbon/ribbonPulldownButton.module.css", () => ({
    pulldown: "rpd-pulldown",
    pulldownSmall: "rpd-pulldown-small",
    text: "rpd-text",
    smallText: "rpd-text-small",
    arrow: "rpd-arrow",
    smallArrow: "rpd-arrow-small",
    dropdown: "rpd-dropdown",
    dropdownItem: "rpd-dropdown-item",
    dropdownIcon: "rpd-dropdown-icon",
    dropdownText: "rpd-dropdown-text",
}));

rs.mock("../src/ribbon/ribbonSplitButton.module.css", () => ({
    split: "rsb-split",
    splitSmall: "rsb-split-small",
    mainArea: "rsb-main",
    smallMainArea: "rsb-main-small",
    arrowButton: "rsb-arrow-btn",
    smallArrowButton: "rsb-arrow-btn-small",
    arrow: "rsb-arrow",
    smallArrow: "rsb-arrow-small",
    text: "rsb-text",
    smallText: "rsb-text-small",
    dropdown: "rsb-dropdown",
    dropdownItem: "rsb-dropdown-item",
    dropdownIcon: "rsb-dropdown-icon",
    dropdownText: "rsb-dropdown-text",
}));

// Mock element helpers — real events so el.click() triggers handlers
import "./_helpers/mockElementRealEvents";

import { RibbonUI } from "../src/ribbon/ribbon";
import { mustQuery } from "./_helpers/domHelpers";

const CMD_QUICK = "test.ribbon.quick" as unknown as CommandKeys;

class TestCommand {
    async execute() {}
}

function makePushButton(): PushButton {
    return {
        type: "push",
        size: "large",
        command: CMD_QUICK,
        icon: "icon-test",
        onClick: () => {},
    } as PushButton;
}

function makeTab(name: string): RibbonTab {
    const group = new RibbonGroup("group.test" as RibbonGroup["groupName"], [makePushButton()]);
    return new RibbonTab(name as RibbonTab["tabName"], group);
}

describe("RibbonUI", () => {
    let published: { topic: string; args: unknown[] }[];
    let pubCallback: (...args: unknown[]) => void;

    beforeEach(() => {
        published = [];
        pubCallback = (...args: unknown[]) => published.push({ topic: "executeCommand", args });
        PubSub.default.sub("executeCommand", pubCallback);
        CommandStore.registerCommand(TestCommand, { key: CMD_QUICK, icon: "icon-quick" });
    });

    afterEach(() => {
        PubSub.default.remove("executeCommand", pubCallback);
        CommandStore.unregisterCommand(CMD_QUICK);
    });

    // Вид, с которым работает панель инструментов: стопка отмены и камера.
    // Счётчики держим в изменяемом объекте — стопка пополняется по ходу работы.
    function makeActiveView(undoCount = 0, redoCount = 0) {
        const counts = { undoCount, redoCount };
        return {
            counts,
            width: 800,
            height: 600,
            document: {
                history: { undoCount: () => counts.undoCount, redoCount: () => counts.redoCount },
            },
            cameraController: {
                fitContent: rs.fn(() => {}),
                zoom: rs.fn((_x: number, _y: number, _delta: number) => {}),
            },
            update: rs.fn(() => {}),
        };
    }

    function createRibbonUI(activeView?: ReturnType<typeof makeActiveView>) {
        const tab1 = makeTab("tab.one");
        const tab2 = makeTab("tab.two");
        const dataContent = {
            tabs: [tab1, tab2],
            activeTab: tab1,
            hiddenTabs: [],
            editableTabs: [],
        } as unknown as Ribbon;
        const app = { views: [], mainWindow: undefined, activeView } as unknown as IApplication;
        const ui = new RibbonUI(app, dataContent);
        return { ui, dataContent, tab1, tab2 };
    }

    // Форк «Макетки»: в шапке стоит имя нашего продукта, а не «Chili3D - v0.7.0».
    // Имя берётся из одной точки (BRAND_NAME) — продукт могут переименовать.
    test("should render root, title bar and app name", () => {
        const { ui } = createRibbonUI();
        expect(ui.className).toBe("r-root");
        expect(ui.querySelector(".r-title-bar")).not.toBeNull();

        const appName = mustQuery(ui, "#appName");
        expect(appName.textContent).toBe("Макетка");
        expect(appName.textContent).not.toContain("Chili3D");
    });

    // Ссылки на чужие площадки из мастерской убраны: ребёнок на уроке не должен
    // уходить в GitHub или чат сообщества. Требование AGPL закрывает отдельная
    // ссылка на исходники в оболочке, а не кнопка в ленте команд.
    test("should not render external links", () => {
        const { ui } = createRibbonUI();
        const links = [...ui.querySelectorAll("a")];
        // Единственная ссылка в шапке — знак «Макетка», и ведёт он внутрь.
        expect(links.length).toBe(1);
        for (const link of links) {
            expect(link.getAttribute("href")?.startsWith("/")).toBe(true);
        }
    });

    // Опоры спеки паритета двух мастерских (`frame-contract.md`, «Опоры для
    // теста»): без них 3D и схемы нечем сверить, а сломать их легко случайной
    // правкой разметки.
    test("should mark the frame bar and its five zones", () => {
        const { ui } = createRibbonUI();
        expect(ui.querySelectorAll("[data-frame-bar]").length).toBe(1);
        const zones = [...ui.querySelectorAll("[data-frame-zone]")].map((el) =>
            el.getAttribute("data-frame-zone"),
        );
        expect(zones).toEqual(["знак", "работа", "инструменты", "главное-действие", "человек"]);
    });

    test("should render ribbon groups for each tab", () => {
        const { ui } = createRibbonUI();
        const groups = ui.querySelectorAll("ribbon-group");
        expect(groups.length).toBe(2);
    });

    // Домашнего экрана редактора в форке нет вовсе: список работ живёт в
    // кабинете оболочки, а мелькавший «Добро пожаловать…» только сбивал
    // ребёнка. Знак — настоящая ссылка, чтобы работали Tab, Enter и средняя
    // кнопка мыши; куда именно она ведёт, решает сервер (поле `backTo`).
    test("app icon should be a link to the address the server gave", () => {
        const globals = globalThis as { MAKETKA_BACK_TO?: unknown };
        globals.MAKETKA_BACK_TO = { href: "/teach", label: "← К группам" };
        try {
            const { ui } = createRibbonUI();
            const appIcon = mustQuery(ui, ".r-app-icon");
            expect(appIcon.tagName.toLowerCase()).toBe("a");
            expect(appIcon.getAttribute("href")).toBe("/teach");
            expect(mustQuery(ui, ".r-back-label").textContent).toBe("← К группам");
        } finally {
            globals.MAKETKA_BACK_TO = undefined;
        }
    });

    // Запасной адрес нужен там, где меты нет вовсе: песочница с лендинга и гость.
    test("app icon should fall back to /home without a server address", () => {
        const { ui } = createRibbonUI();
        expect(mustQuery(ui, ".r-app-icon").getAttribute("href")).toBe("/home");
        expect(ui.querySelector(".r-back-label")).toBeNull();
    });

    // Общие кнопки вида (`frame-contract.md`, «Общие кнопки вида в полосе»):
    // те же слова, тот же порядок и те же подсказки, что в схемах.
    // Иконка без подписи запрещена — стрелку повтора принимали за «Обновить
    // страницу». Словарь в тестах отдаёт сам ключ, поэтому здесь видно, какое
    // слово встанет на кнопку.
    test("should render the workshop toolbar with words in the contract order", () => {
        const { ui } = createRibbonUI();
        const toolBar = mustQuery(ui, "[data-tool-bar]");
        const buttons = [...toolBar.querySelectorAll("button")];
        expect(buttons.map((b) => b.dataset["act"])).toEqual(["undo", "redo", "fit", "zin", "zout"]);
        expect(buttons.map((b) => b.textContent)).toEqual([
            "command.edit.undo",
            "command.edit.redo",
            "viewport.fitContent",
            "+",
            "−",
        ]);
        expect(buttons.map((b) => b.title)).toEqual([
            "toolbar.undo.tip",
            "toolbar.redo.tip",
            "toolbar.fit.tip",
            "viewport.zoomIn",
            "viewport.zoomOut",
        ]);
        expect(toolBar.querySelectorAll("svg").length).toBe(0);
    });

    // Кнопки вида стоят в самой полосе, третьей зоной, а не в ряду под ней:
    // ряд отжимал команды раздела за край экрана и стоял не там, где в схемах
    // (решение владельца 03.09.2026). Под полосой остались только команды:
    // ряда разделов там нет — раздел в форке один («Модель»), и одинокий
    // сегмент был бы нажатием, от которого ничего не происходит.
    test("should place the view buttons inside the frame bar", () => {
        const { ui } = createRibbonUI();
        const bar = mustQuery(ui, "[data-frame-bar]");
        const toolBar = mustQuery(bar, "[data-tool-bar]");
        expect(toolBar.dataset["frameZone"]).toBe("инструменты");
        expect([...bar.children].indexOf(toolBar)).toBe(2);
        const row = mustQuery(ui, ".r-commands-row");
        expect(row.children.length).toBe(1);
        expect((row.children[0] as HTMLElement).querySelectorAll("ribbon-group").length).toBe(2);
    });

    test("should publish undo and redo commands from the toolbar", () => {
        const { ui } = createRibbonUI(makeActiveView(1, 1));
        mustQuery<HTMLButtonElement>(ui, "[data-act='undo']").click();
        mustQuery<HTMLButtonElement>(ui, "[data-act='redo']").click();
        expect(published.map((p) => p.args[0])).toEqual(["edit.undo", "edit.redo"]);
    });

    // Кнопка, от которой ничего не произойдёт, ребёнку не показывается живой,
    // но и оживать должна сама: стопка отмены пополняется по ходу работы.
    test("should keep undo dead until there is something to undo", () => {
        const view = makeActiveView(0, 0);
        const { ui } = createRibbonUI(view);
        document.body.appendChild(ui);
        try {
            const undo = mustQuery<HTMLButtonElement>(ui, "[data-act='undo']");
            expect(undo.disabled).toBe(true);
            view.counts.undoCount = 1;
            PubSub.default.pub("historyChanged");
            expect(undo.disabled).toBe(false);
            expect(mustQuery<HTMLButtonElement>(ui, "[data-act='redo']").disabled).toBe(true);
        } finally {
            ui.remove();
        }
    });

    test("should fit and zoom the active view", () => {
        const view = makeActiveView();
        const { ui } = createRibbonUI(view);
        mustQuery<HTMLButtonElement>(ui, "[data-act='fit']").click();
        expect(view.cameraController.fitContent).toHaveBeenCalledTimes(1);

        mustQuery<HTMLButtonElement>(ui, "[data-act='zin']").click();
        mustQuery<HTMLButtonElement>(ui, "[data-act='zout']").click();
        expect(view.cameraController.zoom.mock.calls.map((call) => call[2])).toEqual([-5, 5]);
        expect(view.update).toHaveBeenCalledTimes(3);
    });

    // Вкладок документов и «+» в шапке больше нет: работа на странице одна, а
    // «+» заводил документ без номера работы — он никуда не сохранялся и пропадал
    // вместе с вкладкой. Середина шапки отдана каркасу (имя работы и состояние).
    test("should not offer a second document in the title bar", () => {
        const { ui } = createRibbonUI();
        expect(ui.querySelector("svg[icon='icon-plus']")).toBeNull();
        const center = mustQuery(ui, ".r-center");
        expect(center.id).toBe("frame-work");
        expect(center.children.length).toBe(0);
    });
});
