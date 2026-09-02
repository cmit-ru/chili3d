// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: сообщения мастерской (B-103).
//
// Беда показывается баннером с крестиком, а не тостом: тост уезжает через две
// секунды, и ребёнок, который в этот момент смотрел на сцену, не узнает, что
// работа не сохраняется. Тост остаётся для нейтральных подтверждений — они
// ничего не требуют, и пропустить их не страшно.
//
// Место у сообщений одно — верх по центру (`frame-contract.md`, «Правило
// места»). Если там уже висит плашка режима («Песочница», «Чужая работа»),
// сообщение встаёт ПОД неё, а не поверх: нижняя группа сдвигается, а не
// прячется.

/** Беда — красная рамка и крестик; нейтральное — спокойная, гаснет само. */
export type BannerTone = "error" | "neutral";

export interface BannerAction {
    text: string;
    /** Вернуть `true`, чтобы баннер закрылся после нажатия. */
    onSelect: () => void | boolean | Promise<void | boolean>;
}

export interface BannerOptions {
    text: string;
    tone?: BannerTone;
    /** Мелкая строка для взрослого: «покажи преподавателю: работа 7, ошибка 500». */
    hint?: string;
    actions?: BannerAction[];
    /** Нейтральное гаснет само; беда висит, пока её не закроют. */
    autoCloseMs?: number;
    /** Второй баннер с тем же ключом заменяет первый, а не копится под ним. */
    key?: string;
}

export interface Banner {
    close(): void;
}

const STACK_ID = "frame-messages";

/** Шрифт каркаса. Живёт здесь, потому что этот файл ничего не импортирует. */
export const FRAME_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Низ ленты: сообщение не должно закрывать ни полосу каркаса, ни команды. */
function ribbonBottom(): number {
    const ribbon = document.querySelector("chili-ribbon") as HTMLElement | null;
    const rect = ribbon?.getBoundingClientRect();
    return rect && rect.height > 0 ? rect.bottom : 44;
}

/** Плашка режима стоит в том же месте и по слою выше — сообщение уходит под неё. */
function modeBottom(): number {
    let bottom = 0;
    for (const el of document.querySelectorAll<HTMLElement>('[data-frame-group="mode"]')) {
        if (!el.isConnected || el.hidden) continue;
        const rect = el.getBoundingClientRect();
        if (rect.height > 0) bottom = Math.max(bottom, rect.bottom);
    }
    return bottom;
}

let stack: HTMLElement | undefined;

function place() {
    if (!stack) return;
    stack.style.top = `${Math.max(ribbonBottom(), modeBottom()) + 8}px`;
}

function ensureStack(): HTMLElement {
    if (stack?.isConnected) {
        place();
        return stack;
    }
    stack = document.createElement("div");
    stack.id = STACK_ID;
    // Место и группа объявлены в разметке: иначе правило «в одном месте одна
    // группа» проверялось бы только глазами (ТЗ, «Слои и места»).
    stack.dataset["framePlace"] = "top-center";
    stack.dataset["frameGroup"] = "message";
    stack.style.cssText = `
        position: fixed; left: 50%; transform: translateX(-50%); z-index: 500;
        display: grid; gap: 8px; width: min(560px, calc(100vw - 24px));
        font-family: ${FRAME_FONT}; font-size: 14px;
    `;
    document.body.appendChild(stack);
    place();
    window.addEventListener("resize", place);
    return stack;
}

function dropStackIfEmpty() {
    if (stack && stack.childElementCount === 0) {
        stack.remove();
        window.removeEventListener("resize", place);
        stack = undefined;
    }
}

function actionButton(action: BannerAction, close: () => void, tone: BannerTone) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.text;
    button.style.cssText = `
        font: inherit; font-weight: 600; padding: 6px 12px; border-radius: 6px;
        min-height: 24px; cursor: pointer; white-space: nowrap;
        border: 1px solid ${tone === "error" ? "#b91c1c" : "#0e7a5f"};
        background: none; color: ${tone === "error" ? "#b91c1c" : "#0e7a5f"};
    `;
    button.onclick = async () => {
        const keepOpen = (await action.onSelect()) === false;
        if (!keepOpen) close();
    };
    return button;
}

/** Показать сообщение. Возвращает ручку: баннер закрывает и тот, кто его открыл. */
export function showBanner(options: BannerOptions): Banner {
    const tone = options.tone ?? "error";
    const parent = ensureStack();

    if (options.key) {
        parent.querySelector(`[data-banner-key="${CSS.escape(options.key)}"]`)?.remove();
    }

    const root = document.createElement("div");
    if (options.key) root.dataset["bannerKey"] = options.key;
    // Беду читалка объявляет сразу, спокойное подтверждение — в свой черёд.
    root.setAttribute("role", tone === "error" ? "alert" : "status");
    root.style.cssText = `
        display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap;
        padding: 10px 12px; border-radius: 8px; line-height: 1.4;
        background: ${tone === "error" ? "#fdecec" : "#eef6f2"};
        border: 1px solid ${tone === "error" ? "#b91c1c" : "#0e7a5f"};
        color: ${tone === "error" ? "#7f1d1d" : "#0b3d31"};
        box-shadow: 0 10px 30px -18px rgba(11,31,26,.55);
    `;

    const words = document.createElement("div");
    words.style.cssText = "flex:1 1 240px;min-width:0";
    const text = document.createElement("div");
    text.textContent = options.text;
    words.appendChild(text);
    if (options.hint) {
        const hint = document.createElement("div");
        hint.textContent = options.hint;
        hint.style.cssText = "margin-top:4px;font-size:12.5px;color:#4a625b";
        words.appendChild(hint);
    }

    let timer: number | undefined;
    const close = () => {
        window.clearTimeout(timer);
        root.remove();
        dropStackIfEmpty();
    };

    const cross = document.createElement("button");
    cross.type = "button";
    cross.textContent = "✕";
    cross.setAttribute("aria-label", "Закрыть сообщение");
    cross.style.cssText = `
        font: inherit; line-height: 1; min-width: 24px; min-height: 24px;
        border: 0; background: none; color: inherit; cursor: pointer; border-radius: 6px;
    `;
    cross.onclick = close;

    root.append(words);
    for (const action of options.actions ?? []) root.append(actionButton(action, close, tone));
    root.append(cross);
    parent.appendChild(root);
    place();

    if (options.autoCloseMs) timer = window.setTimeout(close, options.autoCloseMs);
    return { close };
}

const CARRY_KEY = "maketka.frame.notice";

/**
 * Слово, которое должно пережить переход на другую страницу: разрешение
 * расхождения версий уводит ребёнка в другую работу, и сказанное до перехода
 * он бы не увидел.
 */
export function rememberNotice(text: string) {
    try {
        sessionStorage.setItem(CARRY_KEY, text);
    } catch {
        // Приватный режим браузера: перенос слова не стоит падения мастерской.
    }
}

/** Показать отложенное слово, если оно было. */
export function showRememberedNotice(actions?: BannerAction[]) {
    let text: string | null = null;
    try {
        text = sessionStorage.getItem(CARRY_KEY);
        if (text) sessionStorage.removeItem(CARRY_KEY);
    } catch {
        return;
    }
    if (text) showBanner({ text, tone: "neutral", actions });
}

/** Нейтральное подтверждение: «Интернет вернулся, всё сохранено» и подобное. */
export function showNotice(text: string, actions?: BannerAction[]): Banner {
    return showBanner({ text, tone: "neutral", actions, autoCloseMs: actions ? undefined : 6000 });
}

/**
 * Ошибки ядра переводим в баннер, не правя апстрим: снимаем ВСЕХ подписчиков
 * `displayError` (там `Toast.error` из `packages/ui`, а он не экспортирован —
 * снять его по ссылке нечем) и подписываем себя.
 *
 * Тексты ядра английские и техничные («BRep_API: command not done»): ребёнку
 * показываем человеческие слова, а машинный текст оставляем мелкой строкой —
 * по нему преподаватель или мы разберёмся, что случилось.
 */
export function subscribeCoreErrors(pubsub: {
    removeAll(event: "displayError"): void;
    sub(event: "displayError", callback: (message: string) => void): void;
}) {
    pubsub.removeAll("displayError");
    pubsub.sub("displayError", (message: string) => {
        const own = /[а-яё]/i.test(message ?? "");
        showBanner({
            key: "core-error",
            text: own ? message : "Не получилось построить фигуру. Попробуй другие размеры",
            hint: own ? undefined : String(message ?? "").slice(0, 200),
        });
    });
}
