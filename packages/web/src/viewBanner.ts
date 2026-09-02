// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: чужая работа открывается в просмотре.
//
// Преподаватель открывает работу ученика из ленты группы. По умолчанию это
// просмотр: автосохранение выключено, случайно перезаписать детскую работу
// нельзя. Правка — по явному нажатию (решение владельца 2026-08-30): после
// него изменения сохраняются в работу ученика, а плашка честно напоминает,
// в чьей работе идёт правка. Вторая кнопка забирает копию себе.

import { FRAME_FONT } from "./errorBanner";
import { placeAsMode } from "./frameBar";

export interface ViewBannerOptions {
    ownerName: string;
    /** Пример из общей полки: слова другие, действие то же. */
    isExample?: boolean;
    /** Есть ли вообще право править (у преподавателя группы и админа — есть). */
    canEdit: boolean;
    /** Вызывается при переключении в правку: включает автосохранение. */
    onEdit: () => void;
    /** Забрать копию себе; возвращает номер новой работы или null. */
    onCopy: () => Promise<number | null>;
}

export class ViewBanner {
    private readonly root: HTMLElement;

    constructor(private readonly options: ViewBannerOptions) {
        this.root = document.createElement("div");
        this.root.style.cssText = `
            display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
            padding: 8px 12px; border-radius: 8px;
            background: #fdf6e3; border: 1px solid #c98a10; color: #7a5408;
            font-family: ${FRAME_FONT};
            font-size: 13.5px; max-width: min(680px, calc(100vw - 24px));
        `;
        placeAsMode(this.root);
        this.showViewing();
        document.body.appendChild(this.root);
    }

    private button(label: string, primary: boolean): HTMLButtonElement {
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = label;
        el.style.cssText = primary
            ? `font: inherit; font-weight: 600; padding: 6px 12px; border-radius: 6px;
               min-height: 24px; border: none; background: #c98a10; color: #fff; cursor: pointer;`
            : `font: inherit; padding: 6px 12px; border-radius: 6px; min-height: 24px;
               cursor: pointer; border: 1px solid #c98a10; background: none; color: #7a5408;`;
        return el;
    }

    private showViewing() {
        this.root.innerHTML = "";
        // Слова плашки — общие с мастерской схем (`frame-contract.md`, «Слова
        // режимов»). Имя хозяина работы остаётся в плашке правки: там оно и
        // нужно — напомнить, в чьей работе идут изменения.
        const text = document.createElement("span");
        text.textContent = this.options.isExample
            ? "Это пример — сохрани копию себе"
            : "Чужая работа — сохрани копию себе";
        this.root.appendChild(text);

        if (this.options.canEdit) {
            const edit = this.button("Править", true);
            edit.onclick = () => {
                this.options.onEdit();
                this.showEditing();
            };
            this.root.appendChild(edit);
        }

        // Одно действие — одно слово: «Забрать себе» стоит и в меню работы.
        const copy = this.button("Забрать себе", false);
        copy.onclick = async () => {
            copy.disabled = true;
            copy.textContent = "Сохраняю…";
            const id = await this.options.onCopy();
            if (id) {
                window.location.assign(`/3d/${id}`);
            } else {
                copy.disabled = false;
                copy.textContent = "Не получилось — ещё раз?";
            }
        };
        this.root.appendChild(copy);
    }

    private showEditing() {
        this.root.innerHTML = "";
        this.root.style.background = "#e2f0ea";
        this.root.style.borderColor = "#0e7a5f";
        this.root.style.color = "#0b3d31";
        const text = document.createElement("span");
        // Напоминание остаётся на экране: правка чужой работы не должна
        // выглядеть как работа в своей.
        text.textContent = `Вы правите работу: ${this.options.ownerName}. Изменения сохраняются к ученику.`;
        this.root.appendChild(text);
    }
}
