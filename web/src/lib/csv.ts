// メンバー一覧のCSV取り込み（列名は順不同、ない列は空でOK）
export const CSV_COLUMNS: Record<string, string> = {
  名前: "name",
  氏名: "name",
  会社名: "company",
  会社: "company",
  業種: "industry",
  カテゴリー: "industry",
  LINE表示名: "lineName",
  メール: "email",
  メールアドレス: "email",
  入会日: "joinedAt",
  最後の1to1: "lastOneToOne",
  メモ: "memo",
};

/** ダブルクォート対応の簡単なCSVパーサ */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function normDate(s: string): string {
  const m = s.trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}

export function csvToMembers(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => CSV_COLUMNS[h.trim()] ?? "");
  return rows
    .slice(1)
    .map((r) => {
      const o: Record<string, string> = {};
      head.forEach((k, i) => {
        if (!k) return;
        const v = (r[i] ?? "").trim();
        if (!v) return;
        o[k] = k === "joinedAt" || k === "lastOneToOne" ? normDate(v) : v;
      });
      return o;
    })
    .filter((o) => o.name);
}
