import { useQuery, useNow } from "../lib/hooks";
import { OneToOne, activeOneToOnesQuery } from "../lib/data";
import { fmtDateTime, fmtRange } from "../lib/time";

export function Schedule() {
  const now = useNow(60000);
  const rows = useQuery<OneToOne>(activeOneToOnesQuery());
  if (!rows) return <div className="page muted center">読み込み中…</div>;
  const iso = new Date(now).toISOString();
  const upcoming = rows.filter((o) => o.status === "confirmed" && o.confirmedSlot && o.confirmedSlot.end >= iso).sort((a, b) => a.confirmedSlot!.start.localeCompare(b.confirmedSlot!.start));
  const waiting = rows.filter((o) => o.status === "waiting");
  const past = rows
    .filter((o) => o.status === "done" || (o.status === "confirmed" && o.confirmedSlot && o.confirmedSlot.end < iso))
    .sort((a, b) => b.confirmedSlot!.start.localeCompare(a.confirmedSlot!.start))
    .slice(0, 10);

  return (
    <div className="page">
      <h1>予定</h1>
      <section>
        <h3>これからの1to1</h3>
        {upcoming.length === 0 && <p className="muted">まだありません</p>}
        {upcoming.map((o) => (
          <div key={o.id} className="list-item">
            <b>{fmtRange(Date.parse(o.confirmedSlot!.start), Date.parse(o.confirmedSlot!.end))}</b>
            <div>
              {o.memberName}さん{o.company ? `（${o.company}）` : ""}
            </div>
          </div>
        ))}
      </section>
      <section>
        <h3>返事待ち</h3>
        {waiting.length === 0 && <p className="muted">なし</p>}
        {waiting.map((o) => (
          <div key={o.id} className="list-item">
            <div>{o.memberName}さん</div>
            <div className="muted small">{o.expiresAt ? `リンクの期限 ${fmtDateTime(o.expiresAt.toMillis())}` : ""}</div>
          </div>
        ))}
      </section>
      <section>
        <h3>最近やった1to1</h3>
        {past.length === 0 && <p className="muted">なし</p>}
        {past.map((o) => (
          <div key={o.id} className="list-item muted">
            {fmtDateTime(Date.parse(o.confirmedSlot!.start))} {o.memberName}さん
          </div>
        ))}
      </section>
    </div>
  );
}
