// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: автосохранение работы школьника.
//
// Правила из ТЗ §5:
//   • пишем через 10–15 секунд тишины ИЛИ не реже раза в минуту непрерывной
//     работы — ребёнок не должен помнить про кнопку «Сохранить»;
//   • после расхождения ревизий автосохранение останавливается: дальше решает
//     ребёнок, а правки живут в буфере;
//   • перед уходом со страницы пробуем сохранить последнее состояние.

import type { Act, IApplication, IDocument } from "@chili3d/core";

const IDLE_MS = 12_000; // тишина после последней правки
const MAX_MS = 60_000; // потолок при непрерывном черчении

export class AutoSave {
    private idleTimer?: number;
    private maxTimer?: number;
    private saving = false;
    private stopped = false;
    private attached = new WeakSet<IDocument>();

    /**
     * Правка встала в очередь на запись. Каркас по этому знаку перестаёт
     * говорить «Сохранено»: до подтверждения сервера это неправда (B-208).
     */
    onPending?: () => void;

    constructor(
        private readonly app: IApplication,
        /** Пачка правок уходит на запись — событие `ops_batch` метрик (ТЗ §9). */
        private readonly onBatch?: () => void,
    ) {}

    /** Останавливается при расхождении: дальше сохраняет только сам ребёнок. */
    stop() {
        this.stopped = true;
        this.clearTimers();
    }

    resume() {
        this.stopped = false;
    }

    watch(document: IDocument) {
        if (this.attached.has(document)) return;
        this.attached.add(document);
        document.history.onChanged = () => this.schedule(document);

        // «Виды» живут мимо истории: их заводят, убирают и переименовывают без
        // отмены, и история о них молчит (B-163). Слушаем сам список и имя
        // каждого вида — иначе новый вид жил бы только до перезагрузки.
        const touched = () => this.schedule(document);
        const followName = (act: Act) => act.onPropertyChanged(touched);
        document.acts.forEach(followName);
        document.acts.onCollectionChanged((args) => {
            if (args.action === "add") args.items.forEach(followName);
            touched();
        });
    }

    private clearTimers() {
        window.clearTimeout(this.idleTimer);
        window.clearTimeout(this.maxTimer);
        this.idleTimer = undefined;
        this.maxTimer = undefined;
    }

    private schedule(document: IDocument) {
        if (this.stopped) return;

        window.clearTimeout(this.idleTimer);
        this.idleTimer = window.setTimeout(() => this.flush(document), IDLE_MS);

        // Потолок: при непрерывной работе тишины может не наступить вовсе,
        // и без него правки копились бы в буфере весь урок.
        if (this.maxTimer === undefined) {
            this.maxTimer = window.setTimeout(() => this.flush(document), MAX_MS);
        }

        this.onPending?.();
    }

    /**
     * Правка мимо истории и мимо списка видов: имя работы, поднятые из буфера
     * правки. История о них молчит, а сохранить их всё равно надо (B-208).
     */
    touch(document: IDocument) {
        this.schedule(document);
    }

    private async flush(document: IDocument) {
        this.clearTimers();
        if (this.stopped || this.saving) return;
        this.saving = true;
        try {
            this.onBatch?.();
            await document.save();
        } catch (error) {
            // Ошибку показывает индикатор: он подписан на состояние хранилища.
            console.warn("[autosave]", error);
        } finally {
            this.saving = false;
        }
    }

    /** Есть ли правки, о которых сервер ещё не знает (нужно замку и индикатору). */
    hasPending(): boolean {
        return this.idleTimer !== undefined || this.maxTimer !== undefined || this.saving;
    }

    /** Немедленное сохранение: перед блокировкой экрана и уходом со страницы. */
    async saveNow(document: IDocument): Promise<void> {
        await this.flush(document);
    }

    /**
     * Последняя попытка при уходе: вкладку закрывают, не дожидаясь таймера.
     *
     * Само по себе `document.save()` тут не работало (B-208): обычный запрос
     * браузер на уходе со страницы обрывает, а до запроса хранилище ещё ждёт
     * записи в IndexedDB, до которой вкладка уже не доживает. Поэтому сначала
     * говорим хранилищу, что уходим, — оно шлёт тело с `keepalive` и буфер не
     * ждёт. Сохраняем только когда есть что сохранять: у `keepalive` предел
     * тела 64 КБ на всю вкладку, и лишним запросом мы вытеснили бы снимок.
     */
    attachUnloadGuard(document: IDocument) {
        const storage = this.app.storage as { markClosing?: () => void; markOpen?: () => void };
        window.addEventListener("pagehide", () => {
            if (this.stopped || !this.hasPending()) return;
            storage.markClosing?.();
            void document.save();
        });
        // Уход бывает отменённым: по «Назад» браузер достаёт ту же страницу из
        // кэша, и дальше вкладка живёт обычной жизнью.
        window.addEventListener("pageshow", () => storage.markOpen?.());
    }
}
