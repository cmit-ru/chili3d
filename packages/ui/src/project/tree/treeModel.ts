// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument, INode } from "@chili3d/core";
import { TreeItem } from "./treeItem";
import style from "./treeModel.module.css";

export class TreeModel extends TreeItem {
    constructor(document: IDocument, node: INode) {
        super(document, node);
        // «Выше» и «Ниже» — между именем и глазком (B-276): глазок остаётся
        // крайним справа, как ребёнок к нему и привык.
        this.append(this.name, this.moveUpButton, this.moveDownButton, this.visibleIcon);
        this.classList.add(style.panel);
    }

    mainElement(): HTMLElement {
        return this;
    }
}

customElements.define("tree-model", TreeModel);
