// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: превью снимается таймером, а не в такте сохранения (B-178).
// Проверяем три обещания ТЗ §11: снимок делается в кадре, без правок его нет,
// и при уходе со страницы он всё-таки случается.

import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { PreviewShots } from "../src/preview";

function цель() {
    const отправлено: string[] = [];
    const наЗакрытии: boolean[] = [];
    const сНаводкой: boolean[] = [];
    let снимков = 0;
    return {
        отправлено,
        наЗакрытии,
        сНаводкой,
        снимков: () => снимков,
        target: {
            snapshot: (наводя?: boolean) => {
                снимков += 1;
                сНаводкой.push(Boolean(наводя));
                return `кадр-${снимков}`;
            },
            send: async (dataUrl: string, closing?: boolean) => {
                отправлено.push(dataUrl);
                наЗакрытии.push(Boolean(closing));
            },
        },
    };
}

describe("превью вне такта сохранения", () => {
    let кадры: Array<() => void>;
    let исходныйRaf: typeof window.requestAnimationFrame;

    beforeEach(() => {
        rs.useFakeTimers();
        кадры = [];
        исходныйRaf = window.requestAnimationFrame;
        // Кадр рисуем вручную: так видно, что снимок ждёт кадра, а не таймера.
        window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
            кадры.push(() => cb(0));
            return кадры.length;
        }) as typeof window.requestAnimationFrame;
    });

    afterEach(() => {
        window.requestAnimationFrame = исходныйRaf;
        rs.useRealTimers();
    });

    test("без сохранений снимков нет", () => {
        const { target, снимков } = цель();
        const превью = new PreviewShots(target, 60_000);
        превью.start();

        rs.advanceTimersByTime(180_000);

        expect(кадры.length).toBe(0);
        expect(снимков()).toBe(0);
        превью.stop();
    });

    test("после сохранения снимок делается в кадре и уходит один раз за период", async () => {
        const { target, отправлено, снимков, сНаводкой } = цель();
        const превью = new PreviewShots(target, 60_000);
        превью.start();
        превью.workChanged();

        rs.advanceTimersByTime(60_000);
        // Таймер только попросил кадр: пиксели холста читать ещё нельзя.
        expect(снимков()).toBe(0);
        expect(кадры.length).toBe(1);

        кадры.shift()?.();
        await Promise.resolve();
        expect(отправлено).toEqual(["кадр-1"]);
        // Обычный снимок — тем, что видит перед собой ученик: камеру не трогаем.
        expect(сНаводкой).toEqual([false]);

        // Следующая минута без правок — новых снимков нет.
        rs.advanceTimersByTime(60_000);
        expect(кадры.length).toBe(0);
        expect(отправлено.length).toBe(1);
        превью.stop();
    });

    test("при уходе со страницы снимок делается сразу, кадра уже не будет", async () => {
        const { target, отправлено, наЗакрытии } = цель();
        const превью = new PreviewShots(target, 60_000);
        превью.start();
        превью.workChanged();

        window.dispatchEvent(new Event("pagehide"));
        await Promise.resolve();

        expect(отправлено).toEqual(["кадр-1"]);
        // Хранилищу надо знать, что вкладка закрывается: обычный запрос браузер
        // на уходе со страницы обрывает, и картинка не доезжала.
        expect(наЗакрытии).toEqual([true]);
        превью.stop();
    });

    test("работу без картинки снимаем при открытии, не дожидаясь минуты", async () => {
        const { target, отправлено, наЗакрытии, сНаводкой } = цель();
        const превью = new PreviewShots(target, 60_000);
        превью.start();

        превью.shootNow();
        expect(кадры.length).toBe(1);
        кадры.shift()?.();
        await Promise.resolve();

        expect(отправлено).toEqual(["кадр-1"]);
        expect(наЗакрытии).toEqual([false]);
        // Первый кадр — с наводкой: камера при открытии смотрит мимо модели.
        expect(сНаводкой).toEqual([true]);

        // Разовый снимок не считается правкой: следующая минута молчит.
        rs.advanceTimersByTime(60_000);
        expect(кадры.length).toBe(0);
        expect(отправлено.length).toBe(1);
        превью.stop();
    });

    test("после stop таймер и уход со страницы молчат", async () => {
        const { target, отправлено } = цель();
        const превью = new PreviewShots(target, 60_000);
        превью.start();
        превью.workChanged();
        превью.stop();

        rs.advanceTimersByTime(120_000);
        window.dispatchEvent(new Event("pagehide"));
        await Promise.resolve();

        expect(кадры.length).toBe(0);
        expect(отправлено).toEqual([]);
    });
});
