import { useState } from "react";
import { Me, useNow, useQuery, useSettings } from "../lib/hooks";
import { OneToOne, REASONS, activeOneToOnesQuery, api, monthStats } from "../lib/data";
import { Meter } from "../components/Meter";
import { Schedule } from "./Schedule";
import { Members } from "./Members";

/** 「1to1」タブ：今月の件数＋予定とメンバーを切りかえ */
export function OneToOnePage({ me, initialCsv = "", goHome }: { me: Me; initialCsv?: string; goHome?: () => void }) {
  const [seg, setSeg] = useState<"schedule" | "members">(initialCsv ? "members" : "schedule");
  const now = useNow(60000);
  const settings = useSettings();
  const ones = useQuery<OneToOne>(activeOneToOnesQuery());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // 1to1の流れの入り口：候補カードを作ってホームへ（ホームでスワイプしてLINEで送る）
  const newProposal = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await api.requestProposal();
      if (r.reason) setMsg(REASONS[r.reason] ?? r.reason);
      else goHome?.();
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
        <button className="btn primary todo-add-big" disabled={busy} onClick={newProposal}>
          {busy ? "相手と日にちを探しています…" : "🤝 1to1の候補を出す"}
        </button>
        <p className="small muted center">押すと、相手と空いている日にちを選んでホームにカードを出します。カードを右にスワイプするとLINEで送れます</p>
        {msg && <p className="notice center">{msg}</p>}
        <div className="seg">
          <button className={seg === "schedule" ? "on" : ""} onClick={() => setSeg("schedule")}>
            📅 予定
          </button>
          <button className={seg === "members" ? "on" : ""} onClick={() => setSeg("members")}>
            👥 メンバー
          </button>
        </div>
      </div>
      {seg === "schedule" ? <Schedule me={me} /> : <Members key={initialCsv.length} initialCsv={initialCsv} />}
    </div>
  );
}
