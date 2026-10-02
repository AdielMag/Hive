import { describe, expect, it, beforeEach } from "vitest";
import { useImagePreview } from "./image-preview-store.ts";

describe("image-preview-store", () => {
  beforeEach(() => {
    useImagePreview.getState().closePreview();
  });

  it("initializes with null image", () => {
    expect(useImagePreview.getState().image).toBeNull();
  });

  it("opens preview with string URL", () => {
    useImagePreview.getState().openPreview("https://example.com/test.png");
    expect(useImagePreview.getState().image).toEqual({
      src: "https://example.com/test.png",
    });
  });

  it("opens preview with PreviewImage object", () => {
    useImagePreview.getState().openPreview({
      src: "data:image/png;base64,abc123",
      alt: "screenshot.png",
      title: "Preview Title",
    });
    expect(useImagePreview.getState().image).toEqual({
      src: "data:image/png;base64,abc123",
      alt: "screenshot.png",
      title: "Preview Title",
    });
  });

  it("closes preview", () => {
    useImagePreview.getState().openPreview("https://example.com/test.png");
    expect(useImagePreview.getState().image).not.toBeNull();
    useImagePreview.getState().closePreview();
    expect(useImagePreview.getState().image).toBeNull();
  });
});
