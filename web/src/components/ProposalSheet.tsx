import { useEffect, useState } from "react";
import { Card } from "../lib/cards";
import { CalEv, REASONS, api } from "../lib/data";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { lineUrlFor } from "../lib/replies";
import { DayTimeline } from "./DayTimeline";
import { usePraise } from "./Praise";

/** 1to1タブの中で、候補日とLINE文面を見て送る画面 */
export function ProposalSheet({ card, onClose, onSwitch }: { card: Card | undefined; onClose: () => void; onSwitch: (cardId: string) => void }) {
  const { praise } = usePraise();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showText, setShowText] = useState(false);
  // LINEを開く前の確認（文面を直せる）
  const [draft, setDraft] = useState<string | null>(null);
  // 候補日ごとの実際の予定（Googleカレンダー）
  const [events, setEvents] = useState<CalEv[] | null | "off">(null);
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => {
    api.avoidedEvents().then(
      (r) => (setEvents(r.connected ? r.events : "off"), setOnlyMine(r.connected && r.allCalendars === false)),
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

  // 候補の時間にかぶっている予定（自分で足した日時など）
  const clashes = (start: number, end: number) =>
    Array.isArray(events) ? events.filter((e) => e.avoided && e.start < end && e.end > start).map((e) => (e.allDay ? `${e.title}（終日）` : e.title)) : [];
  const warn = (start: number, end: number) => {
    const c = clashes(start, end);
    return c.length ? <div className="clash-warn">⚠️ この時間は{c.slice(0, 3).join("・")}の予定があります</div> : null;
  };

  // 候補日を直す（1つ消す・自分で足す）
  const [adding, setAdding] = useState(false);
  const [newAt, setNewAt] = useState("");
  const saveSlots = (starts: string[]) =>
    run(async () => {
      await api.editSlots({ cardId: card!.id, starts });
    });

  // 直した文面をカードに残す（「もどる」「あとで」でも消えないように）
  const saveDraft = () => {
    if (!card || draft === null) return;
    const text = draft.trim();
    if (text && text !== (card.lineText ?? "").trim()) updateDoc(doc(db, "cards", card.id), { lineText: text, lineUrl: lineUrlFor(text) }).catch(() => undefined);
  };
  const send = () => {
    if (!card || draft === null) return;
    const text = draft.trim();
    // 直した文面はカードにも残す
    if (text !== (card.lineText ?? "").trim()) updateDoc(doc(db, "cards", card.id), { lineText: text, lineUrl: lineUrlFor(text) }).catch(() => undefined);
    // 先に「送った」を記録してからLINEを開く（LINEに切りかわると通信が切れることがあるため）
    api.markSent({ cardId: card.id }).catch((e) => setMsg(String(e.message ?? e)));
    window.open(lineUrlFor(text), "_blank");
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
        {card && draft !== null ? (
          <>
            <h2>この内容で送ります</h2>
            <p className="small muted">直したいところは、そのまま書きかえてOKです</p>
            <textarea className="line-edit" rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn primary" disabled={!draft.trim()} onClick={send}>
              💬 この内容でLINEを開く
            </button>
            <button className="btn ghost" onClick={() => setDraft(card.lineText ?? "")}>
              元の文面にもどす
            </button>
            <button className="btn ghost" onClick={() => (saveDraft(), setDraft(null))}>
              もどる
            </button>
          </>
        ) : !card ? (
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
                  <li key={s.start}>
                    <div className="row between">
                    <span>📅 {s.label}</span>
                    {(card.slots ?? []).length > 1 && (
                      <button className="link-btn small" disabled={busy} onClick={() => saveSlots((card.slots ?? []).filter((x) => x.start !== s.start).map((x) => x.start))}>
                        ✕ 消す
                      </button>
                    )}
                    </div>
                    {warn(Date.parse(s.start), Date.parse(s.end))}
                  </li>
                ))}
              </ul>
              {adding ? (
                <>
                <div className="row gap slot-add">
                  <input type="datetime-local" step={1800} value={newAt} onChange={(e) => setNewAt(e.target.value)} />
                  <button
                    className="btn primary"
                    disabled={busy || !newAt}
                    onClick={() => (saveSlots([...(card.slots ?? []).map((x) => x.start), new Date(newAt).toISOString()]), setAdding(false), setNewAt(""))}
                  >
                    足す
                  </button>
                </div>
                {newAt && warn(new Date(newAt).getTime(), new Date(newAt).getTime() + 60 * 60000)}
                </>
              ) : (
                (card.slots ?? []).length < 5 && (
                  <button className="link-btn small" onClick={() => setAdding(true)}>
                    ＋ 日時を自分で入れる
                  </button>
                )
              )}
            </div>
            <button className="link-btn small" onClick={() => setShowText(!showText)}>
              {showText ? "▲ LINEの文面を閉じる" : "▼ LINEの文面を見る"}
            </button>
            {showText && <pre className="line-preview">{card.lineText}</pre>}
            {msg && <p className="notice center">{msg}</p>}
            <button className="btn primary" disabled={busy} onClick={() => setDraft(card.lineText ?? "")}>
              💬 LINEで送る
            </button>
            <div className="row gap">
              <button className="btn ghost grow" disabled={busy} onClick={other}>
                別の人にする
              </button>
              <button className="btn ghost grow" disabled={busy} onClick={remove}>
                🗑 この人をやめる
              </button>
            </div>
          </>
        )}
        <button className="btn ghost" onClick={() => (saveDraft(), onClose())}>
          あとで
        </button>
        {card && draft === null && (
          <div>
            <h3>候補日のカレンダー</h3>
            {events === null && <p className="small muted">カレンダーを読み込み中…</p>}
            {onlyMine && <p className="notice small">お店のカレンダーなど、ほかのカレンダーの予定はまだ入っていません。青山さんのアカウントで「設定 → カレンダーをつなぎ直す」をすると入ります</p>}
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
