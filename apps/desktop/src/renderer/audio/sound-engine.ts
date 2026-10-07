/**
 * Core Web Audio API engine for Hive.
 * Handles AudioContext lifecycle, master volume, limiter compression, polyphony throttling, and synthesis routing.
 */
import type { SoundId, SoundTheme } from "./sound-types.ts";
import { SOUND_RENDERERS } from "./sound-presets.ts";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private previewGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private targetVolume = 0.6;
  private isMuted = false;

  private lastPlayedTime = new Map<SoundId, number>();
  private readonly THROTTLE_MS = 40;
  private activeVoiceCount = 0;
  private readonly MAX_ACTIVE_VOICES = 10;

  constructor() {
    this.setupGestureUnlock();
  }

  /**
   * Lazily create AudioContext and master gain node with limiter.
   */
  private getContext(): { ctx: AudioContext; masterGain: GainNode; previewGain: GainNode } | null {
    if (typeof window === "undefined") return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      try {
        this.ctx = new AudioCtx();

        // Dynamics compressor as brickwall / master limiter to avoid digital clipping
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-4, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(6, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);
        this.compressor.connect(this.ctx.destination);

        // Master gain
        this.masterGain = this.ctx.createGain();
        const initialGain = this.isMuted ? 0 : this.targetVolume;
        this.masterGain.gain.setValueAtTime(initialGain, this.ctx.currentTime);
        this.masterGain.connect(this.compressor);

        // Preview gain (routes directly to compressor for testing sounds even while muted)
        this.previewGain = this.ctx.createGain();
        this.previewGain.gain.setValueAtTime(this.targetVolume, this.ctx.currentTime);
        this.previewGain.connect(this.compressor);
      } catch (err) {
        console.warn("[SoundEngine] Failed to initialize AudioContext:", err);
        return null;
      }
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    if (!this.masterGain || !this.previewGain) return null;
    return { ctx: this.ctx, masterGain: this.masterGain, previewGain: this.previewGain };
  }

  /**
   * Chromium restricts AudioContext until a user gesture occurs.
   * Attach once-listeners to resume on first click/keypress.
   */
  private setupGestureUnlock(): void {
    if (typeof window === "undefined") return;

    const unlock = () => {
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
    };

    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true, passive: true });
  }

  /**
   * Configure master volume and mute state.
   */
  public configure(volume: number, muted: boolean): void {
    this.targetVolume = Math.max(0, Math.min(1, volume));
    this.isMuted = muted;

    if (this.masterGain && this.ctx) {
      const eff = this.isMuted ? 0 : this.targetVolume;
      this.masterGain.gain.setTargetAtTime(eff, this.ctx.currentTime, 0.02);
    }
    if (this.previewGain && this.ctx) {
      this.previewGain.gain.setTargetAtTime(this.targetVolume, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Update master volume (0.0 to 1.0)
   */
  public setVolume(volume: number): void {
    this.configure(volume, this.isMuted);
  }

  /**
   * Update mute state
   */
  public setMuted(muted: boolean): void {
    this.configure(this.targetVolume, muted);
  }

  /**
   * Play a sound synthesized procedurally.
   * @param soundId The sound effect ID to play
   * @param theme The active sound theme
   * @param isPreview If true, plays through preview gain (audible during settings test even if muted)
   */
  public play(soundId: SoundId, theme: SoundTheme = "modern", isPreview = false): void {
    const now = Date.now();
    const last = this.lastPlayedTime.get(soundId) ?? 0;
    if (now - last < this.THROTTLE_MS) {
      return; // Throttled to avoid harsh clipping
    }

    if (this.activeVoiceCount >= this.MAX_ACTIVE_VOICES) {
      return; // Polyphony ceiling reached
    }

    const instance = this.getContext();
    if (!instance) return;

    const { ctx, masterGain, previewGain } = instance;

    // Do not schedule while AudioContext is suspended
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
      return;
    }

    this.lastPlayedTime.set(soundId, now);

    const themeRenderers = SOUND_RENDERERS[theme] ?? SOUND_RENDERERS.modern;
    const renderer = themeRenderers[soundId];
    if (renderer) {
      this.activeVoiceCount++;
      const dest = isPreview ? previewGain : masterGain;
      try {
        renderer(ctx, dest);
      } catch (err) {
        console.warn("[SoundEngine] Error rendering sound:", soundId, err);
      } finally {
        setTimeout(() => {
          this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
        }, 350);
      }
    }
  }
}

export const soundEngine = new SoundEngine();
