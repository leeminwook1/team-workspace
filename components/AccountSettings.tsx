"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ModalClose } from "./ModalClose";

type NotifyPrefs = { assign: boolean; due: boolean; late: boolean; directive: boolean; equip: boolean };
const PREF_ITEMS: { key: keyof NotifyPrefs; label: string; desc: string }[] = [
  { key: "assign", label: "담당 배정", desc: "업무·행사 담당자로 지정될 때" },
  { key: "due", label: "마감 리마인더", desc: "오늘 마감 업무 아침 알림" },
  { key: "late", label: "지연 리마인더", desc: "마감이 지난 업무 아침 알림" },
  { key: "directive", label: "지시(TODO)", desc: "우리 팀에 지시가 내려올 때 (팀장·부팀장)" },
  { key: "equip", label: "장비 예약·반납", desc: "장비 예약·반납·미반납·수령 예정 알림" },
];

export default function AccountSettings({
  initialName, email, roleLabel, teamName, initialTelegramChatId, initialNotifyPrefs, initialIcalToken,
}: {
  initialName: string; email: string; roleLabel: string; teamName: string | null; initialTelegramChatId?: string;
  initialNotifyPrefs?: NotifyPrefs;
  initialIcalToken?: string;
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
  const [showGuide, setShowGuide] = useState(false);
  const [prefs, setPrefs] = useState<NotifyPrefs>(
    { assign: true, due: true, late: true, directive: true, equip: true, ...(initialNotifyPrefs ?? {}) }
  );

  // ── iCal 구독 ──
  const [icalToken, setIcalToken] = useState(initialIcalToken ?? "");
  const [icalBusy, setIcalBusy] = useState(false);
  const [icalMsg, setIcalMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const icalUrl = icalToken && typeof window !== "undefined" ? `${window.location.origin}/api/ical/${icalToken}` : "";

  async function issueIcal(regen: boolean) {
    setIcalBusy(true); setIcalMsg(null);
    const res = await fetch("/api/me/ical-token", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setIcalBusy(false);
    if (!res.ok) { setIcalMsg({ ok: false, text: data.error ?? "발급 실패" }); return; }
    setIcalToken(data.token);
    setIcalMsg({ ok: true, text: regen ? "재발급했어요. 이전 URL은 더 이상 동작하지 않아요." : "구독 URL이 준비됐어요. 아래 안내대로 캘린더 앱에 추가하세요." });
  }
  async function revokeIcal() {
    setIcalBusy(true); setIcalMsg(null);
    const res = await fetch("/api/me/ical-token", { method: "DELETE" });
    setIcalBusy(false);
    if (!res.ok) { setIcalMsg({ ok: false, text: "해제 실패" }); return; }
    setIcalToken("");
    setIcalMsg({ ok: true, text: "구독을 해제했어요. 기존 URL은 즉시 무효화됐습니다." });
  }
  async function copyIcal() {
    try {
      await navigator.clipboard.writeText(icalUrl);
      setIcalMsg({ ok: true, text: "URL을 복사했어요." });
    } catch {
      setIcalMsg({ ok: false, text: "복사에 실패했어요. URL을 직접 선택해 복사해주세요." });
    }
  }

  async function issueLinkCode() {
    setCodeBusy(true);
    setTgMsg(null);
    try {
      const res = await fetch("/api/me/telegram-code", { method: "POST" });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setTgMsg({ ok: false, text: data.error ?? "코드 발급 실패" }); return; }
      setLinkCode(data.code);
    } catch {
      setTgMsg({ ok: false, text: "네트워크 오류로 코드를 발급하지 못했어요." });
    } finally {
      setCodeBusy(false);
    }
  }

  async function saveTelegram(e: React.FormEvent) {
    e.preventDefault();
    setTgMsg(null);
    setTgBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId: tgId.trim(), notifyPrefs: prefs }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setTgMsg({ ok: false, text: data.error ?? "저장 실패" }); return; }
      if (!tgId.trim()) setTgMsg({ ok: true, text: "텔레그램 연동이 해제되었습니다." });
      else if (data.telegramTest) setTgMsg({ ok: true, text: "연동 완료! 텔레그램으로 테스트 메시지를 보냈어요." });
      else setTgMsg({ ok: true, text: "저장되었습니다. (테스트 메시지 전송 실패 — 챗 ID 또는 서버 봇 설정을 확인하세요)" });
    } catch {
      setTgMsg({ ok: false, text: "네트워크 오류로 저장하지 못했어요." });
    } finally {
      setTgBusy(false);
    }
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
    try {
      const res = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setNameMsg({ ok: false, text: data.error ?? "저장 실패" }); return; }
      await update(); // 세션의 이름 즉시 갱신
      setNameMsg({ ok: true, text: "이름이 변경되었습니다." });
    } catch {
      setNameMsg({ ok: false, text: "네트워크 오류로 저장하지 못했어요." });
    } finally {
      setNameBusy(false);
    }
  }

  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw.length < 8) { setPwMsg({ ok: false, text: "새 비밀번호는 8자 이상" }); return; }
    if (newPw !== newPw2) { setPwMsg({ ok: false, text: "새 비밀번호가 서로 다릅니다." }); return; }
    setPwBusy(true);
    try {
      const res = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }) });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setPwMsg({ ok: false, text: data.error ?? "변경 실패" }); return; }
      setCurPw(""); setNewPw(""); setNewPw2("");
      setPwMsg({ ok: true, text: "비밀번호가 변경되었습니다." });
    } catch {
      setPwMsg({ ok: false, text: "네트워크 오류로 변경하지 못했어요." });
    } finally {
      setPwBusy(false);
    }
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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, margin: "0 0 6px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>텔레그램 알림</h2>
          <button type="button" className="btn btn-line btn-sm" onClick={() => setShowGuide(true)} style={{ flex: "none" }}>
            연동 방법
          </button>
        </div>
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
          {/* 알림 수신 설정 — 연동된 경우에만 (텔레그램 발송만 제어, 앱 내 알림은 항상) */}
          {tgId.trim() && (
            <div className="tg-prefs">
              <div className="tg-prefs-title">받을 알림 선택</div>
              {PREF_ITEMS.map((it) => (
                <div className="switch-row" key={it.key}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-soft)" }}>{it.label}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>{it.desc}</div>
                  </div>
                  <button
                    type="button" role="switch" aria-checked={prefs[it.key]}
                    className={`toggle${prefs[it.key] ? " on" : ""}`}
                    onClick={() => setPrefs((p) => ({ ...p, [it.key]: !p[it.key] }))}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {tgMsg && <p className={tgMsg.ok ? "ok-msg" : "err-msg"}>{tgMsg.text}</p>}
          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" disabled={tgBusy}>{tgBusy ? "저장 중…" : "저장"}</button>
          </div>
        </form>
      </div>

      {/* 캘린더 구독 (iCal) */}
      <div className="card" style={{ padding: 22, marginTop: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>캘린더 구독 (iCal)</h2>
        <p className="page-sub" style={{ margin: "0 0 14px" }}>
          내 담당 업무·개인 일정·부재를 구글/애플 캘린더 등 쓰던 캘린더 앱에서 그대로 볼 수 있어요.
        </p>
        {icalToken ? (
          <>
            <div className="ical-url-row">
              <input className="ical-url" value={icalUrl} readOnly onFocus={(e) => e.target.select()} aria-label="iCal 구독 URL" />
              <button type="button" className="btn btn-primary btn-sm" onClick={copyIcal}>복사</button>
            </div>
            <div className="ical-guide">
              <p><b>구글 캘린더</b>: 설정 → 캘린더 추가 → <b>URL로 추가</b> → 위 주소 붙여넣기</p>
              <p><b>아이폰/맥</b>: 설정 → 캘린더 → 계정 추가 → 기타 → <b>구독 캘린더 추가</b> → 위 주소 붙여넣기</p>
              <p className="muted-note">이 URL을 아는 사람은 내 일정을 볼 수 있어요 — 공유하지 마세요. 갱신 주기는 캘린더 앱이 정해요(보통 몇 시간).</p>
            </div>
            <div className="modal-actions" style={{ marginTop: 14, gap: 8 }}>
              <button type="button" className="btn btn-line btn-sm" disabled={icalBusy} onClick={() => issueIcal(true)}>URL 재발급</button>
              <button type="button" className="btn btn-danger btn-sm" disabled={icalBusy} onClick={revokeIcal}>구독 해제</button>
            </div>
          </>
        ) : (
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={icalBusy} onClick={() => issueIcal(false)}>
              {icalBusy ? "발급 중…" : "구독 URL 발급"}
            </button>
          </div>
        )}
        {icalMsg && <p className={icalMsg.ok ? "ok-msg" : "err-msg"} style={{ marginTop: 10 }}>{icalMsg.text}</p>}
      </div>

      {/* 텔레그램 연동 방법 매뉴얼 모달 */}
      {showGuide && (
        <div className="modal-overlay" onClick={() => setShowGuide(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <ModalClose onClose={() => setShowGuide(false)} />
            <h2>텔레그램 연동 방법</h2>
            <p className="page-sub" style={{ margin: "-8px 0 16px" }}>
              아래 순서대로 따라 하면 1분 안에 알림을 받을 수 있어요.
            </p>

            {/* 봇 배너 */}
            <div className="tg-guide-bot">
              <span className="tg-guide-bot-ic" aria-hidden>✈️</span>
              <div className="tg-guide-bot-txt">
                <b>@teamcal_noti_bot</b>
                <span>텔레그램 검색창에 이 이름을 넣어 봇 대화방을 여세요.</span>
              </div>
            </div>

            <div className="tg-guide-label">방법 1 · 간편 연동 <em>(추천)</em></div>
            <ol className="tg-guide-steps">
              <li>텔레그램에서 <b>@teamcal_noti_bot</b> 을 검색해 대화방을 열고 <b>시작(Start)</b> 을 눌러요.</li>
              <li>이 화면의 <b>연동 코드 발급</b> 버튼을 누르면 6자리 코드가 나와요. <span className="tg-guide-muted">(10분간 유효)</span></li>
              <li>봇 대화방에 <span className="tg-inline-code">/연동 123456</span> 처럼 코드를 붙여 보내요.</li>
              <li>봇이 <b>“연동 완료”</b> 라고 답하고 테스트 메시지가 오면 끝이에요.</li>
            </ol>

            <div className="tg-guide-label">방법 2 · 챗 ID 직접 입력</div>
            <ol className="tg-guide-steps">
              <li>텔레그램에서 <b>@userinfobot</b> 을 검색해 <b>시작(Start)</b> 을 누르면 내 <b>숫자 ID</b> 를 알려줘요.</li>
              <li>그 숫자를 복사해 이 화면의 <b>“또는 챗 ID 직접 입력”</b> 칸에 붙여넣고 <b>저장</b> 을 눌러요.</li>
            </ol>

            <div className="tg-guide-label">연동 후 쓸 수 있는 명령</div>
            <ul className="tg-guide-cmds">
              <li><span className="tg-inline-code">/오늘</span> <span className="tg-inline-code">/내일</span> 오늘·내일 일정 확인 <em>(누구나)</em></li>
              <li><span className="tg-inline-code">/예약현황</span> 장비 예약 현황 <em>(누구나)</em></li>
              <li><span className="tg-inline-code">/일정 제목 날짜 시간 담당:이름 장비:이름</span> 일정 등록 <em>(권한 필요)</em></li>
              <li><span className="tg-inline-code">/예약 장비명 날짜 시간</span> 장비 예약 <em>(권한 필요)</em></li>
              <li><span className="tg-inline-code">/도움말</span> 전체 명령 안내</li>
            </ul>

            <p className="tg-guide-note">
              💡 알림이 오지 않으면 봇 대화방에서 <b>시작(Start)</b> 을 눌렀는지, 발급한 코드가 <b>10분</b> 안에 지났는지 확인해 보세요.
            </p>

            <div className="modal-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowGuide(false)}>확인했어요</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
