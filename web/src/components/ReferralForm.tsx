import { useState } from "react";
import { collection } from "firebase/firestore";
import { db } from "../firebase";
import { useQuery } from "../lib/hooks";
import { Member } from "../lib/data";
import { Character } from "./Character";

/** 「リファーラルを記録」：だれに紹介したか（と、ひとことメモ）だけ */
export function ReferralForm({ onSubmit, onCancel }: { onSubmit: (v: { to: string; memo: string }) => Promise<void>; onCancel: () => void }) {
  const members = useQuery<Member>(collection(db, "members"));
  const [to, setTo] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>リファーラルを記録</h2>
        <input autoFocus list="ref-member-names" value={to} onChange={(e) => setTo(e.target.value)} placeholder="だれに紹介した？（例：山田さん）" />
        <datalist id="ref-member-names">
          {(members ?? []).map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="ひとことメモ（なくてもOK。例：知人の引っ越しの件）" />
        <div className="row gap center-y">
          <Character mood="praise" size={44} />
          <span className="small muted">1週間に1件がチャプターのミッション！</span>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={onCancel}>
            やめる
          </button>
          <button
            className="btn primary grow"
            disabled={!to.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSubmit({ to: to.trim().replace(/さん$/, ""), memo: memo.trim() });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "記録しています…" : "記録する"}
          </button>
        </div>
      </div>
    </div>
  );
}
