import { useState } from "react";
import { collection } from "firebase/firestore";
import { db } from "../firebase";
import { useQuery } from "../lib/hooks";
import { MEMO_TAGS, Member, Memo } from "../lib/data";
import { Character } from "./Character";

/**
 * 1to1のあとの「ひとことメモ」。基本はボタンをタップするだけ。
 * 文章は書きたいときだけ（iPhoneならキーボードのマイクで話してもOK）
 */
export function MemoForm({
  name,
  initial,
  onSubmit,
  onCancel,
}: {
  name: string;
  initial?: Memo;
  onSubmit: (v: { tags: string[]; connect: string[]; text: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const members = useQuery<Member>(collection(db, "members"));
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [connect, setConnect] = useState<string[]>(initial?.connect ?? []);
  const [who, setWho] = useState("");
  const [text, setText] = useState(initial?.text ?? "");
  const [saving, setSaving] = useState(false);
  const toggle = (t: string) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  const addWho = () => {
    const n = who.trim().replace(/さん$/, "");
    if (n && !connect.includes(n)) setConnect([...connect, n]);
    setWho("");
  };
  const empty = tags.length === 0 && connect.length === 0 && !text.trim() && !who.trim();
  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{name}さんとの1to1、どうでした？</h2>
        <p className="small muted">当てはまるものをタップするだけでOK</p>
        <div className="chips">
          {MEMO_TAGS.map((t) => (
            <button key={t} className={`chip ${tags.includes(t) ? "on" : ""}`} onClick={() => toggle(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="small muted">つなげたい人（いれば）</div>
        {connect.length > 0 && (
          <div className="chips">
            {connect.map((n) => (
              <span key={n} className="chip on">
                {n}さん{" "}
                <button className="x" onClick={() => setConnect(connect.filter((x) => x !== n))} aria-label="削除">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="row gap">
          <input
            className="grow"
            list="memo-member-names"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWho()}
            placeholder="名前を入れて「追加」"
          />
          <button className="btn ghost" disabled={!who.trim()} onClick={addWho}>
            追加
          </button>
        </div>
        <datalist id="memo-member-names">
          {(members ?? []).filter((m) => m.name !== name).map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="ひとこと（なくてもOK。🎤マイクで話すと文字になります）" />
        <div className="row gap center-y">
          <Character mood="praise" size={44} />
          <span className="small muted">次に会うときや紹介のときに思い出せます</span>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={onCancel}>
            {initial ? "やめる" : "あとで"}
          </button>
          <button
            className="btn primary grow"
            disabled={empty || saving}
            onClick={async () => {
              setSaving(true);
              const last = who.trim().replace(/さん$/, "");
              try {
                await onSubmit({ tags, connect: last && !connect.includes(last) ? [...connect, last] : connect, text: text.trim() });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "残しています…" : "メモを残す"}
          </button>
        </div>
      </div>
    </div>
  );
}
