# Clickable File Paths in Session and OS File Manager Button

Make all file paths shown in session transcripts default to clickable links that open in a new tab, and add an OS-specific "Open in Finder" / "Open in File Explorer" button to the file viewer toolbar.

## Approach
- Create a central `file-links` utility to recognize file paths, parse optional line/column numbers, and open tabs via `file.open`.
- Enhance `Markdown` with a remark plugin and inline code renderer so both backticked paths and plain-text paths become clickable.
- Make tool call headers (read, edit, write, grep, find) and user messages with file paths clickable to open in tabs.
- Add an OS-aware "Open in Finder" (macOS) / "Open in File Explorer" (Windows) button to `FileViewerTab` and `DiffViewerTab`.

## Decisions

> [!CHOICE] Plain-text path detection vs inline backticks only
> **Question**: Should file paths without backticks in chat text also be auto-detected as clickable links?
> - (x) **Both backticks and plain-text paths**: Markdown links, backticks, and regex-matched paths in plain text are all clickable [Recommended]
> - ( ) **Backticks and links only**: Only backticked code spans and markdown links become clickable

> [!CHOICE] Handling line and column numbers
> **Question**: How should paths with line numbers (e.g. `src/app.ts:42`) be handled when opening?
> - (x) **Strip line numbers for file opening and preserve line data**: Open the file without path error and pass line to the tab [Recommended]
> - ( ) **Strict paths only**: Ignore paths that contain trailing line numbers

<!-- MORE -->

## Changes

| File | Change |
|---|---|
| `apps/desktop/src/renderer/lib/file-links.ts` | `[NEW]` Central path detection regex, line parsing, and `openFileInTab` helper |
| `apps/desktop/src/renderer/lib/platform.ts` | `[NEW]` Helper returning OS-specific labels ("Open in Finder", "Open in File Explorer", "Open in File Manager") |
| `apps/desktop/src/renderer/components/code/Markdown.tsx` | `[MODIFY]` Detect file paths in links, inline code, and plain text, rendering clickable file links |
| `apps/desktop/src/renderer/components/Transcript.tsx` | `[MODIFY]` Make tool call summary paths (`read`, `edit`, `write`) and user message paths clickable |
| `apps/desktop/src/renderer/styles/transcript.css` | `[MODIFY]` Styles for `.md-code-file` and clickable tool arguments with hover states |
| `modules/diff-viewer/src/ui/FileViewerTab.tsx` | `[MODIFY]` Replace generic "Show in Folder" button with OS-specific "Open in Finder" / "Open in File Explorer" |
| `modules/diff-viewer/src/ui/DiffViewerTab.tsx` | `[MODIFY]` Add OS-specific "Open in Finder" / "Open in File Explorer" button to header |
| `apps/desktop/src/renderer/components/TabStrip.tsx` | `[MODIFY]` Update tab context menu to use OS-specific file manager label |

## Risks
- False positives in plain text: mitigated by requiring recognized file extensions, path separators, or known filenames (e.g. `package.json`).
- Path resolution for relative paths: relative paths resolve against `activeProject.path`.

## Verify
- Click backticked file path (e.g. `` `src/renderer/App.tsx` ``) in chat: opens file tab.
- Click plain text file path (e.g. `apps/desktop/package.json:10`): opens file tab.
- Click path in tool call header (`read`, `edit`, `write`): opens file tab.
- Click "Open in File Explorer" (Windows) / "Open in Finder" (macOS) in file tab: reveals file on disk.
- Unit tests for `isFilePath`, `parseFilePath`, and platform labels.
