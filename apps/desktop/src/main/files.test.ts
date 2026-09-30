import { describe, expect, it } from "vitest";
import { detectLanguage } from "./files.ts";

describe("Files language detector", () => {
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
});
