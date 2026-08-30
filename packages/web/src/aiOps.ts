// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: исполнитель пакетов построения ИИ-помощника (фазы Б/В).
//
// Помощник преподавателя присылает через оболочку план построения — до 60
// операций из фиксированного словаря. Вкладка с открытой работой опрашивает
// сервер (раз в секунду при активном пакете) и проигрывает шаги по одному
// за тик, так что модель собирается на глазах. Исполнитель один («руль» на
// сервере, TTL 90 секунд) — вторая вкладка только показывает прогресс.
//
// Пока пакет активен, поверх редактора висит прозрачный щит со строкой
// состояния: «строит помощник, ничего не нажимайте» — и кнопкой «Остановить».
//
// Ошибки не скрываются: сбойный шаг останавливает пакет, и «прервано на
// шаге N» видят и вкладка, и помощник. Ссылки шагов на созданные узлы живут
// в памяти вкладки; «взять_из_сцены» ссылается на узлы по той же нумерации,
// что и выжимка work() оболочки: плоский обход дерева, папка работы — №1.

import {
    BooleanNode,
    BoxNode,
    ConeNode,
    CylinderNode,
    ExtrudeNode,
    PolygonNode,
    RegularPolygonNode,
    RevolvedNode,
    SphereNode,
} from "@chili3d/app";
import {
    EditableShapeNode,
    FolderNode,
    GeometryNode,
    type IApplication,
    type IDocument,
    type INode,
    type IShape,
    Line,
    Material,
    Matrix4,
    Plane,
    type Result,
    ShapeNode,
    ShapeTypes,
    Transaction,
    XYZ,
} from "@chili3d/core";

/** Версия словаря операций. Пакет другой версии не исполняется (tz-ai.md §5). */
const DICT_VERSION = 3;

const IDLE_MS = 5_000;
const ACTIVE_MS = 1_000;

/** Шаг словаря: имена операций русские, параметры — латиницей (данные оболочки). */
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
    cx?: number;
    cy?: number;
    cz?: number;
    index?: number;
    points?: number[][];
    color?: string;
    field?: string;
    value?: number;
    factor?: number;
    thickness?: number;
    edges?: number[];
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

/** Поля, которые можно менять операцией «изменить» — сеттеры параметрических узлов. */
const EDITABLE_FIELDS = new Set(["dx", "dy", "dz", "radius", "sides", "length", "angle"]);

export class AiOps {
    private busy = false;
    private wasActive = false;
    private readonly nodesByStep = new Map<number, INode>();
    private readonly shield: HTMLDivElement;
    private readonly statusLine: HTMLDivElement;
    private readonly stopButton: HTMLButtonElement;
    private hideTimer: number | undefined;

    constructor(
        private readonly app: IApplication,
        private readonly doc: IDocument,
        private readonly projectId: string,
        private readonly canExecute: () => boolean,
        private readonly saveNow: () => Promise<unknown>,
    ) {
        this.shield = document.createElement("div");
        this.shield.style.cssText = "position:fixed;inset:0;z-index:55;display:none;background:transparent";
        const bar = document.createElement("div");
        bar.style.cssText =
            "position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;" +
            "align-items:center;gap:14px;background:#1f2430;color:#fff;padding:12px 18px;" +
            "border-radius:10px;font:14px/1.5 system-ui,sans-serif;" +
            "box-shadow:0 6px 24px rgba(0,0,0,.4);max-width:min(92vw,560px);border:1px solid #5a6272";
        this.statusLine = document.createElement("div");
        // Цвет и шрифт — прямо на элементе: темы редактора перебивают
        // унаследованные от контейнера значения (тёмный текст на тёмном фоне).
        this.statusLine.style.cssText = "color:#fff;font:14px/1.5 system-ui,sans-serif";
        this.stopButton = document.createElement("button");
        this.stopButton.textContent = "Остановить";
        this.stopButton.style.cssText =
            "border:1px solid #5a6272;background:transparent;color:#fff;padding:6px 12px;" +
            "border-radius:6px;cursor:pointer;font:13px system-ui,sans-serif;flex:none";
        this.stopButton.onclick = () => void this.cancel();
        bar.appendChild(this.statusLine);
        bar.appendChild(this.stopButton);
        this.shield.appendChild(bar);
        document.body.appendChild(this.shield);
        this.schedule(IDLE_MS);
    }

    /** Щит на время пакета: видно всё, нажать ничего нельзя — работает помощник. */
    private show(text: string, options?: { blocking?: boolean; stoppable?: boolean }) {
        if (this.hideTimer) window.clearTimeout(this.hideTimer);
        this.statusLine.textContent = text;
        this.shield.style.display = "block";
        this.shield.style.pointerEvents = options?.blocking === false ? "none" : "auto";
        this.stopButton.style.display = options?.stoppable === false ? "none" : "block";
    }

    private showFinal(text: string) {
        this.show(text, { blocking: false, stoppable: false });
        this.hideTimer = window.setTimeout(() => this.hide(), 6_000);
    }

    private hide() {
        this.shield.style.display = "none";
    }

    private async cancel() {
        this.stopButton.disabled = true;
        await fetch(`/api/projects/${this.projectId}/ops-cancel`, {
            method: "POST",
            credentials: "same-origin",
        }).catch(() => undefined);
        this.stopButton.disabled = false;
        this.showFinal("Построение остановлено.");
    }

    private schedule(ms: number) {
        window.setTimeout(() => void this.tick(), ms);
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
        const data = (await response.json()) as {
            batch: OpsBatch | null;
            role?: string;
            snapshot_wanted?: boolean;
        };
        // Свежий снимок по запросу помощника — вне зависимости от пакетов.
        if (data.snapshot_wanted) void this.sendSnapshot();

        if (!data.batch) {
            if (this.wasActive) {
                this.wasActive = false;
                this.showFinal("Построение остановлено.");
            }
            return IDLE_MS;
        }

        const batch = data.batch;
        this.wasActive = true;
        if (data.role !== "executor" || !this.canExecute()) {
            const appliedCount = batch.steps.filter((s) => s.applied).length;
            this.show(
                `Сейчас строит помощник (в другой вкладке): шаг ${appliedCount} из ${batch.steps.length}. Пожалуйста, ничего не нажимайте.`,
            );
            return ACTIVE_MS;
        }

        if (batch.dict_version !== DICT_VERSION) {
            await this.report(batch.id, 1, false, "словарь операций другой версии — обновите вкладку");
            this.showFinal("Помощник говорит на другой версии словаря — обновите страницу.");
            this.wasActive = false;
            return IDLE_MS;
        }

        const step = batch.steps.find((s) => !s.applied);
        if (!step) return IDLE_MS;

        this.show(
            `Сейчас строит помощник: шаг ${step.step_no} из ${batch.steps.length}. Пожалуйста, ничего не нажимайте.`,
        );
        try {
            this.apply(step.step_no, step.op);
            const done = await this.report(batch.id, step.step_no, true);
            if (done) {
                this.wasActive = false;
                this.showFinal("Помощник закончил построение — работа сохранена.");
                this.nodesByStep.clear();
                await this.saveNow().catch(() => undefined);
                await this.sendSnapshot(); // превью не ждёт минутного троттлинга
                return IDLE_MS;
            }
            return ACTIVE_MS;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.report(batch.id, step.step_no, false, message);
            this.wasActive = false;
            this.showFinal(`Прервано на шаге ${step.step_no}: ${message}`);
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

    /** Свежий кадр сцены — тем же рендерером, что и обычное превью. */
    private async sendSnapshot() {
        try {
            const image = this.app.activeView?.toImage(320);
            if (!image) return;
            await fetch(`/api/projects/${this.projectId}/preview`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ thumb: image }),
            });
        } catch {
            // снимок не критичен: следующий запрос повторит
        }
    }

    /* ------------------------- дерево работы ------------------------- */

    /**
     * Плоский список узлов В ТОЙ ЖЕ нумерации, что выжимка work() оболочки:
     * обход в глубину, папка работы — №1. Иначе помощник промахивается
     * («взять_из_сцены» видела одно дерево, work() — другое).
     */
    private flatNodes(): INode[] {
        // Сериализация пишет корневую папку работы как nodes[0] — поэтому №1
        // здесь сам rootNode, а его дети идут дальше в порядке обхода.
        const root = this.doc.modelManager.rootNode as unknown as INode;
        const out: INode[] = [root];
        const walk = (node: INode | undefined) => {
            let current = node;
            while (current) {
                out.push(current);
                const child = (current as { firstChild?: INode }).firstChild;
                if (child) walk(child);
                current = current.nextSibling;
            }
        };
        walk(this.doc.modelManager.rootNode.firstChild);
        return out;
    }

    /** Куда класть новые узлы: в папку работы, рядом с ручными фигурами. */
    private targetParent(): { add(...nodes: INode[]): void } {
        const first = this.doc.modelManager.rootNode.firstChild;
        if (first instanceof FolderNode) return first;
        return this.doc.modelManager.rootNode;
    }

    /* ------------------------- исполнение операций ------------------------- */

    private anyNode(ref: unknown): INode {
        const found = this.nodesByStep.get(Number(ref));
        if (!found) {
            throw new Error(`узел шага ${ref} не найден (вкладка перезагружалась?)`);
        }
        return found;
    }

    private node(ref: unknown): ShapeNode {
        const found = this.anyNode(ref);
        if (!(found instanceof ShapeNode)) {
            throw new Error(`узел шага ${ref} — не фигура`);
        }
        return found;
    }

    /** Геометрия узла в мировых координатах: булевы и модификаторы должны
     *  видеть тело уже повёрнутым/сдвинутым — как штатные команды редактора
     *  (см. transformedMul в commands/boolean.ts). */
    private shapeOf(node: ShapeNode): IShape {
        const shape = node.shape as Result<IShape>;
        if (!shape.isOk) throw new Error("у узла нет геометрии");
        return shape.value.transformedMul(node.worldTransform());
    }

    private unwrap<T>(result: Result<T>, what: string): T {
        if (!result.isOk) throw new Error(`${what}: ${String(result.error).slice(0, 120)}`);
        return result.value;
    }

    /** Центр фигуры в мировых координатах (для поворота/масштаба/зеркала). */
    private centerOf(target: ShapeNode, op?: OpData): XYZ {
        if (op && (op.cx !== undefined || op.cy !== undefined || op.cz !== undefined)) {
            return new XYZ({ x: Number(op.cx ?? 0), y: Number(op.cy ?? 0), z: Number(op.cz ?? 0) });
        }
        // shapeOf уже в мировых координатах — центр bbox и есть мировой центр.
        const box = this.shapeOf(target).boundingBox();
        return new XYZ({
            x: (box.min.x + box.max.x) / 2,
            y: (box.min.y + box.max.y) / 2,
            z: (box.min.z + box.max.z) / 2,
        });
    }

    /** Матрица «вокруг точки»: перенос в ноль → преобразование → обратно. */
    private aroundPoint(center: XYZ, m: Matrix4): Matrix4 {
        return Matrix4.fromTranslation(-center.x, -center.y, -center.z)
            .multiply(m)
            .multiply(Matrix4.fromTranslation(center.x, center.y, center.z));
    }

    private addNode(stepNo: number, node: INode) {
        this.targetParent().add(node);
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

    private edgeIndexes(shape: IShape, wanted?: number[]): number[] {
        const total = shape.findSubShapes(ShapeTypes.edge).length;
        if (!wanted?.length) return Array.from({ length: total }, (_, i) => i + 1);
        for (const e of wanted) {
            if (!Number.isInteger(e) || e < 1 || e > total) {
                throw new Error(`ребра №${e} нет: у фигуры ${total} рёбер`);
            }
        }
        return wanted;
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
            case "контур": {
                const z = Number(op.z ?? 0);
                const pts = (op.points as number[][]).map(
                    ([px, py]) => new XYZ({ x: Number(px), y: Number(py), z }),
                );
                // Контур замыкается сам: последняя точка соединяется с первой.
                if (!pts[0].isEqualTo(pts[pts.length - 1])) pts.push(pts[0]);
                const node = new PolygonNode({ document: this.doc, points: pts });
                node.name = "Контур";
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
                const edges = this.edgeIndexes(shape, op.edges);
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
            case "полость": {
                const source = this.node(op.node);
                const result = shapeFactory.makeThickSolidBySimple(
                    this.shapeOf(source),
                    -Math.abs(Number(op.thickness)),
                );
                const fresh = new EditableShapeNode({
                    document: this.doc,
                    name: source.name || "Полость",
                    shape: this.unwrap(result, "полость"),
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
                const center = this.centerOf(target, op);
                target.transform = target.transform.multiply(
                    Matrix4.fromAxisRad(center, axisVector(op.axis), degToRad(Number(op.angle))),
                );
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "масштабировать": {
                const target = this.node(op.node);
                const f = Number(op.factor);
                const center = this.centerOf(target, op);
                target.transform = target.transform.multiply(
                    this.aroundPoint(center, Matrix4.fromScale(f, f, f)),
                );
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "зеркало": {
                const target = this.node(op.node);
                const plane = new Plane({
                    origin: this.centerOf(target, op),
                    normal: axisVector(op.axis),
                    xvec: op.axis === "x" ? XYZ.unitY : XYZ.unitX,
                });
                const clone = target.clone();
                clone.transform = target.transform.multiply(Matrix4.createMirrorWithPlane(plane));
                target.parent?.insertAfter(target, clone);
                this.nodesByStep.set(stepNo, clone);
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
                const target = this.anyNode(op.node);
                target.name = String(op.name).slice(0, 60);
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "покрасить": {
                const target = this.node(op.node);
                if (!(target instanceof GeometryNode)) {
                    throw new Error("красить можно только фигуру");
                }
                const color = Number.parseInt(String(op.color).replace("#", ""), 16);
                if (!Number.isFinite(color)) throw new Error("цвет задаётся как #rrggbb");
                const material = new Material({
                    document: this.doc,
                    name: `Цвет ${op.color}`,
                    color,
                });
                this.doc.modelManager.materials.push(material);
                target.materialId = material.id;
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "изменить": {
                const target = this.node(op.node);
                const field = String(op.field);
                if (!EDITABLE_FIELDS.has(field)) {
                    throw new Error(`поле «${field}» менять нельзя`);
                }
                const editable = target as unknown as Record<string, unknown>;
                if (typeof editable[field] !== "number") {
                    throw new Error(`у этой фигуры нет поля «${field}»`);
                }
                editable[field] = Number(op.value);
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "скрыть":
            case "показать": {
                const target = this.anyNode(op.node);
                (target as { visible: boolean }).visible = kind === "показать";
                this.nodesByStep.set(stepNo, target);
                return;
            }
            case "удалить": {
                const target = this.anyNode(op.node);
                if (target instanceof FolderNode || target === (this.doc.modelManager.rootNode as unknown)) {
                    throw new Error("папку работы удалять нельзя — удаляйте фигуры по одной");
                }
                target.parent?.remove(target);
                for (const [key, value] of this.nodesByStep) {
                    if (value === target) this.nodesByStep.delete(key);
                }
                return;
            }
            case "взять_из_сцены": {
                // Нумерация — как в выжимке work(): плоский обход, папка — №1.
                const all = this.flatNodes();
                const want = Number(op.index);
                const found = all[want - 1];
                if (!found) throw new Error(`в работе нет узла №${want} (всего ${all.length})`);
                this.nodesByStep.set(stepNo, found);
                return;
            }
            default:
                throw new Error(`операция «${kind}» этой сборке не известна`);
        }
    }
}
