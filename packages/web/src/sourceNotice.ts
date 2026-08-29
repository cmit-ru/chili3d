// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: предложение исходного кода пользователю мастерской.
//
// AGPL-3.0 §13 обязывает предложить исходный текст ИМЕННО той версии, с которой
// человек работает по сети, и предложение должно быть заметным. Раньше ссылка
// жила на домашнем экране редактора; экран убрали — вместе с ним пропало и
// предложение, то есть форк оказался в нарушении лицензии (INV-010).
//
// Ссылка ведёт на `/3d/source`, который редиректит в публичный репозиторий, а
// рядом с ним лежит `/3d/source.txt` с точным коммитом собранной версии.
// Оформление намеренно тихое: это обязательство перед лицензией, а не элемент
// урока, и оно не должно отвлекать ребёнка от работы.

export class SourceNotice {
    constructor() {
        const link = document.createElement("a");
        link.href = "/3d/source";
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "Открытый код";
        link.title = "Исходный код этой версии редактора (лицензия AGPL-3.0)";
        link.style.cssText = `
            position: fixed; right: 12px; bottom: 8px; z-index: 300;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            font-size: 11.5px; color: var(--foreground-color, #4a625b); opacity: .55;
            text-decoration: none; padding: 2px 4px;
        `;
        link.onmouseenter = () => {
            link.style.opacity = "1";
            link.style.textDecoration = "underline";
        };
        link.onmouseleave = () => {
            link.style.opacity = ".55";
            link.style.textDecoration = "none";
        };
        document.body.appendChild(link);
    }
}
