/** Self-contained highlighted source listing (tokens + line numbers), exposed to modules as `host.ui.HighlightedSource`. */
import React from "react";
import { HighlightedLines } from "./HighlightedLines.tsx";
import { useHighlight } from "./useHighlight.ts";
import { useAppearance } from "../../features/appearance/appearance-store.ts";

export const HighlightedSource: React.FC<{ code: string; language?: string | null; wrap?: boolean; lineNumbers?: boolean }> = ({
  code,
  language = null,
  wrap,
  lineNumbers = true,
}) => {
  const tokens = useHighlight(code, language);
  const prefWrap = useAppearance((s) => s.editor.wrapCode);
  return <HighlightedLines code={code} tokens={tokens} lineNumbers={lineNumbers} wrap={wrap ?? prefWrap} />;
};
