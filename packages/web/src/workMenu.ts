// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: раскрывающееся меню полосы каркаса (B-103).
//
// Меню в полосе ровно два и они разделены по смыслу: имя работы — «про эту
// работу», аватар — «про меня» (ТЗ, «Меню работы»). Оба открываются этим
// файлом, чтобы клавиатура, слои и оформление у них не разъехались.
//
// Приглушённый пункт остаётся в обходе с клавиатуры и объясняет себя: спрятанное
// не объясняет, почему его нет, а молча ничего не делающее — тем более.

import { type BannerAction, FRAME_FONT, showBanner } from "./errorBanner";

export interface MenuItem {
    text: string;
    /** Приглушён: виден, обходится с клавиатуры, при нажатии объясняет себя. */
    disabled?: boolean;
    reason?: string;
    reasonAction?: BannerAction;
    separatorBefore?: boolean;
    onSelect?: () => void;
}

export interface MenuOptions {
    /** Заголовок: «Эта работа» у имени, имя человека у аватара. */
    title: string;
    /** Первая строка меню — состояние сохранения, теми же словами, что в полосе. */
    status?: string;
    items: MenuItem[];
}

const MENU = `
    position: fixed; z-index: 470; min-width: 260px; max-width: min(360px, calc(100vw - 24px));
    padding: 6px; border-radius: 8px; background: #fff; color: #12211d;
    border: 1px solid #c7d3ce; box-shadow: 0 18px 44px -22px rgba(11,31,26,.55);
    display: grid; gap: 2px;
`;

const ITEM = `
    display: block; width: 100%; text-align: left; font: inherit; font-size: 14px;
    min-height: 24px; padding: 7px 10px; border: 0; border-radius: 6px;
    background: none; color: inherit; cursor: pointer;
`;

let open: { root: HTMLElement; button: HTMLElement; close: (focusBack: boolean) => void } | undefined;

/** Открыть меню под кнопкой. Второе открытие закрывает первое — их всегда одно. */
export function openMenu(button: HTMLElement, options: MenuOptions) {
    if (open?.button === button) {
        open.close(true);
        return;
    }
    open?.close(false);

    const root = document.createElement("div");
    root.dataset["frameMenu"] = "";
    root.setAttribute("role", "menu");
    root.setAttribute("aria-label", options.title);
    root.style.cssText = `${MENU} font-family: ${FRAME_FONT};`;

    const header = document.createElement("div");
    header.setAttribute("role", "presentation");
    header.textContent = options.title;
    header.style.cssText = "padding:6px 10px 2px;font-size:12.5px;color:#4a625b";
    root.append(header);

    if (options.status) {
        const status = document.createElement("div");
        status.setAttribute("role", "presentation");
        status.textContent = options.status;
        status.style.cssText = "padding:2px 10px 8px;font-size:13px;color:#4a625b";
        root.append(status);
    }

    const buttons: HTMLButtonElement[] = [];

    const close = (focusBack: boolean) => {
        root.remove();
        button.setAttribute("aria-expanded", "false");
        document.removeEventListener("pointerdown", onOutside, true);
        window.removeEventListener("resize", place);
        open = undefined;
        if (focusBack) button.focus();
    };

    const onOutside = (event: Event) => {
        const target = event.target as Node;
        if (!root.contains(target) && !button.contains(target)) close(false);
    };

    for (const item of options.items) {
        if (item.separatorBefore) {
            const line = document.createElement("div");
            line.setAttribute("role", "separator");
            line.style.cssText = "height:1px;margin:4px 6px;background:#c7d3ce";
            root.append(line);
        }
        const element = document.createElement("button");
        element.type = "button";
        element.setAttribute("role", "menuitem");
        element.tabIndex = -1;
        element.textContent = item.text;
        element.style.cssText = ITEM;
        if (item.disabled) {
            element.setAttribute("aria-disabled", "true");
            element.style.color = "#4a625b";
            element.style.opacity = "0.75";
        }
        element.onmouseenter = () => {
            element.style.background = "#eef6f2";
        };
        element.onmouseleave = () => {
            element.style.background = "none";
        };
        element.onclick = () => {
            close(false);
            if (item.disabled) {
                if (item.reason) {
                    showBanner({
                        key: "menu-reason",
                        tone: "neutral",
                        text: item.reason,
                        actions: item.reasonAction ? [item.reasonAction] : undefined,
                    });
                }
                return;
            }
            item.onSelect?.();
        };
        buttons.push(element);
        root.append(element);
    }

    const place = () => {
        const rect = button.getBoundingClientRect();
        root.style.top = `${rect.bottom + 6}px`;
        const width = root.getBoundingClientRect().width;
        const left = Math.min(rect.left, Math.max(8, window.innerWidth - width - 8));
        root.style.left = `${left}px`;
    };

    root.onkeydown = (event) => {
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            const next = (index + step + buttons.length) % buttons.length;
            buttons[next]?.focus();
        } else if (event.key === "Home") {
            event.preventDefault();
            buttons[0]?.focus();
        } else if (event.key === "End") {
            event.preventDefault();
            buttons[buttons.length - 1]?.focus();
        } else if (event.key === "Escape") {
            // Esc возвращает фокус на кнопку: иначе он падает в начало страницы,
            // и с клавиатуры до полосы приходится идти заново.
            event.preventDefault();
            event.stopPropagation();
            close(true);
        } else if (event.key === "Tab") {
            // Tab не запирается в меню: закрываем и уходим дальше по полосе.
            close(false);
        }
    };

    document.body.append(root);
    button.setAttribute("aria-expanded", "true");
    place();
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onOutside, true);
    buttons[0]?.focus();

    open = { root, button, close };
}

/** Закрыть открытое меню — окна поверх него не должны оставлять хвост. */
export function closeMenu() {
    open?.close(false);
}
