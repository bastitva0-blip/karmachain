"use client";

import { Component, type ReactNode } from "react";
import { Button } from "./ui/button";

interface State {
  failed: boolean;
}

/** Catches render errors and shows a friendly message. Never shows stack traces. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-xl border border-error-border bg-[#1C1213] p-4">
        <strong>{this.props.label ?? "This section failed to load"}</strong>
        <span className="text-[13px] text-ink-dim">The rest of the page still works.</span>
        <Button variant="outline" size="sm" className="self-start" onClick={() => this.setState({ failed: false })}>
          Reload section
        </Button>
      </div>
    );
  }
}
