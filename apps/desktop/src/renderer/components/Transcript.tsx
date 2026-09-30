import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Terminal, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useSessionStore } from "../store/session-store.ts";
import { buildTimeline, type TimelineItem, type ToolResultView } from "@pi-studio/pi-adapter";

export const Transcript: React.FC = () => {
  const { transcript } = useSessionStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const timeline = buildTimeline(transcript);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline.items.length, transcript.streaming]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {timeline.items.length === 0 && !transcript.running && (
        <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-secondary)" }}>Pi Studio</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Ask Pi a question or give it a task in this project.</div>
        </div>
      )}

      {timeline.items.map((item) => (
        <TimelineRow key={item.key} item={item} toolResults={timeline.toolResults} />
      ))}

      <div ref={bottomRef} style={{ height: 1 }} />
    </div>
  );
};

const TimelineRow: React.FC<{ item: TimelineItem; toolResults: Record<string, ToolResultView> }> = ({
  item,
  toolResults,
}) => {
  switch (item.kind) {
    case "user":
      return (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div
            style={{
              maxWidth: "80%",
              background: "var(--accent-subtle)",
              border: "1px solid rgba(83, 155, 245, 0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {item.images && item.images.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {item.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt="attachment"
                    style={{
                      maxHeight: 240,
                      maxWidth: "100%",
                      borderRadius: 6,
                      border: "1px solid var(--border-subtle)",
                      objectFit: "contain",
                      background: "rgba(0, 0, 0, 0.2)",
                    }}
                  />
                ))}
              </div>
            )}
            {item.text && <div>{item.text}</div>}
          </div>
        </div>
      );

    case "assistant":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: "90%" }}>
          {item.blocks.map((block, idx) => {
            if (block.type === "thinking") {
              return <ThinkingBlock key={idx} text={block.thinking} />;
            }
            if (block.type === "text") {
              return (
                <div key={idx} style={{ lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {block.text}
                </div>
              );
            }
            if (block.type === "toolCall") {
              const res = toolResults[block.id];
              return <ToolCallBlock key={idx} block={block} result={res} />;
            }
            return null;
          })}

          {item.streaming && item.blocks.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 12 }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              <span>Thinking...</span>
            </div>
          )}

          {item.errorMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                background: "rgba(229, 83, 75, 0.1)",
                border: "1px solid var(--danger)",
                borderRadius: 6,
                color: "var(--danger)",
                fontSize: 12,
              }}
            >
              <AlertCircle size={14} />
              <span>{item.errorMessage}</span>
            </div>
          )}
        </div>
      );

    case "bash":
      return (
        <div
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6,
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        >
          <div style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            <Terminal size={12} color="var(--accent-base)" />
            <span>$ {item.command}</span>
          </div>
          {item.output && (
            <pre style={{ marginTop: 6, color: "var(--text-muted)", maxHeight: 200, overflowY: "auto" }}>
              {item.output}
            </pre>
          )}
        </div>
      );

    case "marker":
      return (
        <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", margin: "4px 0" }}>
          — {item.text} —
        </div>
      );

    case "summary":
      return (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px dashed var(--border-prominent)",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ fontWeight: 600, color: "var(--accent-base)", marginBottom: 4 }}>
            {item.variant === "compaction" ? "Context Compaction" : "Branch Summary"}
          </div>
          <div>{item.summary}</div>
        </div>
      );

    default:
      return null;
  }
};

const ThinkingBlock: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  if (!text) return null;

  return (
    <div
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          color: "var(--text-muted)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Thinking ({text.length} chars)</span>
      </div>
      {open && (
        <div
          style={{
            padding: "8px 12px",
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
};

const ToolCallBlock: React.FC<{
  block: { name: string; arguments: Record<string, unknown>; argsText?: string; complete: boolean };
  result?: ToolResultView;
}> = ({ block, result }) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 6,
        fontSize: 12,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <FileText size={14} color="var(--accent-base)" />
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{block.name}</span>

        <span style={{ flex: 1, color: "var(--text-muted)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {JSON.stringify(block.arguments)}
        </span>

        {result ? (
          result.isError ? (
            <AlertCircle size={14} color="var(--danger)" />
          ) : (
            <CheckCircle2 size={14} color="var(--success)" />
          )
        ) : (
          <Loader2 size={14} color="var(--accent-base)" style={{ animation: "spin 1s linear infinite" }} />
        )}
      </div>

      {open && (
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-input)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {result?.text ? (
            <pre style={{ color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{result.text}</pre>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>Running tool...</span>
          )}
        </div>
      )}
    </div>
  );
};
