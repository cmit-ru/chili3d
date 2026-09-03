// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Binding,
    Config,
    type IApplication,
    type IConverter,
    Localize,
    PubSub,
    Result,
    type Ribbon,
    type RibbonGroup,
    type RibbonTab,
    type RibbonTabKeys,
} from "@chili3d/core";
import { a, button, collection, div, img, span } from "@chili3d/element";
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

class DisplayConverter<T> implements IConverter<T> {
    constructor(readonly predicate: (value: T) => boolean) {}

    convert(value: T): Result<string> {
        return Result.ok(this.predicate(value) ? "" : "none");
    }
}

export class RibbonUI extends HTMLElement {
    private readonly undoButton: HTMLButtonElement;
    private readonly redoButton: HTMLButtonElement;

    constructor(
        readonly app: IApplication,
        readonly dataContent: Ribbon,
    ) {
        super();
        this.className = style.root;
        this.undoButton = this.toolButton(
            "undo",
            new Localize("command.edit.undo"),
            new Localize("toolbar.undo.tip"),
            () => PubSub.default.pub("executeCommand", "edit.undo"),
        );
        this.redoButton = this.toolButton(
            "redo",
            new Localize("command.edit.redo"),
            new Localize("toolbar.redo.tip"),
            () => PubSub.default.pub("executeCommand", "edit.redo"),
        );
        this.append(this.header(), this.commandsRow());
        this.refreshHistoryButtons();
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
            this.toolBar(),
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
        );
    }

    /**
     * Команды раздела. Ряда разделов здесь нет: раздел в форке ровно один
     * («Модель»), и одинокий сегмент — нажатие, от которого ничего не происходит.
     */
    private commandsRow() {
        return div({ className: style.commandsRow }, this.ribbonTabs());
    }

    /**
     * Третья зона полосы — общие кнопки вида (`agent_docs/frame-contract.md`,
     * «Общие кнопки вида в полосе»). Слова, порядок и опоры `data-tool-bar`/`data-act`
     * дословно те же, что в мастерской схем: до 03.09.2026 эти кнопки стояли в
     * разных местах двух мастерских, а в 3D ещё и отжимали команды раздела за край
     * экрана — ряд под полосой делил ширину с ними.
     *
     * Кнопки текстовые в обеих мастерских — иконка без подписи читается
     * неоднозначно: стрелку повтора принимали за «Обновить страницу».
     */
    private toolBar() {
        return div(
            { className: style.toolBar, dataset: { toolBar: "", frameZone: "инструменты" } },
            this.undoButton,
            this.redoButton,
            // «В экран», а не «Вписать в экран»: в полосе на ширине 1024 полное
            // слово не помещалось. Целиком его договаривает подсказка.
            this.toolButton(
                "fit",
                new Localize("viewport.fitContent"),
                new Localize("toolbar.fit.tip"),
                () => {
                    const view = this.app.activeView;
                    view?.cameraController.fitContent();
                    view?.update();
                },
            ),
            this.toolButton("zin", "+", new Localize("viewport.zoomIn"), () => this.zoom(-5)),
            this.toolButton("zout", "−", new Localize("viewport.zoomOut"), () => this.zoom(5)),
        );
    }

    /** Слово на кнопке — либо из словаря, либо сам знак («+», «−»). */
    private toolButton(act: string, text: Localize | string, tip: Localize | undefined, onclick: () => void) {
        const result = button({
            className: style.toolButton,
            type: "button",
            dataset: { act },
            onclick,
        });
        if (text instanceof Localize) text.set(result, "textContent");
        else result.textContent = text;
        tip?.set(result, "title");
        return result;
    }

    private zoom(delta: number) {
        const view = this.app.activeView;
        if (!view) return;
        view.cameraController.zoom(view.width / 2, view.height / 2, delta);
        view.update();
    }

    /** Кнопка, от которой ничего не произойдёт, ребёнку не показывается живой. */
    private readonly refreshHistoryButtons = () => {
        const history = this.app.activeView?.document?.history;
        this.undoButton.disabled = !history || history.undoCount() === 0;
        this.redoButton.disabled = !history || history.redoCount() === 0;
    };

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
        PubSub.default.sub("historyChanged", this.refreshHistoryButtons);
        PubSub.default.sub("activeViewChanged", this.refreshHistoryButtons);
        this.refreshHistoryButtons();
    }

    disconnectedCallback(): void {
        Config.instance.removePropertyChanged(this.handleConfigChanged);
        PubSub.default.remove("historyChanged", this.refreshHistoryButtons);
        PubSub.default.remove("activeViewChanged", this.refreshHistoryButtons);
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
