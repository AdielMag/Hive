import React, { useEffect, useRef, useState } from "react";
import { FileIcon } from "./file-icons.tsx";

interface NewItemInputProps {
  isDirectory: boolean;
  depth: number;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export const NewItemInput: React.FC<NewItemInputProps> = ({
  isDirectory,
  depth,
  onSubmit,
  onCancel,
}) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      submittedRef.current = true;
      onCancel();
    } else if (e.key === "Enter") {
      e.stopPropagation();
      const trimmed = value.trim();
      if (!trimmed) {
        submittedRef.current = true;
        onCancel();
        return;
      }
      if (/[<>:"/\\|?*]/.test(trimmed)) {
        setError("Invalid characters in name");
        return;
      }
      submittedRef.current = true;
      onSubmit(trimmed);
    }
  };

  const handleBlur = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const trimmed = value.trim();
    if (!trimmed) {
      onCancel();
    } else if (!/[<>:"/\\|?*]/.test(trimmed)) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        paddingLeft: depth * 14 + 4,
        paddingRight: 4,
        margin: "1px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 4px",
          backgroundColor: "var(--bg-surface)",
          borderRadius: 4,
          border: `1px solid ${error ? "#ef4444" : "var(--accent-base)"}`,
        }}
      >
        <FileIcon name={value || (isDirectory ? "folder" : "file")} isDirectory={isDirectory} size={13} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={isDirectory ? "folder name..." : "file name..."}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontSize: 12,
            padding: 0,
            fontFamily: "inherit",
          }}
        />
      </div>
      {error && (
        <span
          style={{
            fontSize: 10,
            color: "#ef4444",
            paddingLeft: 20,
            marginTop: 2,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
};
