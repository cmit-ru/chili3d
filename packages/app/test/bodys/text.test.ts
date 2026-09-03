// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IDocument, Plane, XYZ } from "@chili3d/core";
import { createMockDocument } from "@chili3d/core/test-utils";
import { beforeEach, describe, expect, test } from "@rstest/core";
import { TextNode } from "../../src/bodys/text";
import { DEFAULT_FONT_ID } from "../../src/text/fonts";

describe("TextNode", () => {
    let doc: IDocument;
    const параметры = () => ({
        document: doc,
        plane: Plane.XY,
        text: "Привет",
        fontId: DEFAULT_FONT_ID,
        fontHeight: 10,
        thickness: 2,
    });

    beforeEach(() => {
        doc = createMockDocument();
    });

    test("узел называется «Надпись» на языке пользователя", () => {
        const node = new TextNode(параметры());
        expect(node.display()).toBe("body.text");
        expect(node.name).toBe("body.text");
    });

    test("сохраняет всё, чем задана надпись", () => {
        const node = new TextNode(параметры());
        expect(node.text).toBe("Привет");
        expect(node.fontId).toBe(DEFAULT_FONT_ID);
        expect(node.fontHeight).toBe(10);
        expect(node.thickness).toBe(2);
        expect(node.plane).toBe(Plane.XY);
    });

    test("положение читается и меняется через плоскость", () => {
        const node = new TextNode(параметры());
        const куда = new XYZ({ x: 1, y: 2, z: 3 });

        node.location = куда;

        expect(node.location.isEqualTo(куда)).toBe(true);
        expect(node.plane.normal.isEqualTo(Plane.XY.normal)).toBe(true);
    });

    // Шрифт приезжает по сети, а построение фигуры синхронное: пока файла нет,
    // узел обязан честно сказать «пока не могу», а не бросить исключение.
    test("без загруженного шрифта фигура не строится, но и не падает", () => {
        const node = new TextNode(параметры());
        expect(node.shape.isOk).toBe(false);
    });
});
