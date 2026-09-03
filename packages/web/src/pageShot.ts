// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: снимок всего окна мастерской для отзыва (B-101).
//
// В отзыв уходил только кадр рабочей области (`activeView.toImage`), и жалоба
// «кнопка не нажимается» приходила с картинкой, на которой нет ни кнопки, ни
// панелей, ни открытого окна — ровно того, о чём человек пишет. Нужен снимок
// того, что он видел: лента, палитра, панель урока, окна и подсказки.
//
// Чем НЕ делаем: сторонними библиотеками (html2canvas и подобные) нельзя —
// INV-006 и INV-011 запрещают на странице редактора код, которого нет в
// публичном форке. `getDisplayMedia` тоже нет: это разрешение браузера и лишний
// диалог посреди урока у ребёнка.
//
// Поэтому рисуем страницу сами: клон `body` + собранный CSS кладём в SVG
// `foreignObject`, грузим этот SVG картинкой и переносим на холст.
//
// Тот же модуль повторяет мастерская схем — интерфейс общий, различия
// мастерских уходят в `правкаКлона` (в схемах детали живут в теневом дереве и
// в клон не попадают, их место занимает готовый снимок схемы).

/** Что реально уехало в отзыв: всё окно или только кадр рабочей области. */
export type ВидСнимка = "экран" | "рабочая область";

export interface Снимок {
    картинка: string | null;
    вид: ВидСнимка;
}

export interface НастройкиСнимка {
    /** Кадр рабочей области: он же запасной путь, если окно нарисовать не вышло. */
    запасной: () => string | null;
    /** Правка клона перед сборкой: подменить то, что своим ходом не нарисуется. */
    правкаКлона?: (клон: HTMLElement) => void;
}

/** Ширина снимка: 1400 px при JPEG 0.72 держит картинку в 150–300 КБ. */
const МАКС_ШИРИНА = 1400;
const КАЧЕСТВО = 0.72;
/** Больше трёх секунд человек ждать не должен — уйдёт кадр рабочей области. */
const ЖДЁМ_МС = 3000;
const МАКС_КАРТИНОК = 20;
const МАКС_БАЙТ = 256 * 1024;

/**
 * Что не должно попасть на снимок (само окно отзыва): помечается атрибутом,
 * потому что снимок делается уже после его открытия — иначе картинка была бы
 * почти целиком заслонена этим окном.
 */
export const НЕ_СНИМАТЬ = "data-page-shot-skip";

/** Снимок всего окна; не получилось — кадр рабочей области, но не пустота. */
export async function снимокОкна(настройки: НастройкиСнимка): Promise<Снимок> {
    const запасной = (): Снимок => {
        try {
            return { картинка: настройки.запасной(), вид: "рабочая область" };
        } catch {
            return { картинка: null, вид: "рабочая область" };
        }
    };

    try {
        const ширина = window.innerWidth;
        const высота = window.innerHeight;
        if (!ширина || !высота) return запасной();

        // Клон и кадры холстов снимаем разом, до первого ожидания: дальше идут
        // сеть и загрузка картинки, а экран за это время успеет измениться.
        const клон = document.body.cloneNode(true) as HTMLElement;
        подменитьХолсты(клон, document.body);
        for (const узел of Array.from(клон.querySelectorAll(`[${НЕ_СНИМАТЬ}]`))) узел.remove();
        убратьСпрайт(клон);
        настройки.правкаКлона?.(клон);

        const стили = собратьСтили();
        await втянутьКартинки(клон);
        const картинка = await нарисовать(разметка(клон, стили, ширина, высота), ширина, высота);
        return картинка ? { картинка, вид: "экран" } : запасной();
    } catch {
        return запасной();
    }
}

/**
 * Холст в клон не переносится — копируется пустым. Меняем каждый на картинку
 * того же размера с кадром живого холста: так в снимок попадает сама сцена.
 */
export function подменитьХолсты(клон: HTMLElement, оригинал: HTMLElement): void {
    const живые = Array.from(оригинал.querySelectorAll("canvas"));
    // Клон — точная копия, поэтому холсты сходятся по порядку обхода.
    Array.from(клон.querySelectorAll("canvas")).forEach((холст, индекс) => {
        const живой = живые[индекс];
        const картинка = клон.ownerDocument.createElement("img");
        картинка.setAttribute("style", холст.getAttribute("style") ?? "");
        if (холст.className) картинка.className = холст.className;
        // Собственные width/height холста — разрешение буфера, а не место на
        // экране, поэтому размер берём с живого элемента.
        const место = живой?.getBoundingClientRect?.();
        if (место?.width) {
            картинка.width = Math.round(место.width);
            картинка.height = Math.round(место.height);
        }
        try {
            const кадр = живой?.toDataURL("image/jpeg", 0.8);
            if (кадр) картинка.src = кадр;
        } catch {
            // Холст «испачкан» чужой картинкой — оставляем пустое место.
        }
        холст.replaceWith(картинка);
    });
}

/** Весь CSS страницы одним куском: листы свои, поэтому правила читаются. */
export function собратьСтили(): string {
    const куски: string[] = [];
    for (const лист of Array.from(document.styleSheets)) {
        try {
            for (const правило of Array.from(лист.cssRules)) куски.push(правило.cssText);
        } catch {
            // Чужой лист читать не дают — молча пропускаем.
        }
    }
    return куски.join("\n");
}

/** Спрайт иконок ленты: без него на снимке дыры вместо кнопок. */
function спрайт(): string {
    const куски: string[] = [];
    for (const ключ of Object.keys(window)) {
        if (!ключ.startsWith("_iconfont_svg_string_")) continue;
        const текст = (window as unknown as Record<string, unknown>)[ключ];
        // В переменной лежит целый <svg> с <symbol> внутри, нам нужна начинка.
        if (typeof текст === "string") {
            куски.push(текст.replace(/^\s*<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, ""));
        }
    }
    return куски.join("");
}

/** Тот же спрайт лежит и в теле страницы: две копии id ломают ссылки `<use>`. */
function убратьСпрайт(клон: HTMLElement): void {
    for (const svg of Array.from(клон.querySelectorAll("svg"))) {
        if (svg.querySelector("symbol")) svg.remove();
    }
}

/**
 * Картинки страницы SVG сам не загрузит: свои втягиваем данными, чужие убираем.
 * Ограничения — чтобы отзыв не превратился в выкачивание половины кабинета.
 */
async function втянутьКартинки(клон: HTMLElement): Promise<void> {
    let втянуто = 0;
    for (const картинка of Array.from(клон.querySelectorAll("img"))) {
        const адрес = картинка.getAttribute("src") ?? "";
        if (!адрес || адрес.startsWith("data:")) continue;
        const свой = новыйАдрес(адрес)?.origin === location.origin;
        if (!свой || втянуто >= МАКС_КАРТИНОК) {
            картинка.removeAttribute("src");
            continue;
        }
        втянуто++;
        const данные = await вДанные(адрес);
        if (данные) картинка.setAttribute("src", данные);
        else картинка.removeAttribute("src");
    }
}

function новыйАдрес(адрес: string): URL | null {
    try {
        return new URL(адрес, location.href);
    } catch {
        return null;
    }
}

async function вДанные(адрес: string): Promise<string> {
    try {
        const ответ = await fetch(адрес, { credentials: "same-origin" });
        if (!ответ.ok) return "";
        const тело = await ответ.blob();
        if (тело.size > МАКС_БАЙТ) return "";
        return await new Promise<string>((готово) => {
            const чтение = new FileReader();
            чтение.onload = () => готово(String(чтение.result ?? ""));
            чтение.onerror = () => готово("");
            чтение.readAsDataURL(тело);
        });
    } catch {
        return "";
    }
}

/**
 * Цвета мастерской заданы переменными на `:root[theme=…]`, а корень нашего
 * документа — сам `<svg>`, и до клона эти правила не достанут. Поэтому
 * значения переменных переносим прямо на обёртку: иначе панели уедут в
 * запасные цвета из `var(…, #fff)`.
 */
function переменные(css: string): string {
    const стиль = getComputedStyle(document.body);
    let вывод = "";
    for (const имя of new Set(css.match(/--[\w-]+/g) ?? [])) {
        const значение = стиль.getPropertyValue(имя);
        if (значение) вывод += `${имя}:${значение};`;
    }
    return вывод;
}

/** Собранный документ: спрайт в `<defs>`, страница внутри `foreignObject`. */
function разметка(клон: HTMLElement, css: string, ширина: number, высота: number): string {
    const тело = new XMLSerializer().serializeToString(клон);
    const обёртка = `width:${ширина}px;height:${высота}px;overflow:hidden;${переменные(css)}`;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${ширина}" height="${высота}">` +
        `<defs>${спрайт()}</defs>` +
        `<foreignObject width="${ширина}" height="${высота}">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" style="${обёртка}">` +
        `<style>${css}</style>${тело}</div></foreignObject></svg>`
    );
}

/** Рисуем собранный SVG на холст. Ничего на живую страницу не добавляем. */
function нарисовать(svg: string, ширина: number, высота: number): Promise<string> {
    return new Promise<string>((готово) => {
        let таймер = 0;
        const закончить = (данные: string) => {
            window.clearTimeout(таймер);
            готово(данные);
        };
        таймер = window.setTimeout(() => закончить(""), ЖДЁМ_МС);

        const картинка = new Image();
        картинка.onerror = () => закончить("");
        картинка.onload = () => {
            try {
                const масштаб = Math.min(1, МАКС_ШИРИНА / ширина);
                const холст = document.createElement("canvas");
                холст.width = Math.round(ширина * масштаб);
                холст.height = Math.round(высота * масштаб);
                const кисть = холст.getContext("2d");
                if (!кисть) return закончить("");
                // JPEG прозрачности не знает: без подложки пустые места чернеют.
                кисть.fillStyle = "#ffffff";
                кисть.fillRect(0, 0, холст.width, холст.height);
                кисть.drawImage(картинка, 0, 0, холст.width, холст.height);
                закончить(холст.toDataURL("image/jpeg", КАЧЕСТВО));
            } catch {
                закончить("");
            }
        };
        картинка.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
}
