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

export type SaveState = "idle" | "saving" | "saved" | "offline" | "conflict" | "error";

export interface ConflictInfo {
    serverRev: number;
    changedAt?: string;
}

type StateListener = (state: SaveState, info?: ConflictInfo) => void;

const BUFFER_DB = "maketka-buffer";
const BUFFER_STORE = "edits";

/**
 * Адрес работы приходит от оболочки: она проверяет доступ на сервере ДО того,
 * как ребёнок начнёт качать десять мегабайт ядра, и открывает редактор рамкой
 * (iframe — отдельный документ, закрытого кода на этой странице нет, ADR 1300).
 */
function projectIdFromLocation(): string | null {
    const fromQuery = new URLSearchParams(window.location.search).get("project");
    if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;
    const match = /\/3d\/(\d+)/.exec(window.location.pathname);
    return match ? match[1] : null;
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
    private revisions = new Map<string, number>();
    private buffer = new EditBuffer();
    private listeners: StateListener[] = [];
    /** Владелец буфера: правки одного ребёнка не должны уйти под сессией другого. */
    private owner = "me";
    private tabId = Math.random().toString(36).slice(2, 8);

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

    onStateChange(listener: StateListener) {
        this.listeners.push(listener);
    }

    private emit(state: SaveState, info?: ConflictInfo) {
        for (const listener of this.listeners) listener(state, info);
    }

    private bufferKey(id: string) {
        return `${this.owner}:${id}:${this.tabId}`;
    }

    async createDBIfNeeded(): Promise<void> {
        // Схема живёт на сервере; на клиенте готовим только буфер.
        await this.buffer.get("warmup");
    }

    async get(_database: string, table: string, id: string): Promise<any> {
        if (table !== "documents") return undefined;
        const projectId = id || projectIdFromLocation();
        if (!projectId) return undefined;

        const response = await fetch(`/api/projects/${projectId}`, { credentials: "same-origin" });
        if (!response.ok) return undefined;
        const project = await response.json();
        this.revisions.set(projectId, project.rev ?? 0);
        this.owner = String(project.ownerId ?? this.owner);

        // Если в буфере остались более свежие правки (вкладка упала, сеть падала) —
        // отдаём их, а не серверную версию: иначе работа ребёнка потеряется молча.
        const buffered = await this.buffer.get(this.bufferKey(projectId));
        if (buffered && buffered.rev >= (project.rev ?? 0) && buffered.owner === this.owner) {
            return buffered.value;
        }
        return project.body ?? undefined;
    }

    async put(_database: string, table: string, id: string, value: any): Promise<boolean> {
        // Список недавних документов не храним — лента работ живёт в кабинете.
        // Но именно с ним ядро отдаёт свежий снимок сцены: забираем его на превью.
        if (table !== "documents") {
            if (typeof value?.image === "string") void this.maybeSaveThumbnail(value.image);
            return true;
        }

        const projectId = id || projectIdFromLocation();
        if (!projectId) return false;

        const rev = this.revisions.get(projectId) ?? 0;
        this.emit("saving");
        await this.buffer.put(this.bufferKey(projectId), value, rev, this.owner);

        let response: Response;
        try {
            response = await fetch(`/api/projects/${projectId}/save`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rev, body: value }),
            });
        } catch {
            // Сеть пропала: правки в буфере, работу можно продолжать.
            this.emit("offline");
            return false;
        }

        if (response.status === 409) {
            const conflict = await response.json();
            this.emit("conflict", { serverRev: conflict.serverRev, changedAt: conflict.changedAt });
            return false;
        }
        if (response.status === 401) {
            this.emit("error");
            return false;
        }
        if (!response.ok) {
            this.emit("error");
            return false;
        }

        const saved = await response.json();
        this.revisions.set(projectId, saved.rev);
        await this.buffer.drop(this.bufferKey(projectId));
        this.emit("saved");
        return true;
    }

    async delete(_database: string, _table: string, id: string): Promise<boolean> {
        const response = await fetch(`/projects/${id}/delete`, {
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
     * Превью отправляем не чаще раза в минуту: снимок делается на каждом
     * сохранении, а канал класса делится на тридцать человек.
     */
    private lastThumbAt = 0;
    private async maybeSaveThumbnail(dataUrl: string): Promise<void> {
        const now = Date.now();
        if (now - this.lastThumbAt < 60_000) return;
        this.lastThumbAt = now;
        await this.saveThumbnail(dataUrl);
    }

    /** Превью снимается тем же рендерером в кадре — см. toImage(320). */
    async saveThumbnail(dataUrl: string): Promise<void> {
        const projectId = projectIdFromLocation();
        if (!projectId) return;
        await fetch(`/api/projects/${projectId}/preview`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ thumb: dataUrl }),
        }).catch(() => undefined);
    }
}
