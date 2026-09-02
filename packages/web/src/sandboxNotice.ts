// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: баннер песочницы с лендинга.
//
// Посетитель без входа крутит и меняет модель-образец, но ничего не
// сохраняется (решение владельца 2026-08-31: следующий посетитель должен
// увидеть нетронутый образец, «хочешь сохранять — регистрируйся»).
// Попытка сохранить подсвечивает баннер вместо тихой потери.
//
// Забрать собранное можно, не уходя со страницы: обе кнопки открывают оверлей
// (B-096). Раньше здесь стояли ссылки на /auth/register и /login — уход по ним
// закрывал мастерскую вместе со сценой, и собранное пропадало (находка Ш-4).

import { FRAME_FONT } from "./errorBanner";
import { placeAsMode } from "./frameBar";

export interface SandboxNoticeOptions {
    /** «Сохранить работу»: оверлей регистрации поверх мастерской. */
    onSave: () => void;
    /** «Войти»: тот же оверлей, вкладка входа. */
    onLogin: () => void;
}

export class SandboxNotice {
    private readonly root: HTMLElement;
    private readonly text: HTMLElement;
    private nudged = false;

    constructor(private readonly options: SandboxNoticeOptions) {
        this.root = document.createElement("div");
        // Одна строка и никаких переносов: под строкой заголовка сразу идут
        // кнопки ленты, и плашка в две строки накрывает правую группу — по ней
        // перестаёт попадать курсор (отчёт владельца 02.09).
        this.root.style.cssText = `
            display: flex; align-items: center; gap: 10px; flex-wrap: nowrap;
            white-space: nowrap; line-height: 1.2;
            padding: 5px 8px 5px 12px; border-radius: 8px;
            background: #e8f4fd; border: 1px solid #1c6dbd; color: #114a83;
            font-family: ${FRAME_FONT}; font-size: 13px;
            transition: transform .15s ease;
        `;
        placeAsMode(this.root);

        this.text = document.createElement("span");
        this.text.textContent = "Песочница: ничего не сохраняется";
        this.root.appendChild(this.text);

        const save = document.createElement("button");
        save.type = "button";
        save.textContent = "Сохранить работу";
        save.style.cssText = `font: inherit; font-weight: 600; padding: 4px 10px; border-radius: 6px;
            min-height: 24px; border: none; background: #1c6dbd; color: #fff; cursor: pointer;
            white-space: nowrap;`;
        save.onclick = () => this.options.onSave();
        this.root.appendChild(save);

        const login = document.createElement("button");
        login.type = "button";
        login.textContent = "Войти";
        login.style.cssText = `font: inherit; padding: 4px 10px; border-radius: 6px; min-height: 24px;
            cursor: pointer; border: 1px solid #1c6dbd; background: none; color: #114a83;
            white-space: nowrap;`;
        login.onclick = () => this.options.onLogin();
        this.root.appendChild(login);

        document.body.appendChild(this.root);
    }

    /** Попытка сохранить: меняем текст и встряхиваем баннер один раз за попытку. */
    nudge() {
        if (!this.nudged) {
            this.nudged = true;
            // Текст той же длины, что и обычный: плашка обязана остаться в одну
            // строку. И указывает он теперь на кнопку рядом, а не на чужую страницу.
            this.text.textContent = "Чтобы не потерять — сохраните:";
        }
        // Смещение на половину ширины держит плашку по центру — его нельзя
        // терять ради встряски.
        this.root.style.transform = "translateX(-50%) scale(1.06)";
        window.setTimeout(() => {
            this.root.style.transform = "translateX(-50%)";
        }, 180);
    }
}
