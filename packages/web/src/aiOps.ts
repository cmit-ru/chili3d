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
    PipeNode,
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
import { sceneVolumeMm3 } from "./volume";

/** Версия словаря операций. Пакет другой версии не исполняется (tz-ai.md §5). */
const DICT_VERSION = 4;

const IDLE_MS = 2_000;
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
    pitch?: number;
    turns?: number;
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
    pause_ms?: number;
    demo?: boolean;
    steps: OpsStep[];
}

const xyz = (op: OpData) => new XYZ({ x: Number(op.x), y: Number(op.y), z: Number(op.z) });

const axisVector = (axis: unknown): XYZ => (axis === "x" ? XYZ.unitX : axis === "y" ? XYZ.unitY : XYZ.unitZ);

const planeAt = (origin: XYZ) => new Plane({ origin, normal: XYZ.unitZ, xvec: XYZ.unitX });

const degToRad = (deg: number) => (deg * Math.PI) / 180;

/** Кнопка ленты для каждой операции — цель виртуального курсора в демо-режиме. */
const OP_COMMANDS: Record<string, string> = {
    брусок: "create.box",
    цилиндр: "create.cylinder",
    шар: "create.sphere",
    конус: "create.cone",
    полигон: "create.regularPolygon",
    контур: "create.polygon",
    выдавить: "create.extrude",
    повернуть_вокруг_оси: "create.revol",
    скруглить: "modify.fillet",
    фаска: "modify.chamfer",
    полость: "modify.shell",
    объединить: "boolean.join",
    вычесть: "boolean.cut",
    пересечь: "boolean.common",
    передвинуть: "modify.move",
    повернуть: "modify.rotate",
    зеркало: "modify.mirror",
    размножить_по_кругу: "modify.array",
    размножить_сеткой: "modify.array",
    покрасить: "modify.paintBucket",
    удалить: "modify.deleteNode",
};

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
    private cursor: HTMLDivElement | undefined;

    constructor(
        private readonly app: IApplication,
        private readonly doc: IDocument,
        private readonly projectId: string,
        private readonly canExecute: () => boolean,
        private readonly saveNow: () => Promise<unknown>,
    ) {
        this.shield = document.createElement("div");
        // Щит не перекрывает экран физически: камера (правая/средняя кнопка,
        // колесо, Shift+колесо) должна работать, пока помощник строит.
        // Блокируются только левые клики — отдельным capture-перехватчиком.
        this.shield.style.cssText =
            "position:fixed;inset:0;z-index:55;display:none;background:transparent;pointer-events:none";
        const bar = document.createElement("div");
        bar.style.cssText =
            "position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;" +
            "align-items:center;gap:14px;background:#1f2430;color:#fff;padding:12px 18px;" +
            "border-radius:10px;font:14px/1.5 system-ui,sans-serif;" +
            "box-shadow:0 6px 24px rgba(0,0,0,.4);max-width:min(92vw,560px);border:1px solid #5a6272;" +
            "pointer-events:auto";
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

    /** Перехват ЛЕВЫХ кликов на время пакета: выбор и перетаскивание не
     *  проходят, а вращение и зум камеры (правая/средняя кнопка, колесо) —
     *  работают. Кнопка «Остановить» и плашка живут поверх перехвата. */
    private readonly clickBlocker = (event: Event) => {
        const e = event as MouseEvent;
        if (e.button !== 0) return;
        if (this.shield.contains(e.target as Node)) return;
        e.stopPropagation();
        e.preventDefault();
    };

    private blockClicks(on: boolean) {
        const method = on ? "addEventListener" : "removeEventListener";
        window[method]("pointerdown", this.clickBlocker, true);
        window[method]("click", this.clickBlocker, true);
    }

    /** Плашка на время пакета: видно всё, камера крутится, клики не проходят. */
    private show(text: string, options?: { blocking?: boolean; stoppable?: boolean }) {
        if (this.hideTimer) window.clearTimeout(this.hideTimer);
        this.statusLine.textContent = text;
        this.shield.style.display = "block";
        this.blockClicks(options?.blocking !== false);
        this.stopButton.style.display = options?.stoppable === false ? "none" : "block";
    }

    private showFinal(text: string) {
        this.show(text, { blocking: false, stoppable: false });
        this.hideTimer = window.setTimeout(() => this.hide(), 6_000);
    }

    private hide() {
        this.shield.style.display = "none";
        this.blockClicks(false);
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
        const response = await fetch(`/api/projects/${this.projectId}/ops-poll?dict=${DICT_VERSION}`, {
            credentials: "same-origin",
        });
        if (!response.ok) return IDLE_MS;
        const data = (await response.json()) as {
            batch: OpsBatch | null;
            role?: string;
            snapshot_wanted?: boolean;
            snapshot_view?: string;
            snapshot_edges_of?: number;
        };
        // Свежий снимок по запросу помощника — вне зависимости от пакетов.
        if (data.snapshot_wanted) void this.sendSnapshot(data.snapshot_view, data.snapshot_edges_of);

        if (!data.batch) {
            if (this.wasActive) {
                this.wasActive = false;
                this.showFinal("Построение остановлено.");
            }
            return IDLE_MS;
        }

        const batch = data.batch;
        this.wasActive = true;
        // Пакет для другой версии словаря: руль нам не дали — и правильно.
        // Пакет не трогаем (его исполнит свежая вкладка), человеку — подсказка.
        if (data.role === "stale" || batch.dict_version !== DICT_VERSION) {
            this.show("Помощник прислал задание для обновлённого редактора — обновите страницу (F5).", {
                blocking: false,
                stoppable: false,
            });
            return IDLE_MS;
        }
        if (data.role !== "executor" || !this.canExecute()) {
            const appliedCount = batch.steps.filter((s) => s.applied).length;
            this.show(
                `Сейчас строит помощник (в другой вкладке): шаг ${appliedCount} из ${batch.steps.length}. Пожалуйста, ничего не нажимайте.`,
            );
            return ACTIVE_MS;
        }

        const pause = Math.max(0, Math.min(2_000, Number(batch.pause_ms ?? ACTIVE_MS)));
        // Темп задаёт помощник: 0 — все шаги подряд без пауз (результат сразу),
        // иначе шаг за тик — построение видно глазами.
        for (;;) {
            const step = batch.steps.find((s) => !s.applied);
            if (!step) return IDLE_MS;
            this.show(
                `Сейчас строит помощник: шаг ${step.step_no} из ${batch.steps.length}. Пожалуйста, ничего не нажимайте.`,
            );
            try {
                if (batch.demo) await this.demoPoint(step.op);
                this.apply(step.step_no, step.op);
                const done = await this.report(batch.id, step.step_no, true, undefined, this.stepFacts());
                step.applied = true;
                if (done) {
                    this.wasActive = false;
                    this.showFinal("Помощник закончил построение — работа сохранена.");
                    this.nodesByStep.clear();
                    await this.saveNow().catch(() => undefined);
                    await this.sendSnapshot(); // превью не ждёт минутного троттлинга
                    return IDLE_MS;
                }
                if (pause > 0) return pause;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await this.report(batch.id, step.step_no, false, message);
                this.wasActive = false;
                this.showFinal(`Прервано на шаге ${step.step_no}: ${message}`);
                this.nodesByStep.clear();
                return IDLE_MS;
            }
        }
    }

    /** Гео-факты после шага (B-046): агент сверяет числа, а не только картинку. */
    private stepFacts(): Record<string, unknown> | undefined {
        try {
            let bodies = 0;
            let min: XYZ | undefined;
            let max: XYZ | undefined;
            for (const node of this.flatNodes()) {
                if (!(node instanceof ShapeNode) || !node.shape.isOk) continue;
                bodies += 1;
                const world = node.shape.value.transformedMul(node.worldTransform());
                const box = world.boundingBox();
                min = min
                    ? new XYZ({
                          x: Math.min(min.x, box.min.x),
                          y: Math.min(min.y, box.min.y),
                          z: Math.min(min.z, box.min.z),
                      })
                    : new XYZ(box.min);
                max = max
                    ? new XYZ({
                          x: Math.max(max.x, box.max.x),
                          y: Math.max(max.y, box.max.y),
                          z: Math.max(max.z, box.max.z),
                      })
                    : new XYZ(box.max);
            }
            const r = (v: number) => Math.round(v * 10) / 10;
            return {
                bodies,
                bbox:
                    min && max
                        ? { min: [r(min.x), r(min.y), r(min.z)], max: [r(max.x), r(max.y), r(max.z)] }
                        : null,
                volume_mm3: sceneVolumeMm3(this.doc),
            };
        } catch {
            return undefined; // факты не должны ломать построение
        }
    }

    private async report(
        batch: number,
        step: number,
        ok: boolean,
        error?: string,
        facts?: Record<string, unknown>,
    ) {
        const response = await fetch(`/api/projects/${this.projectId}/ops-step`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ batch, step, ok, error, facts }),
        });
        if (!response.ok) return false;
        return Boolean(((await response.json()) as { done?: boolean }).done);
    }

    /** Демо-режим (B-048): виртуальный курсор подъезжает к настоящей кнопке
     *  ленты и «нажимает» её — как в видеоуроке, только вживую. */
    private async demoPoint(op: OpData) {
        const key = OP_COMMANDS[String(op.op)];
        const button = key ? (document.querySelector(`[data-command="${key}"]`) as HTMLElement | null) : null;
        if (!button || !button.offsetParent) return; // кнопки нет или она скрыта
        if (!this.cursor) {
            this.cursor = document.createElement("div");
            this.cursor.style.cssText =
                "position:fixed;left:0;top:0;z-index:70;width:26px;height:26px;pointer-events:none;" +
                "transition:transform .7s cubic-bezier(.4,0,.2,1);will-change:transform;" +
                "filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))";
            this.cursor.innerHTML =
                '<svg viewBox="0 0 24 24" width="26" height="26">' +
                '<path d="M4 2 L20 12 L12 13.5 L9 21 Z" fill="#fff" stroke="#1f2430" stroke-width="1.6"/></svg>';
            this.cursor.style.transform = `translate(${window.innerWidth / 2}px, ${window.innerHeight / 2}px)`;
            document.body.appendChild(this.cursor);
        }
        const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
        const rect = button.getBoundingClientRect();
        this.cursor.style.display = "block";
        this.cursor.style.transform = `translate(${rect.left + rect.width / 2 - 4}px, ${rect.top + rect.height / 2 - 2}px)`;
        await sleep(750);
        const savedOutline = button.style.outline;
        button.style.outline = "3px solid #ff8800";
        await sleep(400);
        button.style.outline = savedOutline;
        // курсор «уносит» операцию в сцену
        this.cursor.style.transform = `translate(${window.innerWidth / 2}px, ${window.innerHeight / 2}px)`;
        await sleep(400);
    }

    /** Кадр с пронумерованными рёбрами узла (B-049): агент выбирает edges глазами. */
    private async edgeLabeledImage(base: string, edgesOf: number): Promise<string> {
        const node = this.flatNodes()[edgesOf - 1];
        if (!(node instanceof ShapeNode) || !node.shape.isOk) return base;
        const world = node.shape.value.transformedMul(node.worldTransform());
        const edges = world.findSubShapes(ShapeTypes.edge).slice(0, 40);
        const view = this.app.activeView;
        if (!view) return base;
        const scale = 320 / Math.max(view.width ?? 320, view.height ?? 320, 1);
        const points = edges.map((edge, i) => {
            const b = edge.boundingBox();
            const mid = new XYZ({
                x: (b.min.x + b.max.x) / 2,
                y: (b.min.y + b.max.y) / 2,
                z: (b.min.z + b.max.z) / 2,
            });
            const xy = view.worldToScreen(mid);
            return { n: i + 1, x: xy.x * scale, y: xy.y * scale };
        });
        return await new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");
                if (!ctx) return resolve(base);
                ctx.drawImage(img, 0, 0);
                ctx.font = "bold 11px system-ui";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                for (const p of points) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(255,255,255,.92)";
                    ctx.fill();
                    ctx.strokeStyle = "#1f2430";
                    ctx.stroke();
                    ctx.fillStyle = "#1f2430";
                    ctx.fillText(String(p.n), p.x, p.y + 0.5);
                }
                resolve(canvas.toDataURL("image/jpeg", 0.8));
            };
            img.onerror = () => resolve(base);
            img.src = base;
        });
    }

    /** Направления взгляда для снимков по ракурсам. */
    private static readonly VIEWS: Record<
        string,
        { dir: [number, number, number]; up: [number, number, number] }
    > = {
        изометрия: { dir: [1, -1, 1], up: [0, 0, 1] },
        спереди: { dir: [0, -1, 0], up: [0, 0, 1] },
        сверху: { dir: [0, 0, 1], up: [0, 1, 0] },
        сбоку: { dir: [1, 0, 0], up: [0, 0, 1] },
    };

    /** Свежий кадр сцены — тем же рендерером, что и обычное превью.
     *  С ракурсом: камера отъезжает на нужную сторону, кадр, камера обратно. */
    private async sendSnapshot(view?: string, edgesOf?: number) {
        try {
            const camera = this.app.activeView?.cameraController;
            const wanted = view ? AiOps.VIEWS[view] : undefined;
            let saved: { eye: XYZ; target: XYZ; up: XYZ } | undefined;
            if (camera && wanted) {
                saved = { eye: camera.cameraPosition, target: camera.cameraTarget, up: camera.cameraUp };
                const t = camera.cameraTarget;
                const d = wanted.dir;
                const len = Math.hypot(d[0], d[1], d[2]);
                const dist = Math.max(1, saved.eye.sub(t).length());
                camera.lookAt(
                    {
                        x: t.x + (d[0] / len) * dist,
                        y: t.y + (d[1] / len) * dist,
                        z: t.z + (d[2] / len) * dist,
                    },
                    t,
                    { x: wanted.up[0], y: wanted.up[1], z: wanted.up[2] },
                );
                camera.fitContent();
                this.doc.visual.update();
            }
            let image = this.app.activeView?.toImage(320);
            if (image && edgesOf) {
                image = await this.edgeLabeledImage(image, Number(edgesOf));
            }
            if (camera && saved) {
                camera.lookAt(saved.eye, saved.target, saved.up);
                this.doc.visual.update();
            }
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
        if (!result.isOk) {
            const raw = result.error as unknown;
            const text =
                typeof raw === "string"
                    ? raw
                    : ((raw as { message?: string })?.message ?? JSON.stringify(raw));
            throw new Error(`${what}: ${String(text).slice(0, 120)}`);
        }
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

    /** Индексы рёбер для ядра. Снаружи (кадр edges_of, параметр edges) номера
     *  человеческие — 1..N; ядро ждёт 0-based и само прибавляет единицу к
     *  карте OCCT. 1-based на входе ядра давал выход за карту и нечитаемое
     *  «Fillet Error: [object Object]» (боевой отчёт помощника). */
    private edgeIndexes(shape: IShape, wanted?: number[]): number[] {
        const total = shape.findSubShapes(ShapeTypes.edge).length;
        if (!wanted?.length) return Array.from({ length: total }, (_, i) => i);
        for (const e of wanted) {
            if (!Number.isInteger(e) || e < 1 || e > total) {
                throw new Error(`ребра №${e} нет: у фигуры ${total} рёбер`);
            }
        }
        return wanted.map((e) => e - 1);
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
                // v4: вокруг заданной точки (cx, cy); без неё — вокруг (0, 0).
                const target = this.node(op.node);
                const count = Number(op.count);
                const center = new XYZ({ x: Number(op.cx ?? 0), y: Number(op.cy ?? 0), z: 0 });
                for (let i = 1; i < count; i++) {
                    const clone = target.clone();
                    clone.transform = target.transform.multiply(
                        Matrix4.fromAxisRad(center, XYZ.unitZ, (2 * Math.PI * i) / count),
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
            case "спираль": {
                // Пружина/резьба телом: путь-геликоида + труба по нему (v4).
                const wire = this.unwrap(
                    shapeFactory.helix(
                        xyz(op),
                        XYZ.unitZ,
                        XYZ.unitX,
                        Number(op.radius),
                        Number(op.pitch),
                        Number(op.turns) * 360,
                    ),
                    "спираль",
                );
                const node = new PipeNode({
                    document: this.doc,
                    radius: Math.max(0.2, Number(op.thickness) / 2),
                    path: wire,
                });
                node.name = "Спираль";
                return this.addNode(stepNo, node);
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
