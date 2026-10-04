import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db, getApp } from "../firebase";

export function pushState(): "unsupported" | "default" | "granted" | "denied" {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
}

/** 通知をONにする（iPhoneはホーム画面に追加したアプリからだけ使える） */
export async function enablePush(uid: string): Promise<boolean> {
  if (!(await isSupported())) return false;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  return refreshPushToken(uid);
}

export async function refreshPushToken(uid: string): Promise<boolean> {
  if (!(await isSupported()) || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;
  const token = await getToken(getMessaging(getApp()), { serviceWorkerRegistration: reg, vapidKey });
  if (!token) return false;
  await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
  return true;
}
