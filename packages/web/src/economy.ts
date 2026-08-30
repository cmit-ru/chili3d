// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: экономный режим рендера для классных машин (B-052).
//
// Включается ДО сборки приложения: по флагу «общие компьютеры класса» у
// группы работы (его отдаёт оболочка) или по автодетекту слабого железа.
// Экономия: pixel ratio не выше 1, без сглаживания, тесселяция вдвое грубее —
// на школьных мониторах разница почти не видна, а треугольников и пикселей
// кратно меньше.

declare global {
    // Читаются ядром в момент создания рендерера и мешеров.
    // biome-ignore lint/style/noVar: declare global requires var
    var __maketkaEconomy: boolean | undefined;
    // biome-ignore lint/style/noVar: declare global requires var
    var __maketkaMeshDeflection: number | undefined;
}

function weakDevice(): boolean {
    const cores = navigator.hardwareConcurrency || 8;
    const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
    return cores <= 4 || memory <= 4;
}

export function enableEconomyIfNeeded(sharedPc: boolean) {
    if (!sharedPc && !weakDevice()) return false;
    globalThis.__maketkaEconomy = true;
    globalThis.__maketkaMeshDeflection = 0.01; // штатно 0.005
    return true;
}
