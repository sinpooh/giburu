import { useState } from "react";
import { Me, useNow, useQuery, useSettings } from "../lib/hooks";
import { OneToOne, REASONS, activeOneToOnesQuery, api, monthStats, openCardsQuery } from "../lib/data";
import { Card } from "../lib/cards";
import { ProposalSheet } from "../components/ProposalSheet";
import { Meter } from "../components/Meter";
import { Partner, PartnerPicker } from "../components/PartnerPicker";
import { AvoidedEvents } from "../components/AvoidedEvents";
import { Schedule } from "./Schedule";
import { Members } from "./Members";

/** 「1to1」タブ：今月の件数＋予定とメンバーを切りかえ */
export function OneToOnePage({ me, initialCsv = "" }: { me: Me; initialCsv?: string }) {
  const [seg, setSeg] = useState<"schedule" | "members">(initialCsv ? "members" : "schedule");
  const now = useNow(60000);
  const settings = useSettings();
  const ones = useQuery<OneToOne>(activeOneToOnesQuery());
  const cards = useQuery<Card>(openCardsQuery());
  const pending = (cards ?? []).filter((c) => c.type === "proposal");
  // 開いている候補（候補日とLINE文面の画面）
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // 1to1の流れの入り口：候補を作って、この画面の中で候補日とLINE文面を出す
  const [picking, setPicking] = useState(false);
  const [showAvoid, setShowAvoid] = useState(false);
  const newProposal = async (p: Partner) => {
    setPicking(false);
    setBusy(true);
    setMsg("");
    try {
      const r = await api.requestProposal(p ?? undefined);
      if (r.cardId) setSheetId(r.cardId);
      else if (r.reason) setMsg(REASONS[r.reason] ?? r.reason);
    } catch (e) {
      setMsg(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="page seg-head">
        <Meter count={monthStats(ones, now).count} goal={settings.monthlyGoal} />
        <button className="btn primary todo-add-big" disabled={busy} onClick={() => setPicking(true)}>
          {busy ? "相手と日にちを探しています…" : "🤝 1to1の候補を出す"}
        </button>
        <p className="small muted center">相手を選ぶ（おまかせもOK）と、空いている日にちを3つ探します。そのままLINEで送れます</p>
        {msg && <p className="notice center">{msg}</p>}
        <p className="center">
          <button className="link-btn small" onClick={() => setShowAvoid(true)}>
            📅 よけている予定を見る
          </button>
        </p>
        {showAvoid && <AvoidedEvents onClose={() => setShowAvoid(false)} />}
        {picking && <PartnerPicker onPick={newProposal} onCancel={() => setPicking(false)} />}
        {sheetId && <ProposalSheet card={(cards ?? []).find((c) => c.id === sheetId)} onClose={() => setSheetId(null)} onSwitch={setSheetId} />}
        {pending.length > 0 && (
          <div className="pending-list">
            <h3>送る前のおすすめ（{pending.length}）</h3>
            {pending.map((c) => (
              <button key={c.id} className="list-item" onClick={() => setSheetId(c.id)}>
                <div className="row between">
                  <b>{c.title}</b>
                  <span className="small accent-text">見る・送る ›</span>
                </div>
                {c.sub && <div className="muted small">{c.sub}</div>}
              </button>
            ))}
          </div>
        )}
        <div className="seg">
          <button className={seg === "schedule" ? "on" : ""} onClick={() => setSeg("schedule")}>
            📅 予定
          </button>
          <button className={seg === "members" ? "on" : ""} onClick={() => setSeg("members")}>
            👥 メンバー
          </button>
        </div>
      </div>
      {seg === "schedule" ? <Schedule me={me} /> : <Members key={initialCsv.length} initialCsv={initialCsv} byName={me.name} onCardAdded={(n) => setMsg(`${n}さんを登録しました！ホームにあいさつLINEのカードが出ています`)} onStart={(id) => (window.scrollTo({ top: 0, behavior: "smooth" }), newProposal({ memberId: id }))} busy={busy} />}
    </div>
  );
}
