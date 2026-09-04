// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Config, type ObjectSnapType, ObjectSnapTypes, ObjectSnapTypeUtils } from "@chili3d/core";
import { beforeEach, describe, expect, test } from "@rstest/core";

// Mock CSS modules
rs.mock("../src/statusbar/snapConfig.module.css", () => ({
    container: "sc-container",
    caption: "sc-caption",
}));

// Mock element helpers — snap tests trigger handlers via el.click(),
// so the realEvents variant is needed
import "./_helpers/mockElementRealEvents";

import { SnapConfig } from "../src/statusbar/snapConfig";
import { mustQuery } from "./_helpers/domHelpers";

describe("SnapConfig", () => {
    let originalSnapType: ObjectSnapType;
    let originalEnableSnap: boolean;
    let originalEnableSnapTracking: boolean;

    beforeEach(() => {
        originalSnapType = Config.instance.snapType;
        originalEnableSnap = Config.instance.enableSnap;
        originalEnableSnapTracking = Config.instance.enableSnapTracking;

        // Set defaults for consistent testing
        Config.instance.enableSnap = true;
        Config.instance.enableSnapTracking = true;
    });

    afterEach(() => {
        Config.instance.snapType = originalSnapType;
        Config.instance.enableSnap = originalEnableSnap;
        Config.instance.enableSnapTracking = originalEnableSnapTracking;
    });

    describe("constructor", () => {
        test("should render snap type checkboxes", () => {
            const config = new SnapConfig();
            const checkboxes = config.querySelectorAll('input[type="checkbox"]');
            // 8 snap types + 1 tracking toggle = 9 checkboxes
            expect(checkboxes.length).toBe(9);
        });

        test("should set container CSS class", () => {
            const config = new SnapConfig();
            expect(config.className).toContain("sc-container");
        });

        test("should create checkboxes with id prefix snap-", () => {
            const config = new SnapConfig();
            const snapCheckboxes = config.querySelectorAll('input[id^="snap-"]');
            // 9 total checkboxes, all should start with snap- prefix
            expect(snapCheckboxes.length).toBe(9);
        });

        test("should create tracking checkbox", () => {
            const config = new SnapConfig();
            const trackingCheckbox = mustQuery<HTMLInputElement>(config, "#snap-tracking");
            expect(trackingCheckbox.checked).toBe(true);
        });

        test("should render labels for each checkbox", () => {
            const config = new SnapConfig();
            const labels = config.querySelectorAll("label");
            // 8 snap type labels + 1 tracking label = 9
            expect(labels.length).toBe(9);
        });
    });

    describe("group captions", () => {
        // Подписи приходят через `Localize`, а мок элементов объектный textContent
        // не раскрывает — поэтому проверяется расстановка, а не сам текст.
        test("should render a caption before each snap group", () => {
            const config = new SnapConfig();
            const children = [...config.children];
            const captions = config.querySelectorAll(".sc-caption");

            expect(captions.length).toBe(2);
            // «Прилипать к:» открывает плашку, «ещё:» стоит после первых четырёх галочек
            expect(children.indexOf(captions[0])).toBe(0);
            expect(children.indexOf(captions[1])).toBe(5);
        });
    });

    describe("snap type toggling", () => {
        test("should toggle snap type when checkbox clicked", () => {
            const config = new SnapConfig();
            // SnapTypes[i].type is a numeric enum value, so the id format is snap-{number}
            const endPointId = `snap-${ObjectSnapTypes.endPoint}`;
            const endPointCheckbox = mustQuery<HTMLInputElement>(config, `#${endPointId}`);

            const hadType = ObjectSnapTypeUtils.hasType(Config.instance.snapType, ObjectSnapTypes.endPoint);

            endPointCheckbox.click();

            const nowHasType = ObjectSnapTypeUtils.hasType(
                Config.instance.snapType,
                ObjectSnapTypes.endPoint,
            );

            // After clicking, the type should toggle
            expect(nowHasType).toBe(!hadType);
        });
    });

    describe("tracking toggle", () => {
        test("should toggle enableSnapTracking when tracking checkbox is clicked", () => {
            Config.instance.enableSnapTracking = true;
            const config = new SnapConfig();
            const trackingCheckbox = mustQuery<HTMLInputElement>(config, "#snap-tracking");
            trackingCheckbox.click();
            expect(Config.instance.enableSnapTracking).toBe(false);
        });
    });

    describe("config change reactivity", () => {
        test.each([
            { prop: "snapType" },
            { prop: "enableSnap" },
            { prop: "enableSnapTracking" },
        ])("should re-render when $prop config changes", ({ prop }) => {
            const config = new SnapConfig();
            const firstCheckboxBefore = mustQuery(config, 'input[type="checkbox"]');

            // Manually trigger the property changed callback
            (config as unknown as { snapTypeChanged: (p: string) => void }).snapTypeChanged(prop);

            // Content should be regenerated: same count, new element instances
            const checkboxes = config.querySelectorAll('input[type="checkbox"]');
            expect(checkboxes.length).toBe(9);
            expect(checkboxes[0]).not.toBe(firstCheckboxBefore);
        });

        test("should NOT clear checkboxes for unrelated config changes", () => {
            const config = new SnapConfig();
            (config as unknown as { snapTypeChanged: (prop: string) => void }).snapTypeChanged("language");
            // The snapTypeChanged method only clears on snapType/enableSnap/enableSnapTracking
            // For "language", innerHTML should NOT have been cleared
            expect(config.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThan(0);
        });
    });
});
