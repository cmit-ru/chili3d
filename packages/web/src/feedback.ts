// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: «Что-то не так?» — отзыв прямо из мастерской (B-101).
//
// Пожаловаться было некуда: адрес почты лежит на странице поддержки, а уйти на неё —
// закрыть мастерскую вместе с тем, что человек хотел показать. Поэтому окно
// открывается поверх сцены, а всё, о чём иначе пришлось бы переспрашивать (какая
// работа, какой браузер, что писала консоль, как выглядел экран), собирается само.
//
// Своей кнопки у отзыва нет: дверь в него одна и живёт в шапке — пункт «Что-то не
// так?» в меню человека, а у гостя кнопка рядом с «Войти» (`frameBar.ts`). Так же
// сделано в мастерской схем; прибитая плашка в углу закрывала статусную строку и
// перекрывалась пустой полосой действий вьюпорта, из-за чего не нажималась.
//
// Контракт оболочки — cad-app `src/routes/feedback.js`:
//   POST /api/feedback { editor, kind, message, projectId, context, shot } → { ok } | 429 { message }

import { FRAME_FONT } from "./errorBanner";
import { НЕ_СНИМАТЬ } from "./pageShot";

const ВИДЫ: [string, string][] = [
    ["broken", "Что-то сломалось"],
    ["hard", "Неудобно"],
    ["idea", "Есть идея"],
];

/**
 * Последние ошибки страницы: восстановить их задним числом нельзя, поэтому пишем
 * с самого начала работы и держим только десять — в отзыв уходит хвост, а не журнал.
 *
 * Перехват отдельный от CoreGuard: тот ищет падение ядра и показывает экран
 * восстановления, а здесь нужны любые ошибки, включая те, что редактор пережил.
 */
const ошибки: string[] = [];

function записать(текст: unknown) {
    if (!текст) return;
    ошибки.push(`${new Date().toLocaleTimeString("ru-RU")} ${String(текст).slice(0, 300)}`);
    if (ошибки.length > 10) ошибки.shift();
}

let перехвачено = false;
function перехватитьОшибки() {
    if (перехвачено) return;
    перехвачено = true;
    window.addEventListener("error", (e) => записать(e.message || e.error));
    window.addEventListener("unhandledrejection", (e) => записать(e.reason));
    const прежний = console.error;
    console.error = (...args: unknown[]) => {
        записать(args.map(String).join(" "));
        прежний.apply(console, args as []);
    };
}

/** Хвост журнала ошибок — для отзыва и для теста. */
export function последниеОшибки(): string[] {
    return ошибки.slice();
}

const PANEL = `
    position: fixed; inset: 0; z-index: 1200; display: flex;
    align-items: center; justify-content: center; padding: 16px;
    background: rgba(11,31,26,.45);
    font-family: ${FRAME_FONT};
`;

const CARD = `
    width: min(460px, 100%); max-height: calc(100vh - 32px); overflow: auto;
    background: var(--panel-background-color, #fff);
    color: var(--foreground-color, #0b1f1a);
    border-radius: 10px; box-shadow: 0 24px 60px -24px rgba(11,31,26,.6);
    padding: 22px; display: grid; gap: 12px; font-size: 14px;
`;

const TAB = `
    font: inherit; padding: 7px 12px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--border-color, #c7d3ce); background: none; color: inherit;
`;

const TAB_ON = `${TAB} border-color: #1c6dbd; background: #e8f4fd; color: #114a83; font-weight: 600;`;

const PRIMARY = `
    font: inherit; font-weight: 600; padding: 10px 14px; border-radius: 6px;
    border: none; background: #1c6dbd; color: #fff; cursor: pointer;
`;

export interface FeedbackOptions {
    /** Номер работы; в песочнице и на пустом входе его нет. */
    projectId: string | null;
    /** Что добавить к автосбору: ревизия, карточка урока. */
    context?: () => Record<string, unknown>;
    /** Снимок для отзыва в виде data-url; null, если снимать нечего.
     *  Обещанием: окно мастерской рисуется не мгновенно. */
    shot?: () => Promise<string | null>;
}

export class Feedback {
    private версия = "";

    constructor(private readonly options: FeedbackOptions) {
        перехватитьОшибки();
    }

    /** Версия собранного редактора: тот же коммит, что показывает «Открытый код». */
    private async ensureVersion(): Promise<string> {
        if (this.версия) return this.версия;
        try {
            const response = await fetch("/3d/source.txt");
            if (response.ok) this.версия = (await response.text()).trim().slice(0, 12);
        } catch {
            this.версия = "";
        }
        return this.версия;
    }

    open() {
        const root = document.createElement("div");
        // Снимок делается уже при открытом окне отзыва: без пометки картинка
        // была бы почти целиком заслонена им самим.
        root.setAttribute(НЕ_СНИМАТЬ, "");
        root.style.cssText = PANEL;
        const card = document.createElement("div");
        card.style.cssText = CARD;
        root.appendChild(card);
        const close = () => root.remove();

        root.addEventListener("mousedown", (e) => {
            if (e.target === root) close();
        });
        // Клавиши внутри окна до сцены не доходят: Delete в тексте иначе удалит деталь.
        for (const type of ["keydown", "keyup", "keypress"]) {
            card.addEventListener(type, (e) => e.stopPropagation());
        }
        card.addEventListener("keydown", (e) => {
            if ((e as KeyboardEvent).key === "Escape") close();
        });

        const title = document.createElement("div");
        title.style.cssText = "font-size:19px;font-weight:700";
        title.textContent = "Что не так?";

        const lede = document.createElement("div");
        lede.style.cssText = "opacity:.75;line-height:1.4";
        lede.textContent =
            "Расскажите, что случилось. Номер работы, браузер и картинку экрана мы приложим " +
            "сами — переспрашивать не будем.";

        let вид = "broken";
        const tabs = document.createElement("div");
        tabs.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
        const кнопки = ВИДЫ.map(([key, label]) => {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = label;
            b.setAttribute("data-kind", key);
            b.style.cssText = key === вид ? TAB_ON : TAB;
            b.onclick = () => {
                вид = key;
                for (const x of кнопки) x.style.cssText = x.getAttribute("data-kind") === key ? TAB_ON : TAB;
            };
            tabs.appendChild(b);
            return b;
        });

        const label = document.createElement("label");
        label.style.cssText = "display:grid;gap:5px";
        const labelText = document.createElement("span");
        labelText.textContent = "Что случилось (можно не писать)";
        const текст = document.createElement("textarea");
        текст.rows = 3;
        текст.maxLength = 2000;
        текст.placeholder = "Например: скругление не получается на этом ребре";
        текст.setAttribute("data-fb-text", "");
        текст.style.cssText = `
            width: 100%; box-sizing: border-box; font: inherit; padding: 9px 10px; resize: vertical;
            border: 1px solid var(--border-color, #c7d3ce); border-radius: 6px;
            background: var(--background-color, #fff); color: inherit;
        `;
        label.append(labelText, текст);

        const check = document.createElement("label");
        check.style.cssText = "display:flex;align-items:center;gap:8px;cursor:pointer";
        const галка = document.createElement("input");
        галка.type = "checkbox";
        галка.checked = true;
        галка.setAttribute("data-fb-shot", "");
        const checkText = document.createElement("span");
        checkText.textContent = "Приложить картинку экрана";
        check.append(галка, checkText);

        // Пока снимок рисуется, на его месте стоит заглушка: пустота выглядела
        // бы так, будто картинку не приложат вовсе.
        const место = document.createElement("div");
        место.textContent = "Готовим картинку экрана…";
        место.setAttribute("data-fb-shot-wait", "");
        место.style.cssText = `
            display: grid; place-items: center; min-height: 92px; border-radius: 6px;
            border: 1px dashed var(--border-color, #c7d3ce); background: #f8fafc;
            color: #4a625b; opacity: .8;
        `;

        const превью = document.createElement("img");
        превью.alt = "Картинка экрана, которая уйдёт вместе с отзывом";
        превью.hidden = true;
        превью.style.cssText = `
            width: 100%; border-radius: 6px; border: 1px solid var(--border-color, #c7d3ce);
            background: #f8fafc;
        `;

        const send = document.createElement("button");
        send.type = "button";
        send.textContent = "Отправить";
        send.setAttribute("data-fb-send", "");
        send.style.cssText = PRIMARY;

        const note = document.createElement("div");
        note.hidden = true;
        note.style.cssText = "line-height:1.4";

        card.append(title, lede, tabs, label, check, место, превью, send, note);
        document.body.appendChild(root);
        текст.focus();

        // Снимок делаем сразу: экран успеет измениться, пока человек пишет.
        // «Отправить» при этом не запираем — нажали раньше времени, отправка
        // сама дождётся картинку.
        const снимок = Promise.resolve(this.options.shot?.() ?? null).catch(() => null);
        let картинка: string | null = null;
        // Снимать нечем (окно открыто без него) — заглушке взяться неоткуда.
        let готово = !this.options.shot;
        const показать = () => {
            место.hidden = готово || !галка.checked;
            превью.hidden = !(готово && галка.checked && картинка);
        };
        показать();
        void снимок.then((данные) => {
            готово = true;
            картинка = данные;
            if (данные) превью.src = данные;
            показать();
        });
        галка.onchange = показать;

        const сказать = (text: string, ошибка = false) => {
            note.textContent = text;
            note.hidden = !text;
            note.style.color = ошибка ? "#a4262c" : "inherit";
            note.toggleAttribute("data-fb-error", ошибка);
        };

        send.onclick = async () => {
            send.disabled = true;
            сказать("Отправляем…");
            try {
                const response = await fetch("/api/feedback", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        editor: "3d",
                        kind: вид,
                        message: текст.value,
                        projectId: Number(this.options.projectId) || null,
                        shot: галка.checked ? await снимок : null,
                        context: {
                            ...(this.options.context?.() ?? {}),
                            адрес: location.pathname + location.search,
                            браузер: navigator.userAgent,
                            экран: `${window.innerWidth}×${window.innerHeight}`,
                            версия: await this.ensureVersion(),
                            ошибки: последниеОшибки(),
                        },
                    }),
                });
                const answer = await response.json().catch(() => ({}) as { message?: string });
                if (!response.ok) {
                    send.disabled = false;
                    сказать(answer.message || "Не получилось отправить. Попробуйте ещё раз.", true);
                    return;
                }
                const done = document.createElement("div");
                done.style.cssText = "font-size:19px;font-weight:700";
                done.textContent = "Спасибо!";
                const doneText = document.createElement("div");
                doneText.style.cssText = "opacity:.75;line-height:1.4";
                doneText.textContent = "Мы получили сообщение и посмотрим, что там.";
                card.replaceChildren(done, doneText);
                card.setAttribute("data-fb-done", "");
                window.setTimeout(close, 2500);
            } catch {
                send.disabled = false;
                сказать("Не получилось отправить — похоже, пропала сеть.", true);
            }
        };
    }
}
