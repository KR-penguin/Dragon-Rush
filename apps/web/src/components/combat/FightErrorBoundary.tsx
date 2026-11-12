import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Called once if the fight screen crashes (the caller settles the fight another way). */
  onError: (error: unknown) => void;
}

/** Keeps a broken fight screen from freezing the board game. */
export class FightErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('fight screen failed; settling the fight with dice', error);
    this.props.onError(error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
