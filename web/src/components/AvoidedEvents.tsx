import { useEffect, useState } from "react";
import { api } from "../lib/data";
import { jst } from "../lib/time";
import { useSettings } from "../lib/hooks";

type Ev = { title: string; start: number; end: number; allDay: boolean; avoided: boolean };
const WD = "日月火水木金土";
const hm = (t: number) => {
  const p = jst(t);
  return `${p.hh}:${String(p.mm).padStart(2, "0")}`;
};
const dayKey = (t: number) => {
  const p = jst(t);
  return `${p.m}/${p.d}（${WD[p.wd]}）`;
};

/** 1to1の候補を出すときに、どの予定をよけているかの一覧 */
export function AvoidedEvents({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const [data, setData] = useState<{ connected: boolean; allCalendars?: boolean; events: Ev[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.avoidedEvents().then(setData, (e) => setErr(String(e.message ?? e)));
  }, []);
  const days = new Map<string, Ev[]>();
  for (const e of data?.events ?? []) days.set(dayKey(e.start), [...(days.get(dayKey(e.start)) ?? []), e]);
  const closed = (s.closedDays ?? []).map((d) => WD[d]).join("・");
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <h2>よけている予定</h2>
        <div className="box small">
          <div>1to1の候補は、次の時間をよけて出しています。</div>
          <div>・青山さんのGoogleカレンダーの予定（お店などの共有カレンダーも含む・下の一覧）</div>
          <div>・予定の前後{s.bufferMin}分</div>
          <div>
            ・{s.workStart}〜{s.workEnd}以外の時間{closed ? `、お休みの曜日（${closed}）` : ""}
            {s.includeWeekends ? "" : "、土日"}
          </div>
          <div>・ほかの1to1で使っている時間</div>
        </div>
        {err && <p className="notice">読みこめませんでした：{err}</p>}
        {!data && !err && <p className="muted center">カレンダーを見ています…</p>}
        {data?.connected && data.allCalendars === false && <p className="notice small">今は青山さん本人のカレンダーだけ見ています。お店のカレンダーなども見るには、青山さんのアカウントで「設定 → カレンダーをつなぎ直す」をしてください</p>}
        {data && !data.connected && <p className="notice">カレンダーがつながっていないので、予定はよけていません。設定からつないでください。</p>}
        {data?.connected && data.events.length === 0 && <p className="muted center">この2週間、カレンダーに予定はありません</p>}
        {[...days.entries()].map(([day, evs]) => (
          <div key={day}>
            <div className="small muted av-day">{day}</div>
            {evs.map((e, i) => (
              <div key={i} className={`av-item ${e.avoided ? "" : "av-no"}`}>
                <span className="av-time">{e.allDay ? "終日" : `${hm(e.start)}〜${hm(e.end)}`}</span>
                <span className="grow">{e.title}</span>
                <span className="small">{e.avoided ? "✅ よけている" : "⚠️ よけていない"}</span>
              </div>
            ))}
          </div>
        ))}
        {data?.connected && (
          <p className="small muted">
            ⚠️は、Googleカレンダーで「予定なし（空き）」になっている予定です。よけたいときは、その予定を開いて「予定あり」に変えてください。
            ここに出ていない予定（お店の共有カレンダーなど、別のカレンダーの予定）はよけていません。
          </p>
        )}
        <button className="btn ghost" onClick={onClose}>
          とじる
        </button>
      </div>
    </div>
  );
}
