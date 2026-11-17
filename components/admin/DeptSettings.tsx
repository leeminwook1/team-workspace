"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ColorPicker } from "@/components/admin/ColorPicker";

type Dept = { id: string; name: string; slug: string; color: string; telegramChatId: string };

// 과 설정 — 사진과 하나만 쓰므로 팀 목록·생성 대신 과 정보만 편집한다.
export default function DeptSettings({ dept }: { dept: Dept }) {
  const router = useRouter();
  const [name, setName] = useState(dept.name);
  const [color, setColor] = useState(dept.color);
  const [tgChatId, setTgChatId] = useState(dept.telegramChatId);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/teams/${dept.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: dept.slug, color, isActive: true, telegramChatId: tgChatId.trim() }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? "저장 실패" }); return; }
      setMsg({ ok: true, text: "저장했어요." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "네트워크 오류로 저장하지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 22, maxWidth: 560 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>과 설정</h2>
      <form onSubmit={save}>
        <div className="field">
          <label>과 이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={30} />
        </div>
        <div className="field">
          <label>대표 색상</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="field">
          <label>텔레그램 단체방 챗 ID (선택)</label>
          <input
            value={tgChatId}
            onChange={(e) => setTgChatId(e.target.value)}
            placeholder="예: -1001234567890 (비우면 브리핑 끔)"
            maxLength={32}
          />
          <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "6px 0 0", lineHeight: 1.5 }}>
            봇을 과 단체방에 초대하고 그 방에서 <b>/챗아이디</b>를 보내면 ID를 알려줘요.
            등록하면 <b>매일 아침 9시</b> 그 방으로 오늘 일정·장비 대여 브리핑이 갑니다.
          </p>
        </div>
        {msg && <p className={msg.ok ? "ok-msg" : "err-msg"}>{msg.text}</p>}
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </form>
    </div>
  );
}
