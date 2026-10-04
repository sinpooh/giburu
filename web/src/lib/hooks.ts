import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, onSnapshot, Query, DocumentReference, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { ALLOWED, AppSettings, DEFAULTS, Role } from "../config";

export interface Me {
  user: User;
  role: Role;
  name: string;
}

export function useMe(): { me: Me | null; loading: boolean; error: string } {
  const [state, setState] = useState<{ me: Me | null; loading: boolean; error: string }>({ me: null, loading: true, error: "" });
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) return setState({ me: null, loading: false, error: "" });
        const a = user.email ? ALLOWED[user.email] : undefined;
        if (!a) {
          await signOut(auth);
          return setState({ me: null, loading: false, error: `${user.email} ではログインできません。許可されたGoogleアカウントでログインしてください。` });
        }
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        await setDoc(
          ref,
          {
            email: user.email,
            role: a.role,
            name: a.name,
            lastSeen: serverTimestamp(),
            ...(snap.exists() ? {} : { notifyManager: a.notifyManager, fcmTokens: [] }),
          },
          { merge: true },
        );
        setState({ me: { user, role: a.role, name: a.name }, loading: false, error: "" });
      }),
    [],
  );
  return state;
}

export function useQuery<T>(q: Query | null, deps: unknown[] = []): T[] | null {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    if (!q) return;
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T)), (e) => console.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}

export function useDoc<T>(ref: DocumentReference | null, deps: unknown[] = []): T | null | undefined {
  const [v, setV] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!ref) return;
    return onSnapshot(ref, (s) => setV(s.exists() ? ({ id: s.id, ...s.data() } as T) : null), (e) => console.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

export function useSettings(): AppSettings {
  const s = useDoc<Partial<AppSettings>>(doc(db, "settings", "app"));
  return { ...DEFAULTS, ...(s ?? {}) } as AppSettings;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
