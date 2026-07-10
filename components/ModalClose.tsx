"use client";

// 모달 우측 상단 닫기(X) 버튼 — 아이콘 내장(별도 import 불필요)
export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="modal-x" onClick={onClose} aria-label="닫기">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
