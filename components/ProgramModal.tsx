"use client";
import { useState } from "react";
import { ModalClose } from "@/components/ModalClose";
import { Icon } from "@/components/icons";

// 식순·타임테이블 한 줄 — 행사·촬영 업무가 공유
export type ProgramRow = { id: string; time: string; title: string; note: string };

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tmp-${Math.random().toString(36).slice(2)}`;

// 식순 편집 모달 — 행 추가·삭제·순서 이동. 저장 시 완전히 빈 줄은 버린다.
export function ProgramModal({
  initial, title = "식순 편집", onClose, onSave,
}: {
  initial: ProgramRow[];
  title?: string;
  onClose: () => void;
  onSave: (rows: ProgramRow[]) => void;
}) {
  const [rows, setRows] = useState<ProgramRow[]>(initial.length ? initial : [{ id: uid(), time: "", title: "", note: "" }]);
  const [err, setErr] = useState("");
  const upd = (id: string, patch: Partial<ProgramRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, { id: uid(), time: "", title: "", note: "" }]);
  const del = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const moveRow = (i: number, dir: -1 | 1) => setRows((rs) => {
    const j = i + dir;
    if (j < 0 || j >= rs.length) return rs;
    const n = [...rs];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    // 완전히 빈 줄은 버리고, 시간·비고만 있고 순서명이 없는 줄은 막는다
    const nonEmpty = rows.filter((r) => r.time.trim() || r.title.trim() || r.note.trim());
    if (nonEmpty.some((r) => !r.title.trim())) { setErr("시간·비고가 있는 줄은 순서 내용도 입력해주세요."); return; }
    onSave(nonEmpty.map((r) => ({ id: r.id, time: r.time.trim(), title: r.title.trim(), note: r.note.trim() })));
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{title}</h2>
        <p className="page-sub" style={{ marginTop: -4 }}>시간은 자유롭게 적어요 (예: 14:00 또는 14:00–14:10). 위/아래로 순서를 조정하세요.</p>
        <form onSubmit={submit}>
          <div className="prog-edit">
            {rows.map((r, i) => (
              <div className="prog-edit-row" key={r.id}>
                <div className="prog-edit-move">
                  <button type="button" className="kb-move-btn" disabled={i === 0} onClick={() => moveRow(i, -1)} aria-label="위로"><Icon name="chevronL" size={15} /></button>
                  <span className="prog-edit-num">{i + 1}</span>
                  <button type="button" className="kb-move-btn" disabled={i === rows.length - 1} onClick={() => moveRow(i, 1)} aria-label="아래로"><Icon name="chevronR" size={15} /></button>
                </div>
                <input className="prog-edit-time" value={r.time} onChange={(e) => upd(r.id, { time: e.target.value })} placeholder="14:00" maxLength={40} />
                <input className="prog-edit-title" value={r.title} onChange={(e) => upd(r.id, { title: e.target.value })} placeholder="순서 내용 (예: 개회 선언)" maxLength={200} />
                <input className="prog-edit-note" value={r.note} onChange={(e) => upd(r.id, { note: e.target.value })} placeholder="담당·비고 (선택)" maxLength={200} />
                <button type="button" className="prog-edit-del" onClick={() => del(r.id)} aria-label="이 줄 삭제">×</button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-line btn-sm" onClick={add} style={{ marginTop: 8 }}>
            <Icon name="plus" size={14} strokeWidth={2.4} /> 순서 추가
          </button>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary">저장</button>
          </div>
        </form>
      </div>
    </div>
  );
}
