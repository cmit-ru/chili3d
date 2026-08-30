// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: исполнитель пакетов построения ИИ-помощника (фаза Б).
//
// Помощник преподавателя присылает через оболочку план построения — до 60
// операций из фиксированного словаря. Вкладка с открытой работой опрашивает
// сервер (раз в секунду при активном пакете) и проигрывает шаги по одному
// за тик, так что модель собирается на глазах. Исполнитель один («руль» на
// сервере, TTL 90 секунд) — вторая вкладка только показывает прогресс.
//
// Ошибки не скрываются: сбойный шаг останавливает пакет, и «прервано на
// шаге N» видят и вкладка, и помощник. Ссылки шагов на созданные узлы живут
// в памяти вкладки: если она перезагрузилась посреди пакета, шаг со ссылкой
// на потерянный узел честно падает — помощник пришлёт новый пакет.

import {
    BooleanNode,
    BoxNode,
    ConeNode,
    CylinderNode,
    ExtrudeNode,
    RegularPolygonNode,
    RevolvedNode,
    SphereNode,
} from "@chili3d/app";
import {
    EditableShapeNode,
    type IDocument,
    type INode,
    type IShape,
    Line,
    Matrix4,
    Plane,
    type Result,
    ShapeNode,
    ShapeTypes,
    Transaction,
    XYZ,
} from "@chili3d/core";

/** Версия словаря операций. Пакет другой версии не исполняется (tz-ai.md §5). */
const DICT_VERSION = 1;

const IDLE_MS = 5_000;
const ACTIVE_MS = 1_000;

/** Шаг словаря v1: имена операций русские, параметры — латиницей (данные оболочки). */
interface OpData {
    op: string;
    x?: number;
    y?: number;
    z?: number;
    dx?: number;
    dy?: number;
    dz?: number;
    radius?: number;
    height?: number;
    distance?: number;
    sides?: number;
    count?: number;
    nx?: number;
    ny?: number;
    step_x?: number;
    step_y?: number;
    node?: number;
    tools?: number[];
    axis?: string;
    angle?: number;
    name?: string;
}

interface OpsStep {
    step_no: number;
    op: OpData;
    applied: boolean;
}

interface OpsBatch {
    id: number;
    dict_version: number;
    status: string;
    steps: OpsStep[];
}

const xyz = (op: OpData) => new XYZ({ x: Number(op.x), y: Number(op.y), z: Number(op.z) });

const axisVector = (axis: unknown): XYZ => (axis === "x" ? XYZ.unitX : axis === "y" ? XYZ.unitY : XYZ.unitZ);

const planeAt = (origin: XYZ) => new Plane({ origin, normal: XYZ.unitZ, xvec: XYZ.unitX });

const degToRad = (deg: number) => (deg * Math.PI) / 180;

export class AiOps {
    private timer: number | undefined;
    private busy = false;
    private finishedBatch = 0;
    private readonly nodesByStep = new Map<number, INode>();
    private readonly banner: HTMLDivElement;

    constructor(
        private readonly doc: IDocument,
        private readonly projectId: string,
        private readonly canExecute: () => boolean,
        private readonly saveNow: () => Promise<unknown>,
    ) {
        this.banner = document.createElement("div");
        this.banner.style.cssText =
            "position:fixed;right:16px;bottom:16px;z-index:60;display:none;max-width:340px;" +
            "background:#1f2430;color:#fff;padding:10px 14px;border-radius:8px;font:13px/1.5 " +
            "system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)";
        document.body.appendChild(this.banner);
        this.schedule(IDLE_MS);
    }

    private show(text: string) {
        this.banner.textContent = text;
        this.banner.style.display = "block";
    }

    private hide() {
        this.banner.style.display = "none";
    }

    private schedule(ms: number) {
        this.timer = window.setTimeout(() => void this.tick(), ms);
    }

    private async tick() {
        if (this.busy) return this.schedule(ACTIVE_MS);
        this.busy = true;
        let next = IDLE_MS;
        try {
            next = await this.poll();
        } catch {
            next = IDLE_MS; // сеть моргнула — просто следующий тик
        } finally {
            this.busy = false;
            this.schedule(next);
        }
    }

    private async poll(): Promise<number> {
        const response = await fetch(`/api/projects/${this.projectId}/ops-poll`, {
            credentials: "same-origin",
        });
        if (!response.ok) return IDLE_MS;
        const data = (await response.json()) as { batch: OpsBatch | null; role?: string };
        if (!data.batch) {
            if (this.finishedBatch === -1) this.hide(); // пакет отменили извне
            this.finishedBatch = -1;
            return IDLE_MS;
        }

        const batch = data.batch;
        if (data.role !== "executor" || !this.canExecute()) {
            const appliedCount = batch.steps.filter((s) => s.applied).length;
            this.show(`Помощник строит в другой вкладке: шаг ${appliedCount} из ${batch.steps.length}`);
            return ACTIVE_MS;
        }

        if (batch.dict_version !== DICT_VERSION) {
            await this.report(batch.id, 1, false, "словарь операций другой версии — обновите вкладку");
            this.show("Помощник говорит на другой версии словаря — обновите страницу.");
            return IDLE_MS;
        }

        const step = batch.steps.find((s) => !s.applied);
        if (!step) return IDLE_MS;

        this.show(`Помощник строит: шаг ${step.step_no} из ${batch.steps.length}`);
        try {
            this.apply(step.step_no, step.op);
            const done = await this.report(batch.id, step.step_no, true);
            if (done) {
                this.show("Помощник закончил построение — работа сохранена.");
                this.nodesByStep.clear();
                await this.saveNow().catch(() => undefined);
                window.setTimeout(() => this.hide(), 6_000);
                return IDLE_MS;
            }
            return ACTIVE_MS;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.report(batch.id, step.step_no, false, message);
            this.show(`Прервано на шаге ${step.step_no}: ${message}`);
            this.nodesByStep.clear();
            return IDLE_MS;
        }
    }

    private async report(batch: number, step: number, ok: boolean, error?: string) {
        const response = await fetch(`/api/projects/${this.projectId}/ops-step`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batch, step, ok, error }),
        });
        if (!response.ok) return false;
        return Boolean(((await response.json()) as { done?: boolean }).done);
    }

    /* ------------------------- исполнение операций ------------------------- */

    private node(ref: unknown): ShapeNode {
        const found = this.nodesByStep.get(Number(ref));
        if (!found || !(found instanceof ShapeNode)) {
            throw new Error(`узел шага ${ref} не найден (вкладка перезагружалась?)`);
        }
        return found;
    }

    private shapeOf(node: ShapeNode): IShape {
        const shape = node.shape as Result<IShape>;
        if (!shape.isOk) throw new Error("у узла нет геометрии");
        return shape.value;
    }

    private unwrap<T>(result: Result<T>, what: string): T {
        if (!result.isOk) throw new Error(`${what}: ${String(result.error).slice(0, 120)}`);
        return result.value;
    }

    private addNode(stepNo: number, node: INode) {
        this.doc.modelManager.addNode(node);
        this.nodesByStep.set(stepNo, node);
    }

    private replaceNode(stepNo: number, oldNode: ShapeNode, fresh: INode) {
        oldNode.parent?.insertAfter(oldNode, fresh);
        oldNode.parent?.remove(oldNode);
        // Все прежние ссылки на этот узел теперь ведут на результат.
        for (const [key, value] of this.nodesByStep) {
            if (value === oldNode) this.nodesByStep.set(key, fresh);
        }
        this.nodesByStep.set(stepNo, fresh);
    }

    private apply(stepNo: number, op: OpData) {
        Transaction.execute(this.doc, `ai step ${stepNo}`, () => {
            this.applyInner(stepNo, op);
            this.doc.visual.update();
        });
    }

    private applyInner(stepNo: number, op: OpData) {
        const kind = String(op.op);
        switch (kind) {
            case "брусок": {
                const node = new BoxNode({
                    document: this.doc,
                    plane: planeAt(xyz(op)),
                    dx: Number(op.dx),
                    dy: Number(op.dy),
                    dz: Number(op.dz),
                });
                node.name = "Брусок";
                return this.addNode(stepNo, node);
            }
            case "цилиндр": {
                const node = new CylinderNode({
                    document: this.doc,
                    normal: XYZ.unitZ,
                    center: xyz(op),
                    radius: Number(op.radius),
                    dz: Number(op.height),
                });
                node.name = "Цилиндр";
                return this.addNode(stepNo, node);
            }
            case "шар": {
                const node = new SphereNode({
                    document: this.doc,
                    center: xyz(op),
                    radius: Number(op.radius),
                });
                node.name = "Шар";
                return this.addNode(stepNo, node);
            }
            case "конус": {
                const node = new ConeNode({
                    document: this.doc,
                    normal: XYZ.unitZ,
                    center: xyz(op),
                    radius: Number(op.radius),
                    dz: Number(op.height),
                });
                node.name = "Конус";
                return this.addNode(stepNo, node);
            }
            case "полигон": {
                const node = new RegularPolygonNode({
                    document: this.doc,
                    normal: XYZ.unitZ,
                    xvec: XYZ.unitX,
                    center: xyz(op),
                    radius: Number(op.radius),
                    sides: Number(op.sides),
                });
                node.name = "Многоугольник";
                if ("isFace" in node) (node as { isFace: boolean }).isFace = true;
                return this.addNode(stepNo, node);
            }
            case "выдавить": {
                const source = this.node(op.node);
                const node = new ExtrudeNode({
                    document: this.doc,
                    section: this.shapeOf(source),
                    length: Number(op.height),
                });
                node.name = source.name || "Тело";
                return this.replaceNode(stepNo, source, node);
            }
            case "повернуть_вокруг_оси": {
                const source = this.node(op.node);
                const node = new RevolvedNode({
                    document: this.doc,
                    profile: this.shapeOf(source),
                    axis: new Line({ point: XYZ.zero, direction: axisVector(op.axis) }),
                    angle: Number(op.angle),
                });
                node.name = source.name || "Тело вращения";
                return this.replaceNode(stepNo, source, node);
            }
            case "скруглить":
            case "фаска": {
                const source = this.node(op.node);
                const shape = this.shapeOf(source);
                // Все рёбра тела: индексация подрёбер в ядре — 1..N (OCCT).
                const edges = shape.findSubShapes(ShapeTypes.edge).map((_, i) => i + 1);
                const result =
                    kind === "скруглить"
                        ? shapeFactory.fillet(shape, edges, Number(op.radius))
                        : shapeFactory.chamfer(shape, edges, Number(op.distance));
                const fresh = new EditableShapeNode({
                    document: this.doc,
                    name: source.name || (kind === "скруглить" ? "Скругление" : "Фаска"),
                    shape: this.unwrap(result, kind === "скруглить" ? "скругление" : "фаска"),
                });
                return this.replaceNode(stepNo, source, fresh);
            }
            case "объединить":
            case "вычесть":
            case "пересечь": {
                const target = this.node(op.node);
                const toolNodes = (op.tools as unknown[]).map((t) => this.node(t));
                const targetShape = this.shapeOf(target);
                const toolShapes = toolNodes.map((n) => this.shapeOf(n));
                const result =
                    kind === "объединить"
                        ? shapeFactory.booleanFuse([targetShape], toolShapes, true)
                        : kind === "вычесть"
                          ? shapeFactory.booleanCut([targetShape], toolShapes)
                          : shapeFactory.booleanCommon([targetShape], toolShapes);
                const fresh = new BooleanNode({
                    document: this.doc,
                    booleanShape: this.unwrap(result, "булева операция"),
                });
                fresh.name = target.name || "Деталь";
                this.replaceNode(stepNo, target, fresh);
                for (const tool of toolNodes) {
                    tool.parent?.remove(tool);
                    for (const [key, value] of this.nodesByStep) {
                        if (value === tool) this.nodesByStep.delete(key);
                    }
                }
                return;
            }
            case "передвинуть": {
                const target = this.node(op.node);
                target.transform = target.transform.multiply(
                    Matrix4.fromTranslation(Number(op.dx), Number(op.dy), Number(op.dz)),
                );
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "повернуть": {
                const target = this.node(op.node);
                target.transform = target.transform.multiply(
                    Matrix4.fromAxisRad(XYZ.zero, axisVector(op.axis), degToRad(Number(op.angle))),
                );
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "размножить_по_кругу": {
                const target = this.node(op.node);
                const count = Number(op.count);
                for (let i = 1; i < count; i++) {
                    const clone = target.clone();
                    clone.transform = target.transform.multiply(
                        Matrix4.fromAxisRad(XYZ.zero, XYZ.unitZ, (2 * Math.PI * i) / count),
                    );
                    target.parent?.insertAfter(target, clone);
                }
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "размножить_сеткой": {
                const target = this.node(op.node);
                const nx = Number(op.nx);
                const ny = Number(op.ny);
                for (let ix = 0; ix < nx; ix++) {
                    for (let iy = 0; iy < ny; iy++) {
                        if (ix === 0 && iy === 0) continue;
                        const clone = target.clone();
                        clone.transform = target.transform.multiply(
                            Matrix4.fromTranslation(ix * Number(op.step_x), iy * Number(op.step_y), 0),
                        );
                        target.parent?.insertAfter(target, clone);
                    }
                }
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "именовать": {
                const target = this.node(op.node);
                target.name = String(op.name).slice(0, 60);
                this.nodesByStep.set(stepNo, target);
                return;
            }
            default:
                throw new Error(`операция «${kind}» этой сборке не известна`);
        }
    }
}
