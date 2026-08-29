// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: лента команд под ребёнка (ТЗ §7).
//
// В upstream на первом уровне лежит около полусотни команд — для ребёнка,
// который первый раз видит CAD, это стена кнопок, и до первой фигуры он идёт
// минуты вместо секунд (критерий 60 сек, §10). Оставляем наверху то, что нужно
// на первых уроках, остальное убираем в «Ещё» (collapsedItems) — оно никуда не
// пропадает, просто не мешает.
//
// Вкладка «Менеджер» с командой test.performance убрана целиком: она строит
// тысячи фигур ради замера скорости и на школьном ноутбуке вешает вкладку.

import type { RibbonTabProfile } from "@chili3d/core";

export const DefaultRibbon: RibbonTabProfile[] = [
    {
        tabName: "ribbon.tab.model",
        groups: [
            {
                groupName: "ribbon.group.draw",
                items: [
                    "create.line",
                    {
                        type: "split",
                        items: ["create.rect", "create.circle", "create.ellipse", "create.regularPolygon"],
                    },
                    {
                        type: "split",
                        items: [
                            "create.box",
                            "create.sphere",
                            "create.cylinder",
                            "create.cone",
                            "create.pyramid",
                        ],
                    },
                    "create.extrude",
                ],
                // Дуги, кривые и протяжки нужны позже — ребёнку первых уроков они
                // только увеличивают стену кнопок.
                collapsedItems: [
                    "create.arc",
                    "create.arc2point",
                    "create.arc3point",
                    "create.arcTTR",
                    "create.loft",
                    "create.sweep",
                    "create.revol",
                    "create.point",
                    "create.polygon",
                    "create.bezier",
                    "create.helix",
                    "create.pipe",
                ],
            },
            {
                groupName: "ribbon.group.modify",
                items: [
                    "modify.move",
                    ["modify.rotate", "modify.mirror", "modify.array"],
                    // Скругление — второй шаг карточки «Брелок», поэтому наверху.
                    ["modify.fillet", "modify.chamfer"],
                    "modify.deleteNode",
                ],
                collapsedItems: [
                    "modify.trim",
                    "modify.extend",
                    "modify.shell",
                    "modify.split",
                    "modify.sew",
                    "modify.simplifyShape",
                    "modify.explode",
                    "modify.removeShapes",
                    "modify.removeFeature",
                    "modify.break",
                    "modify.paintBucket",
                    "modify.brushAdd",
                    "modify.brushRemove",
                    "modify.brushClear",
                ],
            },
            {
                // «Вычти цилиндр из бруска» — четвёртый шаг первой карточки.
                groupName: "ribbon.group.boolean",
                items: [["boolean.common", "boolean.cut", "boolean.join"]],
            },
            {
                groupName: "ribbon.group.tools",
                items: ["create.group", "measure.length"],
                collapsedItems: [
                    "convert.toWire",
                    "convert.toCompound",
                    "convert.toFace",
                    "convert.toShell",
                    "convert.toSolid",
                    "convert.curveProjection",
                    "create.section",
                    "create.offset",
                    "create.copyShape",
                    "workingPlane.toggleDynamic",
                    "workingPlane.set",
                    "workingPlane.alignToPlane",
                    "workingPlane.fromSection",
                    "measure.angle",
                    "measure.select",
                    "modify.repairShape",
                    "modify.checkShape",
                ],
            },
            {
                groupName: "ribbon.group.act",
                items: ["act.alignCamera"],
            },
            {
                // Экспорт — последний шаг карточки: «выгрузи STL для печати».
                groupName: "ribbon.group.importExport",
                items: ["file.import", "file.export"],
            },
        ],
    },
];
