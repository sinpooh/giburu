import { useEffect, useMemo, useRef, useState } from "react";
import { TAP_LINES } from "../lib/phrases";

export type Mood = "normal" | "praise" | "nudge" | "guide";

// 表情ごとの絵（複数あるときは表示のたびにランダム）。新しい絵は public/character/ に置いてここに足す
const WAVE = "/character/aoyama-wave.webp";
const POSES: Record<Mood, string[]> = {
  normal: [WAVE],
  praise: [WAVE],
  nudge: [WAVE],
  guide: [WAVE],
};

// 表情ごとのいつもの動き
const MOTION: Record<Mood, string> = {
  normal: "ch-bob",
  praise: "ch-jump",
  nudge: "ch-wiggle",
  guide: "ch-sway",
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/**
 * 青山さんキャラ。ずっとふわふわ動いていて、タップするとくるっと跳ねてひとことしゃべる。
 * say を渡すと頭の上に吹き出しを出す。
 */
export function Character({
  mood = "normal",
  size = 80,
  className = "",
  say,
  talk = size >= 60,
}: {
  mood?: Mood;
  size?: number;
  className?: string;
  say?: React.ReactNode;
  talk?: boolean;
}) {
  const src = useMemo(() => pick(POSES[mood]), [mood]);
  const [hop, setHop] = useState(0);
  const [line, setLine] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onTap = () => {
    setHop((h) => h + 1);
    if (!talk) return;
    setLine(pick(TAP_LINES));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLine(null), 2200);
  };

  const bubble = line ?? say;
  return (
    <span className={`ch-wrap ${say ? "ch-has-say" : ""} ${className}`} style={{ height: size }}>
      {bubble && (
        <span key={line ?? "say"} className="ch-say">
          {bubble}
        </span>
      )}
      <span className={`ch-move ${MOTION[mood]} ${size < 60 ? "ch-small" : ""}`}>
        <img
          key={hop}
          className={`character ${hop ? "ch-spin" : ""}`}
          src={src}
          alt="青山さん"
          style={{ height: size }}
          onClick={onTap}
          draggable={false}
        />
      </span>
    </span>
  );
}

export function Bubble({ mood = "normal", children }: { mood?: Mood; children: React.ReactNode }) {
  return (
    <div className="bubble-row">
      <Character mood={mood} size={92} talk={false} />
      <div key={String(children)} className="bubble bubble-pop">
        {children}
      </div>
    </div>
  );
}
