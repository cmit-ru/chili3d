// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: превью работы снимается отдельно от сохранения (ТЗ §11).
//
// Раньше снимок делал сам `Document.save()`: полный кадр канвы плюс даунскейл
// в такте записи — на классной машине это удлиняло каждое автосохранение, ровно
// то, чего гейт «не теряем правки» просит избегать. Теперь таймер только
// планирует снимок на ближайший кадр, а запись работы его не ждёт.

/** Откуда брать снимок и куда его отправлять (ТЗ §11: тот же рендерер, 320 px). */
export interface PreviewTarget {
    snapshot(): string | undefined;
    send(dataUrl: string): Promise<void>;
}

const PERIOD_MS = 60_000;

export class PreviewShots {
    private timer?: number;
    private planned = false;
    private changed = false;

    constructor(
        private readonly target: PreviewTarget,
        private readonly period = PERIOD_MS,
    ) {}

    /** Работу сохранили — значит, есть что переснять. */
    workChanged() {
        this.changed = true;
    }

    start() {
        if (this.timer !== undefined) return;
        this.timer = window.setInterval(() => this.plan(), this.period);
        window.addEventListener("pagehide", this.onHide);
    }

    stop() {
        window.clearInterval(this.timer);
        this.timer = undefined;
        window.removeEventListener("pagehide", this.onHide);
    }

    // Вкладку закрывают, кадра уже не будет: снимаем прямо здесь.
    private readonly onHide = () => {
        if (this.changed) void this.shoot();
    };

    /**
     * Пиксели холста валидны только сразу после `render` в том же кадре
     * (`preserveDrawingBuffer` выключен), поэтому просим ближайший кадр,
     * а не снимаем из таймера.
     */
    private plan() {
        if (!this.changed || this.planned) return;
        this.planned = true;
        window.requestAnimationFrame(() => {
            this.planned = false;
            void this.shoot();
        });
    }

    private async shoot() {
        this.changed = false;
        try {
            const dataUrl = this.target.snapshot();
            if (dataUrl) await this.target.send(dataUrl);
        } catch (error) {
            // Ошибка превью не отменяет и не задерживает сохранение (ТЗ §11).
            console.warn("[превью]", error);
        }
    }
}
