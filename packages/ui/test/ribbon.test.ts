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
    ribbonTitlePanel: "r-ribbon-title-panel",
    backLabel: "r-back-label",
    quickCommands: "r-quick-commands",
    split: "r-split",
    tabHeader: "r-tab-header",
    activedTab: "r-actived-tab",
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

    function createRibbonUI() {
        const tab1 = makeTab("tab.one");
        const tab2 = makeTab("tab.two");
        const dataContent = {
            quickCommands: [CMD_QUICK],
            tabs: [tab1, tab2],
            activeTab: tab1,
            hiddenTabs: [],
            editableTabs: [],
        } as unknown as Ribbon;
        const app = { views: [], mainWindow: undefined } as unknown as IApplication;
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
    test("should mark the frame bar and its four zones", () => {
        const { ui } = createRibbonUI();
        expect(ui.querySelectorAll("[data-frame-bar]").length).toBe(1);
        const zones = [...ui.querySelectorAll("[data-frame-zone]")].map((el) =>
            el.getAttribute("data-frame-zone"),
        );
        expect(zones).toEqual(["знак", "работа", "главное-действие", "человек"]);
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

    test("should publish executeCommand when quick command clicked", () => {
        const { ui } = createRibbonUI();
        const titlePanel = mustQuery(ui, ".r-ribbon-title-panel");
        // children: quickCommands collection, split span, tab headers collection
        const quickContainer = titlePanel.children[0] as HTMLElement;
        const quickButton = mustQuery(quickContainer, "span");
        quickButton.click();
        expect(published.some((p) => p.topic === "executeCommand" && p.args[0] === CMD_QUICK)).toBe(true);
    });

    test("should switch activeTab when tab header clicked", () => {
        const { ui, dataContent, tab2 } = createRibbonUI();
        const titlePanel = mustQuery(ui, ".r-ribbon-title-panel");
        const tabHeaderContainer = titlePanel.children[2] as HTMLElement;
        const tabLabels = tabHeaderContainer.querySelectorAll("label");
        expect(tabLabels.length).toBe(2);

        (tabLabels[1] as HTMLElement).click();
        expect(dataContent.activeTab).toBe(tab2);
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
