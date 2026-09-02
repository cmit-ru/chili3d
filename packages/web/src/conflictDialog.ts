// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: окно «Эта работа открыта ещё где-то» (B-103).
//
// Молчаливая перезапись чужой версии запрещена: на 409 автосохранение
// останавливается, правки продолжают копиться на экране, а в полосе стоит слово
// состояния и кнопка «Что делать?». Окно открывается ТОЛЬКО по нажатию — само
// поверх работы оно не выскакивает.
//
// Обе ветки сначала сохраняют копию текущих правок (`POST …/fork`): что бы
// ребёнок ни выбрал, нарисованное им не пропадает.

import type { ConflictInfo } from "@chili3d/storage";
import { rememberNotice } from "./errorBanner";
import { GHOST_BUTTON, openModal, PRIMARY_BUTTON } from "./modal";

export interface ConflictDialogOptions {
    info?: ConflictInfo;
    returnFocus?: HTMLElement | null;
    /** Сохранить копию текущих правок отдельной работой. */
    saveCopy: () => Promise<{ id: number; title: string } | null>;
}

function when(changedAt?: string) {
    if (!changedAt) return "недавно";
    return new Date(changedAt).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function openConflictDialog(options: ConflictDialogOptions) {
    const modal = openModal({ title: "Эта работа открыта ещё где-то", returnFocus: options.returnFocus });

    const text = document.createElement("p");
    text.style.cssText = "margin:0;color:#4a625b;line-height:1.5";
    text.textContent =
        `Похоже, ты открывал её на другом компьютере, и там она новее ` +
        `(изменена ${when(options.info?.changedAt)}). Ничего не пропадёт: ` +
        `вторую работу я сохраню отдельно.`;

    const status = document.createElement("div");
    status.setAttribute("role", "status");
    status.hidden = true;
    status.style.cssText = "color:#4a625b";

    modal.card.append(text, status);

    // Кнопки названы по тому, что выбирает ребёнок — с какой работой он
    // продолжает, а не какую сохранить: сохраняются обе в любом случае.
    const keep = document.createElement("button");
    keep.type = "button";
    keep.textContent = "Работать дальше с этой";
    keep.style.cssText = PRIMARY_BUTTON;

    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Открыть ту, что новее";
    open.style.cssText = GHOST_BUTTON;

    const resolve = async (keepMine: boolean) => {
        keep.disabled = true;
        open.disabled = true;
        status.hidden = false;
        status.textContent = "Сохраняю…";

        const copy = await options.saveCopy();
        if (!copy) {
            status.textContent = "Не получилось сохранить копию. Попробуй ещё раз";
            keep.disabled = false;
            open.disabled = false;
            return;
        }
        // Строку переносим через переход: обе ветки уводят на другую страницу,
        // и сказанное здесь ребёнок бы не увидел.
        rememberNotice(`Твой вариант сохранён отдельно: «${copy.title}» — он в «Моих работах»`);
        if (keepMine) window.location.assign(`/3d/${copy.id}`);
        else window.location.reload();
    };

    keep.onclick = () => void resolve(true);
    open.onclick = () => void resolve(false);
    modal.footer.append(open, keep);
}
