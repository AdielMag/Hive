/**
 * GitHub-flavoured markdown with IDE code blocks. Memoized on the source text so a streaming transcript
 * only re-parses the message that is actually changing.
 */
import React, { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock.tsx";

const REMARK_PLUGINS = [remarkGfm];

function makeComponents(streaming: boolean): Components {
  return {
    // Fenced blocks are rendered by `code`; drop the wrapping <pre> so CodeBlock owns the chrome.
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, node }) => {
      const text = String(children ?? "");
      const match = /language-([\w#+.-]+)/.exec(className ?? "");
      const isBlock = Boolean(match) || text.includes("\n") || node?.position?.start.line !== node?.position?.end.line;
      if (!isBlock) return <code>{children}</code>;
      return <CodeBlock code={text} language={match?.[1] ?? null} streaming={streaming} />;
    },
    a: ({ href, children }) => (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          if (href) void window.studio.openExternal(href);
        }}
        title={href}
      >
        {children}
      </a>
    ),
    input: ({ checked, type }) => (type === "checkbox" ? <input type="checkbox" checked={!!checked} readOnly /> : null),
  };
}

const STATIC_COMPONENTS = makeComponents(false);
const STREAMING_COMPONENTS = makeComponents(true);

export const Markdown: React.FC<{ text: string; streaming?: boolean; className?: string }> = memo(({ text, streaming, className }) => (
  <div className={`md selectable${className ? ` ${className}` : ""}`}>
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={streaming ? STREAMING_COMPONENTS : STATIC_COMPONENTS}>
      {text}
    </ReactMarkdown>
  </div>
));
Markdown.displayName = "Markdown";
