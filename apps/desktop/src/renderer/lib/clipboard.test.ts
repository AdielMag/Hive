import { describe, expect, it, vi } from "vitest";
import { copyImageToClipboard, copyText, downloadImage } from "./clipboard.ts";

describe("clipboard utilities", () => {
  it("copyText returns false when navigator and document are unavailable", async () => {
    const res = await copyText("hello");
    expect(res).toBe(false);
  });

  it("copyImageToClipboard falls back to copyText when ClipboardItem is unavailable", async () => {
    const res = await copyImageToClipboard("data:image/png;base64,123");
    expect(res).toBe(false);
  });

  it("downloadImage returns false when document is unavailable", () => {
    const res = downloadImage("data:image/png;base64,123", "test.png");
    expect(res).toBe(false);
  });

  it("downloadImage creates and clicks link when document is available", () => {
    const clickMock = vi.fn();
    const appendMock = vi.fn();
    const removeMock = vi.fn();

    const mockAnchor = {
      href: "",
      download: "",
      click: clickMock,
      remove: removeMock,
    };

    const anyGlobal = globalThis as any;
    anyGlobal.document = {
      createElement: vi.fn(() => mockAnchor),
      body: {
        appendChild: appendMock,
      },
    };

    const res = downloadImage("https://example.com/pic.png", "pic.png");
    expect(res).toBe(true);
    expect(mockAnchor.href).toBe("https://example.com/pic.png");
    expect(mockAnchor.download).toBe("pic.png");
    expect(clickMock).toHaveBeenCalled();
    expect(removeMock).toHaveBeenCalled();

    delete (globalThis as unknown as { document?: unknown }).document;
  });
});
