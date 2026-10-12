import { CalEv } from "../lib/data";
import { jst, startOfDay } from "../lib/time";

// Googleカレンダーの予定の色（colorId 1〜11）。指定がない予定はピーコック
const COLORS: Record<string, string> = {
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#f6bf26",
  "6": "#f4511e",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d50000",
};
const colorOf = (e: CalEv) => COLORS[e.color ?? ""] ?? "#039be5";
const HOUR_PX = 44;
const hm = (t: number) => {
  const p = jst(t);
  return `${p.hh}:${String(p.mm).padStart(2, "0")}`;
};

/** 候補日1日分の予定を、Googleカレンダーの1日表示のように見せる（候補の時間は点線の枠） */
export function DayTimeline({ events, slot }: { events: CalEv[]; slot: { start: string; end: string } }) {
  const s0 = Date.parse(slot.start);
  const s1 = Date.parse(slot.end);
  const day0 = startOfDay(s0);
  const day1 = day0 + 24 * 3600000;
  const allDay = events.filter((e) => e.allDay && e.start < day1 && e.end > day0);
  const timed = events.filter((e) => !e.allDay && e.start < day1 && e.end > day0).sort((a, b) => a.start - b.start);

  // 表示する時間帯：8時〜20時を基本に、予定や候補がはみ出すときは広げる
  const hourOf = (t: number) => (t - day0) / 3600000;
  let from = 8;
  let to = 20;
  for (const t of [s0, s1, ...timed.flatMap((e) => [Math.max(e.start, day0), Math.min(e.end, day1)])]) {
    from = Math.min(from, Math.floor(hourOf(t)));
    to = Math.max(to, Math.ceil(hourOf(t)));
  }
  const top = (t: number) => (hourOf(t) - from) * HOUR_PX;

  // 重なっている予定は横に並べる
  const cols: number[] = [];
  const placed = timed.map((e) => {
    let c = cols.findIndex((end) => end <= e.start);
    if (c < 0) c = cols.push(0) - 1;
    cols[c] = e.end;
    return { e, c };
  });
  const n = Math.max(1, cols.length);

  return (
    <div className="daytl">
      {allDay.map((e, i) => (
        <div key={i} className="daytl-allday" style={{ background: colorOf(e) }}>
          {e.title}
        </div>
      ))}
      <div className="daytl-grid" style={{ height: (to - from) * HOUR_PX }}>
        {Array.from({ length: to - from + 1 }, (_, i) => (
          <div key={i} className="daytl-hour" style={{ top: i * HOUR_PX }}>
            <span>{from + i}:00</span>
          </div>
        ))}
        {placed.map(({ e, c }, i) => (
          <div
            key={i}
            className={`daytl-ev ${e.avoided ? "" : "free"}`}
            style={{
              top: top(Math.max(e.start, day0)),
              height: Math.max(18, top(Math.min(e.end, day1)) - top(Math.max(e.start, day0)) - 2),
              left: `calc(48px + (100% - 50px) * ${c / n})`,
              width: `calc((100% - 50px) / ${n} - 2px)`,
              background: colorOf(e),
            }}
          >
            <b>{e.title}</b>
            <span>
              {hm(e.start)}〜{hm(e.end)}
            </span>
          </div>
        ))}
        <div className="daytl-slot" style={{ top: top(s0), height: top(s1) - top(s0) }}>
          <span>
            ここを提案 {hm(s0)}〜{hm(s1)}
          </span>
        </div>
      </div>
      {timed.length === 0 && allDay.length === 0 && <p className="small muted center">この日の予定はありません</p>}
    </div>
  );
}
