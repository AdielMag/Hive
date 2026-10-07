/** Minimal toast queue used by `host.toast` and core prompts (e.g. "X isn't installed. Enable"). */
import { create } from "zustand";
import type { ToastOptions } from "@hive/module-sdk/renderer";
import { playUiSound } from "../store/sound-store.ts";

export interface Toast extends Required<Pick<ToastOptions, "message" | "kind">> {
  id: number;
  action?: ToastOptions["action"];
}

interface ToastState {
  toasts: Toast[];
  push(options: string | ToastOptions): number;
  dismiss(id: number): void;
}

let nextId = 1;
let lastToastSoundTime = 0;
let lastToastMessage = "";

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (options) => {
    const o: ToastOptions = typeof options === "string" ? { message: options } : options;
    const kind = o.kind ?? "info";
    const soundMap = {
      info: "toast_info" as const,
      success: "toast_success" as const,
      warning: "toast_warning" as const,
      error: "toast_error" as const,
    };
    const now = Date.now();
    const isRapidDuplicate = o.message === lastToastMessage && now - lastToastSoundTime < 600;
    if (!o.silent && !isRapidDuplicate) {
      lastToastSoundTime = now;
      lastToastMessage = o.message;
      playUiSound(soundMap[kind] ?? "toast_info");
    }
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message: o.message, kind: o.kind ?? "info", action: o.action }] }));
    const duration = o.duration ?? 5000;
    if (duration > 0) setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (options: string | ToastOptions): number => useToasts.getState().push(options);
