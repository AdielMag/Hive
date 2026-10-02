import { useEffect, useRef, useState } from "react";
import { messagesToTimeline, type AnyMessage, type Timeline } from "@hive/pi-adapter";
import { parseOutputLines, type SubagentView } from "../lib/ai/subagents.ts";
import { useSessionStore } from "../store/session-store.ts";

interface SubagentOutputState {
  timeline: Timeline;
  prompt?: string;
  loading: boolean;
  error: string | null;
}

const EMPTY_TIMELINE: Timeline = { items: [], toolResults: {} };

/**
 * Loads and streams the nested transcript from a subagent's `.output` JSONL file.
 * Polls for updates while the subagent is running and the card is expanded.
 */
export function useSubagentOutput(view: SubagentView, expanded: boolean): SubagentOutputState {
  const activeKey = useSessionStore((s) => s.activeKey);
  const activeTab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const sessionPath = activeTab?.sessionPath;

  const [timeline, setTimeline] = useState<Timeline>(EMPTY_TIMELINE);
  const [prompt, setPrompt] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filePathRef = useRef<string | null>(view.outputFile ?? null);
  const offsetRef = useRef<number>(0);
  const messagesRef = useRef<AnyMessage[]>([]);
  const isRunning =
    view.status === "running" || view.status === "queued" || view.status === "background";

  useEffect(() => {
    if (!expanded) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const locateAndRead = async () => {
      try {
        if (!filePathRef.current) {
          if (!window.studio?.locateSubagentOutput) return;
          const ref = await window.studio.locateSubagentOutput({
            key: activeKey ?? undefined,
            sessionPath: sessionPath ?? undefined,
            agentId: view.agentId,
            outputFile: view.outputFile,
            prompt: view.prompt,
          });
          if (cancelled) return;
          if (ref) {
            filePathRef.current = ref.path;
          } else {
            if (!isRunning) {
              setError("Transcript not available");
            }
            return;
          }
        }

        const path = filePathRef.current;
        if (!path || !window.studio?.readSubagentOutput) return;

        // Drain everything available (the main process returns at most ~1 MB per chunk), so a
        // finished subagent with a large transcript is loaded completely, not just its first chunk.
        let added = false;
        for (let i = 0; i < 64; i++) {
          const chunk = await window.studio.readSubagentOutput(path, offsetRef.current);
          if (cancelled) return;
          const progressed = chunk.nextOffset > offsetRef.current;
          offsetRef.current = chunk.nextOffset;
          if (chunk.lines.length > 0) {
            const parsed = parseOutputLines(chunk.lines);
            // Only the first user message is the task prompt; later ones are steering messages.
            if (parsed.prompt) setPrompt((prev) => prev ?? parsed.prompt);
            messagesRef.current = [...messagesRef.current, ...parsed.messages];
            added = true;
          }
          if (!progressed || chunk.nextOffset >= chunk.size) break;
        }

        if (added) {
          setTimeline(messagesToTimeline(messagesRef.current, `subagent:${view.toolCallId}`));
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[useSubagentOutput] Error reading subagent transcript:", err);
          if (messagesRef.current.length === 0) {
            setError("Failed to load subagent transcript");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          // If still running, schedule next poll
          if (isRunning) {
            timer = setTimeout(locateAndRead, 1500);
          }
        }
      }
    };

    setLoading(messagesRef.current.length === 0);
    void locateAndRead();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [expanded, isRunning, activeKey, sessionPath, view.agentId, view.outputFile, view.prompt, view.toolCallId]);

  return { timeline, prompt, loading, error };
}
