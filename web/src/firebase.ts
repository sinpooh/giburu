import { initializeApp, FirebaseApp, FirebaseOptions } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, httpsCallable, Functions, connectFunctionsEmulator } from "firebase/functions";

let app: FirebaseApp;
export let auth: Auth;
export let db: Firestore;
let fns: Functions;

/** 本番は Firebase Hosting が用意する /__/firebase/init.json から設定を読む */
async function loadConfig(): Promise<FirebaseOptions> {
  const env = import.meta.env;
  if (env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    };
  }
  const res = await fetch("/__/firebase/init.json");
  const cfg = (await res.json()) as FirebaseOptions;
  // iPhoneのホーム画面アプリでもログインできるように、ログイン処理を同じドメインで行う
  if (location.hostname.endsWith(".web.app") || location.hostname.endsWith(".firebaseapp.com")) {
    cfg.authDomain = location.hostname;
  }
  return cfg;
}

let ready: Promise<void> | null = null;
export function initFirebase(): Promise<void> {
  if (!ready) {
    ready = loadConfig().then((cfg) => {
      app = initializeApp(cfg);
      auth = getAuth(app);
      db = getFirestore(app);
      fns = getFunctions(app, "asia-northeast1");
      // ローカルで試すとき（VITE_USE_EMULATORS=1）はエミュレータにつなぐ
      if (import.meta.env.VITE_USE_EMULATORS) {
        connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
        connectFirestoreEmulator(db, "127.0.0.1", 8080);
        connectFunctionsEmulator(fns, "127.0.0.1", 5001);
        // 自動テスト用：エミュレータでだけ使えるログイン
        (window as unknown as Record<string, unknown>).__emuLogin = (email: string) =>
          signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
      }
    });
  }
  return ready;
}

export function getApp(): FirebaseApp {
  return app;
}

export function call<Req = unknown, Res = unknown>(name: string) {
  return (data?: Req) => httpsCallable<Req, Res>(fns, name)(data as Req).then((r) => r.data);
}
