// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Своё описание типов opentype.js: пакет типов не везёт, а @types/opentype.js
// в реестре застыл на версии 1 и расходится с API двойки. Описано ровно то,
// чем пользуется инструмент «Надпись», — сверено с dist/opentype.mjs 2.0.0.
//
// Импорт идёт по прямому пути к ESM-сборке: в package.json opentype.js нет
// поля "exports", и Node в тестах уходит на CJS-вход, где именованных
// экспортов нет вовсе. Прямой путь одинаково работает и у сборщика, и в Node.

declare module "opentype.js/dist/opentype.mjs" {
    /** Команда контура. Координаты — в системе экрана: y растёт ВНИЗ. */
    export interface PathCommand {
        type: "M" | "L" | "C" | "Q" | "Z";
        x?: number;
        y?: number;
        x1?: number;
        y1?: number;
        x2?: number;
        y2?: number;
    }

    export interface BoundingBox {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }

    export interface Path {
        commands: PathCommand[];
        getBoundingBox(): BoundingBox;
    }

    export interface Font {
        unitsPerEm: number;
        /** Один путь на всю строку. */
        getPath(text: string, x: number, y: number, fontSize: number): Path;
        /** По пути на каждый знак строки, с учётом кернинга. */
        getPaths(text: string, x: number, y: number, fontSize: number): Path[];
        /** Номер знака в шрифте; 0 — знака в шрифте нет. */
        charToGlyphIndex(char: string): number;
    }

    export function parse(buffer: ArrayBuffer): Font;
}
