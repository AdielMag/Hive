import React from "react";
import { Cpu } from "lucide-react";

export interface ProviderIconProps {
  provider: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({
  provider,
  size = 14,
  className,
  style,
}) => {
  const normalized = (provider || "").toLowerCase().trim();

  // 1. Google (Official 4-color G)
  if (normalized === "google" || normalized === "gemini") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <path
          fill="#4285F4"
          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
        />
      </svg>
    );
  }

  // 2. OpenAI (Official Spiral)
  if (normalized === "openai" || normalized === "chatgpt" || normalized === "gpt") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#10a37f"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1683a.071.071 0 0 1 .038.052v5.5826a4.5045 4.5045 0 0 1-4.4945 4.4947zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829l2.02-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.402-.6813zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.407 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1636a.0804.0804 0 0 1-.038-.0567V6.0748a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.4598a.7948.7948 0 0 0-.3927.6813v6.7219zm1.3103-2.2713l3.08-1.7778 3.08 1.7778v3.5556l-3.08 1.7778-3.08-1.7778z" />
      </svg>
    );
  }

  // 3. Anthropic (Official Wordmark Glyph / Claude Terracotta)
  if (normalized === "anthropic" || normalized === "claude") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#d97757"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <path d="M13.827 3.518h3.811L24 20.482h-3.811l-1.956-4.664H9.772l-1.956 4.664H4L13.827 3.518zm2.464 9.186l-2.464-5.875-2.464 5.875h4.928zM3.811 3.518H0l6.236 14.869 1.956-4.664L3.811 3.518z" />
      </svg>
    );
  }

  // 4. Google Antigravity
  if (normalized === "antigravity" || normalized === "agy") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <defs>
          <linearGradient id="antigravity-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4e8cff" />
            <stop offset="50%" stopColor="#986ee2" />
            <stop offset="100%" stopColor="#ff7582" />
          </linearGradient>
        </defs>
        <path
          fill="url(#antigravity-grad)"
          d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z"
        />
      </svg>
    );
  }

  // 5. DeepSeek
  if (normalized === "deepseek") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#0066FF"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <path d="M21.5 13.5c-.8-4.2-4.5-7.5-9-7.5-5 0-9 4-9 9 0 2 .7 3.9 1.9 5.3L4 21.5l2.2-1.4C7.7 20.7 9.8 21 12 21c5.2 0 9.5-4.2 9.5-9.5 0-.7-.1-1.3-.2-2z" />
      </svg>
    );
  }

  // 6. Meta / Llama
  if (normalized === "meta" || normalized === "llama") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#0668E1"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <path d="M12 8.7c-2.3-3.6-5.3-5.2-7.8-5.2C1.9 3.5 0 5.4 0 8.8c0 4.6 3.6 8.7 7.7 8.7 2.4 0 4.4-1.2 5.8-3.2 1.4 2 3.4 3.2 5.8 3.2 4.1 0 7.7-4.1 7.7-8.7 0-3.4-1.9-5.3-4.2-5.3-2.5 0-5.5 1.6-7.8 5.2zm-4.3 6.3c-2.7 0-4.9-3-4.9-6.2 0-2.1 1.1-3.2 2.5-3.2 1.8 0 4.3 1.9 6.1 5.3-1 2.5-2.4 4.1-3.7 4.1zm8.6 0c-1.3 0-2.7-1.6-3.7-4.1 1.8-3.4 4.3-5.3 6.1-5.3 1.4 0 2.5 1.1 2.5 3.2 0 3.2-2.2 6.2-4.9 6.2z" />
      </svg>
    );
  }

  // 7. Mistral
  if (normalized === "mistral") {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="#FD6F00"
        className={className}
        style={{ flexShrink: 0, ...style }}
      >
        <rect x="2" y="2" width="4" height="4" />
        <rect x="18" y="2" width="4" height="4" />
        <rect x="2" y="6" width="4" height="4" />
        <rect x="6" y="6" width="4" height="4" />
        <rect x="14" y="6" width="4" height="4" />
        <rect x="18" y="6" width="4" height="4" />
        <rect x="2" y="10" width="20" height="4" />
        <rect x="2" y="14" width="8" height="4" />
        <rect x="14" y="14" width="8" height="4" />
        <rect x="2" y="18" width="4" height="4" />
        <rect x="18" y="18" width="4" height="4" />
      </svg>
    );
  }

  // Default Fallback
  return <Cpu size={size} color="var(--accent-base)" className={className} style={{ flexShrink: 0, ...style }} />;
};
