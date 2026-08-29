// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: имя ученика и выход в шапке мастерской.
//
// Раньше это жило в промежуточной странице-обёртке, но лишний экран между
// кабинетом и работой мешал на уроке. Теперь ребёнок попадает в мастерскую
// сразу, а понять, под кем он работает, и выйти можно отсюда — это важно
// на общем компьютере класса.

export interface UserBadgeOptions {
    name: string;
    avatar: string;
    role: string;
    readOnly: boolean;
}

export class UserBadge {
    constructor(private readonly options: UserBadgeOptions) {
        const root = document.createElement("div");
        root.style.cssText = `
            position: fixed; top: 8px; right: 12px; z-index: 450;
            display: flex; align-items: center; gap: 10px;
            padding: 5px 8px 5px 12px; border-radius: 6px;
            background: var(--panel-background-color, #fff);
            border: 1px solid var(--border-color, #c7d3ce);
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            font-size: 13.5px; color: var(--foreground-color, #0b1f1a);
        `;

        if (this.options.readOnly) {
            const badge = document.createElement("span");
            badge.textContent = "только просмотр";
            badge.style.cssText = `
                font-size: 11.5px; font-family: ui-monospace, Menlo, monospace;
                color: #c98a10; border: 1px solid #c98a10; border-radius: 3px; padding: 2px 6px;
            `;
            root.appendChild(badge);
        }

        const avatar = document.createElement("span");
        avatar.textContent = this.options.avatar || "🙂";
        avatar.style.cssText = "font-size:18px;line-height:1";

        const name = document.createElement("span");
        name.textContent = this.options.name;
        name.style.fontWeight = "600";

        const works = document.createElement("a");
        works.href = this.options.role === "student" ? "/projects" : "/teach";
        works.textContent = "Мои работы";
        works.style.cssText = "color:#0e7a5f;text-decoration:none;font-weight:600";

        const leave = document.createElement("a");
        leave.href = "/logout-form";
        leave.textContent = this.options.role === "student" ? "Это не я" : "Выйти";
        leave.style.cssText = `
            color: #4a625b; text-decoration: none; border: 1px solid var(--border-color, #c7d3ce);
            border-radius: 4px; padding: 5px 9px;
        `;

        root.append(avatar, name, works, leave);
        document.body.appendChild(root);
    }
}
