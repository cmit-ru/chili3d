// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: замок правки (B-257, B-262). Проверяем то, ради чего он сделан:
// (1) вкладка наставника держит замок пульсом и отпускает работу, уходя со страницы —
// иначе ребёнок ждал бы две минуты аренды на пустом месте; (2) ученик спрашивает про
// замок только при видимой вкладке — свёрнутая не жжёт ни батарею, ни базу; (3) щит
// не пропускает правку, но оставляет ребёнку полосу мастерской: уйти и позвать
// взрослого он должен уметь всегда.

import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { EditLockHolder, EditLockShield, EditLockWatch } from "../src/editLock";

let запросы: string[];
let маяки: string[];
let ответы: boolean[];
let исходныйFetch: typeof globalThis.fetch;
// Окно в тестах одно на весь файл: незакрытые слушатели соседнего случая ловили бы
// нажатия и следующего. Всё заведённое разбираем в afterEach.
let заведено: Array<() => void>;

const держатель = (id: string) => {
    const замок = new EditLockHolder(id);
    заведено.push(() => void замок.release());
    return замок;
};

const дозор = (id: string, locked: boolean, onChange: (l: boolean) => void) => {
    const наблюдатель = new EditLockWatch(id, locked, onChange);
    заведено.push(() => наблюдатель.stop());
    return наблюдатель;
};

const щитик = () => {
    const щит = new EditLockShield();
    заведено.push(() => щит.lower());
    return щит;
};

/** Видимость вкладки: happy-dom её не переключает, подменяем свойство. */
function видимость(состояние: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { value: состояние, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
    rs.useFakeTimers();
    заведено = [];
    запросы = [];
    маяки = [];
    ответы = [];
    исходныйFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
        запросы.push(`${init?.method ?? "GET"} ${url}`);
        const ответ = ответы.shift();
        return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ mentorEditing: Boolean(ответ) }),
        } as Response);
    }) as typeof fetch;
    navigator.sendBeacon = ((url: string) => {
        маяки.push(url);
        return true;
    }) as typeof navigator.sendBeacon;
    видимость("visible");
});

afterEach(() => {
    for (const разобрать of заведено) разобрать();
    globalThis.fetch = исходныйFetch;
    rs.useRealTimers();
    document.body.innerHTML = "";
});

describe("EditLockHolder — вкладка наставника", () => {
    test("замок берётся сразу и продлевается пульсом", async () => {
        держатель("7").hold();
        expect(запросы).toEqual(["POST /api/projects/7/edit-lock"]);

        await rs.advanceTimersByTimeAsync(45_000 * 2 + 1);
        expect(запросы.length).toBe(3);
    });

    test("«Выйти из правки» снимает замок и прекращает пульс", async () => {
        const замок = держатель("7");
        замок.hold();
        await замок.release();
        expect(запросы.at(-1)).toBe("POST /api/projects/7/edit-unlock");

        const было = запросы.length;
        await rs.advanceTimersByTimeAsync(45_000 * 3);
        expect(запросы.length).toBe(было);
    });

    test("уход со страницы отпускает работу маяком: ребёнок не ждёт аренду", async () => {
        держатель("7").hold();
        window.dispatchEvent(new Event("pagehide"));
        expect(маяки).toEqual(["/api/projects/7/edit-unlock"]);

        const было = запросы.length;
        await rs.advanceTimersByTimeAsync(45_000 * 3);
        expect(запросы.length).toBe(было);
    });
});

describe("EditLockWatch — вкладка ученика", () => {
    test("о запрете и о его снятии говорят по одному разу", async () => {
        ответы = [false, true, true, false];
        const события: boolean[] = [];
        дозор("7", false, (locked) => события.push(locked));

        await rs.advanceTimersByTimeAsync(12_000 * 4 + 1);
        expect(события).toEqual([true, false]);
    });

    test("свёрнутая вкладка не спрашивает ничего", async () => {
        ответы = [true, true, true];
        дозор("7", false, () => {});

        видимость("hidden");
        await rs.advanceTimersByTimeAsync(12_000 * 5);
        expect(запросы.length).toBe(0);
    });

    test("вкладка вернулась на экран — спрашиваем сразу, а не через такт", async () => {
        ответы = [true];
        const события: boolean[] = [];
        дозор("7", false, (locked) => события.push(locked));

        видимость("hidden");
        видимость("visible");
        await rs.advanceTimersByTimeAsync(0);
        expect(запросы.length).toBe(1);
        expect(события).toEqual([true]);
    });

    test("состояние из ответа об открытии работы повторно не объявляется", async () => {
        ответы = [true, false];
        const события: boolean[] = [];
        дозор("7", true, (locked) => события.push(locked));

        await rs.advanceTimersByTimeAsync(12_000 * 2 + 1);
        expect(события).toEqual([false]);
    });
});

describe("EditLockShield", () => {
    /** Нажатие: у щита свои цели, поэтому событие шлём в настоящий узел. */
    const узел = (внутриПолосы = false) => {
        const обёртка = document.createElement("div");
        if (внутриПолосы) обёртка.dataset["frameBar"] = "";
        const цель = document.createElement("button");
        обёртка.appendChild(цель);
        document.body.appendChild(обёртка);
        return цель;
    };

    const послать = (цель: Element, type: string, init: MouseEventInit = {}) => {
        const событие =
            type === "keydown"
                ? new KeyboardEvent(type, { bubbles: true, cancelable: true })
                : new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
        цель.dispatchEvent(событие);
        return событие;
    };

    test("правка не проходит, а полоса мастерской работает", () => {
        const щит = щитик();
        щит.raise();

        const поСцене = послать(узел(), "pointerdown");
        expect(поСцене.defaultPrevented).toBe(true);

        const поПолосе = послать(узел(true), "click");
        expect(поПолосе.defaultPrevented).toBe(false);

        const буква = послать(узел(), "keydown");
        expect(буква.defaultPrevented).toBe(true);
    });

    test("камера остаётся: смотреть, что делает наставник, можно", () => {
        щитик().raise();
        const правой = послать(узел(), "pointerdown", { button: 2 });
        expect(правой.defaultPrevented).toBe(false);
    });

    test("наставник вышел — щит снимается полностью", () => {
        const щит = щитик();
        щит.raise();
        щит.lower();
        const после = послать(узел(), "pointerdown");
        expect(после.defaultPrevented).toBe(false);
    });

    test("ребёнок читает, что происходит с его работой, а не гадает", () => {
        const щит = щитик();
        const плашка = document.querySelector("[data-mentor-lock]") as HTMLElement;
        expect(плашка.style.display).toBe("none");

        щит.raise();
        expect(плашка.style.display).toBe("flex");
        expect(плашка.textContent).toBe("Твою работу сейчас правит наставник — подожди немного");

        щит.lower();
        expect(плашка.style.display).toBe("none");
    });
});
