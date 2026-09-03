// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Config,
    I18n,
    type IApplication,
    type IWindow,
    PubSub,
    Ribbon,
    RibbonTab,
    type RibbonTabProfile,
} from "@chili3d/core";
// Иконки подключаются статическим импортом. В upstream они грузились через
// fetch + new Function — это исполнение кода по сети на origin с сессионной
// кукой ребёнка; запрещено INV-006 и строгой CSP.
import "./iconfont.js";
import { showDialog } from "./dialog";
import { Editor } from "./editor";
import { showFloatPanel } from "./floatPanel";
import { Permanent } from "./permanent";
import { Toast } from "./toast";

export class MainWindow extends HTMLElement implements IWindow {
    readonly ribbon: Ribbon;
    private _inited: boolean = false;
    private _editor?: Editor;

    constructor(
        readonly tabs: RibbonTabProfile[],
        readonly iconFont: string,
        dom?: HTMLElement,
    ) {
        super();
        this.tabIndex = 0;
        this.ensureDom(dom);
        // Быстрых команд в шапке нет: «Отменить» и «Повторить» стоят словами в
        // панели инструментов под полосой (`frame-contract.md`, «Панель
        // инструментов мастерской»), а дискета рядом с автосохранением читалась
        // как «значит, само не сохраняется».
        this.ribbon = new Ribbon([], tabs.map(RibbonTab.fromProfile));
    }

    protected ensureDom(dom?: HTMLElement) {
        if (dom) {
            dom.append(this);
        } else {
            document.body.appendChild(this);
        }

        this.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        this.addEventListener("scroll", (e) => {
            this.scrollTop = 0;
        });
    }

    async init(app: IApplication): Promise<void> {
        if (this._inited) {
            throw new Error("MainWindow is already inited");
        }
        this._inited = true;

        I18n.changeLanguage(Config.instance.language);

        await this.loadCss();
        this.applyTheme();
        // Форк «Макетки»: домашнего экрана редактора нет. Список работ живёт в
        // кабинете оболочки, а этот экран успевал мелькнуть «Добро пожаловать…»
        // между кабинетом и работой — лишний кадр, который сбивает ребёнка.
        this._initEditor(app);
        this._initEventHandlers(app);
    }

    protected async loadCss() {
        await import("./mainWindow.module.css");
    }

    private _initEventHandlers(app: IApplication) {
        PubSub.default.sub("showToast", Toast.info);
        PubSub.default.sub("displayError", Toast.error);
        PubSub.default.sub("showDialog", showDialog);
        PubSub.default.sub("showFloatPanel", showFloatPanel);
        PubSub.default.sub("showPermanent", Permanent.show);

        Config.instance.onPropertyChanged(this.handleConfigChanged);
        window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (Config.instance.themeMode === "system") {
                this.applyTheme();
            }
        });
    }

    private async _initEditor(app: IApplication) {
        this._editor = new Editor(app, this.ribbon);
    }

    private applyTheme() {
        const themeMode = Config.instance.themeMode;
        let theme: "light" | "dark";

        if (themeMode === "system") {
            theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        } else {
            theme = themeMode;
        }

        document.documentElement.setAttribute("theme", theme);
    }

    private readonly handleConfigChanged = (prop: keyof Config) => {
        if (prop === "themeMode") {
            this.applyTheme();
        }

        if (prop === "language") {
            I18n.changeLanguage(Config.instance.language);
        }

        const shouldSaveProps: (keyof Config)[] = ["themeMode", "language", "navigation3D"];
        if (shouldSaveProps.includes(prop)) {
            Config.instance.saveToStorage();
        }
    };
}

customElements.define("chili3d-main-window", MainWindow);
