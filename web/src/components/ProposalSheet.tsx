import { useEffect, useState } from "react";
import { Card } from "../lib/cards";
import { CalEv, REASONS, api } from "../lib/data";
import { DayTimeline } from "./DayTimeline";
import { usePraise } from "./Praise";

/** 1to1タブの中で、候補日とLINE文面を見て送る画面 */
export function ProposalSheet({ card, onClose, onSwitch }: { card: Card | undefined; onClose: () => void; onSwitch: (cardId: string) => void }) {
  const { praise } = usePraise();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showText, setShowText] = useState(false);
  // 候補日ごとの実際の予定（Googleカレンダー）
  const [events, setEvents] = useState<CalEv[] | null | "off">(null);
  useEffect(() => {
    api.avoidedEvents().then(
      (r) => setEvents(r.connected ? r.events : "off"),
      () => setEvents("off"),
    );
  }, []);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setMsg("");
    try {
      await f();
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    if (!card) return;
    if (card.lineUrl) window.open(card.lineUrl, "_blank");
    api.markSent({ cardId: card.id }).catch((e) => setMsg(String(e.message ?? e)));
    praise("送った！あとは返事を待つだけ！");
    onClose();
  };
  const other = () =>
    run(async () => {
      const r = await api.skipProposal({ cardId: card!.id });
      if (r.cardId) onSwitch(r.cardId);
      else {
        setMsg(REASONS[r.reason ?? ""] ?? r.reason ?? "");
        onClose();
      }
    });
  const remove = () =>
    run(async () => {
      await api.skipProposal({ cardId: card!.id, next: false });
      onClose();
    });

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        {!card ? (
          <p className="muted center">候補を用意しています…</p>
        ) : (
          <>
            <h2>{card.title}と1to1</h2>
            {card.sub && <p className="muted small">{card.sub}</p>}
            {card.hint && <p className="small">{card.hint}</p>}
            <div className="box">
              <b>この日にちで聞きます</b>
              <ul className="slot-list">
                {(card.slots ?? []).map((s) => (
                  <li key={s.start}>📅 {s.label}</li>
                ))}
              </ul>
            </div>
            <button className="link-btn small" onClick={() => setShowText(!showText)}>
              {showText ? "▲ LINEの文面を閉じる" : "▼ LINEの文面を見る"}
            </button>
            {showText && <pre className="line-preview">{card.lineText}</pre>}
            {msg && <p className="notice center">{msg}</p>}
            <button className="btn primary" disabled={busy} onClick={send}>
              💬 LINEで送る
            </button>
            <div className="row gap">
              <button className="btn ghost grow" disabled={busy} onClick={other}>
                別の人にする
              </button>
              <button className="btn ghost grow" disabled={busy} onClick={remove}>
                🗑 消す
              </button>
            </div>
          </>
        )}
        <button className="btn ghost" onClick={onClose}>
          あとで
        </button>
        {card && (
          <div>
            <h3>候補日のカレンダー</h3>
            {events === null && <p className="small muted">カレンダーを読み込み中…</p>}
            {events === "off" && <p className="small muted">カレンダーが読めませんでした（設定でカレンダーをつなぐと出ます）</p>}
            {Array.isArray(events) &&
              (card.slots ?? []).map((s) => (
                <div key={s.start}>
                  <p className="daytl-day">
                    <b>📅 {s.label}</b>
                  </p>
                  <DayTimeline events={events} slot={s} />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
