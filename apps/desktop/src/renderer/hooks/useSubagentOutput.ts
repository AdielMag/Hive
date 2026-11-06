import { useEffect, useMemo, useRef, useState } from "react";
import { messagesToTimeline, type AnyMessage, type Timeline } from "@hive/pi-adapter";
import { getSubagentDetails, parseOutputLines, type SubagentView } from "../lib/ai/subagents.ts";
import { useSessionStore } from "../store/session-store.ts";

export interface SubagentSessionContext {
  key?: string | null;
  sessionPath?: string | null;
}

interface SubagentOutputState {
  timeline: Timeline;
  prompt?: string;
  loading: boolean;
  error: string | null;
}

const EMPTY_TIMELINE: Timeline = { items: [], toolResults: {} };

/**
 * Loads and streams the nested transcript for a subagent run.
 * Prefers in-memory messages directly from SubagentDetails (from live streaming or tool results),
 * and falls back to reading .output JSONL files on disk for legacy pi-subagents sessions.
 */
export function useSubagentOutput(
  view: SubagentView,
  expanded: boolean,
  context?: SubagentSessionContext,
  resultIndex = 0,
): SubagentOutputState {
  const storeActiveKey = useSessionStore((s) => s.activeKey);
  const activeTab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const liveTool = useSessionStore((s) => (view.toolCallId ? s.transcript.tools[view.toolCallId] : undefined));

  const effectiveSessionPath = context?.sessionPath ?? (activeTab?.kind === "subagent" ? activeTab?.parentSessionPath : activeTab?.sessionPath);
  const effectiveKey = context?.key ?? (activeTab?.kind === "subagent" ? activeTab?.parentActiveKey : storeActiveKey);

  // Check live or view-provided in-memory subagent details
  // Only the unified `subagent` shape counts here; legacy Agent details must fall through to the disk path.
  const liveDetails =
    getSubagentDetails((liveTool?.result as { details?: unknown } | undefined)?.details) ||
    getSubagentDetails((liveTool?.partial as { details?: unknown } | undefined)?.details) ||
    view.subagentDetails;

  // Out-of-range index yields no transcript; never show another task's messages.
  const inMemoryResult = liveDetails?.results?.[resultIndex];
  const inMemoryMessages = inMemoryResult?.messages;
  const hasInMemoryData = Boolean(liveDetails);

  const [fileTimeline, setFileTimeline] = useState<Timeline>(EMPTY_TIMELINE);
  const [filePrompt, setFilePrompt] = useState<string | undefined>(undefined);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const memoryTimeline = useMemo(() => {
    if (!inMemoryMessages || inMemoryMessages.length === 0) return EMPTY_TIMELINE;
    return messagesToTimeline(inMemoryMessages, `subagent:${view.toolCallId}:${resultIndex}`);
  }, [inMemoryMessages, view.toolCallId, resultIndex]);

  const memoryPrompt = inMemoryResult?.task || view.prompt;
  const memoryError =
    inMemoryResult?.errorMessage ||
    (inMemoryResult && inMemoryResult.exitCode !== 0 && inMemoryResult.exitCode !== -1
      ? inMemoryResult.stderr || `Exited with code ${inMemoryResult.exitCode}`
      : null);

  const filePathRef = useRef<string | null>(view.outputFile ?? null);
  const offsetRef = useRef<number>(0);
  const messagesRef = useRef<AnyMessage[]>([]);
  const isRunning =
    view.status === "running" || view.status === "queued" || view.status === "background" || liveTool?.status === "running";

  // The viewer component can be reused for a different subagent: never carry over its file/messages.
  const ownerRef = useRef<string>(view.toolCallId);
  if (ownerRef.current !== view.toolCallId) {
    ownerRef.current = view.toolCallId;
    filePathRef.current = view.outputFile ?? null;
    offsetRef.current = 0;
    messagesRef.current = [];
  } else if (view.outputFile && filePathRef.current !== view.outputFile && messagesRef.current.length === 0) {
    filePathRef.current = view.outputFile;
    offsetRef.current = 0;
  }

  useEffect(() => {
    if (!expanded || hasInMemoryData) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const locateAndRead = async () => {
      try {
        if (!filePathRef.current) {
          if (!window.studio?.locateSubagentOutput) return;
          const ref = await window.studio.locateSubagentOutput({
            key: effectiveKey ?? undefined,
            sessionPath: effectiveSessionPath ?? undefined,
            agentId: view.agentId,
            outputFile: view.outputFile,
            prompt: view.prompt,
          });
          if (cancelled) return;
          if (ref) {
            filePathRef.current = ref.path;
          } else {
            if (!isRunning) {
              setFileError("Transcript not available");
            }
            return;
          }
        }

        const path = filePathRef.current;
        if (!path || !window.studio?.readSubagentOutput) return;

        let added = false;
        for (let i = 0; i < 64; i++) {
          const chunk = await window.studio.readSubagentOutput(path, offsetRef.current);
          if (cancelled) return;
          const progressed = chunk.nextOffset > offsetRef.current;
          offsetRef.current = chunk.nextOffset;
          if (chunk.lines.length > 0) {
            const parsed = parseOutputLines(chunk.lines);
            if (parsed.prompt) setFilePrompt((prev) => prev ?? parsed.prompt);
            messagesRef.current = [...messagesRef.current, ...parsed.messages];
            added = true;
          }
          if (!progressed || chunk.nextOffset >= chunk.size) break;
        }

        if (added) {
          setFileTimeline(messagesToTimeline(messagesRef.current, `subagent:${view.toolCallId}`));
          setFileError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[useSubagentOutput] Error reading subagent transcript:", err);
          if (messagesRef.current.length === 0) {
            setFileError("Failed to load subagent transcript");
          }
        }
      } finally {
        if (!cancelled) {
          setFileLoading(false);
          if (isRunning) {
            timer = setTimeout(locateAndRead, 1500);
          }
        }
      }
    };

    if (messagesRef.current.length === 0) {
      setFileTimeline(EMPTY_TIMELINE);
      setFilePrompt(undefined);
      setFileError(null);
    }
    setFileLoading(messagesRef.current.length === 0);
    void locateAndRead();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [expanded, hasInMemoryData, isRunning, effectiveKey, effectiveSessionPath, view.agentId, view.outputFile, view.prompt, view.toolCallId]);

  if (hasInMemoryData) {
    return {
      timeline: memoryTimeline,
      prompt: memoryPrompt,
      loading: Boolean(isRunning && inMemoryMessages && inMemoryMessages.length === 0),
      error: memoryError,
    };
  }

  return {
    timeline: fileTimeline,
    prompt: filePrompt,
    loading: fileLoading,
    error: fileError,
  };
}
