// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: окно «Удалить эту модель?» (B-254).
//
// Работа не пропадает — она уезжает в корзину, и об этом сказано до нажатия, а не
// после: ребёнок должен понимать, что нажатие обратимо. Слова — из
// `agent_docs/frame-contract.md`, раздел «Окно „Удалить эту работу?“»; в мастерской
// схем это же окно собрано теми же словами.
//
// Отказ сервера показываем прямо в окне и оставляем окно открытым: страница
// остаётся рабочей, и попробовать ещё раз можно, не открывая меню заново.

import { GHOST_BUTTON, openModal, PRIMARY_BUTTON } from "./modal";

export interface DeleteDialogOptions {
    returnFocus?: HTMLElement | null;
    /** Убрать работу в корзину. Возвращает слова отказа или `null`, если получилось. */
    remove: () => Promise<string | null>;
}

export function openDeleteDialog(options: DeleteDialogOptions) {
    const modal = openModal({ title: "Удалить эту модель?", returnFocus: options.returnFocus });

    const text = document.createElement("p");
    text.style.cssText = "margin:0;color:#4a625b;line-height:1.5";
    text.textContent = "Работа полежит в корзине — оттуда её можно вернуть. Корзина есть в «Моих работах».";

    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.hidden = true;
    status.style.cssText = "color:#4a625b";

    modal.card.append(text, status);

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Отмена";
    cancel.style.cssText = GHOST_BUTTON;
    cancel.onclick = () => modal.close();

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Убрать в корзину";
    confirm.style.cssText = PRIMARY_BUTTON;
    confirm.onclick = async () => {
        confirm.disabled = true;
        cancel.disabled = true;
        status.hidden = false;
        status.textContent = "Убираю…";

        const беда = await options.remove();
        if (беда) {
            status.textContent = беда;
            confirm.disabled = false;
            cancel.disabled = false;
            return;
        }
        // Работы больше нет — оставаться в мастерской не над чем.
        window.location.assign("/projects");
    };

    modal.footer.append(cancel, confirm);
}
