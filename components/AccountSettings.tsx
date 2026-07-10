"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

export default function AccountSettings({
  initialName, email, roleLabel, teamName,
}: {
  initialName: string; email: string; roleLabel: string; teamName: string | null;
}) {
  const { update } = useSession();
  const [name, setName] = useState(initialName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameMsg(null);
    if (name.trim().length < 2) { setNameMsg({ ok: false, text: "이름은 2자 이상" }); return; }
    setNameBusy(true);
    const res = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
    const data = await res.json();
    setNameBusy(false);
    if (!res.ok) { setNameMsg({ ok: false, text: data.error ?? "저장 실패" }); return; }
    await update(); // 세션의 이름 즉시 갱신
    setNameMsg({ ok: true, text: "이름이 변경되었습니다." });
  }

  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 8) { setPwMsg({ ok: false, text: "새 비밀번호는 8자 이상" }); return; }
    if (newPw !== newPw2) { setPwMsg({ ok: false, text: "새 비밀번호가 서로 다릅니다." }); return; }
    setPwBusy(true);
    const res = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }) });
    const data = await res.json();
    setPwBusy(false);
    if (!res.ok) { setPwMsg({ ok: false, text: data.error ?? "변경 실패" }); return; }
    setCurPw(""); setNewPw(""); setNewPw2("");
    setPwMsg({ ok: true, text: "비밀번호가 변경되었습니다." });
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: "0 0 4px" }}>내 계정</h1>
        <p className="page-sub">이름과 비밀번호를 변경할 수 있습니다.</p>
      </div>

      {/* 프로필 */}
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>프로필</h2>
        <form onSubmit={saveName}>
          <div className="field">
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>이메일 (변경 불가)</label>
              <input value={email} disabled />
            </div>
            <div className="field">
              <label>역할 · 소속</label>
              <input value={teamName ? `${roleLabel} · ${teamName}` : roleLabel} disabled />
            </div>
          </div>
          {nameMsg && <p className={nameMsg.ok ? "ok-msg" : "err-msg"}>{nameMsg.text}</p>}
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" disabled={nameBusy}>{nameBusy ? "저장 중…" : "이름 저장"}</button>
          </div>
        </form>
      </div>

      {/* 비밀번호 */}
      <div className="card" style={{ padding: 22, marginTop: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>비밀번호 변경</h2>
        <form onSubmit={savePw}>
          <div className="field">
            <label>현재 비밀번호</label>
            <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" required />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>새 비밀번호 (8자 이상)</label>
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" required />
            </div>
            <div className="field">
              <label>새 비밀번호 확인</label>
              <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" required />
            </div>
          </div>
          {pwMsg && <p className={pwMsg.ok ? "ok-msg" : "err-msg"}>{pwMsg.text}</p>}
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" disabled={pwBusy}>{pwBusy ? "변경 중…" : "비밀번호 변경"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
