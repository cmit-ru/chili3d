// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Binding,
    type CommandKeys,
    CommandStore,
    Config,
    type IApplication,
    type ICommand,
    type IConverter,
    Localize,
    Logger,
    PubSub,
    Result,
    type Ribbon,
    type RibbonGroup,
    type RibbonTab,
    type RibbonTabKeys,
} from "@chili3d/core";
import { a, collection, createIcon, div, img, label, span } from "@chili3d/element";
import style from "./ribbon.module.css";
import { RibbonPushButton } from "./ribbonButton";
import { RibbonGroupElement } from "./ribbonGroup";

// Имя продукта задаёт оболочка (ребрендинг-готовность из ТЗ §9):
// переименование не должно требовать правок в коде редактора.
const BRAND_NAME = (globalThis as { MAKETKA_BRAND?: string }).MAKETKA_BRAND ?? "Макетка";

/** Адрес и подпись возврата: их отдаёт сервер в мете работы (поле `backTo`). */
interface BackTo {
    href: string;
    label?: string;
}

/**
 * Куда ведёт знак «Макетка». Раньше здесь стоял жёсткий `/home`, и решение
 * «куда именно домой» принимал клиент по роли — из-за этого преподавателя
 * уводило из его же работы «к группам». Теперь решает сервер: оболочка кладёт
 * ответное поле `backTo` в глобальную переменную до сборки приложения, а
 * `/home` остаётся запасным на случай песочницы и гостя, где меты нет.
 */
function backTo(): BackTo {
    const value = (globalThis as { MAKETKA_BACK_TO?: BackTo | string }).MAKETKA_BACK_TO;
    if (typeof value === "string") return { href: value };
    if (value && typeof value.href === "string") return value;
    return { href: "/home" };
}

export const QuickButton = (command: ICommand) => {
    const data = CommandStore.getComandData(command);
    if (!data) {
        Logger.warn("commandData is undefined");
        return span({ textContent: "null" });
    }

    const icon = createIcon(data.icon);
    icon.classList.add(style.icon);
    return span(
        {
            title: new Localize(`command.${data.key}`),
            onclick: () => PubSub.default.pub("executeCommand", data.key),
        },
        icon,
    );
};

class ActivedRibbonTabConverter implements IConverter<RibbonTab> {
    constructor(
        readonly tab: RibbonTab,
        readonly style: string,
        readonly activeStyle: string,
    ) {}

    convert(value: RibbonTab): Result<string> {
        return Result.ok(this.tab === value ? `${this.style} ${this.activeStyle}` : this.style);
    }
}

class DisplayConverter<T> implements IConverter<T> {
    constructor(readonly predicate: (value: T) => boolean) {}

    convert(value: T): Result<string> {
        return Result.ok(this.predicate(value) ? "" : "none");
    }
}

export class RibbonUI extends HTMLElement {
    constructor(
        readonly app: IApplication,
        readonly dataContent: Ribbon,
    ) {
        super();
        this.className = style.root;
        this.append(this.header(), this.ribbonTabs());
        app.mainWindow?.ribbon.onPropertyChanged(this.handleRibbonChanged);
    }

    private readonly handleRibbonChanged = (key: keyof Ribbon) => {
        if (key === "editableTabs") {
            if (this.dataContent.editableTabs.length > 0) {
                const groups = this.querySelectorAll(`.${style.groupPanel}`);
                for (const group of groups) {
                    const tab = (group as HTMLElement).dataset["tab"] as RibbonTabKeys;
                    if (this.dataContent.editableTabs.includes(tab)) {
                        group.classList.remove(style.disabled);
                    } else {
                        group.classList.add(style.disabled);
                    }
                }
            } else {
                const groups = this.querySelectorAll(`.${style.disabled}`);
                for (const group of groups) {
                    group.classList.remove(style.disabled);
                }
            }
        }
    };

    private header() {
        // `data-frame-*` — опоры для спеки паритета двух мастерских
        // (`frame-contract.md`, «Опоры для теста»). Логики на них не висит:
        // это только зацепки, по которым тест находит зоны и меряет полосу.
        return div(
            { className: style.titleBar, id: "frame-bar", dataset: { frameBar: "" } },
            this.leftPanel(),
            this.centerPanel(),
            this.mainPanel(),
            this.rightPanel(),
        );
    }

    private leftPanel() {
        const back = backTo();
        return div(
            { className: style.left },
            // Форк «Макетки»: знак продукта — настоящая ссылка, а не `div` с
            // обработчиком: работают Tab, Enter и средняя кнопка мыши, а в классе
            // мышь ломается регулярно. Домашний экран редактора скрыт — список
            // работ живёт в кабинете, и второй такой же только путает.
            a(
                {
                    className: style.appIcon,
                    href: back.href,
                    dataset: { frameZone: "знак" },
                },
                // Знак «Макетки» — тот же файл, что во вкладке браузера и в шапке
                // мастерской схем (`favicon.svg`). Спрайт `iconfont.js` — сгенерированный
                // файл исходного Chili3D в двух копиях; класть туда наш знак значило бы
                // завести третью копию картинки. Путь абсолютный: адрес мастерской —
                // `/3d/<номер>`, и относительный `favicon.svg` уехал бы в `/3d/<номер>/`.
                img({ className: style.icon, src: "/3d/favicon.svg", alt: "" }),
                span({ id: "appName", textContent: BRAND_NAME }),
                // Подпись возврата («← К примерам», «← К группам», «← Мои работы»)
                // приходит от сервера вместе с адресом. Её нет только у запасного
                // `/home`, где «куда именно» решает уже оболочка, — там знака хватает.
                ...(back.label ? [span({ className: style.backLabel, textContent: back.label })] : []),
            ),
            div(
                { className: style.ribbonTitlePanel },
                collection({
                    className: style.quickCommands,
                    sources: this.dataContent.quickCommands,
                    template: (command: CommandKeys) => QuickButton(command as any),
                }),
                span({ className: style.split }),
                this.createRibbonHeader(),
            ),
        );
    }

    private createRibbonHeader() {
        return collection({
            className: style.tabHeaders,
            sources: this.dataContent.tabs,
            template: (tab: RibbonTab) => {
                const converter = new ActivedRibbonTabConverter(tab, style.tabHeader, style.activedTab);
                return label({
                    className: new Binding(this.dataContent, "activeTab", converter),
                    textContent: new Localize(tab.tabName),
                    style: {
                        display: new Binding(
                            this.dataContent,
                            "hiddenTabs",
                            new DisplayConverter(
                                (hiddens: RibbonTabKeys[]) => !hiddens.includes(tab.tabName),
                            ),
                        ),
                    },
                    onclick: () => {
                        this.dataContent.activeTab = tab;
                    },
                });
            },
        });
    }

    private centerPanel() {
        // Форк «Макетки»: коллекции вкладок документов и «+» здесь больше нет.
        // Работа на странице одна, а «+» заводил документ без номера работы —
        // он не сохранялся никуда и пропадал вместе с вкладкой. Вместо вкладок —
        // пустой контейнер, в который наш `frameBar` кладёт имя работы с меню и
        // состояние сохранения.
        return div({ className: style.center, id: "frame-work", dataset: { frameZone: "работа" } });
    }

    private mainPanel() {
        // Третья зона контракта — главное действие мастерской. В схемах здесь
        // «▶ Включить», в 3D действия нет: строить фигуру нечем одной кнопкой.
        // Пустое место всё равно объявлено, иначе спека паритета не сможет
        // сверить порядок зон — у неё окажется три зоны против четырёх.
        return div({ dataset: { frameZone: "главное-действие" } });
    }

    private rightPanel() {
        // Внешних ссылок в шапке нет: ребёнок на уроке не должен уходить из
        // мастерской. Здесь стоит блок пользователя — его кладёт наш `frameBar`.
        return div({ className: style.right, id: "frame-user", dataset: { frameZone: "человек" } });
    }

    private ribbonTabs() {
        return collection({
            className: style.tabContentPanel,
            sources: this.dataContent.tabs,
            template: (tab: RibbonTab) => this.ribbonTab(tab),
        });
    }

    private ribbonTab(tab: RibbonTab) {
        return collection({
            className: style.groupPanel,
            dataset: { tab: tab.tabName },
            sources: tab.groups,
            style: {
                display: new Binding(
                    this.dataContent,
                    "activeTab",
                    new DisplayConverter((tb: RibbonTab) => tab === tb),
                ),
            },
            template: (group: RibbonGroup) => new RibbonGroupElement(group),
        });
    }

    connectedCallback(): void {
        Config.instance.onPropertyChanged(this.handleConfigChanged);
    }

    disconnectedCallback(): void {
        Config.instance.removePropertyChanged(this.handleConfigChanged);
    }

    private readonly handleConfigChanged = (prop: keyof Config) => {
        if (prop === "navigation3D") {
            this.querySelectorAll(customElements.getName(RibbonPushButton)!).forEach((x) => {
                (x as RibbonPushButton).updateShortcut();
            });
        }
    };
}

customElements.define("chili-ribbon", RibbonUI);
