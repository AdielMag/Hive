import React from "react";

export const HighlightText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query || !query.trim()) {
    return <span>{text}</span>;
  }

  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);

  if (idx === -1) {
    return <span>{text}</span>;
  }

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);

  return (
    <span>
      {before}
      <mark
        style={{
          backgroundColor: "rgba(245, 158, 11, 0.3)",
          color: "var(--accent-hover)",
          borderRadius: 2,
          padding: "0 1px",
        }}
      >
        {match}
      </mark>
      <HighlightText text={after} query={query} />
    </span>
  );
};
