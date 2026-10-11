import { useEffect, useState } from "react";

declare const __BUILD_ID__: string;

// 公開後、開きっぱなしの古い版を使っていたら「新しい版があります」を出す
export function UpdateBanner() {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const { id } = await r.json();
        if (id && id !== __BUILD_ID__) setHasNew(true);
      } catch {
        /* オフラインなどは無視 */
      }
    };
    check();
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    addEventListener("focus", check);
    const timer = setInterval(check, 30 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, []);

  if (!hasNew) return null;

  const update = async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* そのまま再読み込み */
    }
    location.reload();
  };

  return (
    <div className="update-banner" role="status">
      <span>✨ 新しい版があります</span>
      <button onClick={update}>更新する</button>
    </div>
  );
}
