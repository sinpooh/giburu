import { useState } from "react";
import { CardInfo, MET_PLACES, addFromBusinessCard, api } from "../lib/data";
import { shrinkImage } from "../lib/image";
import { ymd } from "../lib/time";
import { Character } from "./Character";

const EMPTY: CardInfo = { name: "", company: "", title: "", industry: "", phone: "", email: "", address: "" };

/** 「📇 名刺を撮る」：撮る→AIが読み取る→直して登録（メンバー外）→ホームにあいさつLINEのカード */
export function CardScan({ byName, onDone, onCancel }: { byName: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [photo, setPhoto] = useState("");
  const [card, setCard] = useState<CardInfo | null>(null);
  const [met, setMet] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setMsg("");
    try {
      const data = await shrinkImage(f, 1600, 0.8);
      setPhoto(data);
      const r = await api.readCard({ image: data }).catch(() => ({ ok: false }) as { ok: boolean; card?: CardInfo });
      if (r.ok && r.card) setCard(r.card);
      else {
        setCard({ ...EMPTY });
        setMsg("うまく読み取れなかったので、名前だけ入れてください");
      }
    } catch {
      setMsg("写真を読みこめませんでした");
    } finally {
      setBusy(false);
    }
  };
  const set = (p: Partial<CardInfo>) => setCard({ ...(card ?? EMPTY), ...p });

  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <h2>📇 名刺を撮る</h2>
        {!card && (
          <>
            <label className="btn primary photo-take">
              {busy ? "読み取っています…" : "📷 名刺を撮る・写真を選ぶ"}
              <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
            </label>
            <div className="row gap center-y">
              <Character mood="guide" size={44} />
              <span className="small muted">名前・会社・連絡先を読み取ります</span>
            </div>
          </>
        )}
        {msg && <p className="small notice">{msg}</p>}
        {card && (
          <>
            {photo && <img className="card-photo" src={photo} alt="名刺" />}
            <label className="field">
              <span>名前</span>
              <input value={card.name} onChange={(e) => set({ name: e.target.value })} placeholder="山田 太郎" />
            </label>
            <div className="grid2">
              <label className="field">
                <span>会社</span>
                <input value={card.company} onChange={(e) => set({ company: e.target.value })} />
              </label>
              <label className="field">
                <span>業種</span>
                <input value={card.industry} onChange={(e) => set({ industry: e.target.value })} />
              </label>
              <label className="field">
                <span>電話</span>
                <input value={card.phone} onChange={(e) => set({ phone: e.target.value })} />
              </label>
              <label className="field">
                <span>メール</span>
                <input value={card.email} onChange={(e) => set({ email: e.target.value })} />
              </label>
            </div>
            <div className="small muted">どこで会った？（押さなくてもOK）</div>
            <div className="chips">
              {MET_PLACES.map((p) => (
                <button key={p} className={`chip ${met === p ? "on" : ""}`} onClick={() => setMet(met === p ? "" : p)}>
                  {p}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="row gap">
          <button className="btn ghost" onClick={onCancel}>
            やめる
          </button>
          {card && (
            <button
              className="btn primary grow"
              disabled={!card.name.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const c = { ...card, name: card.name.trim().replace(/さん$/, "") };
                  await addFromBusinessCard(c, met, photo, ymd(Date.now()), byName);
                  onDone(c.name);
                } catch (e) {
                  setMsg(`登録できませんでした：${String((e as Error).message ?? e)}`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              登録する
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
