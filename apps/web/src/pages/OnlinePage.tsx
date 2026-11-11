interface OnlinePageProps {
  onBack: () => void;
}

/** Placeholder until the online lobby lands. */
export function OnlinePage({ onBack }: OnlinePageProps) {
  return (
    <main className="placeholder-page">
      <div className="panel placeholder-card">
        <span className="menu-icon">🌐</span>
        <h1>온라인 게임</h1>
        <p className="muted">준비 중</p>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← 처음으로
        </button>
      </div>
    </main>
  );
}
