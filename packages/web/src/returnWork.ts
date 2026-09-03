// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: возврат работы из файла (B-117 — модели, B-133 — схемы).
//
// Ребёнок скачал работу файлом («Скачать…» → «Файл работы») и потом открыл этот
// файл снова — окном выбора файла или перетаскиванием на мастерскую. Апстрим
// открывал его вторым документом прямо в браузере: за таким документом не
// следит автосохранение, он не появляется в кабинете и пропадает вместе с
// вкладкой — это действующая потеря работы, а не неудобство.
//
// Возврат — это НОВАЯ работа на сервере: оболочка кладёт содержимое файла телом
// работы (`POST /projects/from-file`), и дальше она сохраняется как любая
// другая. Перекладывать ничего не надо: `.cd` — это тот же сериализованный
// документ, что уезжает в облако при каждом сохранении.
//
// Гостю в песочнице сохранять некуда, поэтому ему показывается тот же оверлей
// «Сохранить работу», что и собранному в песочнице: заводим мастерскую (или
// входим) — и файл уезжает в неё тем же движением.
//
// Вид работы определяет сервер по метке внутри файла, а не мастерская, на
// которую файл уронили: ребёнок не помнит, схема у него в файле или модель.
// Уронил схему на 3D — уедет в мастерскую схем по адресу из ответа.

import { InternalClassName } from "@chili3d/core";
import { showBanner } from "./errorBanner";

/** Адрес маршрута оболочки. Один на оба входа — окно и перетаскивание. */
const МАРШРУТ = "/projects/from-file";

/** Второе сообщение о возврате заменяет первое, а не копится под ним. */
const КЛЮЧ = "возврат-работы";

export interface ReturnWorkOptions {
    /** Досылка правок открытой работы: уходим на новую только после неё. */
    flush?: () => Promise<void>;
    /** Сохранять некуда (гость): тот же путь, что у «Сохранить работу». */
    askGuest?: (scene: unknown) => void;
    /** Переход в мастерскую вернувшейся работы. */
    go?: (href: string) => void;
}

/**
 * Работы возвращаются по одной: вторая всё равно увела бы страницу с первой.
 * Про остальные файлы говорим вслух — молчание выглядит как потеря.
 */
export function returnWorkFromFiles(files: File[], options: ReturnWorkOptions = {}): void {
    const file = files[0];
    if (!file) return;
    if (files.length > 1) {
        showBanner({
            key: КЛЮЧ,
            tone: "neutral",
            text: "Верну только первый файл — работы возвращаются по одной",
        });
    }
    void returnWorkFromFile(file, options);
}

export async function returnWorkFromFile(file: File, options: ReturnWorkOptions = {}): Promise<void> {
    const problem = (text: string) => {
        showBanner({ key: КЛЮЧ, text });
    };

    let text: string;
    try {
        text = await file.text();
    } catch {
        problem("Не получилось прочитать файл. Попробуй ещё раз");
        return;
    }

    const waiting = showBanner({ key: КЛЮЧ, tone: "neutral", text: "Возвращаю работу…" });

    let response: Response;
    try {
        // Тело запроса — содержимое файла как есть: это уже JSON, и заворачивать
        // его во второй JSON значило бы удвоить размер на экранировании.
        response = await fetch(МАРШРУТ, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: text,
        });
    } catch {
        waiting.close();
        problem("Не получилось вернуть работу: нет интернета. Проверь связь и попробуй ещё раз");
        return;
    }

    const answer = (await response.json().catch(() => null)) as {
        id?: number;
        href?: string;
        message?: string;
    } | null;
    waiting.close();

    // Сессии нет: у гостя ещё нет мастерской, класть работу некуда. Ведём его
    // тем же путём, что и «Сохранить работу» из песочницы, — регистрация или
    // вход поверх мастерской, и файл уезжает вместе с ними.
    // Оверлей песочницы умеет заводить только модель, поэтому схему гостю
    // предлагать нечем: про неё говорим общими словами.
    if (response.status === 401) {
        const scene = parseScene(text);
        if (scene !== undefined && options.askGuest) {
            options.askGuest(scene);
            return;
        }
        problem("Чтобы вернуть работу, надо войти в свою мастерскую");
        return;
    }

    if (!response.ok || !answer?.id) {
        // Отказ объясняет сервер: там знают, файл ли не тот, кончилось ли место.
        problem(answer?.message ?? "Не получилось вернуть работу. Попробуй ещё раз");
        return;
    }

    // Правки открытой работы досылаем ДО ухода: иначе последние минуты
    // останутся в этой вкладке.
    await options.flush?.();
    const go = options.go ?? ((href: string) => window.location.assign(href));
    go(answer.href ?? `/3d/${answer.id}`);
}

/**
 * Разбор для гостевого пути: сервер его не делал, а оверлею нужен объект.
 * Схему возвращаем как «не наш вид» — оверлей заводит только модель.
 */
function parseScene(text: string): unknown {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return undefined;
    }
    const doc = data as Record<string, unknown> | null;
    return doc?.[InternalClassName] === "Document" ? data : undefined;
}
