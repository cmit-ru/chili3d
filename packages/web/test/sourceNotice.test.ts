// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: предложение исходников — обязательство AGPL §13, а не элемент
// оформления. Тест стоит здесь, чтобы ссылку нельзя было убрать вместе с
// «лишним» из интерфейса, как это случилось с домашним экраном 29.08.2026.

import { SourceNotice } from "../src/sourceNotice";

describe("Предложение исходного кода", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    test("ссылка появляется на странице", () => {
        new SourceNotice();
        const link = document.querySelector('a[href="/3d/source"]') as HTMLAnchorElement;
        expect(link).not.toBeNull();
        expect(link.textContent).toBe("Открытый код");
    });

    test("открывается в новой вкладке и не уводит с работы", () => {
        new SourceNotice();
        const link = document.querySelector('a[href="/3d/source"]') as HTMLAnchorElement;
        expect(link.target).toBe("_blank");
        expect(link.rel).toContain("noopener");
    });
});
