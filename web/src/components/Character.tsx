export type Mood = "normal" | "praise" | "nudge" | "guide";

export function Character({ mood = "normal", size = 80, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  return <img className={`character ${className}`} src={`/character/${mood}.svg`} alt="店長シンプー" style={{ height: size }} />;
}

export function Bubble({ mood = "normal", children }: { mood?: Mood; children: React.ReactNode }) {
  return (
    <div className="bubble-row">
      <Character mood={mood} size={92} />
      <div className="bubble">{children}</div>
    </div>
  );
}
