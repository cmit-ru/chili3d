// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: долгие узлы модели-образца открываются после того, как
// мастерская показана. Проверяем разделение документа: что уходит в отложенные,
// что остаётся, и в каком порядке отложенные будут добавляться.

import { deferSlowNodes, takeDeferredNodes } from "../src/cloudStorage";

const node = (type: string, id: string, extra: Record<string, unknown> = {}) => ({
    id,
    __cla$$__: type,
    parentId: "root",
    ...extra,
});

const документ = (nodes: unknown[]) => ({ name: "Образец", models: { nodes, materials: [] } });

describe("Отложенная сборка долгих узлов образца", () => {
    afterEach(() => {
        takeDeferredNodes(); // не тащим отложенное из теста в тест
    });

    test("развёртки уходят в отложенные, остальное остаётся", () => {
        const result = deferSlowNodes(
            документ([node("FolderNode", "root"), node("BoxNode", "b1"), node("PipeNode", "p1")]),
        );

        expect(result.models.nodes.map((n: any) => n.id)).toEqual(["root", "b1"]);
        expect(takeDeferredNodes().map((n: any) => n.id)).toEqual(["p1"]);
    });

    test("отложенные идут от лёгкого к тяжёлому", () => {
        deferSlowNodes(
            документ([
                node("PipeNode", "тяжёлая", { path: "х".repeat(5000) }),
                node("PipeNode", "лёгкая", { path: "х".repeat(10) }),
            ]),
        );

        expect(takeDeferredNodes().map((n: any) => n.id)).toEqual(["лёгкая", "тяжёлая"]);
    });

    test("документ без долгих узлов не трогаем", () => {
        const исходный = документ([node("BoxNode", "b1")]);
        expect(deferSlowNodes(исходный)).toBe(исходный);
        expect(takeDeferredNodes()).toEqual([]);
    });

    test("забирать отложенное можно только один раз", () => {
        deferSlowNodes(документ([node("PipeNode", "p1")]));
        expect(takeDeferredNodes()).toHaveLength(1);
        expect(takeDeferredNodes()).toHaveLength(0);
    });
});
