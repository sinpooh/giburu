import { useState } from "react";
import { collection } from "firebase/firestore";
import { db } from "../firebase";
import { useQuery } from "../lib/hooks";
import { Member, TASK_LABEL, TaskKind, TaskSummary, api } from "../lib/data";
import { localSummary } from "../lib/replies";

import { shrinkImage } from "../lib/image";

// AIでまとめるか（2026-10-11 シンプーさん「AI機能をつけたい」。つながらないときは文から名前・期限だけ読み取る）
const USE_AI = true;
import { Character } from "./Character";

const EMPTY: TaskSummary = { title: "", who: "", due: "", todo: [], reply: "" };

/**
 * 「ミッション」「注文・依頼」を追加。LINEを貼り付けるか手打ちして「まとめる」を押すと、
 * AIが やること・相手・期限・返信文 にまとめる。直してから「追加する」。
 */
export function TodoForm({
  kind: initialKind,
  onSubmit,
  onCancel,
}: {
  kind: TaskKind;
  onSubmit: (v: TaskSummary & { kind: TaskKind; raw: string }, photos: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<TaskKind>(initialKind);
  const [raw, setRaw] = useState("");
  const [sum, setSum] = useState<TaskSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const members = useQuery<Member>(collection(db, "members"));

  const local = (text: string) => localSummary(text, (members ?? []).map((m) => m.name), Date.now());
  const summarize = async (text: string, imgs = photos) => {
    if (!text.trim() && imgs.length === 0) return;
    setMsg("");
    if (!USE_AI) {
      setSum(local(text));
      return;
    }
    setBusy(true);
    try {
      const r = await api.summarizeTask({ text, kind, images: imgs.slice(0, 4) });
      if (r.ok && r.summary) setSum(r.summary);
      else {
        setSum(local(text));
        setMsg("AIがうまくまとめられなかったので、読み取れたところだけ入れました。直してね");
      }
    } catch {
      setSum(local(text));
      setMsg("いまAIにつながらないので、読み取れたところだけ入れました。直してね");
    } finally {
      setBusy(false);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const add: string[] = [];
      for (const f of Array.from(files).slice(0, 4)) add.push(await shrinkImage(f));
      setPhotos((p) => [...p, ...add].slice(0, 4));
    } catch {
      setMsg("写真を読みこめませんでした");
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return setMsg("コピーされた文章が見つかりませんでした。LINEで長押し→「コピー」してから押してね");
      setRaw(t);
      summarize(t);
    } catch {
      setMsg("貼り付けできませんでした。下の欄を長押しして「ペースト」してもOKです");
    }
  };

  const set = (p: Partial<TaskSummary>) => setSum({ ...(sum ?? EMPTY), ...p });

  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{TASK_LABEL[kind]}を追加</h2>
        <div className="chips">
          {(["mission", "order"] as const).map((k) => (
            <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
              {k === "mission" ? "🎯 " : "📦 "}
              {TASK_LABEL[k]}
            </button>
          ))}
        </div>
        {!sum && (
          <>
            <button className="btn paste-btn" onClick={paste} disabled={busy}>
              📋 LINEを貼り付けてまとめる
            </button>
            <label className="btn photo-btn">
              📷 写真から（注文書・スクショ・商品など）
              <input type="file" accept="image/*" multiple hidden onChange={(e) => (addPhotos(e.target.files), (e.target.value = ""))} />
            </label>
            <textarea rows={4} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="または、ここに手で書いてもOK（例：山田さんから冷蔵庫の取り置き、土曜まで）" />
            <div className="row gap center-y">
              <Character mood="guide" size={44} />
              <span className="small muted">{busy ? "まとめています…" : USE_AI ? "やること・相手・期限をまとめます" : "相手と期限は読み取れたら入ります"}</span>
            </div>
          </>
        )}
        {photos.length > 0 && (
          <div className="photo-row">
            {photos.map((p, i) => (
              <span key={i} className="photo-thumb">
                <img src={p} alt="" />
                <button className="x" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label="削除">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {msg && <p className="small notice">{msg}</p>}
        {sum && (
          <>
            <label className="field">
              <span>やること</span>
              <input value={sum.title} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <div className="grid2">
              <label className="field">
                <span>相手</span>
                <input value={sum.who} onChange={(e) => set({ who: e.target.value })} placeholder="（なし）" />
              </label>
              <label className="field">
                <span>期限</span>
                <input type="date" value={sum.due} onChange={(e) => set({ due: e.target.value })} />
              </label>
            </div>
            {sum.todo.length > 0 && (
              <label className="field">
                <span>手順</span>
                <textarea rows={sum.todo.length} value={sum.todo.join("\n")} onChange={(e) => set({ todo: e.target.value.split("\n") })} />
              </label>
            )}
            {sum.reply && (
              <label className="field">
                <span>返信文（LINEで送れます）</span>
                <textarea rows={3} value={sum.reply} onChange={(e) => set({ reply: e.target.value })} />
              </label>
            )}
          </>
        )}
        <div className="row gap">
          <button className="btn ghost" onClick={onCancel}>
            やめる
          </button>
          {sum ? (
            <button
              className="btn primary grow"
              disabled={!sum.title.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSubmit({ ...sum, title: sum.title.trim(), who: sum.who.trim().replace(/さん$/, ""), todo: sum.todo.map((x) => x.trim()).filter(Boolean), kind, raw: raw.trim() }, photos);
                } finally {
                  setBusy(false);
                }
              }}
            >
              追加する
            </button>
          ) : (
            <button className="btn primary grow" disabled={(!raw.trim() && photos.length === 0) || busy} onClick={() => summarize(raw)}>
              {busy ? "まとめています…" : USE_AI ? "AIでまとめる" : "次へ"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
