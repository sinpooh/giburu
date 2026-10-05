import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth } from "../firebase";
import { Character } from "../components/Character";
import { isIOS, isStandalone } from "../lib/hooks";

export function Login({ error }: { error: string }) {
  const [skipInstall, setSkipInstall] = useState(false);
  const [err, setErr] = useState("");
  const needInstall = isIOS() && !isStandalone() && !skipInstall;

  const login = async () => {
    setErr("");
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try {
      // ホーム画面アプリではポップアップが使えないのでページ移動でログイン
      if (isStandalone()) await signInWithRedirect(auth, p);
      else await signInWithPopup(auth, p);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code.includes("popup")) await signInWithRedirect(auth, p);
      else setErr(String((e as Error).message ?? e));
    }
  };

  if (needInstall) {
    return (
      <div className="page center login">
        <Character mood="guide" size={180} />
        <h1>ようこそ、ギブるへ！</h1>
        <p>まずはホーム画面に追加してね（通知を受け取るのに必要です）</p>
        <ol className="steps">
          <li>
            画面下の <b>共有ボタン</b>（□に↑のマーク）をタップ
          </li>
          <li>
            <b>「ホーム画面に追加」</b>をタップ
          </li>
          <li>
            右上の<b>「追加」</b>をタップ
          </li>
          <li>ホーム画面にできたギブるのアイコンから開き直す</li>
        </ol>
        <button className="link-btn" onClick={() => setSkipInstall(true)}>
          あとでやる（このままログイン）
        </button>
      </div>
    );
  }

  return (
    <div className="page center login">
      <Character mood="guide" size={180} />
      <h1>ギブる</h1>
      <p>1to1も段取りも、スワイプ1回で。</p>
      {(error || err) && <p className="notice">{error || err}</p>}
      <button className="btn primary wide" onClick={login}>
        Googleでログイン
      </button>
    </div>
  );
}
