// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type I18nKeys,
    type IDocument,
    type IShape,
    ParameterShapeNode,
    type Plane,
    property,
    Result,
    serializable,
    serialize,
    type XYZ,
} from "@chili3d/core";
import { DEFAULT_FONT_ID, FONT_COMBOBOX, loadedFont, loadFont } from "../text/fonts";
import { textShape } from "../text/textShape";

export interface TextNodeOptions {
    document: IDocument;
    plane: Plane;
    text: string;
    fontId: string;
    /** Высота заглавной буквы в миллиметрах. */
    fontHeight: number;
    thickness: number;
}

@serializable()
export class TextNode extends ParameterShapeNode {
    override display(): I18nKeys {
        return "body.text";
    }

    @serialize()
    get plane(): Plane {
        return this.getPrivateValue("plane");
    }

    @property("common.location")
    get location() {
        return this.plane.origin;
    }
    set location(value: XYZ) {
        this.setPropertyEmitShapeChanged("plane", this.plane.translateTo(value));
    }

    @serialize()
    @property("text.content")
    get text(): string {
        return this.getPrivateValue("text");
    }
    set text(value: string) {
        this.setPropertyEmitShapeChanged("text", value);
    }

    @serialize()
    @property("text.font", { combobox: FONT_COMBOBOX })
    get fontId(): string {
        return this.getPrivateValue("fontId", DEFAULT_FONT_ID);
    }
    set fontId(value: string) {
        this.setPropertyEmitShapeChanged("fontId", value);
    }

    @serialize()
    @property("text.height")
    get fontHeight(): number {
        return this.getPrivateValue("fontHeight");
    }
    set fontHeight(value: number) {
        this.setPropertyEmitShapeChanged("fontHeight", value);
    }

    @serialize()
    @property("common.thickness")
    get thickness(): number {
        return this.getPrivateValue("thickness");
    }
    set thickness(value: number) {
        this.setPropertyEmitShapeChanged("thickness", value);
    }

    constructor(options: TextNodeOptions) {
        super(options);
        this.setPrivateValue("plane", options.plane);
        this.setPrivateValue("text", options.text);
        this.setPrivateValue("fontId", options.fontId);
        this.setPrivateValue("fontHeight", options.fontHeight);
        this.setPrivateValue("thickness", options.thickness);
    }

    override generateShape(): Result<IShape> {
        const шрифт = loadedFont(this.fontId);
        if (!шрифт) {
            this.дождатьсяШрифта();
            return Result.err("Шрифт ещё загружается");
        }
        return textShape(шрифт, this.text, this.fontHeight, this.thickness, this.plane);
    }

    /**
     * Построение фигуры синхронное, а шрифт приезжает по сети. Работа, открытая
     * заново, сначала не может собрать буквы — поэтому ждём файл и пересобираем
     * надпись, когда он приехал. Историю на это время выключаем: скачивание
     * шрифта — не действие ребёнка, «Отменить» от него загораться не должно.
     */
    private дождатьсяШрифта() {
        loadFont(this.fontId).then((шрифт) => {
            // Шрифт не приехал — второй заход ничего не изменит, а рекурсия
            // через generateShape() зациклила бы попытки.
            if (!шрифт) return;
            const форма = this.generateShape();
            if (!форма.isOk) return;
            const история = this.document.history;
            const было = история.disabled;
            история.disabled = true;
            try {
                this.shape = форма;
            } finally {
                история.disabled = было;
            }
            this.document.visual.update();
        });
    }
}
