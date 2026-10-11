import { useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import { db } from "../firebase";
import { useQuery } from "../lib/hooks";
import { Member } from "../lib/data";

export type Partner = { memberId?: string; outside?: { name: string; company?: string } } | null; // null＝おまかせ

/** 1to1の相手を選ぶ：おまかせ／メンバー一覧から／メンバー以外の人 */
export function PartnerPicker({ onPick, onCancel }: { onPick: (p: Partner) => void; onCancel: () => void }) {
  const members = useQuery<Member>(collection(db, "members"));
  const [q, setQ] = useState("");
  const [outside, setOutside] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const list = useMemo(() => {
    const k = q.trim();
    return (members ?? [])
      .filter((m) => !k || m.name.includes(k) || (m.company ?? "").includes(k) || (m.industry ?? "").includes(k))
      .sort((a, b) => Number(!!a.outside) - Number(!!b.outside) || a.name.localeCompare(b.name, "ja"));
  }, [members, q]);
  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <h2>だれと1to1する？</h2>
        <button className="btn primary" onClick={() => onPick(null)}>
          ✨ おまかせ（しばらく会っていない人を選びます）
        </button>
        {!outside ? (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 名前・会社・業種でさがす" />
            <div className="pick-list">
              {list.map((m) => (
                <button key={m.id} className="pick-item" onClick={() => onPick({ memberId: m.id })}>
                  <b>{m.name}さん</b>
                  {m.outside && <span className="tag">メンバー外</span>}
                  <span className="muted small">{[m.company, m.industry].filter(Boolean).join("・")}</span>
                </button>
              ))}
              {members && list.length === 0 && <p className="muted small center">見つかりませんでした</p>}
            </div>
            <button className="btn ghost" onClick={() => (setOutside(true), setName(q.trim()))}>
              ＋ メンバー以外の人を入れる
            </button>
          </>
        ) : (
          <>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="名前（例：山田 太郎）" />
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="会社名（なくてもOK）" />
            <p className="small muted">次からはメンバー一覧に「メンバー外」として出るので、選ぶだけでOKです</p>
            <div className="row gap">
              <button className="btn ghost" onClick={() => setOutside(false)}>
                もどる
              </button>
              <button className="btn primary grow" disabled={!name.trim()} onClick={() => onPick({ outside: { name: name.trim().replace(/さん$/, ""), company: company.trim() } })}>
                この人で候補を出す
              </button>
            </div>
          </>
        )}
        <button className="btn ghost" onClick={onCancel}>
          やめる
        </button>
      </div>
    </div>
  );
}
