import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useImagePreview } from "../store/image-preview-store.ts";
import { copyImageToClipboard, downloadImage } from "../lib/clipboard.ts";

export const ImagePreviewModal: React.FC = () => {
  const image = useImagePreview((s) => s.image);
  const closePreview = useImagePreview((s) => s.closePreview);

  const [mode, setMode] = useState<"fit" | "full">("fit");
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    isDragging: boolean;
  }>({ startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, isDragging: false });
  const [isPanning, setIsPanning] = useState(false);

  // Reset state when new image is loaded
  useEffect(() => {
    if (image) {
      setMode("fit");
      setZoom(1);
      setDimensions(null);
      setCopied(false);
    }
  }, [image]);

  const handleCopy = useCallback(async () => {
    if (!image) return;
    const success = await copyImageToClipboard(image.src);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [image]);

  const handleDownload = useCallback(() => {
    if (!image) return;
    let filename = image.alt?.trim();
    if (!filename || !/\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(filename)) {
      if (image.src.startsWith("data:image/")) {
        const mime = image.src.slice(11, image.src.indexOf(";"));
        const ext = mime === "jpeg" ? "jpg" : mime || "png";
        filename = `image-${Date.now()}.${ext}`;
      } else {
        try {
          const url = new URL(image.src);
          const name = url.pathname.split("/").pop();
          if (name && /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(name)) {
            filename = name;
          }
        } catch {
          // ignore url parse error
        }
      }
    }
    downloadImage(image.src, filename || "image.png");
  }, [image]);

  // Keyboard navigation
  useEffect(() => {
    if (!image) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePreview();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setMode((prev) => {
          if (prev === "fit") {
            setZoom(1);
            return "full";
          }
          return "fit";
        });
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setMode("full");
        setZoom((z) => Math.min(Number((z + 0.25).toFixed(2)), 4));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setMode("full");
        setZoom((z) => Math.max(Number((z - 0.25).toFixed(2)), 0.25));
      } else if (e.key === "0") {
        e.preventDefault();
        setMode("fit");
        setZoom(1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [image, closePreview]);

  if (!image) return null;

  const title = image.title || image.alt || "Image preview";

  const handleZoomIn = () => {
    setMode("full");
    setZoom((z) => Math.min(Number((z + 0.25).toFixed(2)), 4));
  };

  const handleZoomOut = () => {
    setMode("full");
    setZoom((z) => Math.max(Number((z - 0.25).toFixed(2)), 0.25));
  };

  const handleToggleFit = () => {
    setMode("fit");
    setZoom(1);
  };

  const handleToggleFull = () => {
    setMode("full");
    setZoom(1);
  };

  // Drag-to-pan in full size mode
  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== "full" || !viewportRef.current) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: viewportRef.current.scrollLeft,
      scrollTop: viewportRef.current.scrollTop,
      isDragging: false,
    };
    setIsPanning(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !viewportRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 4) {
      dragRef.current.isDragging = true;
      viewportRef.current.scrollLeft = dragRef.current.scrollLeft - dx;
      viewportRef.current.scrollTop = dragRef.current.scrollTop - dy;
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      // If was not dragging (just a click on the image), toggle back to fit
      if (!dragRef.current.isDragging && mode === "full") {
        setMode("fit");
        setZoom(1);
      }
    }
  };

  return (
    <div
      className="image-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePreview();
      }}
    >
      <header className="image-modal__header" onClick={(e) => e.stopPropagation()}>
        <div className="image-modal__info">
          <span className="image-modal__title" title={title}>
            {title}
          </span>
          {dimensions && (
            <span className="ui-chip mono" title="Natural image dimensions">
              {dimensions.width} × {dimensions.height}
            </span>
          )}
        </div>

        <div className="image-modal__controls">
          {/* Mode toggle */}
          <div className="ui-seg" role="group" aria-label="View mode">
            <button
              type="button"
              aria-pressed={mode === "fit"}
              onClick={handleToggleFit}
              title="Fit to screen (Preview) — Press '0'"
            >
              <Minimize2 size={13} />
              <span>Fit</span>
            </button>
            <button
              type="button"
              aria-pressed={mode === "full" && zoom === 1}
              onClick={handleToggleFull}
              title="Full size (1:1 actual pixels) — Press 'F'"
            >
              <Maximize2 size={13} />
              <span>Full size</span>
            </button>
          </div>

          <div className="image-modal__divider" />

          {/* Zoom controls */}
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            onClick={handleZoomOut}
            disabled={mode === "full" && zoom <= 0.25}
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut size={14} />
          </button>

          <span
            className="ui-chip mono"
            style={{ minWidth: 42, justifyContent: "center" }}
            title="Current zoom"
          >
            {mode === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
          </span>

          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            onClick={handleZoomIn}
            disabled={mode === "full" && zoom >= 4}
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn size={14} />
          </button>

          <div className="image-modal__divider" />

          {/* Copy */}
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            onClick={() => void handleCopy()}
            title={copied ? "Copied!" : "Copy image to clipboard"}
            aria-label="Copy image"
          >
            {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
          </button>

          {/* Download */}
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            onClick={handleDownload}
            title="Download image"
            aria-label="Download image"
          >
            <Download size={14} />
          </button>

          {/* Close */}
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
            onClick={closePreview}
            title="Close (Esc)"
            aria-label="Close image preview"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <div
        ref={viewportRef}
        className={`image-modal__viewport${mode === "full" ? " is-scrollable" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          if (e.target === viewportRef.current) closePreview();
        }}
      >
        {mode === "fit" ? (
          <div
            className="image-modal__canvas-fit"
            onClick={(e) => {
              if (e.target === e.currentTarget) closePreview();
            }}
          >
            <img
              src={image.src}
              alt={image.alt || "Preview"}
              title="Click to view full size"
              onLoad={(e) => {
                const img = e.currentTarget;
                setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              onClick={(e) => {
                e.stopPropagation();
                setMode("full");
                setZoom(1);
              }}
            />
          </div>
        ) : (
          <div
            className={`image-modal__canvas-full${isPanning ? " is-dragging" : ""}`}
            onClick={(e) => {
              if (e.target === e.currentTarget && !dragRef.current.isDragging) closePreview();
            }}
          >
            <img
              src={image.src}
              alt={image.alt || "Preview"}
              title="Click to fit to screen, drag to pan"
              style={
                dimensions
                  ? {
                      width: dimensions.width * zoom,
                      height: dimensions.height * zoom,
                    }
                  : undefined
              }
              onLoad={(e) => {
                const img = e.currentTarget;
                setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              draggable={false}
            />
          </div>
        )}
      </div>
    </div>
  );
};
