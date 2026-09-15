// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type AsyncController,
    type IApplication,
    type ICommand,
    type IDocument,
    type Material,
    PubSub,
    type Ribbon,
} from "@chili3d/core";
import { div } from "@chili3d/element";
import style from "./editor.module.css";
import { ProjectView } from "./project";
import { PropertyView } from "./property";
import { MaterialDataContent, MaterialEditor } from "./property/material";
import { RibbonUI } from "./ribbon";
import { CommandContext } from "./ribbon/commandContext";
import { Statusbar } from "./statusbar";
import { LayoutViewport } from "./viewport";

export class Editor extends HTMLElement {
    private readonly _viewportContainer: HTMLDivElement;
    private readonly _commandContextContainer = div({});
    private commandContext?: CommandContext;
    private _sidebarWidth: number = 360;
    private _isResizingSidebar: boolean = false;
    private _sidebarEl: HTMLDivElement | null = null;

    constructor(
        readonly app: IApplication,
        readonly ribbonContent: Ribbon,
    ) {
        super();
        const viewport = new LayoutViewport(app);
        viewport.classList.add(style.viewport);
        this._viewportContainer = div({ className: style.viewportContainer }, viewport);
        this.render();
    }

    private render() {
        this._sidebarEl = div(
            {
                // Стабильный id: панель урока форка «Макетки» встаёт первым
                // ребёнком этой колонки, а не накладкой поверх свойств фигуры.
                id: "editor-sidebar",
                className: style.sidebar,
                style: `width: ${this._sidebarWidth}px;`,
            },
            new ProjectView({ className: style.sidebarItem }),
            new PropertyView({ className: style.sidebarItem }),
            div({
                className: style.sidebarResizer,
                // Указатель, а не мышь (B-276): на планшете панель тянут пальцем,
                // а `mousedown` палец не порождает.
                onpointerdown: (e: PointerEvent) => this._startSidebarResize(e),
            }),
        );
        this.append(
            div(
                { className: style.root },
                new RibbonUI(this.app, this.ribbonContent),
                div({ className: style.content }, this._sidebarEl, this._viewportContainer),
                new Statusbar(style.statusbar),
            ),
        );
        this.app.mainWindow?.appendChild(this);
    }

    // Захват указателя вместо слушателей на окне (B-276). Рукоятка — полоска в 6 px:
    // палец съезжает с неё на первом же движении, и тогда `pointermove` достаётся
    // сцене под пальцем — панель бросает тянуться, а модель начинает крутиться.
    // `setPointerCapture` адресует весь ход этого указателя самой рукоятке, куда бы
    // он ни ушёл, поэтому и слушатели висят на ней. Мыши это ничего не меняет:
    // указатель мыши — тот же указатель, кнопка держит захват до отпускания.
    private _startSidebarResize(e: PointerEvent) {
        // Второй палец во время растягивания игнорируем: ширину считает один
        // указатель, два разом дёргали бы панель между собой.
        if (this._isResizingSidebar) return;
        const resizer = e.currentTarget as HTMLElement;
        e.preventDefault();
        this._isResizingSidebar = true;
        resizer.setPointerCapture(e.pointerId);
        if (this.app.mainWindow) this.app.mainWindow.style.cursor = "ew-resize";
        const onPointerMove = (ev: PointerEvent) => {
            if (!this._isResizingSidebar || ev.pointerId !== e.pointerId) return;
            if (!this._sidebarEl) return;
            const sidebarRect = this._sidebarEl.getBoundingClientRect();
            let newWidth = ev.clientX - sidebarRect.left;
            const minWidth = 75;
            const maxWidth = Math.floor(window.innerWidth * 0.85);
            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
            this._sidebarWidth = newWidth;
            this._sidebarEl.style.width = `${newWidth}px`;
        };
        const onPointerUp = (ev: PointerEvent) => {
            if (ev.pointerId !== e.pointerId) return;
            this._isResizingSidebar = false;
            if (this.app.mainWindow) this.app.mainWindow.style.cursor = "";
            // Отпущенного пальца среди указателей уже нет, и слепой
            // `releasePointerCapture` бросил бы NotFoundError — спрашиваем.
            if (resizer.hasPointerCapture(ev.pointerId)) resizer.releasePointerCapture(ev.pointerId);
            resizer.removeEventListener("pointermove", onPointerMove);
            resizer.removeEventListener("pointerup", onPointerUp);
            resizer.removeEventListener("pointercancel", onPointerUp);
        };
        resizer.addEventListener("pointermove", onPointerMove);
        resizer.addEventListener("pointerup", onPointerUp);
        // Системный жест (шторка, переключение приложений) обрывает указатель
        // `pointercancel`, и `pointerup` уже не придёт — без этого панель осталась
        // бы прилипшей к пальцу.
        resizer.addEventListener("pointercancel", onPointerUp);
    }

    connectedCallback(): void {
        PubSub.default.sub("editMaterial", this._handleMaterialEdit);
        PubSub.default.sub("openCommandContext", this.openContext);
        PubSub.default.sub("closeCommandContext", this.closeContext);
    }

    disconnectedCallback(): void {
        PubSub.default.remove("editMaterial", this._handleMaterialEdit);
        PubSub.default.remove("openCommandContext", this.openContext);
        PubSub.default.remove("closeCommandContext", this.closeContext);
    }

    private readonly openContext = (command: ICommand) => {
        if (this.commandContext) {
            this.closeContext();
        }
        this.commandContext = new CommandContext(command);
        this._commandContextContainer.append(this.commandContext);
        this._viewportContainer.append(this._commandContextContainer);
    };

    private readonly closeContext = () => {
        this.commandContext?.remove();
        this.commandContext?.dispose();
        this.commandContext = undefined;
        this._commandContextContainer.innerHTML = "";
    };

    private readonly _handleMaterialEdit = (
        document: IDocument,
        editingMaterial: Material,
        callback: (material: Material) => void,
    ) => {
        const context = new MaterialDataContent(document, callback, editingMaterial);
        this._viewportContainer.append(new MaterialEditor(context));
    };
}

customElements.define("chili-editor", Editor);
