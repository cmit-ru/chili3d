// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: объём модели (B-045). Считается по телам сцены при
// сохранении и в гео-фактах шага построения: сумма объёмов всех solid'ов
// (мм³). Пустая или чисто плоская сцена — null, а не ноль: «нет тел» и
// «нулевой объём» для проверок карточек — разные вещи.

import {
    BoundingBox,
    type IDocument,
    type INode,
    type ISolid,
    type Matrix4,
    ShapeNode,
    ShapeTypes,
    XYZ,
} from "@chili3d/core";

/** Кэш объёма: полный пересчёт по всем телам дорог, а автосейв зовёт его
 *  каждые несколько секунд. Свежий точный расчёт (после пакета) прогревает
 *  кэш через notеValue; провайдер сохранения довольствуется значением не
 *  старше maxAgeMs (B-051). */
const volumeCache = new WeakMap<IDocument, { at: number; value: number | null }>();

export function cachedSceneVolumeMm3(doc: IDocument, maxAgeMs: number): number | null {
    const hit = volumeCache.get(doc);
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.value;
    const value = sceneVolumeMm3(doc);
    return value;
}

/** Точный AABB узла без копирования геометрии (B-051): базовый бокс формы
 *  кэширован в ядре, преобразуем его 8 углов матрицей узла. */
export function nodeWorldAabb(node: ShapeNode): BoundingBox | null {
    if (!node.shape.isOk) return null;
    const box = node.shape.value.boundingBox();
    const m: Matrix4 = node.worldTransform();
    let min: XYZ | undefined;
    let max: XYZ | undefined;
    for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
                const p = m.ofPoint(new XYZ({ x, y, z }));
                min = min
                    ? new XYZ({ x: Math.min(min.x, p.x), y: Math.min(min.y, p.y), z: Math.min(min.z, p.z) })
                    : p;
                max = max
                    ? new XYZ({ x: Math.max(max.x, p.x), y: Math.max(max.y, p.y), z: Math.max(max.z, p.z) })
                    : p;
            }
        }
    }
    return min && max ? new BoundingBox(min, max) : null;
}

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
    const value = solids ? Math.round(total) : null;
    volumeCache.set(doc, { at: Date.now(), value });
    return value;
}
