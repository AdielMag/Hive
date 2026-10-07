/**
 * Procedural Web Audio API sound synthesizers for all Hive sound themes.
 * Zero external audio files required. Instant, parametric, zero latency.
 */
import type { SoundId, SoundTheme } from "./sound-types.ts";

type ToneType = OscillatorType;

function now(ctx: AudioContext): number {
  return ctx.currentTime;
}

/** Synthesize a single envelope-shaped oscillator tone */
function playTone(
  ctx: AudioContext,
  dest: AudioNode,
  opts: {
    freq: number;
    type?: ToneType;
    duration: number;
    gain?: number;
    attack?: number;
    decay?: number;
    freqEnd?: number;
    delay?: number;
  },
): void {
  const t0 = now(ctx) + (opts.delay ?? 0);
  const dur = opts.duration;
  const attack = opts.attack ?? 0.005;
  const maxGain = opts.gain ?? 0.3;
  const type = opts.type ?? "sine";

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + dur);
  }

  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.linearRampToValueAtTime(maxGain, t0 + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(gainNode);
  gainNode.connect(dest);

  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Synthesize a shaped noise burst for clicks, switches, taps */
function playNoise(
  ctx: AudioContext,
  dest: AudioNode,
  opts: {
    duration: number;
    filterFreq: number;
    filterType?: BiquadFilterType;
    filterQ?: number;
    gain?: number;
    delay?: number;
  },
): void {
  const t0 = now(ctx) + (opts.delay ?? 0);
  const dur = opts.duration;
  const bufferSize = Math.max(256, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType ?? "bandpass";
  filter.frequency.setValueAtTime(opts.filterFreq, t0);
  filter.Q.setValueAtTime(opts.filterQ ?? 3, t0);

  const gain = ctx.createGain();
  const maxGain = opts.gain ?? 0.25;
  gain.gain.setValueAtTime(maxGain, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  noise.start(t0);
  noise.stop(t0 + dur + 0.02);
}

/** Staggered chord arpeggio */
function playChord(
  ctx: AudioContext,
  dest: AudioNode,
  notes: number[],
  opts: {
    duration: number;
    stagger?: number;
    gain?: number;
    type?: ToneType;
  },
): void {
  const stagger = opts.stagger ?? 0.06;
  const baseGain = opts.gain ?? 0.2;
  notes.forEach((freq, i) => {
    playTone(ctx, dest, {
      freq,
      type: opts.type ?? "sine",
      duration: opts.duration,
      gain: baseGain * (1 - i * 0.08),
      delay: i * stagger,
    });
  });
}

// ---------------------------------------------------------------------------
// THEME IMPLEMENTATIONS
// ---------------------------------------------------------------------------

export const SOUND_RENDERERS: Record<SoundTheme, Record<SoundId, (ctx: AudioContext, dest: AudioNode) => void>> = {
  modern: {
    prompt_send: (ctx, dest) => {
      playTone(ctx, dest, { freq: 380, freqEnd: 720, duration: 0.09, gain: 0.22, type: "sine" });
    },
    agent_start: (ctx, dest) => {
      playTone(ctx, dest, { freq: 280, freqEnd: 440, duration: 0.12, gain: 0.18, type: "sine" });
    },
    agent_settled: (ctx, dest) => {
      // E5 -> G#5 -> B5 warm pleasant resolution
      playChord(ctx, dest, [659.25, 830.61, 987.77], { duration: 0.32, stagger: 0.07, gain: 0.22 });
    },
    agent_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 440, freqEnd: 290, duration: 0.24, gain: 0.25, type: "sine" });
      playTone(ctx, dest, { freq: 415, freqEnd: 275, duration: 0.24, gain: 0.18, type: "triangle" });
    },
    tool_start: (ctx, dest) => {
      playTone(ctx, dest, { freq: 900, duration: 0.035, gain: 0.16, type: "sine" });
    },
    tool_end: (ctx, dest) => {
      playTone(ctx, dest, { freq: 1180, duration: 0.04, gain: 0.14, type: "triangle" });
    },
    tool_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 220, freqEnd: 140, duration: 0.12, gain: 0.22, type: "triangle" });
    },
    subagent_spawn: (ctx, dest) => {
      playTone(ctx, dest, { freq: 523.25, duration: 0.06, gain: 0.18, type: "sine" });
      playTone(ctx, dest, { freq: 783.99, duration: 0.08, gain: 0.18, delay: 0.05, type: "sine" });
    },
    subagent_done: (ctx, dest) => {
      playChord(ctx, dest, [587.33, 880.0], { duration: 0.18, stagger: 0.05, gain: 0.2 });
    },
    plan_request: (ctx, dest) => {
      playChord(ctx, dest, [880.0, 1318.51], { duration: 0.28, stagger: 0.04, gain: 0.2 });
    },
    plan_choice: (ctx, dest) => {
      playTone(ctx, dest, { freq: 580, freqEnd: 220, duration: 0.04, gain: 0.16, type: "sine" });
    },
    plan_approve: (ctx, dest) => {
      // C5 -> E5 -> G5 -> C6 radiant major chord
      playChord(ctx, dest, [523.25, 659.25, 783.99, 1046.5], { duration: 0.35, stagger: 0.05, gain: 0.22 });
    },
    plan_reject: (ctx, dest) => {
      playTone(ctx, dest, { freq: 360, duration: 0.07, gain: 0.18, type: "sine" });
      playTone(ctx, dest, { freq: 280, duration: 0.09, gain: 0.18, delay: 0.08, type: "sine" });
    },
    terminal_bell: (ctx, dest) => {
      playTone(ctx, dest, { freq: 850, duration: 0.28, gain: 0.24, type: "sine" });
    },
    terminal_command: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.02, filterFreq: 1200, gain: 0.15 });
    },
    toast_info: (ctx, dest) => {
      playTone(ctx, dest, { freq: 1046.5, duration: 0.07, gain: 0.18, type: "sine" });
    },
    toast_success: (ctx, dest) => {
      playChord(ctx, dest, [880.0, 1108.73], { duration: 0.18, stagger: 0.05, gain: 0.2 });
    },
    toast_warning: (ctx, dest) => {
      playTone(ctx, dest, { freq: 620, duration: 0.07, gain: 0.2, type: "triangle" });
      playTone(ctx, dest, { freq: 620, duration: 0.07, gain: 0.2, delay: 0.08, type: "triangle" });
    },
    toast_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 220, duration: 0.14, gain: 0.22, type: "sawtooth" });
      playTone(ctx, dest, { freq: 233, duration: 0.14, gain: 0.18, type: "sawtooth" });
    },
    tab_switch: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.02, filterFreq: 3200, filterQ: 1.5, gain: 0.08 });
    },
    modal_open: (ctx, dest) => {
      playTone(ctx, dest, { freq: 320, freqEnd: 540, duration: 0.07, gain: 0.16, type: "sine" });
    },
    modal_close: (ctx, dest) => {
      playTone(ctx, dest, { freq: 500, freqEnd: 280, duration: 0.06, gain: 0.14, type: "sine" });
    },
    button_click: (ctx, dest) => {
      playTone(ctx, dest, { freq: 440, duration: 0.02, gain: 0.12, type: "triangle" });
    },
  },

  mechanical: {
    prompt_send: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.03, filterFreq: 4200, filterQ: 4, gain: 0.25 });
      playTone(ctx, dest, { freq: 220, duration: 0.04, gain: 0.18, type: "triangle" });
    },
    agent_start: (ctx, dest) => {
      playTone(ctx, dest, { freq: 180, duration: 0.06, gain: 0.2, type: "square" });
    },
    agent_settled: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.025, filterFreq: 3500, gain: 0.2 });
      playTone(ctx, dest, { freq: 880, duration: 0.18, gain: 0.22, delay: 0.03, type: "sine" });
    },
    agent_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 150, duration: 0.15, gain: 0.25, type: "sawtooth" });
    },
    tool_start: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.018, filterFreq: 5000, gain: 0.2 });
    },
    tool_end: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.015, filterFreq: 6500, gain: 0.18 });
    },
    tool_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 120, duration: 0.09, gain: 0.22, type: "square" });
    },
    subagent_spawn: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.02, filterFreq: 3000, gain: 0.2 });
      playNoise(ctx, dest, { duration: 0.02, filterFreq: 4500, gain: 0.2, delay: 0.04 });
    },
    subagent_done: (ctx, dest) => {
      playTone(ctx, dest, { freq: 600, duration: 0.05, gain: 0.2, type: "triangle" });
      playTone(ctx, dest, { freq: 900, duration: 0.08, gain: 0.2, delay: 0.04, type: "triangle" });
    },
    plan_request: (ctx, dest) => {
      playTone(ctx, dest, { freq: 750, duration: 0.2, gain: 0.22, type: "sine" });
    },
    plan_choice: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.022, filterFreq: 4000, gain: 0.22 });
    },
    plan_approve: (ctx, dest) => {
      playTone(ctx, dest, { freq: 523, duration: 0.12, gain: 0.2, type: "triangle" });
      playTone(ctx, dest, { freq: 659, duration: 0.12, gain: 0.2, delay: 0.05, type: "triangle" });
      playTone(ctx, dest, { freq: 784, duration: 0.18, gain: 0.22, delay: 0.1, type: "sine" });
    },
    plan_reject: (ctx, dest) => {
      playTone(ctx, dest, { freq: 300, duration: 0.06, gain: 0.2, type: "square" });
      playTone(ctx, dest, { freq: 240, duration: 0.08, gain: 0.2, delay: 0.07, type: "square" });
    },
    terminal_bell: (ctx, dest) => {
      playTone(ctx, dest, { freq: 700, duration: 0.22, gain: 0.25, type: "sine" });
    },
    terminal_command: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.025, filterFreq: 2800, gain: 0.22 });
    },
    toast_info: (ctx, dest) => {
      playTone(ctx, dest, { freq: 800, duration: 0.08, gain: 0.2, type: "triangle" });
    },
    toast_success: (ctx, dest) => {
      playTone(ctx, dest, { freq: 700, duration: 0.08, gain: 0.2, type: "triangle" });
      playTone(ctx, dest, { freq: 1050, duration: 0.12, gain: 0.2, delay: 0.06, type: "triangle" });
    },
    toast_warning: (ctx, dest) => {
      playTone(ctx, dest, { freq: 500, duration: 0.08, gain: 0.2, type: "sawtooth" });
      playTone(ctx, dest, { freq: 500, duration: 0.08, gain: 0.2, delay: 0.09, type: "sawtooth" });
    },
    toast_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 180, duration: 0.18, gain: 0.25, type: "sawtooth" });
    },
    tab_switch: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.015, filterFreq: 4800, gain: 0.12 });
    },
    modal_open: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.02, filterFreq: 3200, gain: 0.16 });
      playTone(ctx, dest, { freq: 350, duration: 0.04, gain: 0.12, delay: 0.01, type: "triangle" });
    },
    modal_close: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.02, filterFreq: 2400, gain: 0.14 });
    },
    button_click: (ctx, dest) => {
      playNoise(ctx, dest, { duration: 0.016, filterFreq: 5200, gain: 0.18 });
    },
  },

  scifi: {
    prompt_send: (ctx, dest) => {
      playTone(ctx, dest, { freq: 400, freqEnd: 1600, duration: 0.08, gain: 0.22, type: "sawtooth" });
    },
    agent_start: (ctx, dest) => {
      playTone(ctx, dest, { freq: 800, freqEnd: 1200, duration: 0.09, gain: 0.18, type: "sine" });
    },
    agent_settled: (ctx, dest) => {
      playTone(ctx, dest, { freq: 880, freqEnd: 1760, duration: 0.12, gain: 0.22, type: "sine" });
      playTone(ctx, dest, { freq: 1320, freqEnd: 2640, duration: 0.18, gain: 0.18, delay: 0.06, type: "sine" });
    },
    agent_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 1200, freqEnd: 220, duration: 0.22, gain: 0.25, type: "sawtooth" });
    },
    tool_start: (ctx, dest) => {
      playTone(ctx, dest, { freq: 1400, freqEnd: 900, duration: 0.035, gain: 0.16, type: "square" });
    },
    tool_end: (ctx, dest) => {
      playTone(ctx, dest, { freq: 900, freqEnd: 1600, duration: 0.04, gain: 0.16, type: "sine" });
    },
    tool_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 300, freqEnd: 120, duration: 0.1, gain: 0.22, type: "sawtooth" });
    },
    subagent_spawn: (ctx, dest) => {
      playTone(ctx, dest, { freq: 700, freqEnd: 1400, duration: 0.06, gain: 0.2, type: "triangle" });
      playTone(ctx, dest, { freq: 1000, freqEnd: 2000, duration: 0.08, gain: 0.2, delay: 0.04, type: "triangle" });
    },
    subagent_done: (ctx, dest) => {
      playTone(ctx, dest, { freq: 1200, freqEnd: 2200, duration: 0.14, gain: 0.2, type: "sine" });
    },
    plan_request: (ctx, dest) => {
      playTone(ctx, dest, { freq: 950, duration: 0.15, gain: 0.2, type: "sine" });
      playTone(ctx, dest, { freq: 1425, duration: 0.22, gain: 0.2, delay: 0.05, type: "sine" });
    },
    plan_choice: (ctx, dest) => {
      playTone(ctx, dest, { freq: 1100, freqEnd: 600, duration: 0.04, gain: 0.18, type: "triangle" });
    },
    plan_approve: (ctx, dest) => {
      playChord(ctx, dest, [600, 900, 1200, 1800], { duration: 0.25, stagger: 0.04, gain: 0.22, type: "sine" });
    },
    plan_reject: (ctx, dest) => {
      playTone(ctx, dest, { freq: 650, freqEnd: 400, duration: 0.08, gain: 0.2, type: "sawtooth" });
      playTone(ctx, dest, { freq: 500, freqEnd: 300, duration: 0.1, gain: 0.2, delay: 0.08, type: "sawtooth" });
    },
    terminal_bell: (ctx, dest) => {
      playTone(ctx, dest, { freq: 1200, duration: 0.2, gain: 0.22, type: "sine" });
    },
    terminal_command: (ctx, dest) => {
      playTone(ctx, dest, { freq: 600, freqEnd: 900, duration: 0.03, gain: 0.14, type: "sine" });
    },
    toast_info: (ctx, dest) => {
      playTone(ctx, dest, { freq: 1200, duration: 0.06, gain: 0.18, type: "sine" });
    },
    toast_success: (ctx, dest) => {
      playTone(ctx, dest, { freq: 900, freqEnd: 1500, duration: 0.12, gain: 0.2, type: "sine" });
    },
    toast_warning: (ctx, dest) => {
      playTone(ctx, dest, { freq: 750, freqEnd: 850, duration: 0.08, gain: 0.2, type: "sawtooth" });
      playTone(ctx, dest, { freq: 750, freqEnd: 850, duration: 0.08, gain: 0.2, delay: 0.09, type: "sawtooth" });
    },
    toast_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 350, freqEnd: 180, duration: 0.18, gain: 0.24, type: "sawtooth" });
    },
    tab_switch: (ctx, dest) => {
      playTone(ctx, dest, { freq: 800, freqEnd: 1200, duration: 0.025, gain: 0.1, type: "sine" });
    },
    modal_open: (ctx, dest) => {
      playTone(ctx, dest, { freq: 400, freqEnd: 900, duration: 0.06, gain: 0.16, type: "triangle" });
    },
    modal_close: (ctx, dest) => {
      playTone(ctx, dest, { freq: 850, freqEnd: 350, duration: 0.05, gain: 0.14, type: "triangle" });
    },
    button_click: (ctx, dest) => {
      playTone(ctx, dest, { freq: 950, duration: 0.02, gain: 0.12, type: "sine" });
    },
  },

  retro: {
    prompt_send: (ctx, dest) => {
      playTone(ctx, dest, { freq: 440, duration: 0.04, gain: 0.2, type: "square" });
      playTone(ctx, dest, { freq: 880, duration: 0.06, gain: 0.2, delay: 0.04, type: "square" });
    },
    agent_start: (ctx, dest) => {
      playTone(ctx, dest, { freq: 330, duration: 0.05, gain: 0.18, type: "square" });
      playTone(ctx, dest, { freq: 495, duration: 0.06, gain: 0.18, delay: 0.05, type: "square" });
    },
    agent_settled: (ctx, dest) => {
      // Classic 8-bit powerup / fanfare arpeggio
      playChord(ctx, dest, [523.25, 659.25, 783.99, 1046.5], { duration: 0.12, stagger: 0.05, gain: 0.2, type: "square" });
    },
    agent_error: (ctx, dest) => {
      // Classic 8-bit game over descend
      playChord(ctx, dest, [400, 350, 300, 200], { duration: 0.1, stagger: 0.06, gain: 0.22, type: "square" });
    },
    tool_start: (ctx, dest) => {
      playTone(ctx, dest, { freq: 700, duration: 0.03, gain: 0.16, type: "square" });
    },
    tool_end: (ctx, dest) => {
      playTone(ctx, dest, { freq: 1000, duration: 0.03, gain: 0.16, type: "square" });
    },
    tool_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 160, duration: 0.08, gain: 0.2, type: "square" });
    },
    subagent_spawn: (ctx, dest) => {
      playTone(ctx, dest, { freq: 600, duration: 0.04, gain: 0.18, type: "square" });
      playTone(ctx, dest, { freq: 800, duration: 0.04, gain: 0.18, delay: 0.04, type: "square" });
    },
    subagent_done: (ctx, dest) => {
      playTone(ctx, dest, { freq: 800, duration: 0.05, gain: 0.18, type: "square" });
      playTone(ctx, dest, { freq: 1200, duration: 0.08, gain: 0.2, delay: 0.05, type: "square" });
    },
    plan_request: (ctx, dest) => {
      playTone(ctx, dest, { freq: 987, duration: 0.08, gain: 0.2, type: "square" });
      playTone(ctx, dest, { freq: 1318, duration: 0.15, gain: 0.2, delay: 0.07, type: "square" });
    },
    plan_choice: (ctx, dest) => {
      playTone(ctx, dest, { freq: 660, duration: 0.025, gain: 0.16, type: "square" });
    },
    plan_approve: (ctx, dest) => {
      playChord(ctx, dest, [587, 740, 880, 1174], { duration: 0.14, stagger: 0.04, gain: 0.2, type: "square" });
    },
    plan_reject: (ctx, dest) => {
      playTone(ctx, dest, { freq: 280, duration: 0.06, gain: 0.2, type: "square" });
      playTone(ctx, dest, { freq: 200, duration: 0.08, gain: 0.2, delay: 0.06, type: "square" });
    },
    terminal_bell: (ctx, dest) => {
      playTone(ctx, dest, { freq: 800, duration: 0.18, gain: 0.24, type: "square" });
    },
    terminal_command: (ctx, dest) => {
      playTone(ctx, dest, { freq: 400, duration: 0.02, gain: 0.14, type: "square" });
    },
    toast_info: (ctx, dest) => {
      playTone(ctx, dest, { freq: 900, duration: 0.05, gain: 0.18, type: "square" });
    },
    toast_success: (ctx, dest) => {
      playTone(ctx, dest, { freq: 880, duration: 0.06, gain: 0.2, type: "square" });
      playTone(ctx, dest, { freq: 1320, duration: 0.1, gain: 0.2, delay: 0.06, type: "square" });
    },
    toast_warning: (ctx, dest) => {
      playTone(ctx, dest, { freq: 550, duration: 0.06, gain: 0.2, type: "square" });
      playTone(ctx, dest, { freq: 550, duration: 0.06, gain: 0.2, delay: 0.07, type: "square" });
    },
    toast_error: (ctx, dest) => {
      playTone(ctx, dest, { freq: 180, duration: 0.14, gain: 0.24, type: "square" });
    },
    tab_switch: (ctx, dest) => {
      playTone(ctx, dest, { freq: 500, duration: 0.015, gain: 0.1, type: "square" });
    },
    modal_open: (ctx, dest) => {
      playTone(ctx, dest, { freq: 350, freqEnd: 700, duration: 0.05, gain: 0.16, type: "square" });
    },
    modal_close: (ctx, dest) => {
      playTone(ctx, dest, { freq: 700, freqEnd: 350, duration: 0.05, gain: 0.14, type: "square" });
    },
    button_click: (ctx, dest) => {
      playTone(ctx, dest, { freq: 520, duration: 0.018, gain: 0.14, type: "square" });
    },
  },
};
