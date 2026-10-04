import { describe, expect, it } from "vitest";
import {
  agentAnswerKey,
  buildAnswersPayload,
  buildChoicesPayload,
  buildQuestionsPayload,
  countUnansweredAgentQuestions,
  decisionProgress,
  hasReviewActivity,
  isDecisionResolved,
  pendingRounds,
  reconcileSelections,
  resolveChoice,
} from "./plan-review.ts";
import type { DecisionItem } from "./plan-utils.ts";
import type { PlanQuestionRound } from "./shared.ts";

describe("plan-review", () => {
  const sampleChoice: DecisionItem = {
    id: "D1",
    key: "d-cache-store",
    type: "choice",
    title: "Cache store",
    prompt: "Which cache?",
    options: [
      { label: "Redis", detail: "Fast in-memory", text: "Redis: Fast in-memory", isRecommended: true, isPreselected: true, rawLine: "" },
      { label: "SQLite", detail: "Zero dependencies", text: "SQLite: Zero dependencies", isRecommended: false, isPreselected: false, rawLine: "" },
    ],
    rawBlock: "",
  };

  const sampleQuestion: DecisionItem = {
    id: "Q1",
    key: "q-retention",
    type: "question",
    title: "Retention",
    prompt: "How many days?",
    options: [],
    rawBlock: "",
  };

  describe("resolveChoice & isDecisionResolved", () => {
    it("falls back to preselected default if user made no explicit pick", () => {
      const resolved = resolveChoice(sampleChoice, {});
      expect(resolved).not.toBeNull();
      expect(resolved?.source).toBe("default");
      expect(resolved?.option.label).toBe("Redis");
      expect(isDecisionResolved(sampleChoice, {}, {})).toBe(true);
    });

    it("uses user selection when chosen", () => {
      const selections = {
        [sampleChoice.key]: { title: sampleChoice.title, label: "SQLite", text: "SQLite: Zero dependencies" },
      };
      const resolved = resolveChoice(sampleChoice, selections);
      expect(resolved?.source).toBe("user");
      expect(resolved?.option.label).toBe("SQLite");
    });

    it("evaluates open question resolution based on non-empty answer", () => {
      expect(isDecisionResolved(sampleQuestion, {}, {})).toBe(false);
      expect(isDecisionResolved(sampleQuestion, {}, { [sampleQuestion.key]: "30 days" })).toBe(true);
      expect(isDecisionResolved(sampleQuestion, {}, { [sampleQuestion.key]: "   " })).toBe(false);
    });
  });

  describe("decisionProgress & reconcileSelections", () => {
    it("calculates progress correctly", () => {
      const progress = decisionProgress([sampleChoice, sampleQuestion], {}, {});
      expect(progress.done).toBe(1); // sampleChoice is resolved via default
      expect(progress.total).toBe(2);
      expect(progress.open).toEqual([sampleQuestion]);
    });

    it("drops invalid selections when options change during a revision", () => {
      const selections = {
        [sampleChoice.key]: { title: sampleChoice.title, label: "NonExistent", text: "NonExistent" },
      };
      const reconciled = reconcileSelections([sampleChoice], selections);
      expect(reconciled[sampleChoice.key]).toBeUndefined();
    });
  });

  describe("hasReviewActivity", () => {
    it("returns true on comment or notes", () => {
      expect(hasReviewActivity([], {}, {}, [], "Needs more tests")).toBe(true);
      expect(hasReviewActivity([], {}, {}, [{ id: "n1", selectedText: "foo", question: "why?" }], "")).toBe(true);
    });

    it("returns true when user deviates from the default choice", () => {
      const defaultSelections = {};
      expect(hasReviewActivity([sampleChoice], defaultSelections, {}, [], "")).toBe(false);

      const modifiedSelections = {
        [sampleChoice.key]: { title: sampleChoice.title, label: "SQLite", text: "SQLite: Zero dependencies" },
      };
      expect(hasReviewActivity([sampleChoice], modifiedSelections, {}, [], "")).toBe(true);
    });
  });

  describe("payload builders", () => {
    it("builds choices payload including defaults and custom selections", () => {
      const choices = buildChoicesPayload([sampleChoice], {
        [sampleChoice.key]: { title: sampleChoice.title, label: "SQLite", text: "SQLite: Zero dependencies" },
      });
      expect(choices).toEqual([
        { id: "D1", title: "Cache store", selected: "SQLite: Zero dependencies" },
      ]);
    });

    it("builds questions payload with question prompt and notes", () => {
      const questions = buildQuestionsPayload(
        [sampleQuestion],
        { [sampleQuestion.key]: "Keep 14 days" },
        [{ id: "note-1", selectedText: "line of code", question: "Can we simplify?" }],
      );
      expect(questions).toEqual([
        { id: "Q1", question: "How many days?", answer: "Keep 14 days" },
        { id: "note-1", question: "Can we simplify?", selectedText: "line of code" },
      ]);
    });

    it("builds answers payload with roundId and handles count of unanswered agent questions", () => {
      const rounds: PlanQuestionRound[] = [
        {
          roundId: 101,
          status: "pending",
          fileVersion: 1,
          timestamp: new Date().toISOString(),
          questions: [
            { id: "ask-1", title: "Feature flag", question: "Ship behind flag?" },
            { id: "ask-2", title: "DB", question: "Which DB?" },
          ],
        },
      ];

      expect(pendingRounds(rounds)).toHaveLength(1);

      const answersMap = {
        [agentAnswerKey(101, "ask-1")]: "Yes, flag it",
      };

      expect(countUnansweredAgentQuestions(rounds, answersMap)).toBe(1);

      const payload = buildAnswersPayload(rounds, answersMap);
      expect(payload).toEqual([
        {
          id: "ask-1",
          roundId: 101,
          title: "Feature flag",
          selected: "Yes, flag it",
          answer: "Yes, flag it",
        },
      ]);
    });
  });
});
