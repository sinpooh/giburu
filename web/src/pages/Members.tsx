import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { useQuery } from "../lib/hooks";
import { Member } from "../lib/data";
import { csvToMembers } from "../lib/csv";

const FIELDS: [keyof Member, string, string][] = [
  ["name", "名前（必須）", "text"],
  ["company", "会社名", "text"],
  ["industry", "業種", "text"],
  ["lineName", "LINEでの表示名", "text"],
  ["email", "メール（あればカレンダー招待を送る）", "email"],
  ["joinedAt", "入会日", "date"],
  ["lastOneToOne", "最後に1to1した日（わからなければ空欄）", "date"],
  ["memo", "メモ", "text"],
];

/** 取り込み用リンク（…/#members=<CSVをbase64url>）で渡されたメンバー一覧。# 以降はサーバーに送られない */
export function csvFromHash(): string {
  const m = location.hash.match(/^#members=([A-Za-z0-9_-]+)/);
  if (!m) return "";
  try {
    const b = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

export function Members({ initialCsv = "" }: { initialCsv?: string }) {
  const rows = useQuery<Member>(collection(db, "members"));
  const [edit, setEdit] = useState<Partial<Member> | null>(null);
  const [importing, setImporting] = useState(!!initialCsv);
  const list = [...(rows ?? [])].sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return (
    <div className="page">
      <div className="row between">
        <h1>メンバー</h1>
        <span className="muted">{list.length}人</span>
      </div>
      <div className="row gap">
        <button className="btn primary grow" onClick={() => setEdit({})}>
          ＋ 追加
        </button>
        <button className="btn ghost grow" onClick={() => setImporting(true)}>
          CSVで取り込み
        </button>
      </div>
      {rows === null && <p className="muted center">読み込み中…</p>}
      {rows && list.length === 0 && <p className="muted center">まだいません。まずは何人か追加してみてね</p>}
      {list.map((m) => (
        <button key={m.id} className={`list-item member ${m.doNotInvite ? "dim" : ""}`} onClick={() => setEdit(m)}>
          <div className="row between">
            <b>{m.name}</b>
            <span className="muted small">{m.lastOneToOne ? `前回 ${m.lastOneToOne}` : "まだ1to1なし"}</span>
          </div>
          <div className="muted small">
            {[m.company, m.industry].filter(Boolean).join("・")}
            {m.doNotInvite ? "（今は誘わない）" : ""}
          </div>
        </button>
      ))}
      {edit && <MemberForm m={edit} onClose={() => setEdit(null)} />}
      {/* 今いるメンバーを読み終えてから開く（同じ人を二重に追加しないため） */}
      {importing && rows !== null && <CsvImport existing={list} initialText={initialCsv} onClose={() => setImporting(false)} />}
    </div>
  );
}

function MemberForm({ m, onClose }: { m: Partial<Member>; onClose: () => void }) {
  const [v, setV] = useState<Partial<Member>>(m);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const data: Record<string, unknown> = {};
    for (const [k] of FIELDS) data[k] = ((v[k] as string) ?? "").trim();
    data.lastOneToOne = data.lastOneToOne || null;
    data.doNotInvite = !!v.doNotInvite;
    if (m.id) await setDoc(doc(db, "members", m.id), data, { merge: true });
    else await addDoc(collection(db, "members"), data);
    onClose();
  };
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{m.id ? "メンバーを編集" : "メンバーを追加"}</h2>
        {FIELDS.map(([k, label, type]) => (
          <label key={k} className="field">
            <span>{label}</span>
            <input type={type} value={(v[k] as string) ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </label>
        ))}
        <label className="check">
          <input type="checkbox" checked={!!v.doNotInvite} onChange={(e) => setV({ ...v, doNotInvite: e.target.checked })} />
          今は誘わない
        </label>
        <div className="row gap">
          {m.id && (
            <button
              className="btn danger"
              onClick={async () => {
                if (confirm(`${m.name}さんを削除しますか？`)) {
                  await deleteDoc(doc(db, "members", m.id!));
                  onClose();
                }
              }}
            >
              削除
            </button>
          )}
          <button className="btn ghost" onClick={onClose}>
            やめる
          </button>
          <button className="btn primary grow" disabled={!v.name?.trim() || saving} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function CsvImport({ existing, initialText = "", onClose }: { existing: Member[]; initialText?: string; onClose: () => void }) {
  const [text, setText] = useState(initialText);
  const [overwrite, setOverwrite] = useState(true);
  const [done, setDone] = useState("");
  const parsed = csvToMembers(text);
  const byName = new Map(existing.map((m) => [m.name, m]));
  const updates = parsed.filter((p) => byName.has(p.name));
  const adds = parsed.filter((p) => !byName.has(p.name));

  const run = async () => {
    const batch = writeBatch(db);
    for (const p of adds) batch.set(doc(collection(db, "members")), { lastOneToOne: null, doNotInvite: false, ...p });
    if (overwrite) for (const p of updates) batch.set(doc(db, "members", byName.get(p.name)!.id), p, { merge: true });
    await batch.commit();
    setDone(`${adds.length}人追加${overwrite ? `・${updates.length}人更新` : ""}しました`);
  };

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>CSVで取り込み</h2>
        <p className="muted small">1行目に列名：名前,会社名,業種,LINE表示名,メール,入会日,最後の1to1,メモ（順不同・ない列はOK）</p>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
          }}
        />
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="ここに貼り付けてもOK" />
        {parsed.length > 0 && (
          <p>
            追加 <b>{adds.length}人</b> ／ 同じ名前がいる <b>{updates.length}人</b>
          </p>
        )}
        {updates.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            同じ名前の人は上書きする（{updates.map((u) => u.name).join("、")}）
          </label>
        )}
        {done ? (
          <>
            <p className="notice">{done}</p>
            <button className="btn primary wide" onClick={onClose}>
              閉じる
            </button>
          </>
        ) : (
          <div className="row gap">
            <button className="btn ghost" onClick={onClose}>
              やめる
            </button>
            <button className="btn primary grow" disabled={parsed.length === 0} onClick={run}>
              取り込む
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
