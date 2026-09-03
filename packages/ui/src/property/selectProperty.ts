// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Свойство с выбором из списка. Поле `combobox` у Property в ядре было, а
// рисовать его было некому: строковое свойство показывалось полем ввода, и
// «шрифт» ребёнку пришлось бы набирать руками. Здесь список из готовых
// значений — по одному пункту на вариант.

import { type Combobox, type IDocument, Localize, type Property, Transaction } from "@chili3d/core";
import { div, option, select, span } from "@chili3d/element";
import commonStyle from "./common.module.css";
import { PropertyBase } from "./propertyBase";

export class SelectProperty extends PropertyBase {
    constructor(
        readonly document: IDocument,
        objects: any[],
        readonly property: Property,
    ) {
        super(objects);
        const combobox = property.combobox as Combobox<any>;
        const текущее = objects[0][property.name];

        this.appendChild(
            div(
                { className: commonStyle.panel },
                span({ className: commonStyle.propertyName, textContent: new Localize(property.display) }),
                select(
                    {
                        style: { flex: "1 1 auto", minWidth: "0" },
                        onchange: (e) => {
                            const value = combobox.items.at((e.target as HTMLSelectElement).selectedIndex);
                            Transaction.execute(document, "modify property", () => {
                                objects.forEach((x) => {
                                    x[property.name] = value;
                                });
                                document.visual.update();
                            });
                        },
                    },
                    ...combobox.items.map((item) =>
                        option({
                            value: String(item),
                            textContent: combobox.converter?.convert(item).value ?? String(item),
                            selected: item === текущее,
                        }),
                    ),
                ),
            ),
        );
    }
}

customElements.define("chili-select-property", SelectProperty);
