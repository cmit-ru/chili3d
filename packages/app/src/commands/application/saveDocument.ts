// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, type IApplication, type ICommand } from "@chili3d/core";

@command({
    key: "doc.save",
    icon: "icon-save",
    isApplicationCommand: true,
})
export class SaveDocument implements ICommand {
    // Форк «Макетки»: сохранение молчит. Раньше оно вешало на весь экран
    // накладку «Выполняется…» и потом тост «Документ сохранён» — при
    // автосохранении раз в несколько секунд это мигало бы ребёнку в лицо
    // посреди работы. Состояние сохранения теперь живёт в одном месте — в
    // полосе сверху, рядом с именем работы. Сообщать нужно только о беде,
    // а о норме — тихо показывать словом «Сохранено».
    async execute(app: IApplication): Promise<void> {
        if (!app.activeView?.document) return;
        await app.activeView.document.save();
    }
}
