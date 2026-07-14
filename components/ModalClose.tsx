"use client";

import { useEffect, useRef } from "react";

// 열려 있는 모달 스택 — ESC는 맨 위 모달만 닫는다 (모달 위 모달 대응)
const modalStack: symbol[] = [];

// 모달 우측 상단 닫기(X) 버튼 — 아이콘 내장(별도 import 불필요)
// 이 컴포넌트를 넣는 것만으로 ESC·오버레이(바깥) 클릭 닫기가 함께 붙는다.
export function ModalClose({ onClose }: { onClose: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = Symbol("modal");
    modalStack.push(id);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalStack[modalStack.length - 1] === id) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);

    // 오버레이(모달 바깥) 클릭 → 닫기 — 모달 내부 클릭은 target이 overlay가 아니라 무시됨
    const overlay = btnRef.current?.closest(".modal-overlay") as HTMLElement | null;
    const onDown = (e: MouseEvent) => {
      if (e.target === overlay) onCloseRef.current();
    };
    overlay?.addEventListener("mousedown", onDown);

    return () => {
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      window.removeEventListener("keydown", onKey);
      overlay?.removeEventListener("mousedown", onDown);
    };
  }, []);

  return (
    <button ref={btnRef} type="button" className="modal-x" onClick={onClose} aria-label="닫기">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
