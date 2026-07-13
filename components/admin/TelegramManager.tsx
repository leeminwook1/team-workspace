"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { Icon } from "@/components/icons";

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  team: { id: string; name: string; color: string } | null;
  linked: boolean;
  chatIdTail: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "최고관리자", manager: "과장", deputy: "부과장", secretary: "서기",
  leader: "팀장", vice_leader: "부팀장", member: "팀원",
};

export default function TelegramManager() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/telegram");
    if (res.ok) setRows((await res.json()).users ?? []);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function unlink(u: Row) {
    const ok = await confirm({
      title: "텔레그램 연동 해제",
      message: `${u.name} 님의 텔레그램 연동을 해제할까요?\n해제하면 텔레그램 알림·봇 명령을 사용할 수 없고, 본인이 설정에서 다시 연동해야 합니다.`,
      confirmText: "연동 해제", danger: true,
    });
    if (!ok) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/admin/telegram", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "해제 실패"); return; }
    load();
  }

  if (!loaded) return <p style={{ color: "var(--ink-faint)" }}>불러오는 중…</p>;

  const linked = rows.filter((r) => r.linked);
  const unlinked = rows.filter((r) => !r.linked);
  const pct = rows.length ? Math.round((linked.length / rows.length) * 100) : 0;

  return (
    <div style={{ maxWidth: 720 }}>
      {err && <p className="err-msg">{err}</p>}

      {/* 요약 */}
      <div className="tg-summary">
        <span className="tg-pct">{pct}%</span>
        <div>
          <div className="tg-summary-line">활성 사용자 {rows.length}명 중 <b>{linked.length}명</b> 연동</div>
          <div className="tg-summary-sub">연동한 사용자는 알림을 텔레그램으로도 받고, 봇 명령(/일정·/대여 등)을 쓸 수 있어요.</div>
        </div>
      </div>

      <div className="admin-section-title">연동됨 {linked.length}명</div>
      <div className="admin-list">
        {linked.map((u) => (
          <div className="admin-item" key={u.id}>
            <div className="admin-item-main">
              <span className="avatar avatar-sm" aria-hidden>{u.name.slice(0, 1)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="admin-item-title">{u.name}</div>
                <div className="admin-item-sub">{u.email}</div>
              </div>
              <span className="chip">{ROLE_LABEL[u.role] ?? u.role}</span>
              {u.team && <span className="chip"><span className="dot" style={{ background: u.team.color }} />{u.team.name}</span>}
              <span className="tg-linked-badge"><Icon name="check" size={12} strokeWidth={2.8} /> 연동됨 {u.chatIdTail}</span>
            </div>
            <div className="admin-item-actions">
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => unlink(u)}>해제</button>
            </div>
          </div>
        ))}
        {linked.length === 0 && (
          <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--ink-faint)" }}>
            아직 연동한 사용자가 없습니다. 각자 <b>설정 → 텔레그램 알림</b>에서 연동할 수 있어요.
          </div>
        )}
      </div>

      {unlinked.length > 0 && (
        <>
          <div className="admin-section-title" style={{ marginTop: 22 }}>미연동 {unlinked.length}명</div>
          <div className="admin-list tg-unlinked">
            {unlinked.map((u) => (
              <div className="admin-item off" key={u.id}>
                <div className="admin-item-main">
                  <span className="avatar avatar-sm" aria-hidden>{u.name.slice(0, 1)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="admin-item-title">{u.name}</div>
                    <div className="admin-item-sub">{u.email}</div>
                  </div>
                  <span className="chip">{ROLE_LABEL[u.role] ?? u.role}</span>
                  {u.team && <span className="chip"><span className="dot" style={{ background: u.team.color }} />{u.team.name}</span>}
                </div>
              </div>
            ))}
          </div>
          <p className="muted-note" style={{ marginTop: 10 }}>
            미연동 사용자에게는 앱 내 알림만 갑니다. 텔레그램 연동은 본인만 할 수 있어요 (설정 → 텔레그램 알림 → 연동 코드 발급).
          </p>
        </>
      )}
    </div>
  );
}
