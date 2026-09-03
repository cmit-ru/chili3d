// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Два инструмента надписи: отдельная надпись на рабочей плоскости и надпись
// прямо на грани тела — выпуклая или вдавленная.

import {
    Combobox,
    command,
    type GeometryNode,
    type IFace,
    type IStep,
    MultistepCommand,
    Plane,
    PointStep,
    PubSub,
    property,
    SelectShapeStep,
    ShapeNode,
    ShapeTypes,
    Transaction,
    XYZ,
} from "@chili3d/core";
import { BooleanNode, TextNode } from "../../bodys";
import { DEFAULT_FONT_ID, FONT_COMBOBOX, loadAllFonts, loadedFont } from "../../text/fonts";
import { textShape } from "../../text/textShape";
import { CreateCommand } from "../createCommand";

/**
 * Насколько буквы утапливаются в тело. Ядро не берётся объединять или вычитать
 * фигуры, которые ровно касаются гранью: результат вырожденный. Поэтому буквы
 * всегда заходят внутрь на эту глубину — на модели это не видно.
 */
const УТОПИТЬ = 0.2;

const СПОСОБ = Combobox.from(["option.text.raised", "option.text.engraved"]);

/** Свойства, общие для обоих инструментов: что написать и чем. */
abstract class TextCommandBase extends MultistepCommand {
    @property("text.content")
    get text(): string {
        return this.getPrivateValue("text", "Привет");
    }
    set text(value: string) {
        this.setProperty("text", value);
    }

    @property("text.font", { combobox: FONT_COMBOBOX })
    get fontId(): string {
        return this.getPrivateValue("fontId", DEFAULT_FONT_ID);
    }
    set fontId(value: string) {
        this.setProperty("fontId", value);
    }

    @property("text.height")
    get fontHeight(): number {
        return this.getPrivateValue("fontHeight", 10);
    }
    set fontHeight(value: number) {
        this.setProperty("fontHeight", value);
    }

    /** Шрифты качаются по сети — ждём их до первого щелчка, а не после. */
    protected override async canExcute(): Promise<boolean> {
        await loadAllFonts();
        return true;
    }
}

@command({
    key: "create.text",
    icon: "icon-text",
})
export class TextCommand extends TextCommandBase {
    @property("common.thickness")
    get thickness(): number {
        return this.getPrivateValue("thickness", 2);
    }
    set thickness(value: number) {
        this.setProperty("thickness", value);
    }

    protected override getSteps(): IStep[] {
        return [new PointStep("prompt.pickPoint")];
    }

    protected override executeMainTask(): void {
        Transaction.execute(this.document, "text", () => {
            this.document.modelManager.addNode(this.geometryNode());
            this.document.visual.update();
        });
    }

    private geometryNode(): GeometryNode {
        const { point, view } = this.stepDatas[0];
        const плоскость = new Plane({
            origin: point!,
            normal: view.workplane.normal,
            xvec: view.workplane.xvec,
        });
        return new TextNode({
            document: this.document,
            plane: плоскость,
            text: this.text,
            fontId: this.fontId,
            fontHeight: this.fontHeight,
            thickness: this.thickness,
        });
    }
}

@command({
    key: "create.textOnBody",
    icon: "icon-textOnBody",
})
export class TextOnBodyCommand extends TextCommandBase {
    @property("text.depth")
    get depth(): number {
        return this.getPrivateValue("depth", 1);
    }
    set depth(value: number) {
        this.setProperty("depth", value);
    }

    @property("text.mode", { combobox: СПОСОБ })
    get mode(): string {
        return this.getPrivateValue("mode", "option.text.raised");
    }
    set mode(value: string) {
        this.setProperty("mode", value);
    }

    protected override getSteps(): IStep[] {
        return [
            new SelectShapeStep(ShapeTypes.face, "prompt.select.faces", {
                nodeFilter: { allow: (node) => node instanceof ShapeNode && node.shape.isOk },
            }),
        ];
    }

    protected override executeMainTask(): void {
        const шрифт = loadedFont(this.fontId);
        if (!шрифт) {
            PubSub.default.pub("showToast", "error.default:{0}", "Шрифт не загрузился");
            return;
        }

        const выбор = this.stepDatas[0].shapes[0];
        const тело = выбор.owner.node;
        if (!(тело instanceof ShapeNode) || !тело.shape.isOk) return;

        const грань = this.transformdFirstShape(this.stepDatas[0]) as IFace;
        const [, нормаль] = грань.normal(0, 0);
        const выпуклая = this.mode === "option.text.raised";
        const глубина = Math.max(this.depth, УТОПИТЬ) + УТОПИТЬ;
        // Буквы начинаются по ту сторону грани, чтобы пересечение с телом было
        // объёмным: у выпуклой — чуть внутри тела, у вдавленной — чуть снаружи.
        const начало = выбор.point!.add(нормаль.multiply(выпуклая ? -УТОПИТЬ : УТОПИТЬ));
        const плоскость = new Plane({ origin: начало, normal: нормаль, xvec: осьНадписи(нормаль) });

        const буквы = textShape(шрифт, this.text, this.fontHeight, выпуклая ? глубина : -глубина, плоскость);
        if (!буквы.isOk) {
            PubSub.default.pub("showToast", "error.default:{0}", буквы.error);
            return;
        }
        this.disposeStack.add(буквы.value);

        const исходное = тело.shape.value.transformedMul(выбор.transform);
        this.disposeStack.add(исходное);
        const итог = выпуклая
            ? shapeFactory.booleanFuse([исходное], [буквы.value], true)
            : shapeFactory.booleanCut([исходное], [буквы.value]);
        if (!итог.isOk) {
            PubSub.default.pub("showToast", "error.default:{0}", итог.error);
            return;
        }

        Transaction.execute(this.document, "text on body", () => {
            const узел = new BooleanNode({ document: this.document, booleanShape: итог.value });
            узел.name = тело.name;
            тело.parent?.insertAfter(тело, узел);
            тело.parent?.remove(тело);
            this.document.visual.update();
        });
    }
}

/**
 * Куда смотрит строка на грани. По вертикальной грани надпись должна идти
 * горизонтально и стоять вертикально — как на боку коробки.
 */
export function осьНадписи(нормаль: XYZ): XYZ {
    if (нормаль.isParallelTo(XYZ.unitZ)) return XYZ.unitX;
    return XYZ.unitZ.cross(нормаль).normalize()!;
}
