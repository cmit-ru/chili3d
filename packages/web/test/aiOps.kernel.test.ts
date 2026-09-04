// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: «выдавить» помощника тянет вверх при положительной высоте,
// как бы ни был обойдён контур (B-164). На заглушках этого не увидеть: нормаль
// грани считает настоящее ядро OCCT, и именно она у контура «по часовой»
// смотрит вниз. По той же причине здесь и «полость» (B-188): что она падает на
// любом теле, видно только на настоящем ядре.

import { readFileSync } from "node:fs";
import path from "node:path";
import { GeometryUtils, type IFace, type ISolid, Plane, XYZ } from "@chili3d/core";
import { initWasm, ShapeFactory } from "@chili3d/wasm";
import { beforeAll, describe, expect, test } from "@rstest/core";
import { верхняяГрань, высотаВверх, пределСтенки } from "../src/aiOps";

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

describe("полость на ядре OCCT", () => {
    /** Брусок 40×40×40 — на нём полость помощника падала так же, как на цилиндре. */
    function брусок() {
        const тело = фабрика.box(Plane.XY, 40, 40, 40);
        if (!тело.isOk) throw new Error(String(тело.error));
        return тело.value;
    }

    test("простая полость не работает на замкнутом теле — тут и была ошибка", () => {
        expect(фабрика.makeThickSolidBySimple(брусок(), -3).isOk).toBe(false);
    });

    test("полость по верхней грани: наружные размеры те же, стенки 3 мм, верх открыт", () => {
        const тело = брусок();
        const полость = фабрика.makeThickSolidByJoin(тело, [верхняяГрань(тело)], -3, "arc");
        expect(полость.isOk).toBe(true);

        const рамка = полость.value.boundingBox();
        expect(рамка.min.z).toBeCloseTo(0, 5);
        expect(рамка.max.z).toBeCloseTo(40, 5);
        // Нутро 34×34×37: по 3 мм стенок с четырёх сторон и снизу, сверху дырка.
        expect((полость.value as ISolid).volume()).toBeCloseTo(40 ** 3 - 34 * 34 * 37, 3);
    });

    test("стенка толще места внутри: ядро молчит и возвращает тело, предел считаем сами", () => {
        const малый = фабрика.box(Plane.XY, 10, 10, 10);
        if (!малый.isOk) throw new Error(String(малый.error));

        // Ядро на такой толщине не отказывает — отдаёт исходный брусок целиком,
        // и без нашей проверки ребёнок не узнал бы, что просьбу не выполнили (B-193).
        const ядро = фабрика.makeThickSolidByJoin(малый.value, [верхняяГрань(малый.value)], -50, "arc");
        expect(ядро.isOk).toBe(true);
        expect((ядро.value as ISolid).volume()).toBeGreaterThan(999);

        // Дно одно, стенок по ширине и глубине по две: у бруска 10 предел — 5 мм.
        expect(пределСтенки(малый.value)).toBeCloseTo(5, 5);
        expect(пределСтенки(брусок())).toBeCloseTo(20, 5);
    });
});
