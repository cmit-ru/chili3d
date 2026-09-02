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

import { FRAME_FONT } from "./errorBanner";

export class SourceNotice {
    constructor() {
        const link = document.createElement("a");
        link.href = "/3d/source";
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "Открытый код";
        link.title = "Исходный код этой версии редактора (лицензия AGPL-3.0)";
        link.dataset["framePlace"] = "bottom-right";
        link.dataset["frameGroup"] = "corner-notices";
        // Ссылка висит над канвасом WebGL. Без непрозрачной подложки «контраст к
        // фону» означал бы контраст к тому, что ребёнок нарисовал в этом углу, —
        // то есть не означал бы ничего. Кегль, цвет и подложка — по INV-010 и
        // AGPL §13: предложение исходников обязано быть заметным.
        link.style.cssText = `
            position: fixed; right: 12px; bottom: 8px; z-index: 300;
            font-family: ${FRAME_FONT}; font-size: 12.5px; color: #4a625b;
            text-decoration: none; padding: 5px 8px; border-radius: 6px;
            background: #fff; border: 1px solid #c7d3ce;
        `;
        link.onmouseenter = () => {
            link.style.textDecoration = "underline";
        };
        link.onmouseleave = () => {
            link.style.textDecoration = "none";
        };
        document.body.appendChild(link);
    }
}
