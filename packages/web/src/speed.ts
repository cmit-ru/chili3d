// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: числа вместо слова «тормозит» (B-134) — сколько миллисекунд
// грузилась страница и сколько занимает кадр. Жалоба на скорость без чисел
// неразбираема: «тормозит» на классной машине и «тормозит» дома — разные поломки.

/**
 * Сколько грузилась страница, по Navigation Timing. Пока страница ещё грузится,
 * `loadEventEnd` равен нулю — тогда берём готовность разметки. Нечего измерить —
 * null: лучше без строки в письме, чем со строкой «0 мс».
 */
export function загрузкаМс(perf: Performance | undefined = globalThis.performance): number | null {
    const nav = perf?.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return null;
    const конец = nav.loadEventEnd || nav.domContentLoadedEventEnd || 0;
    const мс = Math.round(конец - (nav.startTime || 0));
    return мс > 0 ? мс : null;
}

/** Середина ряда: одиночный тяжёлый кадр (сборка мусора) не портит замер. */
export function медиана(числа: number[]): number | null {
    if (!числа.length) return null;
    const ряд = [...числа].sort((a, b) => a - b);
    return Math.round(ряд[Math.floor(ряд.length / 2)]!);
}

export interface ЗамерКадра {
    rAF?: ((cb: () => void) => void) | null;
    сейчас?: () => number;
    кадров?: number;
    предел?: number;
}

/**
 * Сколько занимает кадр — короткой серией замеров прямо сейчас, а не постоянным
 * счётчиком: вечный `requestAnimationFrame` сам тратил бы то, что взялся мерить,
 * и как раз на слабых машинах, где включён экономный режим.
 *
 * Вкладка в фоне кадров не рисует, поэтому есть срок: не дождались — null.
 */
export function кадрМс({ rAF, сейчас, кадров = 30, предел = 500 }: ЗамерКадра = {}): Promise<number | null> {
    const запросить = rAF ?? globalThis.requestAnimationFrame?.bind(globalThis);
    const час = сейчас ?? (() => globalThis.performance?.now?.() ?? Date.now());
    if (typeof запросить !== "function") return Promise.resolve(null);
    return new Promise((готово) => {
        const промежутки: number[] = [];
        const начало = час();
        let прошлый = начало;
        const сдаться = setTimeout(() => готово(медиана(промежутки)), предел + 300);
        const конец = () => {
            clearTimeout(сдаться);
            готово(медиана(промежутки));
        };
        const шаг = () => {
            const t = час();
            промежутки.push(t - прошлый);
            прошлый = t;
            if (промежутки.length >= кадров || t - начало >= предел) {
                конец();
                return;
            }
            запросить(шаг);
        };
        запросить(шаг);
    });
}
