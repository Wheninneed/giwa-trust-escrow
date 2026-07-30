"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { explorerTx } from "shared";

type Tone = "neutral" | "success" | "danger";

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  txHash?: string;
}

interface ToastApi {
  push: (message: string, tone?: Tone, txHash?: string) => void;
}

const ToastContext = createContext<ToastApi>({ push: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: Tone = "neutral", txHash?: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-2), { id, message, tone, txHash }]);
    // 자동으로 사라지되, 사용자가 읽을 시간은 준다
    setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== id)), tone === "danger" ? 8000 : 5000);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {items.length > 0 && (
        <div className="toast-wrap" role="status" aria-live="polite">
          {items.map((item) => (
            <div key={item.id} className="toast" data-tone={item.tone}>
              <span className="grow">{item.message}</span>
              {item.txHash && (
                <a
                  href={explorerTx(item.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "underline", flex: "none", opacity: 0.9 }}
                >
                  거래 보기
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
