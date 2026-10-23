import { buildTimeline, createTranscript, type Timeline, type TranscriptState } from "@hive/pi-adapter";

/**
 * Shared, incremental timeline builder. The persisted part (entries + live messages) is built once per
 * stable input set and shared by every consumer; only the streaming message is re-created per batch.
 */
type BaseEntry = {
  byId: TranscriptState["byId"];
  order: TranscriptState["order"];
  leafId: string | null;
  live: TranscriptState["live"];
  running: boolean;
  hasStreaming: boolean;
  timeline: Timeline;
};

const MAX_BASES = 4;
const bases: BaseEntry[] = [];
const finals = new WeakMap<TranscriptState, Timeline>();

function baseFor(t: TranscriptState): BaseEntry {
  const hasStreaming = !!t.streaming;
  const hit = bases.findIndex(
    (b) =>
      b.byId === t.byId &&
      b.order === t.order &&
      b.leafId === t.leafId &&
      b.live === t.live &&
      b.running === t.running &&
      b.hasStreaming === hasStreaming,
  );
  if (hit >= 0) {
    const [entry] = bases.splice(hit, 1);
    bases.unshift(entry!);
    return entry!;
  }
  // A placeholder streaming message keeps flush/turn-divider semantics identical to a full build;
  // the real streaming item replaces its last item below.
  const placeholder = t.streaming ? { message: { ...t.streaming.message, content: [] } } : null;
  const entry: BaseEntry = {
    byId: t.byId,
    order: t.order,
    leafId: t.leafId,
    live: t.live,
    running: t.running,
    hasStreaming,
    timeline: buildTimeline({ ...t, streaming: placeholder }),
  };
  bases.unshift(entry);
  if (bases.length > MAX_BASES) bases.pop();
  return entry;
}

export function getTimeline(transcript: TranscriptState): Timeline {
  const cached = finals.get(transcript);
  if (cached) return cached;
  const base = baseFor(transcript).timeline;
  let result = base;
  if (transcript.streaming) {
    const live = buildTimeline({ ...createTranscript(), streaming: transcript.streaming }).items[0];
    if (live) result = { items: [...base.items.slice(0, -1), live], toolResults: base.toolResults };
  }
  finals.set(transcript, result);
  return result;
}
