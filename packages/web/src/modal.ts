// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: общая рамка модального окна (B-103).
//
// Окна «Что скачать?» и «Открыть другую работу» ведут себя одинаково: фокус
// уходит внутрь и не выходит, Esc закрывает, щелчок мимо закрывает, при закрытии
// фокус возвращается туда, откуда окно открыли. Правило одно — и код один, иначе
// второе окно неминуемо отстанет от первого.

import { FRAME_FONT } from "./errorBanner";
import { closeMenu } from "./workMenu";

export interface ModalHandle {
    /** Тело окна: сюда складывают содержимое. */
    card: HTMLElement;
    /** Подвал окна: кнопки действия. */
    footer: HTMLElement;
    close(): void;
}

const OVERLAY = `
    position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center;
    padding: 16px; background: rgba(11,31,26,.42);
`;

const CARD = `
    width: min(560px, 100%); max-height: min(80vh, 720px); overflow: auto;
    display: grid; gap: 14px; padding: 18px; border-radius: 8px;
    background: #fff; color: #12211d; font-size: 14px; line-height: 1.4;
    box-shadow: 0 30px 70px -30px rgba(11,31,26,.7);
`;

const FOCUSABLE =
    'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function openModal(options: {
    title: string;
    width?: string;
    returnFocus?: HTMLElement | null;
    onClose?: () => void;
}): ModalHandle {
    closeMenu();

    const overlay = document.createElement("div");
    overlay.style.cssText = `${OVERLAY} font-family: ${FRAME_FONT};`;

    const card = document.createElement("div");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.style.cssText = CARD;
    if (options.width) card.style.width = options.width;

    const head = document.createElement("div");
    head.style.cssText = "display:flex;align-items:center;gap:12px";
    const title = document.createElement("h2");
    title.textContent = options.title;
    title.style.cssText = "margin:0;flex:1 1 auto;font-size:18px;line-height:1.2";
    const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
    title.id = titleId;
    card.setAttribute("aria-labelledby", titleId);

    const cross = document.createElement("button");
    cross.type = "button";
    cross.textContent = "✕";
    cross.setAttribute("aria-label", "Закрыть окно");
    cross.style.cssText = `
        font: inherit; line-height: 1; min-width: 24px; min-height: 24px; cursor: pointer;
        border: 0; border-radius: 6px; background: none; color: #4a625b;
    `;

    const body = document.createElement("div");
    body.style.cssText = "display:grid;gap:10px";

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap";

    head.append(title, cross);
    card.append(head, body, footer);
    overlay.append(card);

    const close = () => {
        overlay.remove();
        document.removeEventListener("keydown", onKey, true);
        options.onClose?.();
        options.returnFocus?.focus();
    };

    const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }
        if (event.key !== "Tab") return;
        // Фокус не выходит из окна: иначе с клавиатуры ребёнок уезжает в ленту
        // под накладкой и не понимает, почему ничего не нажимается.
        const stops = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
            (el) => el.offsetParent !== null || el === document.activeElement,
        );
        if (stops.length === 0) return;
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    cross.onclick = close;
    overlay.onpointerdown = (event) => {
        if (event.target === overlay) close();
    };
    document.addEventListener("keydown", onKey, true);

    document.body.append(overlay);
    (card.querySelector<HTMLElement>(FOCUSABLE) ?? cross).focus();

    return { card: body, footer, close };
}

export const PRIMARY_BUTTON = `
    font: inherit; font-weight: 600; min-height: 24px; padding: 9px 16px; cursor: pointer;
    border: 1px solid #0e7a5f; border-radius: 6px; background: #0e7a5f; color: #fff;
`;

export const GHOST_BUTTON = `
    font: inherit; min-height: 24px; padding: 9px 16px; cursor: pointer;
    border: 1px solid #c7d3ce; border-radius: 6px; background: none; color: #12211d;
`;
