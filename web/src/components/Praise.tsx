import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Character } from "./Character";
import { randomPraise } from "../lib/phrases";

interface Big {
  title: string;
  sub?: string;
}
const Ctx = createContext<{ praise: (text?: string) => void; celebrate: (b: Big) => void }>({ praise: () => {}, celebrate: () => {} });

export const usePraise = () => useContext(Ctx);

const COLORS = ["#e2558a", "#f7b733", "#6aaa5a", "#5aa9e6", "#ff7a59", "#b07ae6"];

export function Confetti({ count = 60 }: { count?: number }) {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${Math.random() * 100}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${Math.random() * 0.8}s`,
            animationDuration: `${1.8 + Math.random() * 1.6}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function PraiseProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [big, setBig] = useState<Big | null>(null);

  const praise = useCallback((text?: string) => {
    const id = Date.now();
    setToast({ id, text: text ?? randomPraise() });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 1700);
  }, []);
  const celebrate = useCallback((b: Big) => setBig(b), []);

  return (
    <Ctx.Provider value={{ praise, celebrate }}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="praise-toast"
            initial={{ y: 220, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 220, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <div className="bubble praise-bubble">{toast.text}</div>
            <Character mood="praise" size={150} />
          </motion.div>
        )}
      </AnimatePresence>
      {big && (
        <div className="celebrate" onClick={() => setBig(null)}>
          <Confetti count={90} />
          <motion.div initial={{ scale: 0.4, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 12 }}>
            <Character mood="praise" size={260} />
          </motion.div>
          <h1 className="celebrate-title">{big.title}</h1>
          {big.sub && <p className="celebrate-sub">{big.sub}</p>}
          <p className="muted small">タップで閉じる</p>
        </div>
      )}
    </Ctx.Provider>
  );
}
