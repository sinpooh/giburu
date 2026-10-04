import { DAY, fmtCountdown, startOfNextMonth } from "../lib/time";
import { useNow } from "../lib/hooks";

/** 今月の1to1メーター（メガ割風カウントダウン） */
export function Meter({ count, goal }: { count: number; goal: number }) {
  const now = useNow(1000);
  const left = startOfNextMonth(now) - now;
  const days = Math.floor(left / DAY);
  const rest = Math.max(0, goal - count);
  const hot = days <= 7 && rest > 0;
  const done = count >= goal;
  return (
    <div className={`meter ${hot ? "meter-hot" : ""} ${done ? "meter-done" : ""}`}>
      <div className="meter-top">
        <span>今月の1to1</span>
        <span className="meter-count">
          月末まで <b className="mono">{days}日 {fmtCountdown(left - days * DAY)}</b>
        </span>
      </div>
      <div className="meter-mid">
        <span className="meter-big">
          {count} / {goal}件
        </span>
        <span>{done ? (count > goal ? "ボーナスステージ！" : "達成！🎉") : `あと${rest}件！`}</span>
      </div>
      <div className="meter-bar">
        <div style={{ width: `${Math.min(100, (count / goal) * 100)}%` }} />
      </div>
    </div>
  );
}
