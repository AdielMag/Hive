import { describe, expect, it } from "vitest";
import { JsonlSplitter, serializeRecord } from "../src/jsonl.ts";

describe("JsonlSplitter", () => {
  it("splits simple LF lines and strips trailing CR", () => {
    const s = new JsonlSplitter();
    const lines = s.push('{"a":1}\n{"b":2}\r\n{"c":3}\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
    expect(s.end()).toEqual([]);
  });

  it("handles chunks split across record boundaries", () => {
    const s = new JsonlSplitter();
    expect(s.push('{"a":')).toEqual([]);
    expect(s.push('1}\n{"b":')).toEqual(['{"a":1}']);
    expect(s.push('2}\n')).toEqual(['{"b":2}']);
    expect(s.end()).toEqual([]);
  });

  it("handles multi-byte UTF-8 split across byte chunks", () => {
    const s = new JsonlSplitter();
    // '{"msg":"船"}\n' -> '船' is 3 bytes: 0xe8 0x88 0xb9
    const full = new TextEncoder().encode('{"msg":"船"}\n');
    const part1 = full.slice(0, 9); // cuts inside 船
    const part2 = full.slice(9);
    expect(s.push(part1)).toEqual([]);
    const lines = s.push(part2);
    expect(lines).toEqual(['{"msg":"船"}']);
    expect(JSON.parse(lines[0]!)).toEqual({ msg: "船" });
  });

  it("does NOT split on Unicode line separators U+2028 or U+2029 (docs/rpc.md:54)", () => {
    const s = new JsonlSplitter();
    // A string containing U+2028 (\u2028) and U+2029 (\u2029) must remain one single line
    const payload = '{"text":"line1\\u2028line2\\u2029line3"}\n';
    const lines = s.push(payload);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({ text: "line1\u2028line2\u2029line3" });
  });

  it("returns trailing content without LF in end()", () => {
    const s = new JsonlSplitter();
    expect(s.push('{"a":1}')).toEqual([]);
    expect(s.end()).toEqual(['{"a":1}']);
  });

  it("serializeRecord appends newline", () => {
    expect(serializeRecord({ id: "1", type: "prompt" })).toBe('{"id":"1","type":"prompt"}\n');
  });
});
