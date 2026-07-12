"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

export default function AccountSettings({
  initialName, email, roleLabel, teamName, initialTelegramChatId,
}: {
  initialName: string; email: string; roleLabel: string; teamName: string | null; initialTelegramChatId?: string;
}) {
  const { update } = useSession();
  const [name, setName] = useState(initialName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [tgId, setTgId] = useState(initialTelegramChatId ?? "");
  const [tgBusy, setTgBusy] = useState(false);
  const [tgMsg, setTgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);

  async function issueLinkCode() {
    setCodeBusy(true);
    setTgMsg(null);
    const res = await fetch("/api/me/telegram-code", { method: "POST" });
    const data = await res.json();
    setCodeBusy(false);
    if (!res.ok) { setTgMsg({ ok: false, text: data.error ?? "코드 발급 실패" }); return; }
    setLinkCode(data.code);
  }

  async function saveTelegram(e: React.FormEvent) {
    e.preventDefault();
    setTgMsg(null);
    setTgBusy(true);
    const res = await fetch("/api/me", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramChatId: tgId.trim() }),
    });
    const data = await res.json();
    setTgBusy(false);
    if (!res.ok) { setTgMsg({ ok: false, text: data.error ?? "저장 실패" }); return; }
    if (!tgId.trim()) setTgMsg({ ok: true, text: "텔레그램 연동이 해제되었습니다." });
    else if (data.telegramTest) setTgMsg({ ok: true, text: "연동 완료! 텔레그램으로 테스트 메시지를 보냈어요." });
    else setTgMsg({ ok: true, text: "저장되었습니다. (테스트 메시지 전송 실패 — 챗 ID 또는 서버 봇 설정을 확인하세요)" });
  }

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

      {/* 텔레그램 알림 연동 */}
      <div className="card" style={{ padding: 22, marginTop: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>텔레그램 알림</h2>
        <p className="page-sub" style={{ margin: "0 0 14px" }}>
          연동하면 승인·담당자 배정·마감 알림을 텔레그램으로 받고, /일정 /예약 명령으로 등록도 할 수 있어요.
        </p>

        {/* 방법 1 — 연동 코드 (추천) */}
        <div className="tg-link-box">
          <div className="tg-link-head">
            <b>간편 연동 (추천)</b>
            <button type="button" className="btn btn-line btn-sm" onClick={issueLinkCode} disabled={codeBusy}>
              {codeBusy ? "발급 중…" : linkCode ? "코드 재발급" : "연동 코드 발급"}
            </button>
          </div>
          {linkCode ? (
            <p className="tg-link-guide">
              텔레그램에서 <b>@teamcal_noti_bot</b> 대화방에 아래를 보내세요 (10분 유효):
              <span className="tg-link-code">/연동 {linkCode}</span>
            </p>
          ) : (
            <p className="tg-link-guide">코드를 발급하고 봇에게 <b>/연동 코드</b>를 보내면 자동으로 연결돼요.</p>
          )}
        </div>

        <form onSubmit={saveTelegram}>
          <div className="field">
            <label>또는 챗 ID 직접 입력</label>
            <input
              value={tgId}
              onChange={(e) => setTgId(e.target.value)}
              placeholder="예: 123456789 (비우면 연동 해제)"
              inputMode="numeric"
              maxLength={32}
            />
          </div>
          {tgMsg && <p className={tgMsg.ok ? "ok-msg" : "err-msg"}>{tgMsg.text}</p>}
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" disabled={tgBusy}>{tgBusy ? "저장 중…" : "저장"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
