// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Надпись, построенная настоящим ядром OCCT: тут проверяется то, чего не видно
// на заглушках, — что из контуров получается тело, что дырка в «О» осталась
// дыркой, а высота букв в миллиметрах та, которую задал ребёнок.

import { readFileSync } from "node:fs";
import path from "node:path";
import { type ISolid, Plane, type ShapeType, ShapeTypes, XYZ } from "@chili3d/core";
import { initWasm, ShapeFactory } from "@chili3d/wasm";
import { beforeAll, describe, expect, test } from "@rstest/core";
import { parse } from "opentype.js/dist/opentype.mjs";
import type { LoadedFont } from "../../src/text/fonts";
import { textShape } from "../../src/text/textShape";

const ШРИФТЫ = path.resolve(import.meta.dirname, "../../src/text/fonts");

function шрифт(файл: string): LoadedFont {
    const данные = readFileSync(path.join(ШРИФТЫ, файл));
    const разобранный = parse(данные.buffer.slice(данные.byteOffset, данные.byteOffset + данные.byteLength));
    const рамка = разобранный.getPath("Н", 0, 0, 1000).getBoundingBox();
    return { font: разобранный, capHeight: (рамка.y2 - рамка.y1) / 1000 };
}

/** Суммарный объём всех тел формы: у слитой надписи их одно, у компаунда — много. */
function объём(форма: { shapeType: ShapeType; findSubShapes: (t: ShapeType) => unknown[] }): number {
    const тела =
        форма.shapeType === ShapeTypes.solid
            ? [форма as unknown as ISolid]
            : (форма.findSubShapes(ShapeTypes.solid) as ISolid[]);
    return тела.reduce((сумма, т) => сумма + т.volume(), 0);
}

beforeAll(async () => {
    await initWasm({
        wasmBinary: readFileSync(path.resolve(import.meta.dirname, "../../../wasm/lib/chili-wasm.wasm")),
    });
    Object.defineProperty(globalThis, "shapeFactory", {
        configurable: true,
        value: new ShapeFactory(),
    });
});

describe("объёмная надпись на ядре OCCT", () => {
    test("«ПРИВЕТ» — тело нужной высоты и толщины, посаженное в центр", () => {
        const форма = textShape(шрифт("PT_Sans-Web-Regular.ttf"), "ПРИВЕТ", 10, 2, Plane.XY);
        expect(форма.isOk).toBeTruthy();

        const рамка = форма.value.boundingBox();
        expect(рамка.max.y - рамка.min.y).toBeCloseTo(10, 0);
        expect(рамка.max.z - рамка.min.z).toBeCloseTo(2, 1);
        expect(рамка.min.z).toBeCloseTo(0, 1);
        // Надпись строится вокруг точки, которую ткнул ребёнок.
        expect(Math.abs(рамка.min.x + рамка.max.x) / 2).toBeLessThan(0.5);
        expect(объём(форма.value)).toBeGreaterThan(0);
    });

    test("у «О» внутри дырка, а не заливка", () => {
        const форма = textShape(шрифт("PT_Sans-Web-Regular.ttf"), "О", 10, 2, Plane.XY);
        expect(форма.isOk).toBeTruthy();

        const тело = форма.value as ISolid;
        expect(тело.containsPoint(new XYZ({ x: 0, y: 0, z: 1 }), false, 1e-6)).toBeFalsy();

        // Кольцо занимает заметно меньше половины своей рамки — заливка занимала бы всю.
        const рамка = форма.value.boundingBox();
        const рамкой =
            (рамка.max.x - рамка.min.x) * (рамка.max.y - рамка.min.y) * (рамка.max.z - рамка.min.z);
        expect(объём(форма.value)).toBeLessThan(рамкой * 0.6);
    });

    test("отрицательная толщина уводит буквы под плоскость — это вдавленная надпись", () => {
        const форма = textShape(шрифт("PT_Sans-Web-Regular.ttf"), "А", 10, -3, Plane.XY);
        expect(форма.isOk).toBeTruthy();

        const рамка = форма.value.boundingBox();
        expect(рамка.min.z).toBeCloseTo(-3, 1);
        expect(рамка.max.z).toBeCloseTo(0, 1);
    });

    test("надпись встаёт на любую плоскость, а не только на пол", () => {
        const форма = textShape(шрифт("PT_Sans-Web-Regular.ttf"), "Б", 10, 2, Plane.YZ);
        expect(форма.isOk).toBeTruthy();

        const рамка = форма.value.boundingBox();
        expect(рамка.max.x - рамка.min.x).toBeCloseTo(2, 1);
        expect(рамка.max.z - рамка.min.z).toBeCloseTo(10, 0);
    });

    test.each([
        ["PT_Sans-Web-Regular.ttf"],
        ["PT_Serif-Web-Regular.ttf"],
        ["PTM55FT.ttf"],
        ["BadScript-Regular.ttf"],
        ["RuslanDisplay-Regular.ttf"],
    ])("%s строит «Мама 8» без единого пропуска", (файл) => {
        const форма = textShape(шрифт(файл), "Мама 8", 10, 2, Plane.XY);
        expect(форма.isOk).toBeTruthy();
        expect(объём(форма.value)).toBeGreaterThan(0);
        // Пять букв и цифра: ни одна не должна потеряться по дороге.
        const рамка = форма.value.boundingBox();
        expect(рамка.max.x - рамка.min.x).toBeGreaterThan(20);
    });

    // Ради этого всё и затевалось: подписать брелок. Буквы притапливаются в грань
    // на УТОПИТЬ мм, чтобы булева операция не пришлась ровно на плоскость грани —
    // касание грань в грань ядро считает вырожденным случаем и часто отказывает.
    test("надпись прирастает к телу и вычитается из него", () => {
        const УТОПИТЬ = 0.2;
        const пластина = () => shapeFactory.box(Plane.XY, 60, 20, 5).value as ISolid;
        const объёмПластины = пластина().volume();
        const ш = шрифт("PT_Sans-Web-Regular.ttf");
        // Верхняя грань пластины лежит на z = 5.
        const верх = (z: number) =>
            new Plane({ origin: new XYZ({ x: 30, y: 10, z }), normal: XYZ.unitZ, xvec: XYZ.unitX });

        const выпуклая = textShape(ш, "Маша", 8, 2 + УТОПИТЬ, верх(5 - УТОПИТЬ));
        const приросло = shapeFactory.booleanFuse([пластина()], [выпуклая.value], true);
        expect(приросло.isOk).toBeTruthy();
        expect(объём(приросло.value)).toBeGreaterThan(объёмПластины);

        const вдавленная = textShape(ш, "Маша", 8, -(1 + УТОПИТЬ), верх(5 + УТОПИТЬ));
        const вычлось = shapeFactory.booleanCut([пластина()], [вдавленная.value]);
        expect(вычлось.isOk).toBeTruthy();
        expect(объём(вычлось.value)).toBeLessThan(объёмПластины);
    });

    test("пустой текст и нулевая высота отвечают отказом, а не падением", () => {
        const ш = шрифт("PT_Sans-Web-Regular.ttf");
        expect(textShape(ш, "   ", 10, 2, Plane.XY).isOk).toBeFalsy();
        expect(textShape(ш, "А", 0, 2, Plane.XY).isOk).toBeFalsy();
    });
});
