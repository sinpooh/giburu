import { useState } from "react";
import { collection } from "firebase/firestore";
import { db } from "../firebase";
import { useQuery } from "../lib/hooks";
import { Member } from "../lib/data";
import { REPLY_KINDS, ReplyKind, replyDraft } from "../lib/replies";
import { DueChoice, dueFrom } from "./TaskForm";
import { Character } from "./Character";

/** 「LINE返信あとで」：だれに・何て返すか・いつまでに を選ぶだけ。文面は店長が用意する */
export function LineReplyForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (v: { name: string; lineText: string; dueAt: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const members = useQuery<Member>(collection(db, "members"));
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ReplyKind>("ok");
  const [text, setText] = useState(replyDraft("ok", ""));
  const [edited, setEdited] = useState(false);
  const [choice, setChoice] = useState<DueChoice>("today");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = name.trim() && (choice !== "date" || date);

  const changeName = (v: string) => {
    setName(v);
    if (!edited) setText(replyDraft(kind, v.trim()));
  };
  const changeKind = (k: ReplyKind) => {
    setKind(k);
    setEdited(false);
    setText(replyDraft(k, name.trim()));
  };

  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>LINE返信あとで</h2>
        <input autoFocus list="member-names" value={name} onChange={(e) => changeName(e.target.value)} placeholder="だれに返信？（例：山田さん）" />
        <datalist id="member-names">
          {(members ?? []).map((m) => (
            <option key={m.id} value={m.name} />
          ))}
        </datalist>
        <div className="small muted">何て返す？</div>
        <div className="chips">
          {REPLY_KINDS.map((r) => (
            <button key={r.key} className={`chip ${kind === r.key ? "on" : ""}`} onClick={() => changeKind(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="row gap center-y">
          <Character mood="guide" size={44} />
          <span className="small muted">{kind === "free" ? "あとで自分で書く用にメモだけ残せます" : "文面、用意しときました！直してもOK"}</span>
        </div>
        <textarea
          rows={4}
          value={text}
          placeholder="（空のままでもOK。LINEを開くボタンだけ出します）"
          onChange={(e) => {
            setText(e.target.value);
            setEdited(true);
          }}
        />
        <div className="small muted">いつまでに？</div>
        <div className="chips">
          {(
            [
              ["today", "今日中"],
              ["tomorrow", "明日まで"],
              ["week", "今週中"],
              ["date", "日付指定"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`chip ${choice === k ? "on" : ""}`} onClick={() => setChoice(k)}>
              {l}
            </button>
          ))}
        </div>
        {choice === "date" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        <div className="row gap">
          <button className="btn ghost" onClick={onCancel}>
            やめる
          </button>
          <button
            className="btn primary grow"
            disabled={!ok || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSubmit({ name: name.trim().replace(/さん$/, ""), lineText: text.trim(), dueAt: dueFrom(choice, date) });
              } finally {
                setSaving(false);
              }
            }}
          >
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}
