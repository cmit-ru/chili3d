// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: замок правки со стороны хранилища (B-262).
//
// Пока за работой сидит наставник, сервер отвечает ребёнку 423. Это НЕ ошибка и не
// расхождение версий: правки целы, и единственное, что стоит между ребёнком и их
// потерей, — буфер. Тест держит оба обещания: хранилище говорит «locked» (полоса
// покажет «Сохраню, когда наставник закончит», а не «Покажи это наставнику») и
// не чистит буфер, из которого правки поднимутся после снятия замка.

import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";
import { CloudStorage, type SaveState } from "../src/cloudStorage";
import { installFakeIndexedDB } from "./fakeIndexedDB";

describe("CloudStorage и замок правки", () => {
    let fake: ReturnType<typeof installFakeIndexedDB>;
    let originalIndexedDB: PropertyDescriptor | undefined;
    let исходныйFetch: typeof globalThis.fetch;
    let ответ: number;
    let состояния: SaveState[];

    beforeEach(() => {
        originalIndexedDB = Object.getOwnPropertyDescriptor(window, "indexedDB");
        fake = installFakeIndexedDB();
        window.history.replaceState({}, "", "/3d/7");
        ответ = 200;
        состояния = [];
        исходныйFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            ({
                ok: ответ === 200,
                status: ответ,
                json: async () => ({ rev: 1 }),
            }) as Response) as typeof fetch;
    });

    afterEach(() => {
        globalThis.fetch = исходныйFetch;
        fake.reset();
        if (originalIndexedDB) Object.defineProperty(window, "indexedDB", originalIndexedDB);
        else delete (window as { indexedDB?: unknown }).indexedDB;
    });

    const хранилище = () => {
        const storage = new CloudStorage();
        storage.onStateChange((state) => состояния.push(state));
        return storage;
    };

    /** Лежат ли правки в буфере: ключ буфера — «владелец:работа». */
    const вБуфере = () =>
        Boolean(fake.databases.get("maketka-buffer")?.stores.get("edits")?.records.get("me:7"));

    test("работу правит наставник — правки не потеряны, а отложены", async () => {
        ответ = 423;
        const storage = хранилище();
        const ok = await storage.put("db", "documents", "doc", { фигуры: 1 });

        expect(ok).toBe(false);
        expect(состояния).toEqual(["saving", "locked"]);
        // Буфер — единственное, что стоит между ребёнком и потерей сделанного.
        expect(вБуфере()).toBe(true);
    });

    test("наставник вышел — то же тело уезжает и буфер чистится", async () => {
        ответ = 423;
        const storage = хранилище();
        await storage.put("db", "documents", "doc", { фигуры: 1 });

        ответ = 200;
        состояния = [];
        const ok = await storage.put("db", "documents", "doc", { фигуры: 1 });

        expect(ok).toBe(true);
        expect(состояния).toEqual(["saving", "saved"]);
        expect(вБуфере()).toBe(false);
    });
});
