// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Application, CommandService, HotkeyService, ShowPropertyEventHandler } from "@chili3d/app";
import {
    Config,
    Constants,
    I18n,
    type IApplication,
    type IDataExchange,
    type IService,
    type IShapeProvider,
    type IStorage,
    type IVisualFactory,
    type IWindow,
    type Locale,
    Logger,
} from "@chili3d/core";
import { DefaultDataExchange } from "./defaultDataExchange";

/**
 * Форк «Макетки»: каждый шаг инициализации начинает загрузку своего модуля СРАЗУ, в
 * момент регистрации, а не когда до него дойдёт очередь в build(). Порядок исполнения
 * остаётся прежним — параллельным становится только скачивание.
 *
 * Зачем: замер 02.09.2026 на профиле «10 Мбит/с, RTT 100 мс, CPU ×4» показал строгую
 * лесенку — ядро геометрии качалось 1,9–15,9 с, и лишь потом стартовал three.js
 * (16,8–17,4 с) и остальные куски. Полторы секунды уходило на паузы между запросами,
 * хотя канал в это время простаивал.
 */
export class AppBuilder {
    protected readonly _inits: (() => Promise<void>)[] = [];
    protected _storage?: IStorage;
    protected _visualFactory?: IVisualFactory;
    protected _shapeProvider?: IShapeProvider;
    protected _window?: IWindow;

    constructor() {
        this.initI18n();
        this.initConfig();
        this.ensureAPI();
    }

    protected ensureAPI() {
        const core = import("@chili3d/core");
        const element = import("@chili3d/element");
        this._inits.push(async () => {
            Logger.info("initializing api");

            (globalThis as any).Chili3dCore = await core;
            (globalThis as any).Chili3dElement = await element;
        });
    }

    protected initConfig() {
        Config.instance.init("config");
        return this;
    }

    protected initI18n() {
        const module = import("@chili3d/i18n");
        this._inits.push(async () => {
            Logger.info("initializing i18n");

            const i18n = await module;
            for (const key of Object.keys(i18n)) {
                I18n.addLanguage((i18n as { [key: string]: Locale })[key]);
            }
        });
    }

    useIndexedDB() {
        this._inits.push(async () => {
            Logger.info("initializing IndexedDBStorage");

            const db = await import("@chili3d/storage");
            this._storage = new db.IndexedDBStorage();
            await this._storage.createDBIfNeeded(Constants.DBName, [
                Constants.DocumentTable,
                Constants.RecentTable,
            ]);
        });
        return this;
    }

    /**
     * Форк «Макетки»: работы хранятся в облаке школы, а не в браузере ребёнка.
     * IndexedDB остаётся буфером несохранённых правок (ТЗ §5).
     */
    useCloudStorage() {
        const module = import("@chili3d/storage");
        this._inits.push(async () => {
            Logger.info("initializing CloudStorage");

            const db = await module;
            this._storage = new db.CloudStorage();
            await this._storage.createDBIfNeeded(Constants.DBName, [
                Constants.DocumentTable,
                Constants.RecentTable,
            ]);
        });
        return this;
    }

    useWasmOcc() {
        const module = import("@chili3d/wasm");
        this._inits.push(async () => {
            Logger.info("initializing wasm occ");

            const wasm = await module;
            await wasm.initWasm();
            this._shapeProvider = new wasm.OccShapeProvider();
        });
        return this;
    }

    useThree(): this {
        const module = import("@chili3d/three");
        this._inits.push(async () => {
            Logger.info("initializing three");

            const three = await module;
            this._visualFactory = new three.ThreeVisulFactory((d) => new ShowPropertyEventHandler(d));
        });
        return this;
    }

    useUI(): this {
        const module = import("@chili3d/ui");
        const tabs = this.getRibbonTabs();
        this._inits.push(async () => {
            Logger.info("initializing MainWindow");

            const ui = await module;
            const app = document.getElementById("app") as HTMLElement;
            this._window = new ui.MainWindow(await tabs, "iconfont.js", app);
        });
        return this;
    }

    async getRibbonTabs() {
        const defaultRibbon = await import("./ribbon");
        return defaultRibbon.DefaultRibbon;
    }

    async build(): Promise<IApplication> {
        for (const init of this._inits) {
            await init();
        }
        this.ensureNecessary();

        const app = this.createApp();
        await this._window?.init(app);

        Logger.info("Application build completed");

        return app;
    }

    createApp() {
        return new Application({
            storage: this._storage!,
            shapeProvider: this._shapeProvider!,
            visualFactory: this._visualFactory!,
            services: this.getServices(),
            mainWindow: this._window,
            dataExchange: this.initDataExchange(),
        });
    }

    initDataExchange(): IDataExchange {
        return new DefaultDataExchange();
    }

    private ensureNecessary() {
        if (this._shapeProvider === undefined) {
            throw new Error("ShapeProvider not set");
        }
        if (this._visualFactory === undefined) {
            throw new Error("VisualFactory not set");
        }
        if (this._storage === undefined) {
            throw new Error("storage has not been initialized");
        }
    }

    protected getServices(): IService[] {
        return [new CommandService(), new HotkeyService()];
    }
}
