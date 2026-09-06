// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: автосохранение замечает «виды» (B-163). Виды заводят,
// переименовывают и убирают мимо истории — без отмены, — поэтому одной
// подписки на историю мало: новый вид жил ровно до перезагрузки страницы.

import {
    Act,
    History,
    type IApplication,
    type IDocument,
    type IHistoryRecord,
    ObservableCollection,
    XYZ,
} from "@chili3d/core";
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

/** Правка модели: фигура, скругление, вычитание, перемещение — всё это записи истории. */
function правка(): IHistoryRecord {
    return { undo: () => {}, redo: () => {}, dispose: () => {} } as unknown as IHistoryRecord;
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

    test("пачка правок отмечается ровно тогда, когда уходит на запись", async () => {
        const { документ, сохранений } = работа();
        let пачек = 0;
        const автосейв = new AutoSave({} as IApplication, () => {
            пачек += 1;
        });
        автосейв.watch(документ);

        документ.acts.push(вид("Сбоку"));
        expect(пачек).toBe(0); // правка есть, записи ещё нет

        await rs.advanceTimersByTimeAsync(12_000);
        expect(сохранений()).toBe(1);
        expect(пачек).toBe(1);

        // Тишина без правок новых пачек не делает: иначе гейтовое число §10
        // считалось бы по пустым тактам.
        await rs.advanceTimersByTimeAsync(120_000);
        expect(пачек).toBe(1);
    });

    test("остановленное автосохранение пачек не отмечает", async () => {
        const { документ } = работа();
        let пачек = 0;
        const автосейв = new AutoSave({} as IApplication, () => {
            пачек += 1;
        });
        автосейв.watch(документ);
        документ.acts.push(вид("Сбоку"));
        автосейв.stop();

        await rs.advanceTimersByTimeAsync(120_000);
        expect(пачек).toBe(0);
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

// Форк «Макетки»: правки, сделанные перед самой перезагрузкой, пропадали, а
// полоса всё это время говорила «Сохранено» (B-208). Две причины: уход со
// страницы не доводил запрос до сервера, а каркасу никто не сообщал, что
// правка ждёт записи.
describe("автосохранение при уходе со страницы и знак для полосы", () => {
    beforeEach(() => {
        rs.useFakeTimers();
    });
    afterEach(() => {
        rs.useRealTimers();
    });

    function хранилище() {
        let закрытий = 0;
        const app = { storage: { markClosing: () => (закрытий += 1) } } as unknown as IApplication;
        return { app, закрытий: () => закрытий };
    }

    test("правка модели поднимает знак для полосы", () => {
        const { документ } = работа();
        let знаков = 0;
        const автосейв = new AutoSave({} as IApplication);
        автосейв.onPending = () => (знаков += 1);
        автосейв.watch(документ);

        документ.history.add(правка());
        expect(знаков).toBe(1);

        // Вид — тоже правка, хотя истории про него не известно (B-163).
        документ.acts.push(вид("Спереди"));
        expect(знаков).toBe(2);
    });

    test("имя работы меняется мимо истории — знак поднимает `touch`", () => {
        const { документ } = работа();
        let знаков = 0;
        const автосейв = new AutoSave({} as IApplication);
        автосейв.onPending = () => (знаков += 1);
        автосейв.watch(документ);

        автосейв.touch(документ);
        expect(знаков).toBe(1);
        expect(автосейв.hasPending()).toBe(true);
    });

    test("остановленное автосохранение знака не поднимает", () => {
        const { документ } = работа();
        let знаков = 0;
        const автосейв = new AutoSave({} as IApplication);
        автосейв.onPending = () => (знаков += 1);
        автосейв.watch(документ);
        автосейв.stop();

        документ.history.add(правка());
        expect(знаков).toBe(0);
    });

    test("уход со страницы с несохранённой правкой: хранилище предупреждено, работа уходит", () => {
        const { документ, сохранений } = работа();
        const { app, закрытий } = хранилище();
        const автосейв = new AutoSave(app);
        автосейв.watch(документ);
        автосейв.attachUnloadGuard(документ);

        документ.history.add(правка());
        window.dispatchEvent(new Event("pagehide"));

        expect(закрытий()).toBe(1);
        expect(сохранений()).toBe(1);
    });

    test("уходить с сохранённой работой — не слать ничего: место `keepalive` нужно снимку", async () => {
        const { документ, сохранений } = работа();
        const { app, закрытий } = хранилище();
        const автосейв = new AutoSave(app);
        автосейв.watch(документ);
        автосейв.attachUnloadGuard(документ);

        документ.history.add(правка());
        await rs.advanceTimersByTimeAsync(12_000);
        expect(сохранений()).toBe(1);

        window.dispatchEvent(new Event("pagehide"));
        expect(закрытий()).toBe(0);
        expect(сохранений()).toBe(1);
    });
});
