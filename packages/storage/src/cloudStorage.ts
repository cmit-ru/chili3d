// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: облачное хранилище работ.
//
// Заменяет IndexedDB как источник правды: тело документа живёт на сервере,
// а IndexedDB остаётся буфером несохранённых правок. Ключевые правила из ТЗ §5:
//   • «Сохранено» показывается только после подтверждённой записи ревизии;
//   • буфер пишется ВСЕГДА, а не только при обрыве сети;
//   • запись поверх более свежей ревизии отклоняется сервером (409) —
//     вместо молчаливой перезаписи ребёнку предлагается сохранить копию.

import type { IStorage } from "@chili3d/core";

export type SaveState =
    | "idle"
    | "saving"
    | "saved"
    | "offline"
    | "conflict"
    /** Работу правит наставник: писать нельзя, но правки целы (B-262). */
    | "locked"
    | "error";

export interface ConflictInfo {
    serverRev?: number;
    changedAt?: string;
    /**
     * Короткий код неудачи для взрослого: он уходит мелкой строкой в баннер
     * трёх неудач («покажи преподавателю: работа 7, ошибка 500»). Без него
     * преподаватель видит ровно тот же текст, что ребёнок, и не знает даже,
     * у одного это ученика или у всего класса.
     */
    code?: string;
}

type StateListener = (state: SaveState, info?: ConflictInfo) => void;

const BUFFER_DB = "maketka-buffer";
const BUFFER_STORE = "edits";

/**
 * Потолок тела для `keepalive`: у браузера он 64 КБ на все запросы вкладки, и
 * делить его приходится со снимком для кабинета. Берём с запасом — тело почти
 * целиком из чисел, где байт равен символу, но имена узлов бывают русскими.
 */
const KEEPALIVE_LIMIT = 48 * 1024;

/**
 * Номер работы берём ИЗ АДРЕСА, а не из документа: ребёнок приходит по ссылке
 * вида `/3d/6`, доступ к которой оболочка уже проверила подзапросом. Внутренний
 * идентификатор документа Chili3D («mnz21j4…») сервер не знает — попытка
 * сохранять по нему заканчивалась пятисоткой и потерей работы.
 *
 * Форма `?project=6` остаётся для локальной разработки без nginx.
 */
/**
 * Песочница с лендинга (`/3d/?sandbox=1`): редактор без входа и без работы.
 * Модель-образец грузится из статики, сохранение честно отключено —
 * следующий посетитель всегда видит нетронутый образец.
 */
export function sandboxFromLocation(): boolean {
    return new URLSearchParams(window.location.search).get("sandbox") === "1";
}

export function projectIdFromLocation(): string | null {
    const fromQuery = new URLSearchParams(window.location.search).get("project");
    if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;
    const match = /\/3d\/(\d+)/.exec(window.location.pathname);
    return match ? match[1] : null;
}

/**
 * Долгие узлы модели-образца открываются ОТДЕЛЬНО, уже после того как мастерская
 * показана. Иначе ребёнок с лендинга смотрит на замерший экран.
 *
 * Почему именно развёртки (`PipeNode`). Замер 01.09.2026 на модели стартера:
 * сама геометрия развёртки строится за 33–160 мс, а триангуляция её поверхности —
 * от 2 до 11 секунд на узел (пять узлов дают 20 секунд из 24). У остальных узлов
 * модели триангуляция укладывается в миллисекунды: обычный цилиндр — 12 мс.
 * Точность сетки на это почти не влияет — дело в самой поверхности развёртки.
 */
const SLOW_NODE_TYPES = new Set(["PipeNode"]);

let deferredNodes: any[] = [];

/** Отложенные узлы забирают ОДИН раз — тот, кто их добавит в открытый документ. */
export function takeDeferredNodes(): any[] {
    const nodes = deferredNodes;
    deferredNodes = [];
    return nodes;
}

/** Экспортируется ради теста: разделение документа проверяется без браузера и сети. */
export function deferSlowNodes(document: any): any {
    const nodes = document?.models?.nodes;
    if (!Array.isArray(nodes)) return document;

    const slow = nodes.filter((n: any) => SLOW_NODE_TYPES.has(n?.__cla$$__));
    if (slow.length === 0) return document;

    // Сначала лёгкие: чем меньше запись узла, тем быстрее он считается,
    // поэтому самый тяжёлый появляется последним и не задерживает остальные.
    deferredNodes = slow
        .map((n: any) => ({ node: n, size: JSON.stringify(n).length }))
        .sort((a, b) => a.size - b.size)
        .map((x) => x.node);

    return {
        ...document,
        models: { ...document.models, nodes: nodes.filter((n: any) => !SLOW_NODE_TYPES.has(n?.__cla$$__)) },
    };
}

/** Буфер правок в IndexedDB: переживает F5, закрытие вкладки и падение ядра. */
class EditBuffer {
    private db?: IDBDatabase;

    private async open(): Promise<IDBDatabase> {
        if (this.db) return this.db;
        this.db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(BUFFER_DB, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(BUFFER_STORE)) {
                    db.createObjectStore(BUFFER_STORE, { keyPath: "key" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return this.db;
    }

    async put(key: string, value: unknown, rev: number, owner: string) {
        const db = await this.open();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(BUFFER_STORE, "readwrite");
            tx.objectStore(BUFFER_STORE).put({ key, value, rev, owner, ts: Date.now() });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * Ключи прежней формы (`владелец:работа:вкладка`) осиротели, когда номер
     * вкладки ушёл из ключа: прочитать их уже некому, а тела работ в них
     * лежат целиком. Убираем свой же мусор при первом открытии работы.
     */
    async dropLegacy(prefix: string) {
        const db = await this.open();
        await new Promise<void>((resolve) => {
            const tx = db.transaction(BUFFER_STORE, "readwrite");
            const store = tx.objectStore(BUFFER_STORE);
            const request = store.getAllKeys();
            request.onsuccess = () => {
                for (const key of request.result) {
                    if (typeof key === "string" && key.startsWith(prefix)) store.delete(key);
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async drop(key: string) {
        const db = await this.open();
        await new Promise<void>((resolve) => {
            const tx = db.transaction(BUFFER_STORE, "readwrite");
            tx.objectStore(BUFFER_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async get(key: string): Promise<{ value: unknown; rev: number; owner: string } | undefined> {
        const db = await this.open();
        return new Promise((resolve) => {
            const tx = db.transaction(BUFFER_STORE, "readonly");
            const request = tx.objectStore(BUFFER_STORE).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(undefined);
        });
    }
}

export class CloudStorage implements IStorage {
    /** Провайдер объёма модели (мм³) — ставится редактором при открытии работы. */
    volumeProvider?: () => number | null;

    /** Песочница: дёргается при попытке сохранить — редактор подсвечивает баннер. */
    onSandboxSave?: () => void;

    private revisions = new Map<string, number>();
    private buffer = new EditBuffer();
    private listeners: StateListener[] = [];
    /** Владелец буфера: правки одного ребёнка не должны уйти под сессией другого. */
    private owner = "me";
    /** Вкладку закрывают: последний запрос должен пережить уход со страницы. */
    private closing = false;
    /**
     * Работа открылась правками из буфера, а не серверным телом: сервер о них
     * ещё не знает, и редактор обязан их дослать (B-208).
     */
    restoredFromBuffer = false;

    constructor() {
        // Просим браузер не вытеснять буфер: иначе «работа цела» — обещание,
        // которое мы не контролируем.
        navigator.storage
            ?.persisted?.()
            .then((granted) => {
                if (!granted) navigator.storage?.persist?.().catch(() => undefined);
            })
            .catch(() => undefined);
    }

    /** Версия работы, которая сейчас в мастерской: уходит с отзывом (B-101). */
    currentRevision(projectId: string): number {
        return this.revisions.get(projectId) ?? 0;
    }

    onStateChange(listener: StateListener) {
        this.listeners.push(listener);
    }

    private emit(state: SaveState, info?: ConflictInfo) {
        for (const listener of this.listeners) listener(state, info);
    }

    /**
     * Ключ буфера — «владелец:работа», без номера вкладки. С номером буфер был
     * односторонним: после перезагрузки вкладка получала новый номер и своих же
     * правок не находила — обещание «правки живут в буфере даже через
     * перезагрузку» (`frame-contract.md`) не выполнялось (B-208).
     *
     * Две вкладки с одной работой друг друга не путают: поднятые правки берутся
     * только если их ревизия не старше серверной, а разошедшиеся ревизии ловит
     * сервер (409).
     */
    private bufferKey(id: string) {
        return `${this.owner}:${id}`;
    }

    /** Уход со страницы: дальше тело шлём так, чтобы браузер его не оборвал. */
    markClosing() {
        this.closing = true;
    }

    /** Вкладка вернулась из кэша браузера («Назад»): уход отменился. */
    markOpen() {
        this.closing = false;
    }

    async createDBIfNeeded(): Promise<void> {
        // Схема живёт на сервере; на клиенте готовим только буфер.
        await this.buffer.get("warmup");
    }

    async get(_database: string, table: string, _id: string): Promise<any> {
        if (table !== "documents") return undefined;
        if (sandboxFromLocation()) {
            const response = await fetch("/try-seed.json");
            return response.ok ? deferSlowNodes(await response.json()) : undefined;
        }
        // Адрес работы берём ТОЛЬКО из URL: ядро подставляет сюда свой
        // внутренний id документа, и сохранение уходило по нему на сервер
        // (POST /api/projects/mnz21j4…/save → 500), то есть в никуда.
        const projectId = projectIdFromLocation();
        if (!projectId) return undefined;

        const response = await fetch(`/api/projects/${projectId}`, { credentials: "same-origin" });
        if (!response.ok) return undefined;
        const project = await response.json();
        this.revisions.set(projectId, project.rev ?? 0);
        this.owner = String(project.ownerId ?? this.owner);

        void this.buffer.dropLegacy(`${this.owner}:${projectId}:`).catch(() => undefined);

        // Если в буфере остались более свежие правки (вкладка упала, сеть падала) —
        // отдаём их, а не серверную версию: иначе работа ребёнка потеряется молча.
        const buffered = await this.buffer.get(this.bufferKey(projectId));
        if (buffered && buffered.rev >= (project.rev ?? 0) && buffered.owner === this.owner) {
            this.restoredFromBuffer = true;
            return buffered.value;
        }
        return project.body ?? undefined;
    }

    async put(_database: string, table: string, _id: string, value: any): Promise<boolean> {
        if (sandboxFromLocation()) {
            // Ничего не пишем — ни на сервер, ни в буфер. Ответ «успех», чтобы
            // ядро не показывало ошибку: про несохранение говорит баннер.
            if (table === "documents") this.onSandboxSave?.();
            return true;
        }
        // Список недавних документов не храним — лента работ живёт в кабинете.
        if (table !== "documents") return true;

        const projectId = projectIdFromLocation();
        if (!projectId) return false;

        const rev = this.revisions.get(projectId) ?? 0;
        // Объём модели спрашиваем у редактора в момент сохранения (B-045):
        // хранилище само документа не знает, поэтому провайдер ставит web/index.
        const volumeMm3 = this.volumeProvider?.() ?? null;
        this.emit("saving");

        // При уходе со страницы буфер не ждём: вкладку сносят раньше, чем
        // IndexedDB подтвердит запись, и запрос на сервер не успевал даже
        // начаться — правки последних секунд пропадали (B-208).
        const вбуфер = this.buffer.put(this.bufferKey(projectId), value, rev, this.owner);
        if (this.closing) void вбуфер.catch(() => undefined);
        else await вбуфер;

        // `keepalive` живёт дольше вкладки, но у него предел тела 64 КБ на всю
        // вкладку. Тело крупной работы в него не помещается — такую отправляем
        // как обычно: шанс успеть есть, а отказ браузера отнял бы и его.
        const тело = JSON.stringify({ rev, body: value, volumeMm3 });
        const переживёт = this.closing && тело.length <= KEEPALIVE_LIMIT;

        let response: Response;
        try {
            response = await fetch(`/api/projects/${projectId}/save`, {
                method: "POST",
                credentials: "same-origin",
                keepalive: переживёт,
                headers: { "Content-Type": "application/json" },
                body: тело,
            });
        } catch {
            // Сеть пропала: правки в буфере, работу можно продолжать.
            this.emit("offline", { code: "нет ответа" });
            return false;
        }

        if (response.status === 409) {
            const conflict = await response.json();
            this.emit("conflict", { serverRev: conflict.serverRev, changedAt: conflict.changedAt });
            return false;
        }
        if (response.status === 423) {
            // За работой сидит наставник (B-262). Это не ошибка: правки остались в
            // буфере и уедут, когда он выйдет из правки. Буфер не чистим — он здесь
            // единственное, что стоит между ребёнком и потерей сделанного.
            this.emit("locked");
            return false;
        }
        if (response.status === 401) {
            this.emit("error", { code: "401" });
            return false;
        }
        if (!response.ok) {
            this.emit("error", { code: String(response.status) });
            return false;
        }

        const saved = await response.json();
        this.revisions.set(projectId, saved.rev);
        this.restoredFromBuffer = false;
        await this.buffer.drop(this.bufferKey(projectId));
        this.emit("saved");
        return true;
    }

    async delete(_database: string, _table: string, _id: string): Promise<boolean> {
        const projectId = projectIdFromLocation();
        if (!projectId) return false;
        const response = await fetch(`/projects/${projectId}/delete`, {
            method: "POST",
            credentials: "same-origin",
        });
        return response.ok;
    }

    async page(_database: string, _table: string, _page: number): Promise<any[]> {
        // Лента работ живёт в кабинете оболочки — домашний экран редактора скрыт.
        return [];
    }

    /** «Сохранить мой отдельно»: копия создаётся в обход квоты (ТЗ §5). */
    async saveAsCopy(value: unknown): Promise<{ id: number; title: string } | null> {
        const projectId = projectIdFromLocation();
        if (!projectId) return null;
        const response = await fetch(`/api/projects/${projectId}/fork`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: value }),
        });
        if (!response.ok) return null;
        return response.json();
    }

    /**
     * Превью снимается тем же рендерером в кадре (`toImage(320)`) и приходит
     * сюда от таймера редактора, а не из такта сохранения — ТЗ §11,
     * `packages/web/src/preview.ts`. Реже раза в минуту: канал класса делится
     * на тридцать человек.
     *
     * `closing` — вкладку закрывают. Обычный запрос браузер на уходе со страницы
     * обрывает, поэтому снимок из `pagehide` шлём с `keepalive`, и у работы,
     * законченной быстрее минуты, картинка всё-таки появляется. Только там: у
     * `keepalive` предел тела 64 КБ, а превью тяжёлой модели подходит к нему
     * вплотную (на бою встречались 44 КБ) — обычный снимок не ограничиваем.
     */
    async saveThumbnail(dataUrl: string, closing = false): Promise<void> {
        const projectId = projectIdFromLocation();
        if (!projectId) return;
        // При уходе картинка уступает работе: общий предел `keepalive` — 64 КБ
        // на вкладку, и снимок тяжёлой модели вытеснил бы само тело (B-208).
        if (closing && this.closing) return;
        await fetch(`/api/projects/${projectId}/preview`, {
            method: "POST",
            credentials: "same-origin",
            keepalive: closing,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ thumb: dataUrl }),
        }).catch(() => undefined);
    }

    /**
     * Ракурс работы: куда смотрела камера, когда работу закрыли. Тело — сотня
     * байт, поэтому и на уходе со страницы шлём тем же путём, с `keepalive`.
     *
     * Ошибку сети не глотаем, в отличие от превью: память вида по ней узнаёт,
     * что ракурс не доехал, и повторит на следующем такте.
     */
    async saveCamera(camera: object, closing = false): Promise<void> {
        const projectId = projectIdFromLocation();
        if (!projectId) return;
        const response = await fetch(`/api/projects/${projectId}/view`, {
            method: "POST",
            credentials: "same-origin",
            keepalive: closing,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ camera }),
        }).catch(() => undefined);
        if (!response) throw new Error("ракурс не ушёл: нет ответа");
    }
}
