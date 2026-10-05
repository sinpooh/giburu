// iPhone へのプッシュ通知（Firebase Cloud Messaging / Web Push）
import { getFirestore, FieldValue, DocumentSnapshot } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { appUrl } from "./config";

type Target = "aoyama" | "managerNotify" | "managers";

// "aoyama" は青山さんと、同じ画面を使う渡辺さん（viewer）にも届く
export async function push(target: Target, title: string, body: string, path = "/"): Promise<number> {
  const snap = await getFirestore()
    .collection("users")
    .where("role", "in", target === "aoyama" ? ["aoyama", "viewer"] : ["manager"])
    .get();
  const docs = snap.docs.filter((u) => target !== "managerNotify" || u.get("notifyManager"));
  return sendTo(docs, title, body, path);
}

export async function pushUid(uid: string, title: string, body: string, path = "/"): Promise<number> {
  const u = await getFirestore().doc(`users/${uid}`).get();
  return u.exists ? sendTo([u], title, body, path) : 0;
}

async function sendTo(docs: DocumentSnapshot[], title: string, body: string, path: string): Promise<number> {
  let sent = 0;
  for (const u of docs) {
    const tokens: string[] = u.get("fcmTokens") ?? [];
    for (const token of tokens) {
      try {
        // data だけで送り、表示は Service Worker（web/src/sw.ts）が行う
        await getMessaging().send({
          token,
          data: { title, body, link: appUrl() + path },
          webpush: { headers: { Urgency: "high", TTL: String(6 * 60 * 60) } },
        });
        sent++;
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code ?? "";
        logger.warn("push failed", { uid: u.id, code });
        if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
          await u.ref.update({ fcmTokens: FieldValue.arrayRemove(token) });
        }
      }
    }
  }
  return sent;
}
