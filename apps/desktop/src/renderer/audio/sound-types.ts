export type SoundCategory = "agent" | "plan" | "terminal" | "toast" | "ui";

export type SoundTheme = "modern" | "mechanical" | "scifi" | "retro";

export type SoundId =
  // Agent & Assistant
  | "prompt_send"
  | "agent_start"
  | "agent_settled"
  | "agent_error"
  | "tool_start"
  | "tool_end"
  | "tool_error"
  | "subagent_spawn"
  | "subagent_done"
  // Plan Previewer & Approvals
  | "plan_request"
  | "question_asked"
  | "plan_choice"
  | "plan_approve"
  | "plan_reject"
  // Terminal
  | "terminal_bell"
  | "terminal_command"
  // Notifications & Toasts
  | "toast_info"
  | "toast_success"
  | "toast_warning"
  | "toast_error"
  // UI Interactions
  | "tab_switch"
  | "modal_open"
  | "modal_close"
  | "button_click";

export interface SoundMeta {
  id: SoundId;
  label: string;
  description: string;
  category: SoundCategory;
}

export const SOUND_DEFINITIONS: Record<SoundId, SoundMeta> = {
  prompt_send: {
    id: "prompt_send",
    label: "Prompt Sent",
    description: "Played when submitting a message in composer",
    category: "agent",
  },
  agent_start: {
    id: "agent_start",
    label: "Agent Thinking",
    description: "Played when assistant begins processing a response",
    category: "agent",
  },
  agent_settled: {
    id: "agent_settled",
    label: "Agent Finished",
    description: "Pleasant resolution chord when response completes",
    category: "agent",
  },
  agent_error: {
    id: "agent_error",
    label: "Agent Error",
    description: "Played when an agent run fails or encounters an error",
    category: "agent",
  },
  tool_start: {
    id: "tool_start",
    label: "Tool Started",
    description: "Tactile blip when a tool (bash, read, edit) begins",
    category: "agent",
  },
  tool_end: {
    id: "tool_end",
    label: "Tool Completed",
    description: "Subtle positive tick on successful tool finish",
    category: "agent",
  },
  tool_error: {
    id: "tool_error",
    label: "Tool Error",
    description: "Muted warning thud on failed tool execution",
    category: "agent",
  },
  subagent_spawn: {
    id: "subagent_spawn",
    label: "Subagent Spawned",
    description: "Chirp when background worker or scout starts",
    category: "agent",
  },
  subagent_done: {
    id: "subagent_done",
    label: "Subagent Finished",
    description: "Harmonic micro-chord when background work completes",
    category: "agent",
  },
  plan_request: {
    id: "plan_request",
    label: "Plan Review Ready",
    description: "Attention ping when a plan review card arrives",
    category: "plan",
  },
  question_asked: {
    id: "question_asked",
    label: "Question Asked",
    description: "Attention ping when the AI asks you a question or needs an approval",
    category: "plan",
  },
  plan_choice: {
    id: "plan_choice",
    label: "Plan Decision Selected",
    description: "Tactile click when selecting a plan decision option",
    category: "plan",
  },
  plan_approve: {
    id: "plan_approve",
    label: "Plan Approved",
    description: "Celebratory major resolution chord on plan approval",
    category: "plan",
  },
  plan_reject: {
    id: "plan_reject",
    label: "Changes Requested",
    description: "Soft double-boop when revision is requested",
    category: "plan",
  },
  terminal_bell: {
    id: "terminal_bell",
    label: "Terminal Bell",
    description: "Resonant bell ping when terminal emits bell character",
    category: "terminal",
  },
  terminal_command: {
    id: "terminal_command",
    label: "Command Executed",
    description: "Mechanical return key tap on running a terminal command",
    category: "terminal",
  },
  toast_info: {
    id: "toast_info",
    label: "Info Notification",
    description: "Soft glass tap for informational toasts",
    category: "toast",
  },
  toast_success: {
    id: "toast_success",
    label: "Success Notification",
    description: "Bright upbeat chime for success notifications",
    category: "toast",
  },
  toast_warning: {
    id: "toast_warning",
    label: "Warning Notification",
    description: "Dual alert ping for warnings",
    category: "toast",
  },
  toast_error: {
    id: "toast_error",
    label: "Error Notification",
    description: "Low warning buzz for error notifications",
    category: "toast",
  },
  tab_switch: {
    id: "tab_switch",
    label: "Tab Switched",
    description: "Light card flick when switching workbench tabs",
    category: "ui",
  },
  modal_open: {
    id: "modal_open",
    label: "Modal Opened",
    description: "Smooth swell pop when dialogs or modals open",
    category: "ui",
  },
  modal_close: {
    id: "modal_close",
    label: "Modal Closed",
    description: "Soft drop pop when dialogs or modals close",
    category: "ui",
  },
  button_click: {
    id: "button_click",
    label: "Button Click",
    description: "Subtle tactile haptic click on interactive elements",
    category: "ui",
  },
};

export const SOUND_CATEGORIES: Array<{ id: SoundCategory; label: string; description: string }> = [
  { id: "agent", label: "Agent & Assistant", description: "Prompt send, thinking, tool calls, completion chords" },
  { id: "plan", label: "Plan Previewer", description: "Plan reviews, choices, approvals, and revision requests" },
  { id: "terminal", label: "Terminal", description: "Terminal bell character and command executions" },
  { id: "toast", label: "Notifications & Alerts", description: "Toasts, info notices, warnings, and error messages" },
  { id: "ui", label: "Workbench & UI", description: "Tab switching, dialog open/close, subtle button clicks" },
];

export const SOUND_THEMES: Array<{ id: SoundTheme; label: string; description: string }> = [
  { id: "modern", label: "Modern Minimal", description: "Soft rounded sines, acoustic micro-pops, warm chords" },
  { id: "mechanical", label: "Mechanical Tactile", description: "Clicky switch transients, relay latches, crisp tactile feedback" },
  { id: "scifi", label: "Sci-Fi Synth", description: "Futuristic pitch sweeps, resonant tech blips, cybernetic chirps" },
  { id: "retro", label: "Retro 8-Bit", description: "Classic square waves, nostalgic arpeggios, vintage game beeps" },
];
