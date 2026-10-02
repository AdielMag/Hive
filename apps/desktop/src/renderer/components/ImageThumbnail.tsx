import React, { useState } from "react";
import { ImageOff, ZoomIn } from "lucide-react";
import { useImagePreview } from "../store/image-preview-store.ts";

export interface ImageThumbnailProps {
  src: string;
  alt?: string;
  title?: string;
  className?: string;
  onClick?: () => void;
}

export const ImageThumbnail: React.FC<ImageThumbnailProps> = ({
  src,
  alt = "Image attachment",
  title,
  className = "",
  onClick,
}) => {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const openPreview = useImagePreview((s) => s.openPreview);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (error) return;
    if (onClick) {
      onClick();
    } else {
      openPreview({ src, alt, title: title || alt });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (!error) {
        if (onClick) onClick();
        else openPreview({ src, alt, title: title || alt });
      }
    }
  };

  if (error) {
    return (
      <div className={`image-thumb image-thumb--error ${className}`} title="Failed to load image">
        <ImageOff size={16} />
        <span className="image-thumb__err-text">{alt || "Image unavailable"}</span>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`image-thumb ${loaded ? "is-loaded" : "is-loading"} ${className}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={title || alt || "Click to preview image"}
      aria-label={alt || "Image preview thumbnail"}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      <div className="image-thumb__badge" aria-hidden="true" title="Click to view">
        <ZoomIn size={12} />
      </div>
    </div>
  );
};
