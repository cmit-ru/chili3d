// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: объём модели (B-045). Считается по телам сцены при
// сохранении и в гео-фактах шага построения: сумма объёмов всех solid'ов
// (мм³). Пустая или чисто плоская сцена — null, а не ноль: «нет тел» и
// «нулевой объём» для проверок карточек — разные вещи.

import { type IDocument, type INode, type ISolid, ShapeNode, ShapeTypes } from "@chili3d/core";

export function sceneVolumeMm3(doc: IDocument): number | null {
    let total = 0;
    let solids = 0;
    const walk = (node: INode | undefined) => {
        let current = node;
        while (current) {
            if (current instanceof ShapeNode && current.shape.isOk) {
                for (const solid of current.shape.value.findSubShapes(ShapeTypes.solid)) {
                    try {
                        total += (solid as ISolid).volume();
                        solids += 1;
                    } catch {
                        // одно битое тело не должно рушить сохранение
                    }
                }
            }
            const child = (current as { firstChild?: INode }).firstChild;
            if (child) walk(child);
            current = current.nextSibling;
        }
    };
    walk(doc.modelManager.rootNode.firstChild);
    return solids ? Math.round(total) : null;
}
