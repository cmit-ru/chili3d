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
                    ...combobox.items.map((item) => {
                        const метка = combobox.converter?.convert(item).value ?? String(item);
                        return option({
                            value: String(item),
                            textContent: метка,
                            selected: item === текущее,
                            // Если подпись пункта совпадает с именем уже загруженного
                            // шрифта (fonts.ts регистрирует их в document.fonts под
                            // собственным именем), рисуем пункт этим же шрифтом — так
                            // ребёнок выбирает шрифт глазами, а не по названию вслепую.
                            // На остальные списки (не про шрифты) это не влияет: их
                            // подписи ни с одним загруженным шрифтом не совпадают.
                            style: шрифтЗагружен(метка) ? { fontFamily: `"${метка}", sans-serif` } : {},
                        });
                    }),
                ),
            ),
        );
    }
}

/** Есть ли в document.fonts шрифт с таким именем — без этого превью не построить. */
function шрифтЗагружен(имя: string): boolean {
    if (typeof document === "undefined" || !document.fonts?.check) return false;
    try {
        return document.fonts.check(`16px "${имя}"`);
    } catch {
        return false;
    }
}

customElements.define("chili-select-property", SelectProperty);
