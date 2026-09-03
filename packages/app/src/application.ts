// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type CommandKeys,
    DOCUMENT_FILE_EXTENSION,
    I18n,
    type IApplication,
    type ICommand,
    type IDataExchange,
    type IDocument,
    type IService,
    type IShapeProvider,
    type IStorage,
    type IView,
    type IVisualFactory,
    type IWindow,
    Logger,
    Material,
    Observable,
    ObservableCollection,
    Plane,
    PubSub,
    type Serialized,
    setCurrentApplication,
    VisualConfig,
    type VisualItemConfig,
} from "@chili3d/core";
import { Document } from "./document";
import { importFiles } from "./utils";

export interface ApplicationOptions {
    visualFactory: IVisualFactory;
    shapeProvider: IShapeProvider;
    services: IService[];
    storage: IStorage;
    dataExchange: IDataExchange;
    mainWindow?: IWindow;
}

export class Application extends Observable implements IApplication {
    readonly dataExchange: IDataExchange;
    readonly visualFactory: IVisualFactory;
    readonly shapeProvider: IShapeProvider;
    readonly services: IService[];
    readonly storage: IStorage;
    readonly mainWindow?: IWindow;
    readonly views = new ObservableCollection<IView>();
    readonly documents: Set<IDocument> = new Set<IDocument>();

    lastCommand: CommandKeys | undefined;

    /**
     * Форк «Макетки»: куда девать файл работы (`.cd`), открытый ребёнком.
     *
     * Апстрим открывает такой файл вторым документом прямо в браузере — за ним
     * не следит ни автосохранение, ни оболочка, и он пропадает вместе с
     * вкладкой (B-117). Оболочка ставит сюда возврат работы на сервер
     * (`packages/web/src/index.ts`), и к этой одной точке сходятся оба входа:
     * окно выбора файла и перетаскивание на мастерскую. Без обработчика
     * поведение остаётся апстримным.
     */
    openWorkFiles?: (files: File[]) => void;

    get executingCommand(): ICommand | undefined {
        return this.getPrivateValue("executingCommand", undefined);
    }
    set executingCommand(value: ICommand | undefined) {
        this.setProperty("executingCommand", value);
    }

    get activeView(): IView | undefined {
        return this.getPrivateValue("activeView", undefined);
    }
    set activeView(value: IView | undefined) {
        this.setProperty("activeView", value, () => {
            PubSub.default.pub("activeViewChanged", value);
        });
    }

    constructor(option: ApplicationOptions) {
        super();

        setCurrentApplication(this);
        this.visualFactory = option.visualFactory;
        this.shapeProvider = option.shapeProvider;
        this.services = option.services;
        this.storage = option.storage;
        this.dataExchange = option.dataExchange;
        this.mainWindow = option.mainWindow;
        this.services.forEach((x) => x.register(this));
        this.services.forEach((x) => x.start());
        this.initEvents();
    }

    private initEvents() {
        window.onbeforeunload = this.handleWindowUnload;
        this.mainWindow?.addEventListener("dragstart", this.handleDragStart);
        this.mainWindow?.addEventListener("dragover", this.handleDragOver);
        this.mainWindow?.addEventListener("drop", this.handleDrop);
        VisualConfig.onPropertyChanged(this.onVisualConfigChanged);
    }

    private readonly onVisualConfigChanged = (property: keyof VisualItemConfig) => {
        if (property === "defaultEdgeColor") {
            this.views.forEach((x) => x.update());
        }
    };

    private readonly handleWindowUnload = (event: BeforeUnloadEvent) => {
        if (this.activeView) {
            // Cancel the event as stated by the standard.
            event.preventDefault();
            // Chrome requires returnValue to be set.
            event.returnValue = "";
        }
    };

    private readonly handleDragStart = (ev: DragEvent) => {
        ev.preventDefault();
    };

    private readonly handleDragOver = (ev: DragEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (ev.dataTransfer) {
            ev.dataTransfer.dropEffect = "copy";
        }
    };

    private readonly handleDrop = (ev: DragEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        const files = this.extractDroppedFiles(ev.dataTransfer);
        this.importFiles(files);
    };

    async importFiles(files: File[] | FileList | undefined) {
        if (!files || files.length === 0) {
            return;
        }
        const { opens, imports } = this.groupFiles(files);
        if (opens.length > 0) {
            if (this.openWorkFiles) this.openWorkFiles(opens);
            else this.loadDocumentsWithLoading(opens);
        }
        // Пустой список тоже заводил документ «Untitled» и показывал полосу
        // выполнения: `importFiles` создаёт документ до того, как посмотрит, что
        // импортировать. При возврате `.cd` импортировать нечего.
        if (imports.length > 0) importFiles(this, imports);
    }

    private loadDocumentsWithLoading(opens: File[]) {
        PubSub.default.pub(
            "showPermanent",
            async () => {
                for (const file of opens) {
                    const json: Serialized = JSON.parse(await file.text());
                    await this.loadDocument(json);
                    this.activeView?.cameraController.fitContent();
                }
            },
            "toast.excuting{0}",
            I18n.translate("command.doc.open"),
        );
    }

    private groupFiles(files: FileList | File[]) {
        const opens: File[] = [];
        const imports: File[] = [];
        for (const element of files) {
            const fileName = element.name.toLowerCase();
            if (fileName.endsWith(DOCUMENT_FILE_EXTENSION)) {
                opens.push(element);
            } else {
                // Расширения (.chiliplugin) форк не загружает: это исполнение
                // произвольного кода на том же origin, где живёт сессия ребёнка
                // (INV-006). Такой файл попадёт в импорт и будет отклонён как
                // неизвестный формат.
                imports.push(element);
            }
        }
        return { opens, imports };
    }

    private extractDroppedFiles(dataTransfer: DataTransfer | null): File[] {
        if (!dataTransfer) return [];
        const fromFileList = Array.from(dataTransfer.files ?? []);
        if (fromFileList.length > 0) return fromFileList;
        const fromItems = Array.from(dataTransfer.items ?? [])
            .filter((item) => item.kind === "file")
            .map((item) => item.getAsFile())
            .filter((file): file is File => file !== null);
        return fromItems;
    }

    async openDocument(id: string): Promise<IDocument | undefined> {
        const document = await Document.open(this, id);
        await this.createActiveView(document);
        return document;
    }

    async newDocument(name: string): Promise<IDocument> {
        const document = new Document(this, name);
        const lightGray = new Material({ document, name: "LightGray", color: 0xdedede });
        const deepGray = new Material({ document, name: "DeepGray", color: 0x898989 });
        document.modelManager.materials.push(lightGray, deepGray);
        await this.createActiveView(document);
        return document;
    }

    async loadDocument(data: Serialized): Promise<IDocument | undefined> {
        const document = await Document.load(this, data);
        await this.createActiveView(document);
        return document;
    }

    protected async createActiveView(document: IDocument | undefined) {
        if (document === undefined) return undefined;
        const view = document.visual.createView("3d", Plane.XY);
        this.activeView = view;
    }
}
