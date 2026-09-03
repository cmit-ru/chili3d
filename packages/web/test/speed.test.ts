// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: числа вместо слова «тормозит» (B-134). Тест держит два обещания:
// замер кадра всегда чем-нибудь заканчивается (вкладка в фоне кадров не рисует),
// и мерить нечего — значит null, а не ноль: строки «0 мс» в письме быть не должно.

import { загрузкаМс, кадрМс, медиана } from "../src/speed";

describe("Числа о скорости", () => {
    test("нечего мерить — null, а не ноль", () => {
        expect(загрузкаМс(undefined)).toBeNull();
        expect(загрузкаМс({ getEntriesByType: () => [] } as unknown as Performance)).toBeNull();
        const нулевая = {
            getEntriesByType: () => [{ startTime: 0, loadEventEnd: 0, domContentLoadedEventEnd: 0 }],
        };
        expect(загрузкаМс(нулевая as unknown as Performance)).toBeNull();
    });

    test("страница грузилась столько, сколько говорит Navigation Timing", () => {
        const perf = {
            getEntriesByType: () => [{ startTime: 0, loadEventEnd: 1234.6, domContentLoadedEventEnd: 900 }],
        };
        expect(загрузкаМс(perf as unknown as Performance)).toBe(1235);
    });

    test("середина ряда, а не среднее: один тяжёлый кадр замер не портит", () => {
        expect(медиана([])).toBeNull();
        expect(медиана([16, 17, 300, 16, 15])).toBe(16);
    });

    test("кадр меряется короткой серией и отдаёт число", async () => {
        let t = 0;
        const кадр = await кадрМс({
            rAF: (cb) => queueMicrotask(cb),
            сейчас: () => (t += 16),
            кадров: 5,
        });
        expect(кадр).toBe(16);
    });

    test("рисовать некому — замер отдаёт null, а не висит", async () => {
        const было = globalThis.requestAnimationFrame;
        (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined;
        try {
            expect(await кадрМс()).toBeNull();
        } finally {
            globalThis.requestAnimationFrame = было;
        }
    });
});
