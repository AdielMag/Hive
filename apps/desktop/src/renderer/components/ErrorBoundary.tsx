/** Contains render crashes to one region instead of blanking the whole window. */
import React from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

interface Props {
  label: string;
  /** Changing this clears the error (e.g. switching tabs). */
  resetKey?: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  key?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[${this.props.label}] render error`, error, info.componentStack);
  }

  override render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ui-empty" style={{ height: "100%" }}>
        <TriangleAlert size={20} color="var(--danger)" />
        <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{this.props.label} hit an error</div>
        <div className="selectable" style={{ fontSize: 11, maxWidth: 420, fontFamily: "var(--font-mono)" }}>
          {this.state.error.message}
        </div>
        <button className="ui-btn ui-btn--sm" style={{ marginTop: 8 }} onClick={() => this.setState({ error: null })}>
          <RotateCcw size={12} /> Try again
        </button>
      </div>
    );
  }
}
