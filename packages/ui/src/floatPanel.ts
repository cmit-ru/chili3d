// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type FloatPanelOptions, Localize } from "@chili3d/core";
import { div, label, svg } from "@chili3d/element";
import style from "./floatPanel.module.css";

const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 200;
const DEFAULT_MIN_WIDTH = 150;
const DEFAULT_MIN_HEIGHT = 100;

export class FloatPanel extends HTMLElement {
    private header: HTMLElement;
    private resizeHandle: HTMLElement;
    private isDragging = false;
    private isResizing = false;
    // Указатель, который сейчас ведёт окно: и заголовок, и уголок правят одни и те же
    // поля dragStart*, поэтому второй палец, пока идёт первый, мы не слушаем (B-276).
    private activePointerId?: number;
    private dragStartX = 0;
    private dragStartY = 0;
    private initialLeft = 0;
    private initialTop = 0;
    private initialWidth = 0;
    private initialHeight = 0;

    constructor(options: FloatPanelOptions) {
        super();
        this.className = style.root;
        this.style.left = `${options.x ?? 20}px`;
        this.style.top = `${options.y ?? 20}px`;
        this.style.width = `${options.width ?? DEFAULT_WIDTH}px`;
        this.style.height = `${options.height ?? DEFAULT_HEIGHT}px`;
        this.style.minWidth = `${options.minWidth ?? DEFAULT_MIN_WIDTH}px`;
        this.style.minHeight = `${options.minHeight ?? DEFAULT_MIN_HEIGHT}px`;

        this.header = this.createHeader(options);
        this.resizeHandle = div({ className: style.resizeHandle });

        const content = div({ className: style.content }, options.content);
        this.append(this.header, content, this.resizeHandle);

        // Указатель, а не мышь (B-276): на планшете окно двигают и растягивают пальцем.
        this.header.addEventListener("pointerdown", this.onHeaderPointerDown);
        this.resizeHandle.addEventListener("pointerdown", this.onResizeHandlePointerDown);

        // Intercept keyboard events to prevent bubbling to window and triggering global shortcuts
        this.tabIndex = -1;
        this.addEventListener("keydown", this.handleKeyEvent);
    }

    private createHeader(options: FloatPanelOptions): HTMLElement {
        return div(
            { className: style.header },
            div({ className: style.title }, label({ textContent: new Localize(options.title) })),
            div(
                {
                    className: style.closeButton,
                    onclick: () => {
                        try {
                            options.onClose?.();
                        } finally {
                            this.remove();
                            this.dispose();
                        }
                    },
                },
                svg({
                    icon: "icon-times",
                }),
            ),
        );
    }

    // Захват указателя вместо слушателей на документе (B-276). Палец ведёт окно как
    // попало: уходит с заголовка на сцену, а то и за край окна. `setPointerCapture`
    // отдаёт весь ход этого указателя заголовку, куда бы палец ни ушёл, — потому и
    // слушатели ниже висят на заголовке. Мыши это не меняет ничего: захват держится,
    // пока кнопка нажата, и отпускается вместе с ней.
    private onHeaderPointerDown = (e: PointerEvent): void => {
        // `closest`, а не `classList` у самой мишени: пальцем попадают по значку внутри
        // крестика, и тогда с захватом клик уехал бы на заголовок — окно перестало бы
        // закрываться.
        if ((e.target as Element).closest?.(`.${style.closeButton}`)) {
            return;
        }
        if (this.activePointerId !== undefined) return;

        this.activePointerId = e.pointerId;
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;

        const rect = this.getBoundingClientRect();
        this.initialLeft = rect.left;
        this.initialTop = rect.top;

        this.header.setPointerCapture(e.pointerId);
        this.header.addEventListener("pointermove", this.onDrag);
        this.header.addEventListener("pointerup", this.onDragEnd);
        // Системный жест (шторка, переключение приложений) обрывает указатель
        // `pointercancel`, `pointerup` при этом не приходит — без этого окно осталось
        // бы висеть на пальце, которого уже нет.
        this.header.addEventListener("pointercancel", this.onDragEnd);
        e.preventDefault();
    };

    private onDrag = (e: PointerEvent): void => {
        if (!this.isDragging || e.pointerId !== this.activePointerId) return;

        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        this.style.left = `${this.initialLeft + dx}px`;
        this.style.top = `${this.initialTop + dy}px`;
    };

    private onDragEnd = (e: PointerEvent): void => {
        if (e.pointerId !== this.activePointerId) return;

        this.isDragging = false;
        this.activePointerId = undefined;
        // Отпущенного пальца среди указателей уже нет, и слепой
        // `releasePointerCapture` бросил бы NotFoundError — спрашиваем.
        if (this.header.hasPointerCapture(e.pointerId)) this.header.releasePointerCapture(e.pointerId);
        this.header.removeEventListener("pointermove", this.onDrag);
        this.header.removeEventListener("pointerup", this.onDragEnd);
        this.header.removeEventListener("pointercancel", this.onDragEnd);
    };

    // Тот же захват, что и у заголовка (B-276), и он тут даже нужнее: уголок — квадрат
    // 16 px, палец сходит с него сразу.
    private onResizeHandlePointerDown = (e: PointerEvent): void => {
        if (this.activePointerId !== undefined) return;

        this.activePointerId = e.pointerId;
        this.isResizing = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;

        const rect = this.getBoundingClientRect();
        this.initialWidth = rect.width;
        this.initialHeight = rect.height;

        this.resizeHandle.setPointerCapture(e.pointerId);
        this.resizeHandle.addEventListener("pointermove", this.onResize);
        this.resizeHandle.addEventListener("pointerup", this.onResizeEnd);
        this.resizeHandle.addEventListener("pointercancel", this.onResizeEnd);
        e.preventDefault();
        e.stopPropagation();
    };

    private onResize = (e: PointerEvent): void => {
        if (!this.isResizing || e.pointerId !== this.activePointerId) return;

        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        const minWidth = parseInt(this.style.minWidth) || DEFAULT_MIN_WIDTH;
        const minHeight = parseInt(this.style.minHeight) || DEFAULT_MIN_HEIGHT;

        this.style.width = `${Math.max(minWidth, this.initialWidth + dx)}px`;
        this.style.height = `${Math.max(minHeight, this.initialHeight + dy)}px`;
    };

    private onResizeEnd = (e: PointerEvent): void => {
        if (e.pointerId !== this.activePointerId) return;

        this.isResizing = false;
        this.activePointerId = undefined;
        if (this.resizeHandle.hasPointerCapture(e.pointerId)) {
            this.resizeHandle.releasePointerCapture(e.pointerId);
        }
        this.resizeHandle.removeEventListener("pointermove", this.onResize);
        this.resizeHandle.removeEventListener("pointerup", this.onResizeEnd);
        this.resizeHandle.removeEventListener("pointercancel", this.onResizeEnd);
    };

    private handleKeyEvent = (e: KeyboardEvent): void => {
        e.stopImmediatePropagation();
    };

    dispose(): void {
        this.removeEventListener("keydown", this.handleKeyEvent);
        this.header.removeEventListener("pointerdown", this.onHeaderPointerDown);
        this.resizeHandle.removeEventListener("pointerdown", this.onResizeHandlePointerDown);
        this.header.removeEventListener("pointermove", this.onDrag);
        this.header.removeEventListener("pointerup", this.onDragEnd);
        this.header.removeEventListener("pointercancel", this.onDragEnd);
        this.resizeHandle.removeEventListener("pointermove", this.onResize);
        this.resizeHandle.removeEventListener("pointerup", this.onResizeEnd);
        this.resizeHandle.removeEventListener("pointercancel", this.onResizeEnd);
    }
}

customElements.define("chili-float-panel", FloatPanel);

export function showFloatPanel(options: FloatPanelOptions): FloatPanel {
    const panel = new FloatPanel(options);
    const host = app.mainWindow ?? document.body;
    host.appendChild(panel);
    return panel;
}
