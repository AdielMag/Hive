/**
 * Contract between the library module's main and renderer halves.
 * Transported over the generic module bridge: `mod:library:<method>`.
 */
import type {
  LibraryEntry,
  LibraryFieldValue,
  LibraryKind,
  LibraryRootInfo,
  LibraryScope,
  LibrarySection,
  LibrarySetFieldRequest,
  LibrarySetFieldResult,
  LibrarySnapshot,
} from "@hive/protocol";

export const MODULE_ID = "library";
export const LIBRARY_TAB_KIND = "library";

export const LibraryMethods = {
  list: "list",
  setField: "setField",
  reveal: "reveal",
  openPath: "openPath",
} as const;

export type {
  LibraryEntry,
  LibraryFieldValue,
  LibraryKind,
  LibraryRootInfo,
  LibraryScope,
  LibrarySection,
  LibrarySetFieldRequest,
  LibrarySetFieldResult,
  LibrarySnapshot,
};
