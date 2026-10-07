/**
 * GitHub-flavoured markdown with IDE code blocks. Memoized on the source text so a streaming transcript
 * only re-parses the message that is actually changing.
 */
import React, { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock.tsx";
import { ImageThumbnail } from "../ImageThumbnail.tsx";
import { openLink } from "../../modules/link-bus.ts";
import { isFilePath, openFileInTab, remarkFileLinks } from "../../lib/file-links.tsx";

const REMARK_PLUGINS = [remarkGfm, remarkFileLinks];

function makeComponents(streaming: boolean): Components {
  return {
    // Fenced blocks are rendered by `code`; drop the wrapping <pre> so CodeBlock owns the chrome.
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, node }) => {
      const text = String(children ?? "");
      const match = /language-([\w#+.-]+)/.exec(className ?? "");
      const isBlock = Boolean(match) || text.includes("\n") || node?.position?.start.line !== node?.position?.end.line;
      if (!isBlock) {
        if (isFilePath(text)) {
          return (
            <code
              className="md-code-file"
              role="button"
              tabIndex={0}
              title={`Open ${text} in new tab`}
              onClick={(e) => {
                e.stopPropagation();
                void openFileInTab(text);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void openFileInTab(text);
                }
              }}
            >
              {children}
            </code>
          );
        }
        return <code>{children}</code>;
      }
      return <CodeBlock code={text} language={match?.[1] ?? null} streaming={streaming} />;
    },
    a: ({ href, children, className }) => {
      const isExternal = href ? /^(https?:\/\/|mailto:)/i.test(href) : false;
      const isFile = href
        ? !isExternal &&
          (isFilePath(href) ||
            href.startsWith("/") ||
            href.startsWith("./") ||
            href.startsWith("../") ||
            /^[a-zA-Z]:[/\\]/.test(href) ||
            href.startsWith("file://"))
        : false;
      return (
        <a
          href={href}
          className={className || (isFile ? "md-file-link" : undefined)}
          onClick={(e) => {
            e.preventDefault();
            if (!href) return;
            if (isFile) {
              void openFileInTab(href);
            } else {
              openLink(href);
            }
          }}
          title={isFile ? `Open ${href} in new tab` : href}
        >
          {children}
        </a>
      );
    },
    input: ({ checked, type }) => (type === "checkbox" ? <input type="checkbox" checked={!!checked} readOnly /> : null),
    img: ({ src, alt, title }) => {
      if (!src) return null;
      return <ImageThumbnail src={src} alt={alt || "Image"} title={title || alt || undefined} className="md-image-thumb" />;
    },
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
