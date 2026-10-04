import { useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

interface Props {
  rightLabel: string;
  leftLabel: string;
  onRight: () => void;
  onLeft: () => void;
  readOnly?: boolean;
  tone?: "normal" | "party";
  children: React.ReactNode;
}

const THRESHOLD = 90;

/** 右スワイプ＝やる、左スワイプ＝あとで／別の案。下のボタンでも同じことができる */
export function SwipeCard({ rightLabel, leftLabel, onRight, onLeft, readOnly, tone = "normal", children }: Props) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-10, 10]);
  const rightOpacity = useTransform(x, [20, THRESHOLD], [0, 1]);
  const leftOpacity = useTransform(x, [-THRESHOLD, -20], [1, 0]);
  const [busy, setBusy] = useState(false);

  const fly = (dir: 1 | -1, fn: () => void) => {
    if (busy) return;
    setBusy(true);
    // LINEを開く処理は指を離した瞬間に呼ぶ（iPhoneで止められないように）
    fn();
    animate(x, dir * 600, { duration: 0.25 }).then(() => {
      x.set(0);
      setBusy(false);
    });
  };

  return (
    <div className="swipe-wrap">
      <motion.div
        className={`card ${tone === "party" ? "card-party" : ""}`}
        style={{ x, rotate }}
        drag={readOnly ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={(_, info) => {
          if (info.offset.x > THRESHOLD) fly(1, onRight);
          else if (info.offset.x < -THRESHOLD) fly(-1, onLeft);
        }}
      >
        <motion.div className="stamp stamp-right" style={{ opacity: rightOpacity }}>
          {rightLabel}
        </motion.div>
        <motion.div className="stamp stamp-left" style={{ opacity: leftOpacity }}>
          {leftLabel}
        </motion.div>
        {children}
        <div className="card-actions">
          <button className="link-btn left" disabled={readOnly || busy} onClick={() => fly(-1, onLeft)}>
            ← {leftLabel}
          </button>
          <button className="link-btn right" disabled={readOnly || busy} onClick={() => fly(1, onRight)}>
            {rightLabel} →
          </button>
        </div>
      </motion.div>
    </div>
  );
}
