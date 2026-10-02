/** Copy text exactly as given (no trailing-whitespace munging), with a DOM fallback. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  if (typeof document !== "undefined") {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {}
  }
  return false;
}

/** Copy an image to the system clipboard (as PNG Blob, or fallback to URL string). */
export async function copyImageToClipboard(src: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const res = await fetch(src);
      const blob = await res.blob();
      if (blob.type === "image/png") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return true;
      }
      // Convert non-PNG formats to PNG via offscreen canvas
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load error"));
        img.src = src;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (pngBlob) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
          return true;
        }
      }
    }
  } catch (err) {
    console.warn("Failed to copy image blob, falling back to text copy:", err);
  }
  return copyText(src);
}

/** Trigger download of an image. */
export function downloadImage(src: string, defaultName = "image.png"): boolean {
  if (typeof document === "undefined") return false;
  try {
    const link = document.createElement("a");
    link.href = src;
    link.download = defaultName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
}

