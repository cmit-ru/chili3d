// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Binding, type I18nKeys, type IDocument, type INode, Localize, Transaction } from "@chili3d/core";
import { button, label, setSVGIcon, svg } from "@chili3d/element";
import style from "./treeItem.module.css";

export abstract class TreeItem extends HTMLElement {
    readonly name: HTMLLabelElement;
    readonly visibleIcon: SVGSVGElement;

    /**
     * Кнопки «Выше» и «Ниже» в самой строке (B-276). До них порядок в дереве
     * меняли только переносом мышью (`dragstart`/`drop` в `tree.ts`), а HTML5
     * drag and drop спецификацией для касания не определён — на планшете порядок
     * было не поменять ничем. Кнопка стоит там, где ребёнок видит деталь: не
     * «сначала выдели, потом ищи кнопку наверху», а одно нажатие по месту.
     */
    readonly moveUpButton: HTMLButtonElement;
    readonly moveDownButton: HTMLButtonElement;

    private _node: INode;
    get node() {
        return this._node;
    }

    constructor(
        private document: IDocument,
        node: INode,
    ) {
        super();
        this._node = node;
        this.draggable = true;
        this.name = label({
            className: style.name,
            textContent: new Binding(node, "name"),
        });
        this.visibleIcon = svg({
            className: style.icon,
            icon: this.getVisibleIcon(),
            onclick: this.onVisibleIconClick,
        });
        this.setVisibleStyle(node.parentVisible);
        this.moveUpButton = this.createMoveButton("items.move.up", this.onMoveUpClick);
        this.moveDownButton = this.createMoveButton("items.move.down", this.onMoveDownClick);
        this.updateMoveButtons();
    }

    private createMoveButton(key: I18nKeys, onclick: (e: MouseEvent) => void) {
        const result = button({
            className: style.moveButton,
            type: "button",
            textContent: new Localize(key),
        });
        // Кнопка сама источником переноса не будет: строку мышь таскает
        // (`draggable` выше), и нажатие, при котором палец или курсор чуть съехал,
        // браузер иначе принимает за начало переноса вместо нажатия.
        result.draggable = false;
        // Слушатель, а не свойство `onclick`, как у глазка выше: снять обработчик
        // в `dispose` можно только так.
        result.addEventListener("click", onclick);
        return result;
    }

    connectedCallback(): void {
        this.node.onPropertyChanged(this.onPropertyChanged);
    }

    disconnectedCallback(): void {
        this.node.removePropertyChanged(this.onPropertyChanged);
    }

    private readonly onPropertyChanged = (property: keyof INode, model: INode) => {
        if (property === "visible") {
            setSVGIcon(this.visibleIcon, this.getVisibleIcon());
        } else if (property === "parentVisible") {
            this.setVisibleStyle(model[property]);
        }
    };

    private setVisibleStyle(parentVisible?: boolean) {
        if (parentVisible === true) {
            this.visibleIcon.classList.remove(style["parent-hidden"]);
        } else {
            this.visibleIcon.classList.add(style["parent-hidden"]);
        }
    }

    addStyle(style: string) {
        this.mainElement().classList.add(style);
    }

    removeStyle(style: string) {
        this.mainElement().classList.remove(style);
    }

    abstract mainElement(): HTMLElement;

    dispose() {
        this.remove();
        this.node.removePropertyChanged(this.onPropertyChanged);
        this.visibleIcon.removeEventListener("click", this.onVisibleIconClick);
        this.moveUpButton.removeEventListener("click", this.onMoveUpClick);
        this.moveDownButton.removeEventListener("click", this.onMoveDownClick);
        this.document = null as any;
        this._node = null as any;
    }

    /**
     * Нажатие, от которого ничего не произойдёт, ребёнок читает как поломку
     * (правило каркаса, `frame-contract.md`), поэтому у первого узла «Выше» не
     * показывается вовсе, а у последнего — «Ниже». Место кнопки при этом
     * остаётся занятым (`visibility`, а не `display`): иначе столбцы кнопок
     * прыгали бы от строки к строке и палец попадал бы по соседней.
     */
    updateMoveButtons() {
        const node = this.node;
        const hasParent = node?.parent !== undefined;
        this.setMoveButtonUsable(this.moveUpButton, hasParent && node.previousSibling !== undefined);
        this.setMoveButtonUsable(this.moveDownButton, hasParent && node.nextSibling !== undefined);
    }

    private setMoveButtonUsable(element: HTMLButtonElement, usable: boolean) {
        element.disabled = !usable;
        element.classList.toggle(style.moveHidden, !usable);
    }

    /**
     * Третий аргумент `move` — сосед, ЗА которым узел встанет, поэтому шаг вверх
     * берёт соседа через одного: у второй сверху строки его нет, и узел встаёт
     * первым.
     */
    private readonly onMoveUpClick = (e: MouseEvent) => {
        e.stopPropagation();
        const previous = this.node?.previousSibling;
        if (previous) this.moveAfter(previous.previousSibling);
    };

    private readonly onMoveDownClick = (e: MouseEvent) => {
        e.stopPropagation();
        const next = this.node?.nextSibling;
        if (next) this.moveAfter(next);
    };

    private moveAfter(previousSibling: INode | undefined) {
        const parent = this.node.parent;
        if (!parent) return;
        // Имя правки то же, что у переноса мышью: для «Отменить» это одно и то же
        // действие, как бы ребёнок его ни сделал.
        Transaction.execute(this.document, "move node", () => {
            parent.move(this.node, parent, previousSibling);
        });
    }

    private getVisibleIcon() {
        return this.node.visible ? "icon-eye" : "icon-eye-slash";
    }

    private readonly onVisibleIconClick = (e: MouseEvent) => {
        e.stopPropagation();
        Transaction.execute(this.document, "change visible", () => {
            this.node.visible = !this.node.visible;
        });
        this.document.visual.update();
    };
}
