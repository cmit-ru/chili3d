// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Config,
    type I18nKeys,
    Localize,
    type ObjectSnapType,
    ObjectSnapTypes,
    ObjectSnapTypeUtils,
} from "@chili3d/core";
import { div, input, label, span } from "@chili3d/element";
import style from "./snapConfig.module.css";

interface SnapTypeItem {
    type: ObjectSnapType;
    display: I18nKeys;
}

/** Плашка читается как одна фраза: подпись-вопрос «Прилипать к:», а галочки —
 *  ответы на неё. Первые четыре понятны ребёнку сразу, остальные идут после
 *  слова «ещё». Подписи берутся из отдельных ключей `snapTo.*`: те же `snap.*`
 *  показываются подсказкой у курсора, где нужен другой падеж. */
const PrimarySnapTypes: SnapTypeItem[] = [
    {
        type: ObjectSnapTypes.endPoint,
        display: "snapTo.end",
    },
    {
        type: ObjectSnapTypes.midPoint,
        display: "snapTo.mid",
    },
    {
        type: ObjectSnapTypes.center,
        display: "snapTo.center",
    },
    {
        type: ObjectSnapTypes.intersection,
        display: "snapTo.intersection",
    },
];

const MoreSnapTypes: SnapTypeItem[] = [
    {
        type: ObjectSnapTypes.perpendicular,
        display: "snapTo.perpendicular",
    },
    {
        type: ObjectSnapTypes.tangent,
        display: "snapTo.tangent",
    },
    {
        type: ObjectSnapTypes.onCurve,
        display: "snapTo.nearCurve",
    },
    {
        type: ObjectSnapTypes.onSurface,
        display: "snapTo.onSurface",
    },
];

export class SnapConfig extends HTMLElement {
    constructor() {
        super();
        this.className = style.container;
        Config.instance.onPropertyChanged(this.snapTypeChanged);

        this.render();
    }

    private readonly snapTypeChanged = (property: keyof Config) => {
        if (property === "snapType" || property === "enableSnap" || property === "enableSnapTracking") {
            this.innerHTML = "";
            this.render();
        }
    };

    private handleSnapClick(snapType: ObjectSnapType) {
        if (ObjectSnapTypeUtils.hasType(Config.instance.snapType, snapType)) {
            Config.instance.snapType = ObjectSnapTypeUtils.removeType(Config.instance.snapType, snapType);
        } else {
            Config.instance.snapType = ObjectSnapTypeUtils.addType(Config.instance.snapType, snapType);
        }
    }

    private caption(key: I18nKeys) {
        return span({
            className: style.caption,
            textContent: new Localize(key),
        });
    }

    private snapCheckbox(snapType: SnapTypeItem) {
        return div(
            input({
                type: "checkbox",
                id: `snap-${snapType.type}`,
                checked: ObjectSnapTypeUtils.hasType(Config.instance.snapType, snapType.type),
                onclick: () => this.handleSnapClick(snapType.type),
            }),
            label({
                htmlFor: `snap-${snapType.type}`,
                textContent: new Localize(snapType.display),
            }),
        );
    }

    private render() {
        this.append(
            this.caption("snapTo.title"),
            ...PrimarySnapTypes.map((snapType) => this.snapCheckbox(snapType)),
            this.caption("snapTo.more"),
            ...MoreSnapTypes.map((snapType) => this.snapCheckbox(snapType)),
            div(
                input({
                    type: "checkbox",
                    id: "snap-tracking",
                    checked: Config.instance.enableSnapTracking,
                    onclick: () => {
                        Config.instance.enableSnapTracking = !Config.instance.enableSnapTracking;
                    },
                }),
                label({
                    htmlFor: "snap-tracking",
                    textContent: new Localize("statusBar.tracking"),
                }),
            ),
        );
    }
}

customElements.define("chili-snap-config", SnapConfig);
