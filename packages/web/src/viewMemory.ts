// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: работа открывается тем же ракурсом, каким её закрыли.
//
// Просьба владельца 06.09.2026. До этого камера не хранилась нигде: при открытии
// её наводили на модель целиком (B-229), и ракурс, в котором ребёнок работал,
// пропадал вместе с вкладкой.
//
// Ракурс живёт отдельно от тела работы (`POST /api/projects/:id/view`), а не
// внутри него: тело версионируется, и запись камеры поднимала бы ревизию —
// соседняя вкладка получала бы «работа изменилась» от того, что модель просто
// повернули. Поворот вида — не правка.

import type { ICameraController } from "@chili3d/core";

/** Ракурс: откуда смотрим, куда смотрим, где верх и род камеры. */
export interface Ракурс {
    eye: [number, number, number];
    target: [number, number, number];
    up: [number, number, number];
    type: "perspective" | "orthographic";
}

export interface ViewMemoryTarget {
    /** Куда камера смотрит сейчас; `undefined` — вида ещё нет. */
    camera(): Ракурс | undefined;
    /** `closing` — вкладку закрывают: запрос должен пережить уход со страницы. */
    send(ракурс: Ракурс, closing?: boolean): Promise<void>;
}

/** Как часто сверяемся с камерой. Реже, чем превью: тело — сотня байт. */
const PERIOD_MS = 15_000;

/** Доли миллиметра в ракурсе не значат ничего, а дрожь чисел гоняла бы запись. */
const окр = (n: number) => Math.round(n * 1000) / 1000;

/** Снять ракурс с камеры вида. */
export function ракурсКамеры(camera: ICameraController): Ракурс {
    const p = camera.cameraPosition;
    const t = camera.cameraTarget;
    const u = camera.cameraUp;
    return {
        eye: [окр(p.x), окр(p.y), окр(p.z)],
        target: [окр(t.x), окр(t.y), окр(t.z)],
        up: [окр(u.x), окр(u.y), окр(u.z)],
        type: camera.cameraType === "orthographic" ? "orthographic" : "perspective",
    };
}

const точка = (v: unknown): v is [number, number, number] =>
    Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/**
 * Поставить камеру по сохранённому ракурсу. `false` — ракурса нет или он битый,
 * тогда вызывающий наводит камеру на модель сам.
 *
 * Ближнюю и дальнюю плоскости не трогаем: они стоят с запасом (0,1 … 1e6 мм),
 * а первый же поворот или приближение пересчитает их по расстоянию.
 */
export function применитьРакурс(camera: ICameraController, ракурс: unknown): boolean {
    if (!ракурс || typeof ракурс !== "object") return false;
    const { eye, target, up, type } = ракурс as Partial<Ракурс>;
    if (!точка(eye) || !точка(target) || !точка(up)) return false;

    camera.cameraType = type === "orthographic" ? "orthographic" : "perspective";
    camera.lookAt(
        { x: eye[0], y: eye[1], z: eye[2] },
        { x: target[0], y: target[1], z: target[2] },
        { x: up[0], y: up[1], z: up[2] },
    );
    return true;
}

export class ViewMemory {
    private timer?: number;
    /** Последний отправленный ракурс — с ним и сравниваем, чтобы не писать зря. */
    private отправленный?: string;

    constructor(
        private readonly target: ViewMemoryTarget,
        private readonly period = PERIOD_MS,
    ) {}

    start() {
        if (this.timer !== undefined) return;
        // Отсчёт ведём от ракурса, с которым работа открылась: пока ребёнок вид
        // не тронул, писать нечего — иначе каждое открытие любой работы стоило бы
        // запроса на запись.
        this.отправленный = this.ключ(this.target.camera());
        this.timer = window.setInterval(() => void this.сверить(), this.period);
        window.addEventListener("pagehide", this.наУходе);
    }

    stop() {
        window.clearInterval(this.timer);
        this.timer = undefined;
        window.removeEventListener("pagehide", this.наУходе);
    }

    // Вкладку закрывают: сверяемся сразу, следующего такта таймера не будет.
    private readonly наУходе = () => {
        void this.сверить(true);
    };

    private async сверить(closing = false) {
        const ракурс = this.target.camera();
        if (!ракурс) return;
        const ключ = this.ключ(ракурс);
        if (ключ === this.отправленный) return;

        // Помечаем до отправки: такт таймера не должен слать то же самое дважды.
        this.отправленный = ключ;
        try {
            await this.target.send(ракурс, closing);
        } catch (error) {
            // Не дошло — забываем отметку, следующий такт попробует снова.
            this.отправленный = undefined;
            console.warn("[вид]", error);
        }
    }

    private ключ(ракурс?: Ракурс) {
        return ракурс ? JSON.stringify(ракурс) : undefined;
    }
}
