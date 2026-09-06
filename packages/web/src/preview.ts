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
    /** `наводя` — первая картинка работы: перед снимком навести камеру на модель. */
    snapshot(наводя?: boolean): string | undefined;
    /** `closing` — вкладку закрывают: запрос должен пережить уход со страницы. */
    send(dataUrl: string, closing?: boolean): Promise<void>;
}

const PERIOD_MS = 60_000;

export class PreviewShots {
    private timer?: number;
    private planned = false;
    private changed = false;
    private наводить = false;

    constructor(
        private readonly target: PreviewTarget,
        private readonly period = PERIOD_MS,
    ) {}

    /** Работу сохранили — значит, есть что переснять. */
    workChanged() {
        this.changed = true;
    }

    /**
     * Снять кадр не дожидаясь минуты. Нужно при открытии работы, у которой
     * картинки в кабинете нет вовсе: до 03.09.2026 снимок делал такт сохранения,
     * и у всего, что закрыли раньше первой минуты, плитка осталась серой. Так же
     * лечит старые схемы мастерская схем (B-144).
     */
    shootNow() {
        this.changed = true;
        // Первый кадр снимаем с наводкой: камера при открытии смотрит мимо
        // модели, и без наводки в кабинет уходит пустая сцена (B-223).
        this.наводить = true;
        this.plan();
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
        if (this.changed) void this.shoot(true);
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

    private async shoot(closing = false) {
        this.changed = false;
        const наводя = this.наводить;
        this.наводить = false;
        try {
            const dataUrl = this.target.snapshot(наводя);
            if (dataUrl) await this.target.send(dataUrl, closing);
        } catch (error) {
            // Ошибка превью не отменяет и не задерживает сохранение (ТЗ §11).
            console.warn("[превью]", error);
        }
    }
}
