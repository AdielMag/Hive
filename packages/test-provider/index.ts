/**
 * Studio test provider: a Pi extension loaded with `-e` in E2E and contract tests.
 *
 * Registers two scripted offline models built on Pi's own `fauxProvider` (no network, no tokens):
 *   studio-test/scripted-1       fast streaming
 *   studio-test-slow/scripted-slow  slow streaming (for steer/queue/abort tests)
 *
 * Behavior is chosen from the last user message:
 *   contains "[tool]"    -> calls the `read` tool on README.md, then summarizes the result
 *   contains "[error]"   -> ends with an error stop reason
 *   contains "[linked]"  -> reports whether a <linked_projects> system-prompt section is present
 *   contains "[long]"    -> a long multi-paragraph answer
 *   otherwise            -> thinking + a short echo of the prompt
 *
 * Also registers commands for extension-UI tests:
 *   /test-dialog  -> ctx.ui.select(...) then ctx.ui.notify(choice)
 *   /test-status  -> ctx.ui.setStatus + ctx.ui.setWidget
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
  fauxToolCall,
  getCurrentSystemPrompt,
} from "@earendil-works/pi-ai";

type LooseMessage = { role: string; content?: unknown; toolName?: string };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => (b as { type?: string })?.type === "text")
    .map((b) => b.text)
    .join("\n");
}

const LONG_ANSWER = Array.from(
  { length: 12 },
  (_, i) =>
    `Paragraph ${i + 1}. The scripted model streams this text slowly so tests can steer, queue follow-ups, or abort mid-run without any network access.`,
).join("\n\n");

let toolCallCounter = 0;

function respond(context: { messages: readonly unknown[] }) {
  const messages = context.messages as readonly LooseMessage[];
  const last = messages[messages.length - 1];

  if (last?.role === "toolResult") {
    const firstLine = textOf(last.content).split("\n")[0] ?? "";
    return fauxAssistantMessage([fauxText(`I read the file with ${last.toolName}. First line: ${firstLine}`)]);
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const prompt = textOf(lastUser?.content).trim();

  if (prompt.includes("[tool]")) {
    toolCallCounter += 1;
    return fauxAssistantMessage(
      [fauxThinking("The user wants me to read README.md."), fauxToolCall("read", { path: "README.md" }, { id: `call_test_${toolCallCounter}` })],
      { stopReason: "toolUse" },
    );
  }
  if (prompt.includes("[error]")) {
    return fauxAssistantMessage([fauxText("Starting, then failing on purpose.")], {
      stopReason: "error",
      errorMessage: "Scripted failure from studio-test",
    });
  }
  if (prompt.includes("[linked]")) {
    const system = getCurrentSystemPrompt(context.messages as never);
    return fauxAssistantMessage([fauxText(`linked_projects present: ${system.includes("<linked_projects>")}`)]);
  }
  if (prompt.includes("[long]")) {
    return fauxAssistantMessage([fauxThinking("Writing a long answer."), fauxText(LONG_ANSWER)]);
  }
  return fauxAssistantMessage([
    fauxThinking("Thinking about the prompt."),
    fauxText(`Echo: ${prompt || "(empty prompt)"}`),
  ]);
}

function registerScripted(
  pi: ExtensionAPI,
  provider: string,
  model: { id: string; name: string },
  tokensPerSecond: number,
): void {
  const faux = fauxProvider({
    provider,
    models: [
      {
        id: model.id,
        name: model.name,
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 200_000,
        maxTokens: 8192,
        cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
      },
    ],
    tokensPerSecond,
  });
  // One factory step per model call; plenty for any test run.
  faux.setResponses(Array.from({ length: 1000 }, () => respond));
  pi.registerProvider(faux.provider);
}

export default function studioTestProvider(pi: ExtensionAPI): void {
  registerScripted(pi, "studio-test", { id: "scripted-1", name: "Studio Scripted Model" }, 4000);
  registerScripted(pi, "studio-test-slow", { id: "scripted-slow", name: "Studio Scripted Model (slow)" }, 30);

  pi.registerCommand("test-dialog", {
    description: "Studio test: show a select dialog and report the choice",
    handler: async (_args, ctx) => {
      const choice = await ctx.ui.select("Pick a color", ["red", "green", "blue"]);
      ctx.ui.notify(`You picked ${choice ?? "nothing"}`, "info");
    },
  });

  pi.registerCommand("test-status", {
    description: "Studio test: set a status item and a widget",
    handler: async (args, ctx) => {
      ctx.ui.setStatus("studio-test", `test status: ${args || "on"}`);
      ctx.ui.setWidget("studio-test", ["Studio test widget", `args: ${args || "(none)"}`], {
        placement: "aboveEditor",
      });
    },
  });
}
