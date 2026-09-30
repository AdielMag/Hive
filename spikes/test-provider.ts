import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxThinking, getCurrentSystemPrompt } from "@earendil-works/pi-ai";

// Deterministic offline provider for GUI E2E tests (no network, no tokens spent).
export default function (pi: ExtensionAPI) {
  const faux = fauxProvider({
    provider: "studio-test",
    models: [{ id: "scripted-1", name: "Studio Scripted Model", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 8192 }],
    tokensPerSecond: 400,
  });
  const reply = (context: any) => {
    const sys = getCurrentSystemPrompt(context.messages);
    const hasLinked = sys.includes("<linked_projects>");
    return fauxAssistantMessage([
      fauxThinking("Checking the system prompt for linked projects."),
      fauxText(`linked_projects section present: ${hasLinked}. System prompt chars: ${sys.length}.`),
    ]);
  };
  faux.setResponses([reply, reply, reply]);
  pi.registerProvider(faux.provider);
}
