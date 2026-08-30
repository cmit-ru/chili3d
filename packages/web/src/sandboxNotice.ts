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
        this.root.style.cssText = `
            position: fixed; top: 8px; left: 50%; transform: translateX(-50%); z-index: 460;
            display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
            padding: 8px 12px; border-radius: 6px;
            background: #e8f4fd; border: 1px solid #1c6dbd; color: #114a83;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            font-size: 13.5px; max-width: min(680px, calc(100vw - 24px));
            transition: transform .15s ease;
        `;

        this.text = document.createElement("span");
        this.text.textContent = "Это песочница: крути и меняй модель. Изменения не сохраняются.";
        this.root.appendChild(this.text);

        const register = document.createElement("a");
        register.href = "/auth/register";
        register.textContent = "Зарегистрироваться";
        register.style.cssText = `font: inherit; font-weight: 600; padding: 6px 12px; border-radius: 4px;
            background: #1c6dbd; color: #fff; text-decoration: none; white-space: nowrap;`;
        this.root.appendChild(register);

        const login = document.createElement("a");
        login.href = "/login";
        login.textContent = "Войти";
        login.style.cssText = `font: inherit; padding: 6px 12px; border-radius: 4px;
            border: 1px solid #1c6dbd; color: #114a83; text-decoration: none; white-space: nowrap;`;
        this.root.appendChild(login);

        document.body.appendChild(this.root);
    }

    /** Попытка сохранить: меняем текст и встряхиваем баннер один раз за попытку. */
    nudge() {
        if (!this.nudged) {
            this.nudged = true;
            this.text.textContent = "Чтобы сохранять свои модели — зарегистрируйтесь, это бесплатно.";
        }
        this.root.style.transform = "translateX(-50%) scale(1.06)";
        window.setTimeout(() => {
            this.root.style.transform = "translateX(-50%)";
        }, 180);
    }
}
