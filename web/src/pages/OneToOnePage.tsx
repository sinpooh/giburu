import { useState } from "react";
import { Me, useNow, useQuery, useSettings } from "../lib/hooks";
import { OneToOne, activeOneToOnesQuery, monthStats } from "../lib/data";
import { Meter } from "../components/Meter";
import { Schedule } from "./Schedule";
import { Members } from "./Members";

/** 「1to1」タブ：今月の件数＋予定とメンバーを切りかえ */
export function OneToOnePage({ me, initialCsv = "" }: { me: Me; initialCsv?: string }) {
  const [seg, setSeg] = useState<"schedule" | "members">(initialCsv ? "members" : "schedule");
  const now = useNow(60000);
  const settings = useSettings();
  const ones = useQuery<OneToOne>(activeOneToOnesQuery());
  return (
    <div>
      <div className="page seg-head">
        <Meter count={monthStats(ones, now).count} goal={settings.monthlyGoal} />
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
