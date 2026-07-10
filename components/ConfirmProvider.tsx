"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  alert?: boolean; // true면 확인 버튼만 (안내용)
};
type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);

/** 네이티브 confirm() 대체 — await useConfirm()({ message }) */
export const useConfirm = () => useContext(ConfirmCtx);

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => setState({ opts, resolve }));
  }, []);

  const close = useCallback(
    (v: boolean) => {
      setState((s) => {
        s?.resolve(v);
        return null;
      });
    },
    []
  );

  // ESC = 취소
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-overlay">
          <div className="modal modal-confirm" role="alertdialog" aria-modal="true">
            {state.opts.title && <h2>{state.opts.title}</h2>}
            <p className="confirm-msg">{state.opts.message}</p>
            <div className="modal-actions">
              {!state.opts.alert && (
                <button className="btn btn-ghost" onClick={() => close(false)}>
                  {state.opts.cancelText ?? "취소"}
                </button>
              )}
              <button
                className={`btn ${state.opts.danger ? "btn-danger-solid" : "btn-primary"}`}
                onClick={() => close(true)}
                autoFocus
              >
                {state.opts.confirmText ?? "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
