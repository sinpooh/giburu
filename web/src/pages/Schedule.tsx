import { useQuery, useNow } from "../lib/hooks";
import { useState } from "react";
import { Memo, OneToOne, Referral, activeOneToOnesQuery, api, deleteReferral, memoSummary, memosQuery, referralsQuery, saveMemo } from "../lib/data";
import { MemoForm } from "../components/MemoForm";
import { Me } from "../lib/hooks";
import { fmtDateTime, fmtRange } from "../lib/time";

export function Schedule({ me }: { me?: Me }) {
  const now = useNow(60000);
  const rows = useQuery<OneToOne>(activeOneToOnesQuery());
  const [busy, setBusy] = useState<string | null>(null);
  const refs = useQuery<Referral>(referralsQuery());
  const [msg, setMsg] = useState("");
  const memos = useQuery<Memo>(memosQuery());
  const [editing, setEditing] = useState<OneToOne | null>(null);
  const cancel = async (o: OneToOne, what: string) => {
    const past = what === "記録";
    const note = past ? "今月の件数からも外れます。" : o.status === "confirmed" ? "カレンダーの予定も消えます。" : "送ったリンクも使えなくなります。";
    if (!window.confirm(`${o.memberName}さんの${what}を${past ? "消し" : "取り消し"}ます。${note}よろしいですか？${past ? "" : "\n（相手への連絡は、必要ならLINEでお願いします）"}`)) return;
    setBusy(o.id);
    setMsg("");
    try {
      const r = await api.cancelOneToOne({ id: o.id });
      setMsg(r.calendarOk === false ? "消しました。カレンダーの予定は消せなかったので、手で消してください" : what === "記録" ? "消しました。今月の件数からも外れました" : "取り消しました");
    } catch (e) {
      setMsg(`取り消せませんでした：${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(null);
    }
  };
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
      {msg && <p className="notice">{msg}</p>}
      <section>
        <h3>これからの1to1</h3>
        {upcoming.length === 0 && <p className="muted">まだありません</p>}
        {upcoming.map((o) => (
          <div key={o.id} className="list-item">
            <b>{fmtRange(Date.parse(o.confirmedSlot!.start), Date.parse(o.confirmedSlot!.end))}</b>
            <div>
              {o.memberName}さん{o.company ? `（${o.company}）` : ""}
            </div>
            <button className="link-btn small" disabled={busy === o.id} onClick={() => cancel(o, "1to1")}>
              {busy === o.id ? "取り消し中…" : "この1to1を取り消す"}
            </button>
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
            <button className="link-btn small" disabled={busy === o.id} onClick={() => cancel(o, "お誘い")}>
              {busy === o.id ? "取り消し中…" : "このお誘いを取り消す"}
            </button>
          </div>
        ))}
      </section>
      <section>
        <h3>最近やった1to1</h3>
        {past.length === 0 && <p className="muted">なし</p>}
        {past.map((o) => (
          <div key={o.id} className="list-item">
            <div className="muted">
              {fmtDateTime(Date.parse(o.confirmedSlot!.start))} {o.memberName}さん
            </div>
            {(() => {
              const m = memos?.find((x) => x.oneToOneId === o.id);
              return (
                <>
                  {m && <div className="memo-line">📝 {memoSummary(m)}</div>}
                  <button className="link-btn small" onClick={() => setEditing(o)}>
                    {m ? "メモを直す" : "メモを書く"}
                  </button>
                </>
              );
            })()}
            <button className="link-btn small" disabled={busy === o.id} onClick={() => cancel(o, "記録")}>
              {busy === o.id ? "消しています…" : "テストだったので消す"}
            </button>
          </div>
        ))}
      </section>
      {editing && (
        <MemoForm
          name={editing.memberName}
          initial={memos?.find((x) => x.oneToOneId === editing.id)}
          onCancel={() => setEditing(null)}
          onSubmit={async (v) => {
            await saveMemo({ oneToOneId: editing.id, memberId: editing.memberId, memberName: editing.memberName, ...v, byName: me?.name ?? "" });
            setEditing(null);
            setMsg("メモを残しました");
          }}
        />
      )}
      <section>
        <h3>最近のリファーラル</h3>
        {(refs ?? []).length === 0 && <p className="muted">まだありません</p>}
        {(refs ?? []).slice(0, 15).map((r) => (
          <div key={r.id} className="list-item">
            <div>
              {r.createdAt ? fmtDateTime(r.createdAt.toMillis()) : ""} {r.to}さんに紹介
            </div>
            {r.memo && <div className="muted small">{r.memo}</div>}
            <button
              className="link-btn small"
              onClick={() => window.confirm(`${r.to}さんへのリファーラルの記録を消します。よろしいですか？`) && deleteReferral(r.id)}
            >
              消す
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
