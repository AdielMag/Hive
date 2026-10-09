import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ToolCardCall } from "@hive/module-sdk/renderer";
import { InView, JevToolCard, OutView, RawView } from "./JevToolCard.tsx";
import { answerChip, buildCardModel, rankedChoices, scoreLevels, summaryText } from "./jev-card-model.ts";

const args = {
  questions: {
    buggy: { type: "noul", instructions: "Is it buggy?", true_means: "has a defect" },
    lang: { type: "choice", instructions: "Language?", options: { python: "Python", go: "Go" } },
    severity: { type: "score", instructions: "How bad?", levels: ["minor", "major", "critical"] },
  },
  files: ["a.py", "b.py"],
  command: "git diff --stat",
};
const answers = {
  buggy: { type: "noul", noul: 0.96 },
  lang: { type: "choice", choice: "python", confidence: 0.88, probabilities: { python: 0.88, go: 0.12 } },
  severity: { type: "score", score: 1.1, confidence: 0.7, legend: {}, probabilities: { "0": 0.1, "1": 0.7, "2": 0.2 } },
};
const oldDetails = { answers, inputTokens: 1200, outputTokens: 9, ms: 428 };
const newDetails = {
  ...oldDetails,
  model: "jev-1.13.0",
  questions: { buggy: "noul", lang: "choice", severity: "score" },
  sources: {
    stateChars: 0,
    files: [
      { path: "a.py", bytes: 2048, preview: "print('a')", truncated: false },
      { path: "b.py", bytes: 100, preview: "print('b')", truncated: false },
    ],
    command: { command: "git diff --stat", bytes: 52, preview: " a.py | 2 +-", truncated: false },
  },
  savedTokensEst: 550,
  confidence: { buggy: 0.96, lang: 0.88, severity: 0.7 },
};

const call = (over: Partial<ToolCardCall>): ToolCardCall => ({ id: "c1", name: "ask_jev", arguments: args, complete: true, running: false, ...over });
const done = (details: unknown, isError = false) => call({ result: { text: "buggy: p(yes)=0.960", isError, details } });

describe("ask_jev card model", () => {
  it("builds chips and the summary from new details", () => {
    const m = buildCardModel(done(newDetails));
    expect(m.status).toBe("done");
    expect(m.tabs).toEqual(["in", "out", "raw"]);
    expect(m.defaultTab).toBe("out");
    expect(m.answers.map(answerChip)).toEqual(["buggy 96% yes", "lang python", "severity major"]);
    expect(summaryText(m)).toBe("3 questions · 2 files · git diff --stat");
    expect(m.ms).toBe(428);
  });

  it("degrades for old details (answers only) and missing details", () => {
    const old = buildCardModel(done(oldDetails));
    expect(old.tabs).toEqual(["in", "out", "raw"]);
    expect(old.sources).toBeUndefined();
    expect(old.answers[0]!.confidence).toBeCloseTo(0.96);
    expect(buildCardModel(done(undefined)).tabs).toEqual(["raw"]);
    expect(buildCardModel(done("junk")).tabs).toEqual(["raw"]);
  });

  it("shows In while running and the error for failed calls", () => {
    const running = buildCardModel(call({ running: true }));
    expect(running.status).toBe("running");
    expect(running.tabs).toEqual(["in", "raw"]);
    const failed = buildCardModel(done({ error: "Jev call failed: HTTP 500", errorKind: "api" }, true));
    expect(failed.status).toBe("error");
    expect(failed.error).toBe("Jev call failed: HTTP 500");
    expect(failed.tabs).toEqual(["in", "raw"]);
  });

  it("ranks choices and lays out score levels", () => {
    const m = buildCardModel(done(newDetails));
    const lang = m.answers[1]!;
    const sev = m.answers[2]!;
    if (lang.answer.type !== "choice" || sev.answer.type !== "score") throw new Error("shape");
    expect(rankedChoices(lang.answer, lang.question)).toEqual([["python", 0.88], ["go", 0.12]]);
    expect(scoreLevels(sev.answer, sev.question)).toEqual([
      { label: "minor", p: 0.1 },
      { label: "major", p: 0.7 },
      { label: "critical", p: 0.2 },
    ]);
    expect(answerChip({ name: "x", answer: { type: "noul", noul: 0.2 }, confidence: 0.8 })).toBe("x 80% no");
  });
});

describe("JevToolCard render", () => {
  const RawBody = () => createElement("div", { className: "raw-stub" }, "RAW");
  const html = (c: ToolCardCall) => renderToStaticMarkup(createElement(JevToolCard, { host: {} as never, call: c, RawBody }));

  it("renders the collapsed row for new, old and detail-less calls", () => {
    const rich = html(done(newDetails));
    expect(rich).toContain("Ask Jev");
    expect(rich).toContain("buggy 96% yes");
    expect(rich).toContain("severity major");
    expect(rich).toContain("428ms");
    const old = html(done(oldDetails));
    expect(old).toContain("lang python");
    const bare = html(done(undefined));
    expect(bare).toContain("Ask Jev");
    expect(bare).toContain("3 questions");
    expect(bare).not.toContain("jev-chip");
  });

  it("renders a spinner while running and the error when failed", () => {
    expect(html(call({ running: true }))).toContain("jev-spin");
    expect(html(done({ error: "Jev call failed: HTTP 500", errorKind: "api" }, true))).toContain("Jev call failed: HTTP 500");
  });

  it("renders In, Out and Raw panes", () => {
    const m = buildCardModel(done(newDetails));
    const inHtml = renderToStaticMarkup(createElement(InView, { m }));
    expect(inHtml).toContain("Is it buggy?");
    expect(inHtml).toContain("has a defect");
    expect(inHtml).toContain("a.py");
    expect(inHtml).toContain("2.0 KB");
    expect(inHtml).toContain("print(&#x27;a&#x27;)");
    expect(inHtml).toContain("$ git diff --stat");
    const outHtml = renderToStaticMarkup(createElement(OutView, { m }));
    expect(outHtml).toContain("96% yes");
    expect(outHtml).toContain("is-winner");
    expect(outHtml).toContain("jev-scale__marker");
    expect(outHtml).toContain("jev-1.13.0");
    expect(outHtml).toContain("tokens saved (est.)");
    const raw = renderToStaticMarkup(createElement(RawView, { m, RawBody }));
    expect(raw).toContain("RAW");
    expect(raw).toContain("savedTokensEst");

    // Old call: In from arguments only (paths, no sizes), Out from answers without the new footer fields.
    const old = buildCardModel(done(oldDetails));
    const oldIn = renderToStaticMarkup(createElement(InView, { m: old }));
    expect(oldIn).toContain("b.py");
    expect(oldIn).not.toContain("KB");
    const oldOut = renderToStaticMarkup(createElement(OutView, { m: old }));
    expect(oldOut).toContain("lang");
    expect(oldOut).not.toContain("saved");
  });
});

describe("ask_jev batch card", () => {
  const RawBody = () => createElement("div", { className: "raw-stub" }, "RAW");
  const html = (c: ToolCardCall) => renderToStaticMarkup(createElement(JevToolCard, { host: {} as never, call: c, RawBody }));
  const batchArgs = {
    questions: args.questions,
    items: [
      { id: "a.py", files: ["a.py"] },
      { id: "b.py", command: "git diff -- b.py" },
      { id: "c.py", files: ["c.py"] },
    ],
  };
  const batchDetails = {
    inputTokens: 300,
    outputTokens: 30,
    ms: 900,
    model: "jev-1.13.0",
    questions: { buggy: "noul", lang: "choice", severity: "score" },
    savedTokensEst: 700,
    batch: [
      { id: "a.py", answers, confidence: { buggy: 0.96 }, inputTokens: 100, outputTokens: 10, ms: 400, sources: { stateChars: 0, files: [{ path: "a.py", bytes: 2048, preview: "print('a')", truncated: false }] } },
      { id: "b.py", answers, inputTokens: 100, outputTokens: 10, ms: 300, sources: { stateChars: 0, files: [], command: { command: "git diff -- b.py", bytes: 52, preview: "+x", truncated: false } } },
      { id: "c.py", error: "Could not gather content: nope", errorKind: "gather", inputTokens: 0, outputTokens: 0, ms: 2 },
    ],
  };
  const batchCall = (over: Partial<ToolCardCall> = {}): ToolCardCall =>
    call({ arguments: batchArgs, result: { text: "[a.py] ...", isError: false, details: batchDetails }, ...over });

  it("models items, the failure count and tabs", () => {
    const m = buildCardModel(batchCall());
    expect(m.batch).toBe(true);
    expect(m.status).toBe("done");
    expect(m.answers).toEqual([]);
    expect(m.items.map((i) => [i.id, i.status])).toEqual([["a.py", "done"], ["b.py", "done"], ["c.py", "error"]]);
    expect(m.failedItems).toBe(1);
    expect(m.items[0]!.answers.map(answerChip)).toEqual(["buggy 96% yes", "lang python", "severity major"]);
    expect(summaryText(m)).toBe("3 questions · 3 items · 1 failed");
    expect(m.tabs).toEqual(["in", "out", "raw"]);
    expect(m.ms).toBe(900);
  });

  it("shows pending items while running and an error when the whole batch is refused", () => {
    const running = buildCardModel(batchCall({ running: true, result: undefined }));
    expect(running.status).toBe("running");
    expect(running.tabs).toEqual(["in", "raw"]);
    expect(running.items.every((i) => i.status === "pending")).toBe(true);
    const refused = buildCardModel(batchCall({ result: { text: "x", isError: true, details: { error: "Daily Jev call limit: 4 calls left today", errorKind: "cap" } } }));
    expect(refused.status).toBe("error");
    expect(refused.error).toMatch(/4 calls left/);
    expect(refused.failedItems).toBe(0);
    const allFailed = buildCardModel(batchCall({ result: { text: "x", isError: true, details: { batch: batchDetails.batch.map((b) => ({ ...b, answers: undefined, error: "e" })) } } }));
    expect(allFailed.error).toBe("all 3 items failed");
  });

  it("renders the collapsed row, In and Out panes for a batch", () => {
    const row = html(batchCall());
    expect(row).toContain("3 items");
    expect(row).toContain("1 failed");
    expect(row).toContain("900ms");
    const m = buildCardModel(batchCall());
    const inHtml = renderToStaticMarkup(createElement(InView, { m }));
    expect(inHtml).toContain("Items (3)");
    expect(inHtml).toContain("a.py");
    expect(inHtml).toContain("2.0 KB");
    expect(inHtml).toContain("$ git diff -- b.py");
    expect(inHtml).toContain("Could not gather content: nope");
    const outHtml = renderToStaticMarkup(createElement(OutView, { m }));
    expect((outHtml.match(/<details/g) ?? []).length).toBe(3);
    expect(outHtml).toContain("buggy 96% yes");
    expect(outHtml).toContain("is-winner");
    expect(outHtml).toContain("Could not gather content: nope");
    expect(outHtml).toContain("jev-1.13.0");
    expect(outHtml).toContain("tokens saved (est.)");
    const raw = renderToStaticMarkup(createElement(RawView, { m, RawBody }));
    expect(raw).toContain("RAW");
    expect(raw).toContain("batch");
  });

  it("leaves old single-item and detail-less cards as before", () => {
    const old = buildCardModel(done(oldDetails));
    expect(old.batch).toBe(false);
    expect(old.items).toEqual([]);
    expect(summaryText(old)).toBe("3 questions · 2 files · git diff --stat");
    expect(html(done(oldDetails))).not.toContain(" items");
    expect(html(done(undefined))).toContain("3 questions");
    expect(html(done(undefined))).not.toContain("jev-group");
  });
});
