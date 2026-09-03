// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IDocument } from "../document";
import type { Result } from "../foundation";
import type { FolderNode } from "../model";
import type { IShape } from "./shape";

export interface IShapeConverter {
    convertToIGES(...shapes: IShape[]): Result<string>;
    convertFromIGES(document: IDocument, iges: Uint8Array): Result<FolderNode>;
    /**
     * STEP export through XCAF: every part becomes one named product, so body
     * names (and colors) survive the trip to another CAD. See {@link StepExportPart}.
     */
    convertToSTEP(parts: StepExportPart[]): Result<string>;
    convertFromSTEP(document: IDocument, step: Uint8Array): Result<FolderNode>;
    convertToBrep(shape: IShape): Result<string>;
    convertFromBrep(brep: string): Result<IShape>;
    /**
     * Headless STL export: tessellates each shape (OCCT mesh) and writes STL
     * bytes with no visual layer. Binary by default. See {@link StlExportOptions}.
     */
    convertToSTL(shapes: IShape[], options?: StlExportOptions): Result<Uint8Array>;
    convertFromSTL(document: IDocument, stl: Uint8Array): Result<FolderNode>;
}

export interface StepExportPart {
    /** Body to write. */
    shape: IShape;
    /** Body name — becomes the STEP product name. */
    name?: string;
    /** Body color as "#rrggbb" — becomes a STEP style. */
    color?: string;
}

export interface StlExportOptions {
    /** Binary STL when true (default), ASCII otherwise. */
    binary?: boolean;
    /** Solid name written into the ASCII header (ignored for binary). */
    name?: string;
}
