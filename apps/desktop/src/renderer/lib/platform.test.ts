import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { getFileManagerLabel, getPlatform } from "./platform.ts";

describe("platform helpers", () => {
  const originalDoc = (globalThis as any).document;

  beforeEach(() => {
    (globalThis as any).document = {
      documentElement: {
        dataset: {},
      },
    };
  });

  afterEach(() => {
    (globalThis as any).document = originalDoc;
  });

  it("determines label from dataset platform darwin", () => {
    document.documentElement.dataset.platform = "darwin";
    expect(getPlatform()).toBe("mac");
    expect(getFileManagerLabel()).toBe("Open in Finder");
  });

  it("determines label from dataset platform win32", () => {
    document.documentElement.dataset.platform = "win32";
    expect(getPlatform()).toBe("windows");
    expect(getFileManagerLabel()).toBe("Open in File Explorer");
  });

  it("determines label from dataset platform linux", () => {
    document.documentElement.dataset.platform = "linux";
    expect(getPlatform()).toBe("linux");
    expect(getFileManagerLabel()).toBe("Open in File Manager");
  });
});
