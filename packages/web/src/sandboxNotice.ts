// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: баннер песочницы с лендинга.
//
// Посетитель без входа крутит и меняет модель-образец, но ничего не
// сохраняется (решение владельца 2026-08-31: следующий посетитель должен
// увидеть нетронутый образец, «хочешь сохранять — регистрируйся»).
// Попытка сохранить подсвечивает баннер вместо тихой потери.

export class SandboxNotice {
    private readonly root: HTMLElement;
    private readonly text: HTMLElement;
    private nudged = false;

    constructor() {
        this.root = document.createElement("div");
        // Правый верхний угол — место блока пользователя (UserBadge): в песочнице
        // он не создаётся, и угол свободен. По центру плашка ложилась на ленту и
        // закрывала команды (отчёт владельца 02.09).
        //
        // Ровно одна строка и та же высота, что у UserBadge: под строкой заголовка
        // сразу идут кнопки ленты, и плашка в две строки накрывает правую группу
        // («Импорт/Экспорт») — по ней перестаёт попадать курсор. Поэтому текст
        // короткий, переносов нет, а отступы такие, чтобы плашка кончалась ВЫШЕ
        // ленты: строка заголовка кончается на 48-м пикселе (замер в браузере).
        this.root.style.cssText = `
            position: fixed; top: 6px; right: 12px; z-index: 460;
            display: flex; align-items: center; gap: 10px; flex-wrap: nowrap;
            white-space: nowrap; line-height: 1.2;
            padding: 3px 6px 3px 10px; border-radius: 6px;
            background: #e8f4fd; border: 1px solid #1c6dbd; color: #114a83;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            transform-origin: top right; transition: transform .15s ease;
        `;

        this.text = document.createElement("span");
        this.text.textContent = "Песочница: не сохраняется";
        this.root.appendChild(this.text);

        const register = document.createElement("a");
        register.href = "/auth/register";
        register.textContent = "Зарегистрироваться";
        register.style.cssText = `font: inherit; font-weight: 600; padding: 3px 9px; border-radius: 4px;
            background: #1c6dbd; color: #fff; text-decoration: none; white-space: nowrap;`;
        this.root.appendChild(register);

        const login = document.createElement("a");
        login.href = "/login";
        login.textContent = "Войти";
        login.style.cssText = `font: inherit; padding: 3px 9px; border-radius: 4px;
            border: 1px solid #1c6dbd; color: #114a83; text-decoration: none; white-space: nowrap;`;
        this.root.appendChild(login);

        document.body.appendChild(this.root);
    }

    /** Попытка сохранить: меняем текст и встряхиваем баннер один раз за попытку. */
    nudge() {
        if (!this.nudged) {
            this.nudged = true;
            // Текст той же длины, что и обычный: плашка обязана остаться в одну строку.
            this.text.textContent = "Сохранять — после регистрации";
        }
        this.root.style.transform = "scale(1.06)";
        window.setTimeout(() => {
            this.root.style.transform = "";
        }, 180);
    }
}
