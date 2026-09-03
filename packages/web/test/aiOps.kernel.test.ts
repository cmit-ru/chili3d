// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: «выдавить» помощника тянет вверх при положительной высоте,
// как бы ни был обойдён контур (B-164). На заглушках этого не увидеть: нормаль
// грани считает настоящее ядро OCCT, и именно она у контура «по часовой»
// смотрит вниз.

import { readFileSync } from "node:fs";
import path from "node:path";
import { GeometryUtils, type IFace, XYZ } from "@chili3d/core";
import { initWasm, ShapeFactory } from "@chili3d/wasm";
import { beforeAll, describe, expect, test } from "@rstest/core";
import { высотаВверх } from "../src/aiOps";

let фабрика: ShapeFactory;

beforeAll(async () => {
    await initWasm({
        wasmBinary: readFileSync(path.resolve(import.meta.dirname, "../../wasm/lib/chili-wasm.wasm")),
    });
    фабрика = new ShapeFactory();
});

/** Плоская грань в z = 0 по точкам контура; замыкается сама, как у помощника. */
function грань(точки: number[][]): IFace {
    const вершины = [...точки, точки[0]].map(([x, y]) => new XYZ({ x, y, z: 0 }));
    const контур = фабрика.polygon(вершины);
    if (!контур.isOk) throw new Error(String(контур.error));
    const грань = фабрика.face([контур.value]);
    if (!грань.isOk) throw new Error(String(грань.error));
    return грань.value;
}

/** Тело, как его строит ExtrudeNode: нормаль сечения × длина. */
function выдавить(сечение: IFace, высота: number) {
    const тело = фабрика.prism(сечение, GeometryUtils.normal(сечение).multiply(высота));
    if (!тело.isOk) throw new Error(String(тело.error));
    return тело.value.boundingBox();
}

const ПРОТИВ_ЧАСОВОЙ = [
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
];
const ПО_ЧАСОВОЙ = [
    [0, 0],
    [0, 10],
    [20, 10],
    [20, 0],
];

describe("выдавливание контура на ядре OCCT", () => {
    test("у контура по часовой нормаль смотрит вниз — тут и пряталась ошибка", () => {
        expect(GeometryUtils.normal(грань(ПРОТИВ_ЧАСОВОЙ)).z).toBeGreaterThan(0);
        expect(GeometryUtils.normal(грань(ПО_ЧАСОВОЙ)).z).toBeLessThan(0);
    });

    test("положительная высота тянет вверх при любом обходе", () => {
        for (const точки of [ПРОТИВ_ЧАСОВОЙ, ПО_ЧАСОВОЙ]) {
            const сечение = грань(точки);
            const рамка = выдавить(сечение, высотаВверх(сечение, 15));
            expect(рамка.min.z).toBeCloseTo(0, 5);
            expect(рамка.max.z).toBeCloseTo(15, 5);
        }
    });

    test("отрицательная высота — вниз, тоже при любом обходе", () => {
        for (const точки of [ПРОТИВ_ЧАСОВОЙ, ПО_ЧАСОВОЙ]) {
            const сечение = грань(точки);
            const рамка = выдавить(сечение, высотаВверх(сечение, -15));
            expect(рамка.min.z).toBeCloseTo(-15, 5);
            expect(рамка.max.z).toBeCloseTo(0, 5);
        }
    });
});
