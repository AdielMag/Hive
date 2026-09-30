import { describe, expect, it } from "vitest";
import { parseAnsi, stripAnsi } from "../src/ansi.ts";

describe("ANSI parser", () => {
  it("strips SGR codes cleanly", () => {
    const raw = "\x1b[32m[AGY]\x1b[0m  5h: \x1b[1m100%\x1b[22m  reset: 4h";
    expect(stripAnsi(raw)).toBe("[AGY]  5h: 100%  reset: 4h");
  });

  it("parses styled segments with color and bold", () => {
    const raw = "\x1b[32mgreen\x1b[0m \x1b[1mbold\x1b[22m";
    const segments = parseAnsi(raw);
    expect(segments).toEqual([
      { text: "green", style: { color: "#57ab5a" } },
      { text: " ", style: {} },
      { text: "bold", style: { bold: true } },
    ]);
  });

  it("drops non-SGR sequences like cursor moves and OSC titles", () => {
    const raw = "\x1b]0;Title\x07\x1b[2Jhello\x1b[H";
    expect(stripAnsi(raw)).toBe("hello");
  });
});
