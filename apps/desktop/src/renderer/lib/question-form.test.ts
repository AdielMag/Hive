import { describe, expect, it } from "vitest";
import { isStudioFormCancel, isStudioFormRequest, type StudioFormRequest } from "@hive/protocol";
import { buildFormAnswers, countAnswered, isAnswered } from "./question-form.ts";

const form: StudioFormRequest = {
  kind: "form",
  id: "f1",
  questions: [
    { id: "scope", label: "Scope", prompt: "Which scope?", allowOther: true, options: [{ value: "a", label: "Table" }, { value: "b", label: "Filter" }] },
    { id: "dates", label: "Dates", prompt: "Which dates?", allowOther: false, options: [{ value: "all", label: "All" }] },
  ],
};

describe("question form answers", () => {
  it("is incomplete until every question is answered", () => {
    expect(buildFormAnswers(form, {})).toBeNull();
    expect(buildFormAnswers(form, { scope: { choice: 0, other: "" } })).toBeNull();
    expect(countAnswered(form, { scope: { choice: 0, other: "" } })).toBe(1);
  });

  it("maps option picks to value, label and 1-based index", () => {
    const answers = buildFormAnswers(form, { scope: { choice: 1, other: "" }, dates: { choice: 0, other: "" } });
    expect(answers).toEqual([
      { id: "scope", value: "b", label: "Filter", wasCustom: false, index: 2 },
      { id: "dates", value: "all", label: "All", wasCustom: false, index: 1 },
    ]);
  });

  it("uses trimmed custom text, and rejects an empty custom answer", () => {
    expect(isAnswered({ choice: "other", other: "   " }, 2)).toBe(false);
    const answers = buildFormAnswers(form, { scope: { choice: "other", other: "  both  " }, dates: { choice: 0, other: "" } });
    expect(answers?.[0]).toEqual({ id: "scope", value: "both", label: "both", wasCustom: true });
  });

  it("ignores stale text in the Other row when an option is selected", () => {
    const answers = buildFormAnswers(form, { scope: { choice: 0, other: "leftover" }, dates: { choice: 0, other: "" } });
    expect(answers?.[0]?.wasCustom).toBe(false);
  });

  it("rejects out-of-range option indexes", () => {
    expect(isAnswered({ choice: 5, other: "" }, 2)).toBe(false);
  });
});

describe("form payload guards", () => {
  it("accepts well-formed requests and rejects junk from third-party extensions", () => {
    expect(isStudioFormRequest(form)).toBe(true);
    expect(isStudioFormRequest({ kind: "form", id: "x", questions: [{ id: "q", prompt: "p", options: [{ value: 1 }] }] })).toBe(false);
    expect(isStudioFormRequest({ kind: "other" })).toBe(false);
    expect(isStudioFormRequest(null)).toBe(false);
    const q = form.questions[0]!;
    const bad = (patch: object) => isStudioFormRequest({ ...form, questions: [{ ...q, ...patch }] });
    expect(bad({})).toBe(true);
    expect(bad({ prompt: { x: 1 } })).toBe(false); // would crash React if rendered
    expect(bad({ label: 5 })).toBe(false);
    expect(bad({ allowOther: undefined })).toBe(false);
    expect(bad({ options: [{ value: "a", label: "A", description: {} }] })).toBe(false);
    expect(bad({ options: [], allowOther: false })).toBe(false); // unanswerable
    expect(bad({ options: [], allowOther: true })).toBe(true); // free text only
    expect(isStudioFormRequest({ ...form, title: {} })).toBe(false);
    expect(isStudioFormRequest({ ...form, questions: [] })).toBe(false);
    expect(isStudioFormRequest({ ...form, questions: [q, { ...q }] })).toBe(false); // duplicate ids
    expect(isStudioFormCancel({ kind: "form_cancel", id: "f1" })).toBe(true);
    expect(isStudioFormCancel({ kind: "form_cancel" })).toBe(false);
  });
});
