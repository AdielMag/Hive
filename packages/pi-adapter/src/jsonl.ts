/**
 * Strict JSONL framing for Pi's RPC stdout (docs/rpc.md:54).
 *
 * Records are split on LF only. An optional preceding CR is stripped. Unicode line/paragraph
 * separators (U+2028/U+2029) are valid inside JSON strings and must NOT split records, which is
 * why Node's `readline` is unsuitable. Uses TextDecoder so multi-byte characters split across
 * chunks are decoded correctly. Browser-safe (no Node imports).
 */
export class JsonlSplitter {
  private readonly decoder = new TextDecoder("utf-8");
  private buffer = "";

  /** Feed a chunk; returns every complete, non-empty line. */
  push(chunk: Uint8Array | string): string[] {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.decode(chunk, { stream: true });
    return this.drain();
  }

  /** Flush at end of stream; a trailing record without LF is still returned. */
  end(): string[] {
    this.buffer += this.decoder.decode();
    const lines = this.drain();
    const rest = stripCr(this.buffer);
    this.buffer = "";
    if (rest.length > 0) lines.push(rest);
    return lines;
  }

  private drain(): string[] {
    const lines: string[] = [];
    let start = 0;
    let index = this.buffer.indexOf("\n", start);
    while (index !== -1) {
      const line = stripCr(this.buffer.slice(start, index));
      if (line.length > 0) lines.push(line);
      start = index + 1;
      index = this.buffer.indexOf("\n", start);
    }
    this.buffer = start === 0 ? this.buffer : this.buffer.slice(start);
    return lines;
  }
}

function stripCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/** Serialize one record. JSON.stringify never emits a raw LF, so one record is one line. */
export function serializeRecord(record: unknown): string {
  return `${JSON.stringify(record)}\n`;
}
