import { useState } from "react";
import { collection } from "firebase/firestore";
import { db } from "../firebase";
import { useQuery } from "../lib/hooks";
import { Member } from "../lib/data";
import { REPLY_KINDS, ReplyKind, guessFromLine, replyDraft } from "../lib/replies";
import { DueChoice, dueFrom } from "./TaskForm";
import { Character } from "./Character";

/** 「LINE返信あとで」：だれに・何て返すか・いつまでに を選ぶだけ。文面は店長が用意する */
export function LineReplyForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (v: { name: string; lineText: string; dueAt: number; quote?: string }) => Promise<void>;
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
  const [quote, setQuote] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
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

  // LINEで長押し→コピーしたメッセージを貼り付けると、名前・返し方・期限を読み取る
  const applyPaste = (raw: string) => {
    if (!raw.trim()) return setPasteMsg("コピーされたメッセージが見つかりませんでした。LINEで長押し→「コピー」してから押してね");
    const g = guessFromLine(raw, (members ?? []).map((m) => m.name));
    setQuote(raw.trim());
    if (g.name) setName(g.name);
    setKind(g.kind);
    setEdited(false);
    setText(replyDraft(g.kind, g.name || name.trim()));
    setChoice(g.due);
    setPasteMsg(g.name ? "読み取りました！ちがうところだけ直してね" : "読み取りました！だれからかだけ入れてね");
  };
  const paste = async () => {
    try {
      applyPaste(await navigator.clipboard.readText());
    } catch {
      setPasteMsg("貼り付けできませんでした。下の欄に長押しで貼り付けてもOKです");
      setQuote(" ");
    }
  };

  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>LINE返信あとで</h2>
        <button className="btn paste-btn" onClick={paste}>
          📋 LINEのメッセージを貼り付け
        </button>
        {pasteMsg && <p className="small notice">{pasteMsg}</p>}
        {quote && (
          <textarea
            rows={3}
            className="quote"
            value={quote.trim()}
            placeholder="ここに長押しで貼り付け"
            onChange={(e) => setQuote(e.target.value)}
            onBlur={(e) => e.target.value.trim() && !name && applyPaste(e.target.value)}
          />
        )}
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
                await onSubmit({ name: name.trim().replace(/さん$/, ""), lineText: text.trim(), dueAt: dueFrom(choice, date), quote: quote.trim() || undefined });
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
