import { create } from "zustand";

export interface PreviewImage {
  src: string;
  alt?: string;
  title?: string;
}

export interface ImagePreviewState {
  image: PreviewImage | null;
  openPreview: (image: string | PreviewImage) => void;
  closePreview: () => void;
}

export const useImagePreview = create<ImagePreviewState>((set) => ({
  image: null,
  openPreview: (image) => {
    if (typeof image === "string") {
      set({ image: { src: image } });
    } else {
      set({ image });
    }
  },
  closePreview: () => set({ image: null }),
}));
