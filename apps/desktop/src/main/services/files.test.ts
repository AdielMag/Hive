import { describe, expect, it } from "vitest";
import { detectLanguage, detectMimeType, readMediaFile } from "./files.ts";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Files language and mime detector", () => {
  it("detects programming and markup languages from extension", () => {
    expect(detectLanguage("src/index.ts")).toBe("typescript");
    expect(detectLanguage("App.tsx")).toBe("typescript");
    expect(detectLanguage("server.mjs")).toBe("javascript");
    expect(detectLanguage("script.py")).toBe("python");
    expect(detectLanguage("main.rs")).toBe("rust");
    expect(detectLanguage("README.md")).toBe("markdown");
    expect(detectLanguage("data.json")).toBe("json");
    expect(detectLanguage("styles.css")).toBe("css");
    expect(detectLanguage("run.sh")).toBe("shell");
    expect(detectLanguage("setup.ps1")).toBe("powershell");
    expect(detectLanguage("unknown.xyz")).toBe("text");
  });

  it("detects mime types for images and media", () => {
    expect(detectMimeType("photo.png")).toBe("image/png");
    expect(detectMimeType("photo.jpg")).toBe("image/jpeg");
    expect(detectMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(detectMimeType("diagram.webp")).toBe("image/webp");
    expect(detectMimeType("anim.gif")).toBe("image/gif");
    expect(detectMimeType("vector.svg")).toBe("image/svg+xml");
    expect(detectMimeType("doc.pdf")).toBe("application/pdf");
    expect(detectMimeType("unknown.xyz")).toBe("application/octet-stream");
  });

  it("reads media file and returns base64 payload", () => {
    const tmp = join(tmpdir(), `test-img-${Date.now()}.png`);
    writeFileSync(tmp, Buffer.from("fake-png-data"));
    try {
      const res = readMediaFile(tmp);
      expect(res.mimeType).toBe("image/png");
      expect(res.data).toBe(Buffer.from("fake-png-data").toString("base64"));
      expect(res.size).toBe(13);
    } finally {
      unlinkSync(tmp);
    }
  });
});
