// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Пять предустановленных шрифтов инструмента «Надпись».
//
// Все под SIL OFL 1.1 — лицензия прямо разрешает распространять шрифты вместе
// с AGPL-программой (шрифты соседствуют с кодом, а не сливаются с ним). Файлы
// лежат ровно такими, какими выложены в Google Fonts, вместе с текстом
// лицензии; кладёт их туда scripts/fetch-fonts.py. Обрезать их под наш алфавит
// нельзя: у четырёх семейств из пяти имя защищено оговоркой Reserved Font Name,
// а обрезка по OFL-FAQ 2.6 — это изменение шрифта, после которого прежнее имя
// носить запрещено. В бандл первого экрана шрифты не входят: браузер берёт их,
// только когда ребёнок открыл инструмент.
//
// Своего шрифта ребёнок загрузить не может — и это не урезание: у Onshape
// закрытый список шрифтов, у Tinkercad свой грузится только обходным путём
// через SVG. Разбор конкурентов — agent_docs/investigations в репозитории cad.

import { Combobox, Result } from "@chili3d/core";
import { type Font, parse } from "opentype.js/dist/opentype.mjs";
import badScript from "./fonts/BadScript-Regular.ttf";
import ptSans from "./fonts/PT_Sans-Web-Regular.ttf";
import ptSerif from "./fonts/PT_Serif-Web-Regular.ttf";
import ptMono from "./fonts/PTM55FT.ttf";
import ruslanDisplay from "./fonts/RuslanDisplay-Regular.ttf";

export interface TextFont {
    /** Идентификатор в документе. Менять нельзя — по нему открываются работы. */
    readonly id: string;
    /** Имя шрифта: одинаковое на всех языках, переводить нечего. */
    readonly name: string;
    readonly url: string;
}

export const TEXT_FONTS: readonly TextFont[] = [
    { id: "pt-sans", name: "PT Sans", url: ptSans },
    { id: "pt-serif", name: "PT Serif", url: ptSerif },
    { id: "pt-mono", name: "PT Mono", url: ptMono },
    { id: "bad-script", name: "Bad Script", url: badScript },
    { id: "ruslan-display", name: "Ruslan Display", url: ruslanDisplay },
];

export const DEFAULT_FONT_ID = TEXT_FONTS[0].id;

/** Список для панелей свойств: значение — идентификатор, подпись — имя шрифта. */
export const FONT_COMBOBOX = Combobox.from(
    TEXT_FONTS.map((x) => x.id),
    { convert: (id: string) => Result.ok(findFont(id)?.name ?? id) },
);

export interface LoadedFont {
    readonly font: Font;
    /**
     * Высота заглавной буквы при кегле 1. Ребёнок задаёт высоту букв в
     * миллиметрах, а не кегль: «высота 10» должна давать «Н» ростом 10 мм.
     */
    readonly capHeight: number;
}

const загруженные = new Map<string, LoadedFont>();
const вПути = new Map<string, Promise<LoadedFont | undefined>>();

export function findFont(id: string): TextFont | undefined {
    return TEXT_FONTS.find((x) => x.id === id);
}

/** Разобранный шрифт, если он уже скачан. Иначе undefined — построение подождёт. */
export function loadedFont(id: string): LoadedFont | undefined {
    return загруженные.get(id);
}

/**
 * Скачать и разобрать шрифт. Повторные вызовы отдают тот же промис, поэтому
 * пять узлов с одним шрифтом качают файл один раз.
 */
export function loadFont(id: string): Promise<LoadedFont | undefined> {
    const готовый = загруженные.get(id);
    if (готовый) return Promise.resolve(готовый);

    const идущий = вПути.get(id);
    if (идущий) return идущий;

    const промис = загрузить(id).finally(() => {
        вПути.delete(id);
    });
    вПути.set(id, промис);
    return промис;
}

/**
 * Скачать все пять сразу — вызывается при запуске инструмента «Надпись».
 * Ребёнок листает список и должен видеть имя каждого шрифта написанным им
 * самим, а выбрав — сразу получить буквы, а не пустое место на пару секунд.
 */
export function loadAllFonts(): Promise<unknown> {
    return Promise.all(TEXT_FONTS.map((x) => loadFont(x.id)));
}

async function загрузить(id: string): Promise<LoadedFont | undefined> {
    const описание = findFont(id);
    if (!описание) return undefined;

    try {
        const ответ = await fetch(описание.url);
        if (!ответ.ok) return undefined;
        const данные = await ответ.arrayBuffer();
        const font = parse(данные);
        const результат: LoadedFont = { font, capHeight: измеритьВысотуБуквы(font) };
        загруженные.set(id, результат);
        зарегистрироватьДляСписка(описание, данные);
        return результат;
    } catch {
        return undefined;
    }
}

/**
 * Высота «Н» — единственная мера, которая одинаково честна и для наборного
 * шрифта, и для рукописного: таблица OS/2 у Bad Script обещает 0,96, а буква
 * на деле выше единицы.
 */
function измеритьВысотуБуквы(font: Font): number {
    const рамка = font.getPath("Н", 0, 0, 1000).getBoundingBox();
    const высота = (рамка.y2 - рамка.y1) / 1000;
    return высота > 0 ? высота : 0.7;
}

/**
 * Тот же файл отдаём браузеру как обычный шрифт — чтобы в списке выбора каждое
 * имя было написано своим шрифтом, и ребёнок выбирал глазами, а не наугад.
 */
function зарегистрироватьДляСписка(описание: TextFont, данные: ArrayBuffer) {
    if (typeof FontFace === "undefined" || !document.fonts) return;
    try {
        const шрифт = new FontFace(описание.name, данные);
        шрифт.load().then(
            (готовый) => document.fonts.add(готовый),
            () => {},
        );
    } catch {
        // Списку не повезло — на построение букв это не влияет.
    }
}
