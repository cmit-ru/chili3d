// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
//
// Форк «Макетки»: лента последних действий для отзыва (B-134). Главное здесь не
// то, что лента копится, а то, что в неё нельзя ничего положить: названия действий
// заданы кодом, и ни имя работы, ни имя фигуры, ни имя файла — ничто, что человек
// набрал сам, — в письмо через ленту не попадёт.

import { КОДЫ, забытьДействия, кодКоманды, лентаДействий, отметить, отметитьКоманду } from "../src/trail";

describe("Лента действий", () => {
    beforeEach(() => забытьДействия());

    test("список названий закрыт: произвольная строка в ленту не попадает", () => {
        expect(отметить("shape_add")).toBe(true);
        // Ровно то, чего мы боимся: человек назвал деталь сам.
        expect(отметить("поставил деталь «Домик Пети»")).toBe(false);
        expect(отметить("")).toBe(false);
        // Свойства прототипа тоже не названия действий.
        expect(отметить("constructor")).toBe(false);
        expect(отметить("__proto__")).toBe(false);
        expect(лентаДействий()).toEqual(["shape_add"]);
    });

    test("имя команды ядра превращается в код, а незнакомая команда — ни во что", () => {
        expect(кодКоманды("create.box")).toBe("shape_add");
        expect(кодКоманды("boolean.cut")).toBe("boolean");
        expect(кодКоманды("modify.deleteNode")).toBe("shape_delete");
        expect(кодКоманды("modify.removeShapes")).toBe("shape_delete");
        expect(кодКоманды("modify.fillet")).toBe("shape_edit");
        expect(кодКоманды("edit.undo")).toBe("undo");
        expect(кодКоманды("doc.saveToFile")).toBe("download");
        // Поворот камеры — не действие над работой.
        expect(кодКоманды("act.alignCamera")).toBeNull();
        expect(кодКоманды("Домик Пети")).toBeNull();
    });

    test("в ленту едут коды, а не имена команд", () => {
        отметитьКоманду("create.box");
        отметитьКоманду("act.alignCamera");
        отметитьКоманду({ имя: "create.box" });
        отметитьКоманду("edit.undo");
        expect(лентаДействий()).toEqual(["shape_add", "undo"]);
    });

    test("каждый код ленты есть в закрытом списке", () => {
        const коды = [
            "create.box",
            "modify.fillet",
            "modify.deleteNode",
            "boolean.cut",
            "measure.length",
            "workingPlane.set",
            "file.import",
            "file.export",
            "edit.undo",
            "edit.redo",
            "doc.save",
            "doc.saveToFile",
            "doc.open",
        ].map((имя) => кодКоманды(имя));
        for (const код of коды) expect(КОДЫ.has(код as string)).toBe(true);
    });

    test("хвост ленты — десять действий, и наружу уходит копия", () => {
        for (let i = 0; i < 14; i++) отметить(i % 2 ? "undo" : "shape_add");
        const лента = лентаДействий();
        expect(лента).toHaveLength(10);
        // Из четырнадцати отметок первые четыре вытеснены: осталась пятая и дальше.
        expect(лента[0]).toBe("shape_add");
        expect(лента[9]).toBe("undo");

        лента.push("save");
        expect(лентаДействий()).toHaveLength(10);
    });
});
