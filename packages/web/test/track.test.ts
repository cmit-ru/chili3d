// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: события метрик уходят в оболочку и привязаны к работе (B-181).
// Раньше имена `first_shape`/`ops_batch`/`export_done` жили только в каталоге
// оболочки, и гейтовые числа §10 считались по подменённым источникам.

import { afterEach, beforeEach, describe, expect, test } from "@rstest/core";
import { sendEvent } from "../src/track";

function адрес(href: string) {
    window.history.replaceState(null, "", href);
}

describe("события редактора", () => {
    let запросы: Array<{ url: string; body: any }>;
    let исходныйFetch: typeof globalThis.fetch;

    beforeEach(() => {
        запросы = [];
        исходныйFetch = globalThis.fetch;
        globalThis.fetch = (async (url: string, init: RequestInit) => {
            запросы.push({ url: String(url), body: JSON.parse(String(init.body)) });
            return new Response("{}", { status: 200 });
        }) as unknown as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = исходныйFetch;
        адрес("/");
    });

    test("событие уходит пачкой на адрес оболочки и знает номер работы", () => {
        адрес("/3d/42");
        sendEvent("first_shape", { откуда: "куб" });

        expect(запросы.length).toBe(1);
        expect(запросы[0].url).toBe("/api/events");
        const [событие] = запросы[0].body.events;
        expect(событие.event).toBe("first_shape");
        expect(событие.projectId).toBe(42);
        expect(событие.props).toEqual({ откуда: "куб" });
        expect(typeof событие.ts).toBe("string");
    });

    test("вне работы событий нет: песочнице и домашнему экрану считать нечего", () => {
        адрес("/3d/?sandbox=1");
        sendEvent("editor_ready");

        expect(запросы).toEqual([]);
    });
});
