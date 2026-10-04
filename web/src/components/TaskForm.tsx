import { useState } from "react";
import { DAY, endOfDay, jst, jstDate } from "../lib/time";

export type DueChoice = "today" | "tomorrow" | "week" | "date";

export function dueFrom(choice: DueChoice, date: string, now = Date.now()): number {
  if (choice === "today") return endOfDay(now);
  if (choice === "tomorrow") return endOfDay(now + DAY);
  if (choice === "week") {
    const wd = jst(now).wd; // 日曜まで
    return endOfDay(now + ((7 - wd) % 7) * DAY);
  }
  const [y, m, d] = date.split("-").map(Number);
  return jstDate(y, m, d, 23, 59).getTime();
}

/** お願い・LINE返信あとで の追加フォーム（内容と期限だけ） */
export function TaskForm({
  title,
  placeholder,
  withDetail,
  onSubmit,
  onCancel,
}: {
  title: string;
  placeholder: string;
  withDetail?: boolean;
  onSubmit: (v: { title: string; detail: string; dueAt: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [detail, setDetail] = useState("");
  const [choice, setChoice] = useState<DueChoice>("today");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = text.trim() && (choice !== "date" || date);

  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        {withDetail && <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="詳しいメモ（なくてもOK）" rows={3} />}
        <div className="chips">
          {(
            [
              ["today", "今日中"],
              ["tomorrow", "明日まで"],
              ["week", "今週中"],
              ["date", "日付指定"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`chip ${choice === k ? "on" : ""}`} onClick={() => setChoice(k)}>
              {l}
            </button>
          ))}
        </div>
        {choice === "date" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        <div className="row gap">
          <button className="btn ghost" onClick={onCancel}>
            やめる
          </button>
          <button
            className="btn primary grow"
            disabled={!ok || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSubmit({ title: text.trim(), detail: detail.trim(), dueAt: dueFrom(choice, date) });
              } finally {
                setSaving(false);
              }
            }}
          >
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}
