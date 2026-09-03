// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: автосохранение замечает «виды» (B-163). Виды заводят,
// переименовывают и убирают мимо истории — без отмены, — поэтому одной
// подписки на историю мало: новый вид жил ровно до перезагрузки страницы.

import { Act, History, type IApplication, type IDocument, ObservableCollection, XYZ } from "@chili3d/core";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { AutoSave } from "../src/autoSave";

function работа() {
    let сохранений = 0;
    const документ = {
        history: new History(),
        acts: new ObservableCollection<Act>(),
        save: async () => {
            сохранений += 1;
        },
    };
    return { документ: документ as unknown as IDocument, сохранений: () => сохранений };
}

function вид(name: string) {
    return new Act({ name, cameraPosition: XYZ.zero, cameraTarget: XYZ.zero, cameraUp: XYZ.unitZ });
}

describe("автосохранение и виды", () => {
    beforeEach(() => {
        rs.useFakeTimers();
    });
    afterEach(() => {
        rs.useRealTimers();
    });

    test("новый вид ставит сохранение в очередь, и оно случается само", async () => {
        const { документ, сохранений } = работа();
        const автосейв = new AutoSave({} as IApplication);
        автосейв.watch(документ);
        expect(автосейв.hasPending()).toBe(false);

        документ.acts.push(вид("Спереди"));
        expect(автосейв.hasPending()).toBe(true);

        await rs.advanceTimersByTimeAsync(12_000);
        expect(сохранений()).toBe(1);
        expect(автосейв.hasPending()).toBe(false);
    });

    test("переименование вида, заведённого до подписки, тоже сохраняется", () => {
        const { документ } = работа();
        const старый = вид("Вид 1");
        документ.acts.push(старый); // вид из файла: он есть ещё до открытия работы
        const автосейв = new AutoSave({} as IApplication);
        автосейв.watch(документ);
        expect(автосейв.hasPending()).toBe(false);

        старый.name = "Сбоку";
        expect(автосейв.hasPending()).toBe(true);
    });

    test("убранный вид — тоже правка", async () => {
        const { документ, сохранений } = работа();
        const автосейв = new AutoSave({} as IApplication);
        автосейв.watch(документ);
        const лишний = вид("Лишний");
        документ.acts.push(лишний);
        await автосейв.saveNow(документ);
        expect(сохранений()).toBe(1);
        expect(автосейв.hasPending()).toBe(false);

        документ.acts.remove(лишний);
        expect(автосейв.hasPending()).toBe(true);
    });

    test("остановленное автосохранение виды не трогают", () => {
        const { документ } = работа();
        const автосейв = new AutoSave({} as IApplication);
        автосейв.watch(документ);
        автосейв.stop();
        документ.acts.push(вид("Спереди"));
        expect(автосейв.hasPending()).toBe(false);
    });
});
