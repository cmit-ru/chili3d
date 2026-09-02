// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    AsyncController,
    CancelableCommand,
    Combobox,
    command,
    DOCUMENT_FILE_EXTENSION,
    download,
    I18n,
    type IApplication,
    type ICommand,
    PropertyUtils,
    PubSub,
    property,
    readFilesAsync,
    SelectNodeStep,
    type VisualNode,
} from "@chili3d/core";

@command({
    key: "file.import",
    icon: "icon-import",
})
export class Import implements ICommand {
    async execute(application: IApplication): Promise<void> {
        // Файл своей работы (`.cd`) ребёнок ищет там, где написано «Импорт», —
        // другой кнопки «открыть файл» на ленте нет. Принимаем его здесь и
        // отдаём приложению: оно уведёт `.cd` в ветку «открыть документ»,
        // а STEP/STL — в текущую сцену (форк «Макетки», B-093).
        const extenstions = [DOCUMENT_FILE_EXTENSION, ...application.dataExchange.importFormats()].join(",");
        const files = await readFilesAsync(extenstions, true);
        if (!files.isOk || files.value.length === 0) {
            alert(files.error);
            return;
        }
        application.importFiles(files.value);
    }
}

@command({
    key: "file.export",
    icon: "icon-export",
})
export class Export extends CancelableCommand {
    @property("file.format", {
        combobox: new Combobox<string>(),
    })
    public get format() {
        return this.getPrivateValue("format", ".step");
    }
    public set format(value: string) {
        this.setProperty("format", value);
    }

    @property("option.command.merge")
    public get merge() {
        return this.getPrivateValue("merge", true);
    }
    public set merge(value: boolean) {
        this.setProperty("merge", value);
    }

    constructor() {
        super();
        const property = PropertyUtils.getProperty(Export.prototype, "format")!;
        property.combobox!.items.clear();
        // In the constructor, this.application has not been assigned yet, so use the global app.
        property.combobox!.items.push(...app.dataExchange.exportFormats());
    }

    protected async executeAsync() {
        const nodes = await this.selectNodesAsync();
        if (!nodes || nodes.length === 0) {
            PubSub.default.pub("showToast", "toast.select.noSelected");
            return;
        }

        PubSub.default.pub(
            "showPermanent",
            async () => {
                PubSub.default.pub("showToast", "toast.downloading");
                if (this.merge || nodes.length === 1) {
                    await this.exportMergedAsync(nodes);
                } else {
                    await this.exportAsZipAsync(nodes);
                }
            },
            "toast.excuting{0}",
            I18n.translate("command.file.export"),
        );
    }

    private get suffix() {
        // ".stl binary" and ".ply binary" share the plain file extension.
        if (this.format === ".stl binary") return ".stl";
        if (this.format === ".ply binary") return ".ply";
        return this.format;
    }

    private async exportMergedAsync(nodes: VisualNode[]) {
        const data = await this.application.dataExchange.export(this.format, nodes);
        if (!data) return;
        download(data, `${nodes[0].name}${this.suffix}`);
    }

    // Browsers block multiple automatic downloads, so pack the files into one zip.
    private async exportAsZipAsync(nodes: VisualNode[]) {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const usedNames = new Set<string>();

        for (const node of nodes) {
            const data = await this.application.dataExchange.export(this.format, [node]);
            if (!data) continue;
            zip.file(this.uniqueFileName(node.name, usedNames), new Blob(data));
        }

        download([await zip.generateAsync({ type: "blob" })], `${nodes[0].name}.zip`);
    }

    private uniqueFileName(nodeName: string, usedNames: Set<string>) {
        let fileName = `${nodeName}${this.suffix}`;
        let counter = 1;
        while (usedNames.has(fileName)) {
            fileName = `${nodeName}-${counter++}${this.suffix}`;
        }
        usedNames.add(fileName);
        return fileName;
    }

    private async selectNodesAsync() {
        this.controller = new AsyncController();
        const step = new SelectNodeStep("prompt.select.models", { multiple: true, keepSelection: true });
        const data = await step.execute(this.application.activeView?.document!, this.controller);
        if (!data?.nodes) {
            PubSub.default.pub("showToast", "prompt.select.noModelSelected");
            return undefined;
        }
        return data.nodes;
    }
}
