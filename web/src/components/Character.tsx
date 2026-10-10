import { useEffect, useMemo, useRef, useState } from "react";
import { TAP_LINES } from "../lib/phrases";

export type Mood = "normal" | "praise" | "nudge" | "guide";

// 表情ごとの絵（"!" つきは左右反転）。表示中も数秒ごとに同じ気分の別の絵に切りかわる
const img = (n: string) => `/character/aoyama-${n}.webp`;
const POSES: Record<Mood, string[]> = {
  normal: ["wave", "smile", "calm", "wink", "!wave", "!smile"],
  praise: ["smile", "love", "wink", "!smile", "!love", "!wink"],
  nudge: ["oh", "!oh", "wave"],
  guide: ["wave", "wink", "calm", "!wave", "!wink"],
};

// 切りかえでちらつかないよう先に読みこんでおく
if (typeof window !== "undefined") ["wave", "smile", "calm", "wink", "love", "oh"].forEach((n) => (new Image().src = img(n)));

// 表情ごとの動き（表示のたびにどれか）
const MOTION: Record<Mood, string[]> = {
  normal: ["ch-bob", "ch-skip", "ch-hop2"],
  praise: ["ch-jump", "ch-twirl", "ch-hop2"],
  nudge: ["ch-wiggle"],
  guide: ["ch-sway", "ch-skip"],
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
  const [pose, setPose] = useState(() => pick(POSES[mood]));
  const motion = useMemo(() => pick(MOTION[mood]), [mood]);
  useEffect(() => {
    setPose(pick(POSES[mood]));
    if (size < 60) return;
    const id = window.setInterval(() => setPose((p) => pick(POSES[mood].filter((x) => x !== p))), 3500 + Math.random() * 3000);
    return () => window.clearInterval(id);
  }, [mood, size]);
  const tapPose = () => setPose(pick(POSES.praise));
  const flip = pose.startsWith("!");
  const [hop, setHop] = useState(0);
  const [line, setLine] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onTap = () => {
    setHop((h) => h + 1);
    tapPose();
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
      <span className={`ch-move ${motion} ${size < 60 ? "ch-small" : ""}`}>
        <img
          key={hop}
          className={`character ${hop ? "ch-spin" : ""}`}
          src={img(pose.replace("!", ""))}
          alt="青山さん"
          style={{ height: size, scale: flip ? "-1 1" : undefined }}
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
