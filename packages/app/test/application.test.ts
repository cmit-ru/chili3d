// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { ICommand, IDocument, IView, IVisualFactory, Serialized } from "@chili3d/core";
import { Logger, ObservableCollection, PubSub } from "@chili3d/core";
import { createMockView, createMockVisualWithDocument } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import { Application } from "../src/application";

// IMPORTANT: Application constructor calls setCurrentApplication(this), which
// throws if called more than once per module. We can only create ONE Application
// instance in this test file. All tests share this instance and mutate it.

// ============================================================================
// Helpers
// ============================================================================

function makeVisualFactory(): IVisualFactory {
    return {
        kernelName: "mock",
        create: (doc: IDocument) => {
            const visual = createMockVisualWithDocument(doc);
            // create a fresh view with document reference each time
            visual.createView = (_name: string, _plane: any) =>
                createMockView({
                    document: doc,
                    cameraController: { fitContent: () => {} },
                } as unknown as Partial<IView>);
            return visual;
        },
    } as unknown as IVisualFactory;
}

function makeSerializedDocData(name: string, id: string): Serialized {
    return {
        version: "0.7.1",
        name,
        id,
        models: {
            nodes: [{ __cla$$__: "FolderNode", id: "root-1", name }],
            components: [],
            materials: [],
        },
        acts: [],
        userData: {},
    } as unknown as Serialized;
}
// ============================================================================

// Must be at module scope; constructor calls setCurrentApplication
const sharedVisualFactory = makeVisualFactory();
const sharedApp = new Application({
    visualFactory: sharedVisualFactory,
    shapeProvider: { factory: {} as any, converter: {} as any },
    services: [],
    storage: {
        createDBIfNeeded: async () => {},
        get: async () => undefined,
        put: async () => true,
        delete: async () => true,
        page: async () => [],
    },
    dataExchange: {
        import: async () => {},
        export: async () => undefined,
        importFormats: () => [],
        exportFormats: () => [],
    },
});

// Helper to reset shared app to a clean-ish state between tests
function resetAppState() {
    // Clear all views
    sharedApp.views.clear();
    // Clear all documents
    sharedApp.documents.clear();
    // Reset properties
    sharedApp.activeView = undefined;
    sharedApp.executingCommand = undefined;
    sharedApp.lastCommand = undefined;
    // Restore collaborators that individual tests may have overridden
    sharedApp.storage.get = async () => undefined;
    sharedApp.dataExchange.import = async () => {};
    // Clear property change handlers
    sharedApp.clearPropertyChanged();
    // Clean up pubsub
    PubSub.default.removeAll("activeViewChanged");
    PubSub.default.removeAll("showPermanent");
    PubSub.default.removeAll("executeCommand");
}

describe("Application", () => {
    afterEach(() => {
        resetAppState();
    });

    // ==========================================================================
    // Constructor & initialization
    // ==========================================================================
    describe("constructor and initialization", () => {
        test("should initialize with provided options", () => {
            const app = sharedApp;
            expect(app.visualFactory).toBe(sharedVisualFactory);
            expect(app.shapeProvider).toBeDefined();
            expect(app.storage).toBeDefined();
            expect(app.dataExchange).toBeDefined();
            expect(app.services).toEqual([]);
        });

        // Форк «Макетки»: загрузка расширений удалена целиком — это исполнение
        // произвольного кода на origin с сессией ребёнка (INV-006).
        test("should not expose a plugin manager", () => {
            expect((sharedApp as unknown as Record<string, unknown>)["pluginManager"]).toBeUndefined();
        });

        test("should initialize views as empty ObservableCollection", () => {
            // views might have been populated by prior tests
            sharedApp.views.clear();
            expect(sharedApp.views).toBeInstanceOf(ObservableCollection);
            expect(sharedApp.views.length).toBe(0);
        });

        test("should initialize documents as empty Set", () => {
            expect(sharedApp.documents).toBeInstanceOf(Set);
            sharedApp.documents.clear();
            expect(sharedApp.documents.size).toBe(0);
        });

        test("should set window.onbeforeunload in initEvents", () => {
            expect(window.onbeforeunload).not.toBeNull();
            expect(typeof window.onbeforeunload).toBe("function");
        });
    });

    // ==========================================================================
    // Properties
    // ==========================================================================
    describe("properties", () => {
        describe("executingCommand", () => {
            test("should default to undefined", () => {
                expect(sharedApp.executingCommand).toBeUndefined();
            });

            test("should get and set executingCommand", () => {
                const mockCommand: ICommand = { execute: async () => {} };
                sharedApp.executingCommand = mockCommand;
                expect(sharedApp.executingCommand).toBe(mockCommand);
            });

            test("should set executingCommand to undefined", () => {
                const mockCommand: ICommand = { execute: async () => {} };
                sharedApp.executingCommand = mockCommand;
                sharedApp.executingCommand = undefined;
                expect(sharedApp.executingCommand).toBeUndefined();
            });

            test("should emit propertyChanged when setting executingCommand", () => {
                let changedProp: string | undefined;
                sharedApp.onPropertyChanged((prop) => {
                    changedProp = prop as string;
                });

                const mockCommand: ICommand = { execute: async () => {} };
                sharedApp.executingCommand = mockCommand;

                expect(changedProp).toBe("executingCommand");
            });
        });

        describe("activeView", () => {
            test("should default to undefined", () => {
                expect(sharedApp.activeView).toBeUndefined();
            });

            test("should get and set activeView", () => {
                const view = createMockView();
                sharedApp.activeView = view;
                expect(sharedApp.activeView).toBe(view);
            });

            test("should publish activeViewChanged when activeView is set", () => {
                let receivedView: IView | undefined;
                PubSub.default.sub("activeViewChanged", (v: IView | undefined) => {
                    receivedView = v;
                });

                const view = createMockView();
                sharedApp.activeView = view;

                expect(receivedView).toBe(view);
            });

            test("should publish activeViewChanged with undefined when cleared", () => {
                const view = createMockView();
                sharedApp.activeView = view;

                let receivedView: IView | undefined = {} as any;
                PubSub.default.sub("activeViewChanged", (v: IView | undefined) => {
                    receivedView = v;
                });

                sharedApp.activeView = undefined;

                expect(receivedView).toBeUndefined();
            });

            test("should emit propertyChanged when setting activeView", () => {
                let changedProp: string | undefined;
                sharedApp.onPropertyChanged((prop) => {
                    changedProp = prop as string;
                });

                const view = createMockView();
                sharedApp.activeView = view;

                expect(changedProp).toBe("activeView");
            });
        });

        describe("lastCommand", () => {
            test("should default to undefined", () => {
                expect(sharedApp.lastCommand).toBeUndefined();
            });

            test("should be assignable", () => {
                sharedApp.lastCommand = "command.box" as any;
                expect(sharedApp.lastCommand).toBe("command.box");
            });
        });
    });

    // ==========================================================================
    // newDocument
    // ==========================================================================
    describe("newDocument", () => {
        test("should create a new document and return it", async () => {
            const doc = await sharedApp.newDocument("TestDoc");

            expect(doc).not.toBeNull();
            expect(doc.name).toBe("TestDoc");
            expect(doc.id).not.toBeNull();
            expect(doc.id.length).toBeGreaterThan(0);
        });

        test("should add document to documents set", async () => {
            const doc = await sharedApp.newDocument("TestDoc2");
            expect(sharedApp.documents.has(doc)).toBe(true);
        });

        test("should add default materials (LightGray, DeepGray)", async () => {
            const doc = await sharedApp.newDocument("TestDoc3");
            const materialNames = (doc.modelManager.materials as unknown as { name: string }[]).map(
                (m) => m.name,
            );
            expect(materialNames).toContain("LightGray");
            expect(materialNames).toContain("DeepGray");
        });

        test("should set activeView to the created view", async () => {
            const doc = await sharedApp.newDocument("TestDoc4");
            expect(sharedApp.activeView).not.toBeNull();
            expect(sharedApp.activeView?.document).toBe(doc);
        });
    });

    // ==========================================================================
    // openDocument
    // ==========================================================================
    describe("openDocument", () => {
        const validData = makeSerializedDocData("SavedDoc", "doc-456");

        test("should return undefined when storage returns undefined", async () => {
            // Default storage returns undefined
            const result = await sharedApp.openDocument("nonexistent");
            expect(result).toBeUndefined();
        });

        test("should return the loaded document when found", async () => {
            sharedApp.storage.get = async () => validData;

            const doc = await sharedApp.openDocument("doc-456");
            expect(doc).not.toBeNull();
            expect(doc!.name).toBe("SavedDoc");
            expect(doc!.id).toBe("doc-456");
        });

        test("should set activeView after opening document", async () => {
            sharedApp.storage.get = async () => validData;

            await sharedApp.openDocument("doc-456");
            expect(sharedApp.activeView).not.toBeNull();
            expect(sharedApp.activeView?.document?.name).toBe("SavedDoc");
        });
    });

    // ==========================================================================
    // loadDocument
    // ==========================================================================
    describe("loadDocument", () => {
        const validSerializedData = makeSerializedDocData("LoadedDoc", "load-123");

        test("should load document from serialized data", async () => {
            const doc = await sharedApp.loadDocument(validSerializedData);
            expect(doc).not.toBeNull();
            expect(doc!.name).toBe("LoadedDoc");
            expect(doc!.id).toBe("load-123");
        });

        test("should add loaded document to documents set", async () => {
            const doc = await sharedApp.loadDocument(validSerializedData);
            expect(sharedApp.documents.has(doc!)).toBe(true);
        });

        test("should set activeView after loading document", async () => {
            await sharedApp.loadDocument(validSerializedData);
            expect(sharedApp.activeView).not.toBeNull();
        });

        test("should return undefined when version mismatches", async () => {
            const originalAlert = globalThis.alert;
            globalThis.alert = (() => {}) as any;

            try {
                const badVersionData = {
                    ...validSerializedData,
                    version: "0.0.1",
                } as unknown as Serialized;

                const doc = await sharedApp.loadDocument(badVersionData);
                expect(doc).toBeUndefined();
            } finally {
                globalThis.alert = originalAlert;
            }
        });
    });

    // ==========================================================================
    // Загрузка по ссылке
    // ==========================================================================
    // Форк «Макетки»: метод loadFileFromUrl удалён вместе с параметрами URL
    // (INV-006) — он скачивал и импортировал произвольный файл по чужой ссылке
    // на origin с сессией ребёнка.
    describe("загрузка по ссылке", () => {
        test("приложение не умеет загружать файл по ссылке", () => {
            expect((sharedApp as unknown as Record<string, unknown>)["loadFileFromUrl"]).toBeUndefined();
        });
    });

    // ==========================================================================
    // groupFiles
    // ==========================================================================
    describe("groupFiles", () => {
        function callGroupFiles(files: File[]) {
            return (sharedApp as any).groupFiles(files);
        }

        test("should group .cd files as opens", () => {
            const cdFile = new File([""], "model.cd");
            const result = callGroupFiles([cdFile]);
            expect(result.opens).toHaveLength(1);
            expect(result.opens[0]).toBe(cdFile);
            expect(result.imports).toHaveLength(0);
        });

        test("should be case-insensitive for .cd extension", () => {
            const result = callGroupFiles([new File([""], "model.CD")]);
            expect(result.opens).toHaveLength(1);
        });

        // Форк «Макетки»: отдельной группы для расширений больше нет — файл
        // .chiliplugin идёт в импорт и отклоняется как неизвестный формат,
        // а не исполняется на origin с сессией ребёнка (INV-006).
        test("should treat .chiliplugin as an ordinary unsupported file", () => {
            const pluginFile = new File([""], "my.plugin.chiliplugin");
            const result = callGroupFiles([pluginFile]);
            expect(result.plugins).toBeUndefined();
            expect(result.imports).toEqual([pluginFile]);
            expect(result.opens).toHaveLength(0);
        });

        test("should group other files as imports", () => {
            const stepFile = new File([""], "model.step");
            const result = callGroupFiles([stepFile]);
            expect(result.imports).toHaveLength(1);
            expect(result.imports[0]).toBe(stepFile);
            expect(result.opens).toHaveLength(0);
        });

        test("should handle mixed file types", () => {
            const files = [
                new File([""], "a.cd"),
                new File([""], "b.chiliplugin"),
                new File([""], "c.step"),
                new File([""], "d.iges"),
                new File([""], "e.CD"),
            ];
            const result = callGroupFiles(files);
            expect(result.opens).toHaveLength(2);
            expect(result.imports).toHaveLength(3);
        });

        test("should return empty arrays for empty file list", () => {
            const result = callGroupFiles([]);
            expect(result.opens).toHaveLength(0);
            expect(result.imports).toHaveLength(0);
        });
    });

    // ==========================================================================
    // extractDroppedFiles
    // ==========================================================================
    describe("extractDroppedFiles", () => {
        function callExtractDroppedFiles(dt: DataTransfer | null) {
            return (sharedApp as any).extractDroppedFiles(dt);
        }

        test("should return empty array for null dataTransfer", () => {
            expect(callExtractDroppedFiles(null)).toEqual([]);
        });

        test("should extract files from dataTransfer.files", () => {
            const dt = new DataTransfer();
            dt.items.add(new File(["content"], "test.step"));

            const result = callExtractDroppedFiles(dt);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("test.step");
        });

        test("should fall back to dataTransfer.items when files is empty", () => {
            const dt = new DataTransfer();
            dt.items.add(new File(["content"], "from-items.step"));

            const result = callExtractDroppedFiles(dt);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("from-items.step");
        });

        test("should filter out non-file items from dataTransfer.items", () => {
            const dt = new DataTransfer();
            dt.items.add(new File(["a"], "good.step"));
            dt.items.add("some string data", "text/plain");

            const result = callExtractDroppedFiles(dt);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("good.step");
        });
    });

    // ==========================================================================
    // importFiles
    // ==========================================================================
    describe("importFiles", () => {
        test("should return early when files is undefined", async () => {
            const pubSpy = rs.spyOn(PubSub.default, "pub");

            await sharedApp.importFiles(undefined);

            expect(pubSpy).not.toHaveBeenCalled();
            expect(sharedApp.documents.size).toBe(0);
            pubSpy.mockRestore();
        });

        test("should return early when files is null", async () => {
            const pubSpy = rs.spyOn(PubSub.default, "pub");

            await sharedApp.importFiles(null as any);

            expect(pubSpy).not.toHaveBeenCalled();
            expect(sharedApp.documents.size).toBe(0);
            pubSpy.mockRestore();
        });

        test("should return early when files array is empty", async () => {
            const pubSpy = rs.spyOn(PubSub.default, "pub");

            await sharedApp.importFiles([]);

            expect(pubSpy).not.toHaveBeenCalled();
            expect(sharedApp.documents.size).toBe(0);
            pubSpy.mockRestore();
        });

        test("should handle FileList input", async () => {
            const data = makeSerializedDocData("DroppedDoc", "dropped-1");
            const dt = new DataTransfer();
            dt.items.add(new File([JSON.stringify(data)], "model.cd"));

            let openCallback: (() => Promise<void>) | undefined;
            PubSub.default.sub("showPermanent", (callback: () => Promise<void>) => {
                openCallback = callback;
            });

            await sharedApp.importFiles(dt.files);

            // The .cd file is routed to the open-document path via showPermanent
            expect(openCallback).not.toBeUndefined();
            await openCallback!();

            const doc = [...sharedApp.documents].find((d) => d.id === "dropped-1");
            expect(doc).not.toBeUndefined();
            expect(doc!.name).toBe("DroppedDoc");
            expect(sharedApp.activeView?.document).toBe(doc);
        });
    });

    // ==========================================================================
    // Drag event handlers
    // ==========================================================================
    describe("drag event handlers", () => {
        test("handleDragStart should call preventDefault", () => {
            const event = new Event("dragstart", { bubbles: true }) as DragEvent;
            let prevented = false;
            event.preventDefault = () => {
                prevented = true;
            };

            (sharedApp as any).handleDragStart(event);
            expect(prevented).toBe(true);
        });

        test("handleDragOver should call stopPropagation and preventDefault", () => {
            const dt = new DataTransfer();
            const event = new DragEvent("dragover", { bubbles: true, cancelable: true });
            Object.defineProperty(event, "dataTransfer", { value: dt });

            let stopped = false;
            let prevented = false;
            event.stopPropagation = () => {
                stopped = true;
            };
            event.preventDefault = () => {
                prevented = true;
            };

            (sharedApp as any).handleDragOver(event);

            expect(stopped).toBe(true);
            expect(prevented).toBe(true);
        });

        test("handleDragOver should set dropEffect to copy", () => {
            const dt = new DataTransfer();
            const event = new DragEvent("dragover", { bubbles: true, cancelable: true });
            Object.defineProperty(event, "dataTransfer", { value: dt });

            (sharedApp as any).handleDragOver(event);
            expect(dt.dropEffect).toBe("copy");
        });

        test("handleDrop should call stopPropagation and preventDefault", () => {
            const dt = new DataTransfer();
            dt.items.add(new File(["content"], "model.step"));
            const event = new DragEvent("drop", { bubbles: true, cancelable: true });
            Object.defineProperty(event, "dataTransfer", { value: dt });

            let stopped = false;
            let prevented = false;
            event.stopPropagation = () => {
                stopped = true;
            };
            event.preventDefault = () => {
                prevented = true;
            };

            (sharedApp as any).handleDrop(event);

            expect(stopped).toBe(true);
            expect(prevented).toBe(true);
        });
    });

    // ==========================================================================
    // beforeunload handler
    // ==========================================================================
    describe("handleWindowUnload", () => {
        test("should prevent close when activeView is set", () => {
            sharedApp.activeView = createMockView();

            const event = new Event("beforeunload") as BeforeUnloadEvent;
            let prevented = false;
            event.preventDefault = () => {
                prevented = true;
            };

            (sharedApp as any).handleWindowUnload(event);
            expect(prevented).toBe(true);
        });

        test("should set returnValue when activeView is set", () => {
            sharedApp.activeView = createMockView();
            const event = new Event("beforeunload") as BeforeUnloadEvent;

            (sharedApp as any).handleWindowUnload(event);
            expect(event.returnValue).toBe("");
        });

        test("should not prevent close when activeView is undefined", () => {
            sharedApp.activeView = undefined;
            expect(sharedApp.activeView).toBeUndefined();

            const event = new Event("beforeunload") as BeforeUnloadEvent;
            let prevented = false;
            event.preventDefault = () => {
                prevented = true;
            };

            (sharedApp as any).handleWindowUnload(event);
            expect(prevented).toBe(false);
        });
    });

    // ==========================================================================
    // VisualConfig change handler
    // ==========================================================================
    describe("onVisualConfigChanged", () => {
        test("should update all views when defaultEdgeColor changes", () => {
            let update1Called = false;
            let update2Called = false;

            sharedApp.views.clear();
            sharedApp.views.push(
                {
                    update: () => {
                        update1Called = true;
                    },
                } as unknown as IView,
                {
                    update: () => {
                        update2Called = true;
                    },
                } as unknown as IView,
            );

            (sharedApp as any).onVisualConfigChanged("defaultEdgeColor");

            expect(update1Called).toBe(true);
            expect(update2Called).toBe(true);
        });

        test("should not update views for other properties", () => {
            let updateCalled = false;
            sharedApp.views.clear();
            sharedApp.views.push({
                update: () => {
                    updateCalled = true;
                },
            } as unknown as IView);

            (sharedApp as any).onVisualConfigChanged("defaultFaceColor");
            (sharedApp as any).onVisualConfigChanged("highlightEdgeColor");
            (sharedApp as any).onVisualConfigChanged("selectedFaceColor");

            expect(updateCalled).toBe(false);
        });

        test("should handle empty views collection gracefully", () => {
            sharedApp.views.clear();

            (sharedApp as any).onVisualConfigChanged("defaultEdgeColor");

            expect(sharedApp.views.length).toBe(0);
        });
    });

    // ==========================================================================
    // createActiveView
    // ==========================================================================
    describe("createActiveView", () => {
        test("should return undefined for undefined document", async () => {
            const result = await (sharedApp as any).createActiveView(undefined);
            expect(result).toBeUndefined();
            expect(sharedApp.activeView).toBeUndefined();
        });

        test("should create view and set as activeView", async () => {
            const doc = await sharedApp.newDocument("IntegrationTest");
            expect(doc).not.toBeNull();
            expect(sharedApp.activeView).not.toBeNull();
            expect(sharedApp.activeView!.document).toBe(doc);
        });
    });
});
