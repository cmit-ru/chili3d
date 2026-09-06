// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import { SaveDocument } from "../../../src/commands/application/saveDocument";

// Форк «Макетки»: сохранение молчит. В апстриме команда вешала на экран накладку
// «Выполняется…» (`showPermanent` с колбэком) и по завершении тост «Документ
// сохранён» — при автосохранении раз в несколько секунд это мигало бы ребёнку
// в лицо посреди работы. Здесь команда просто зовёт `document.save()` и ничего
// не публикует; состояние сохранения показывает полоса сверху, рядом с именем
// работы. Поэтому проверяем две вещи: работа действительно сохраняется — и при
// этом на экране не появляется ничего.

/** Подменяет `PubSub.pub` и собирает все каналы, в которые команда что-то отправила. */
function captureChannels() {
    const channels: string[] = [];
    const originalPub = PubSub.default.pub;
    PubSub.default.pub = ((channel: string, ..._args: any[]) => {
        channels.push(channel);
    }) as any;
    return {
        channels,
        restore: () => {
            PubSub.default.pub = originalPub;
        },
    };
}

describe("SaveDocument", () => {
    test("should have command metadata", () => {
        const data = (SaveDocument as any).prototype.data;
        expect(data).not.toBeNull();
        expect(data.key).toBe("doc.save");
        expect(data.icon).toBe("icon-save");
    });

    test("should have isApplicationCommand flag", () => {
        const data = (SaveDocument as any).prototype.data;
        expect(data.isApplicationCommand).toBe(true);
    });

    test("should implement ICommand (has execute method)", () => {
        const cmd = new SaveDocument();
        expect(typeof cmd.execute).toBe("function");
    });

    test("should save the active document", async () => {
        const { channels, restore } = captureChannels();

        try {
            let saveCalled = false;
            const doc = createMockDocument();
            doc.save = async () => {
                saveCalled = true;
            };
            const app = createMockApplication();
            app.activeView = { document: doc } as any;

            const cmd = new SaveDocument();
            await cmd.execute(app);

            expect(saveCalled).toBe(true);
            expect(channels).toEqual([]);
        } finally {
            restore();
        }
    });

    test("should await the save before resolving", async () => {
        const { restore } = captureChannels();

        try {
            let finished = false;
            let releaseSave: (() => void) | undefined;
            const doc = createMockDocument();
            doc.save = () =>
                new Promise<void>((resolve) => {
                    releaseSave = () => {
                        finished = true;
                        resolve();
                    };
                });
            const app = createMockApplication();
            app.activeView = { document: doc } as any;

            const cmd = new SaveDocument();
            const running = cmd.execute(app);

            expect(finished).toBe(false);
            releaseSave!();
            await running;

            expect(finished).toBe(true);
        } finally {
            restore();
        }
    });

    test("should do nothing when there is no active view", async () => {
        const { channels, restore } = captureChannels();

        try {
            const app = createMockApplication();
            app.activeView = undefined;

            const cmd = new SaveDocument();
            await cmd.execute(app);

            expect(channels).toEqual([]);
        } finally {
            restore();
        }
    });

    test("should do nothing when the active view has no document", async () => {
        const { channels, restore } = captureChannels();

        try {
            const app = createMockApplication();
            (app as any).activeView = { document: undefined };

            const cmd = new SaveDocument();
            await cmd.execute(app);

            expect(channels).toEqual([]);
        } finally {
            restore();
        }
    });
});
