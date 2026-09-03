// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Plane, XYZ } from "@chili3d/core";
import { afterAll, beforeAll, describe, expect, test } from "@rstest/core";
import { TextNode } from "../../../src/bodys/text";
import { TextCommand, TextOnBodyCommand, осьНадписи } from "../../../src/commands/create/text";
import { DEFAULT_FONT_ID } from "../../../src/text/fonts";
import { ensureGlobalStubApp, pointStepResult, seedStepDatas, wireCommand } from "../commandTestUtils";

let restoreApp: () => void;
beforeAll(() => {
    restoreApp = ensureGlobalStubApp();
});
afterAll(() => restoreApp());

describe("TextCommand", () => {
    test("should have command metadata", () => {
        const data = (TextCommand as any).prototype.data;
        expect(data.key).toBe("create.text");
        expect(data.icon).toBe("icon-text");
    });

    test("одна точка — и надпись поставлена", () => {
        const cmd = new TextCommand();
        expect((cmd as any).getSteps()).toHaveLength(1);
    });

    test("значения по умолчанию годятся для первого урока", () => {
        const cmd = new TextCommand();
        expect(cmd.fontId).toBe(DEFAULT_FONT_ID);
        expect(cmd.fontHeight).toBeGreaterThan(0);
        expect(cmd.thickness).toBeGreaterThan(0);
        expect(cmd.text.length).toBeGreaterThan(0);
    });

    test("узел встаёт в выбранную точку и лежит на рабочей плоскости", () => {
        const cmd = new TextCommand();
        wireCommand(cmd);
        const точка = new XYZ({ x: 3, y: 4, z: 0 });
        seedStepDatas(cmd, [pointStepResult({ point: точка })]);
        cmd.text = "Аб";
        cmd.fontHeight = 12;
        cmd.thickness = 3;

        const узел = (cmd as any).geometryNode() as TextNode;

        expect(узел).toBeInstanceOf(TextNode);
        expect(узел.plane.origin.isEqualTo(точка)).toBe(true);
        expect(узел.plane.normal.isEqualTo(Plane.XY.normal)).toBe(true);
        expect(узел.text).toBe("Аб");
        expect(узел.fontHeight).toBe(12);
        expect(узел.thickness).toBe(3);
    });
});

describe("TextOnBodyCommand", () => {
    test("should have command metadata", () => {
        const data = (TextOnBodyCommand as any).prototype.data;
        expect(data.key).toBe("create.textOnBody");
        expect(data.icon).toBe("icon-textOnBody");
    });

    test("выбирается одна грань, по умолчанию надпись выпуклая", () => {
        const cmd = new TextOnBodyCommand();
        expect((cmd as any).getSteps()).toHaveLength(1);
        expect(cmd.mode).toBe("option.text.raised");
        expect(cmd.depth).toBeGreaterThan(0);
    });
});

describe("осьНадписи", () => {
    test("на верхней грани строка идёт вдоль X", () => {
        expect(осьНадписи(XYZ.unitZ).isEqualTo(XYZ.unitX)).toBe(true);
    });

    test("на нижней грани строка тоже идёт вдоль X", () => {
        expect(осьНадписи(XYZ.unitNZ).isEqualTo(XYZ.unitX)).toBe(true);
    });

    test("на боковой грани буквы стоят, а не лежат", () => {
        const нормаль = XYZ.unitX;
        const ось = осьНадписи(нормаль);
        const верх = нормаль.cross(ось).normalize()!;

        expect(ось.isEqualTo(XYZ.unitY)).toBe(true);
        expect(верх.isEqualTo(XYZ.unitZ)).toBe(true);
    });
});
