"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

type TeamRef = { name: string; color: string };
type Results = {
  tasks: { id: string; title: string; date: string; allDay: boolean; teams: TeamRef[] }[];
  events: { id: string; title: string; eventDate: string | null; teams: TeamRef[]; itemsTotal: number; matchedItems?: string[] }[];
  directives: { id: string; title: string; status: string; dueDate: string | null; team: TeamRef | null }[];
  resources: { id: string; name: string; category: TeamRef | null }[];
};

const EMPTY: Results = { tasks: [], events: [], directives: [], resources: [] };
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "";

/** 전역 검색 — 사이드바(입력창 모양) / 모바일 상단바(아이콘) 트리거 + 팔레트 모달 */
export default function GlobalSearch({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => { setOpen(false); setQ(""); setResults(EMPTY); }, []);
  const [active, setActive] = useState(0); // 키보드(↑↓) 선택 인덱스

  // 결과를 렌더 순서 그대로 평탄화 — ↑↓/Enter 탐색용
  const flat: { href: string }[] = [
    ...results.tasks.map((t) => ({ href: `/calendar?task=${t.id}` })),
    ...results.events.map((e) => ({ href: `/events/${e.id}` })),
    ...(results.resources ?? []).map(() => ({ href: "/resources" })),
    ...results.directives.map(() => ({ href: "/directives" })),
  ];

  // Ctrl/⌘+K — 어디서든 검색 열기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 열리면 포커스, ESC 닫기 + ↑↓/Enter 결과 탐색
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (flat.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const target = flat[Math.min(active, flat.length - 1)];
        if (target) go(target.href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // flat·active를 참조하므로 매 렌더 재등록 (가벼움)

  // 결과가 바뀌면 선택을 맨 위로 + 선택 항목이 보이게 스크롤
  useEffect(() => { setActive(0); }, [results]);
  useEffect(() => {
    document.querySelector(".gs-item.kb-active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // 디바운스 검색
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (!query) { setResults(EMPTY); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, open]);

  function go(href: string) {
    close();
    router.push(href);
  }

  const total = results.tasks.length + results.events.length + results.directives.length + (results.resources?.length ?? 0);

  return (
    <>
      {compact ? (
        <button className="gs-trigger-icon" aria-label="검색" onClick={() => setOpen(true)}>
          <Icon name="search" size={19} />
        </button>
      ) : (
        <button className="gs-trigger" onClick={() => setOpen(true)}>
          <Icon name="search" size={16} />
          <span>검색</span>
          <kbd className="gs-kbd">Ctrl K</kbd>
        </button>
      )}

      {/* sticky 사이드바 내부에서 z-index가 갇히지 않도록 body 포털로 렌더 */}
      {open && createPortal(
        <div className="modal-overlay gs-overlay" onClick={close}>
          <div className="gs-panel" onClick={(e) => e.stopPropagation()}>
            <div className="gs-input-row">
              <Icon name="search" size={18} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="업무 · 행사 · TODO · 장비 검색"
                aria-label="검색어"
              />
              <button className="gs-esc" onClick={close}>ESC</button>
            </div>

            <div className="gs-body">
              {!q.trim() ? (
                <p className="gs-hint">제목·장소·내용으로 검색할 수 있어요.</p>
              ) : loading ? (
                <p className="gs-hint">검색 중…</p>
              ) : total === 0 ? (
                <p className="gs-hint">“{q.trim()}” 검색 결과가 없습니다.</p>
              ) : (
                <>
                  {results.tasks.length > 0 && (
                    <div className="gs-group">
                      <div className="gs-group-title">업무</div>
                      {results.tasks.map((t, i) => (
                        <button className={`gs-item${active === i ? " kb-active" : ""}`} onMouseEnter={() => setActive(i)} key={t.id} onClick={() => go(`/calendar?task=${t.id}`)}>
                          <span className="gs-item-dots">
                            {t.teams.slice(0, 3).map((tm, i) => <span className="dot" key={i} style={{ background: tm.color }} />)}
                          </span>
                          <span className="gs-item-title">{t.title}</span>
                          <span className="gs-item-meta">{fmtDate(t.date)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {results.events.length > 0 && (
                    <div className="gs-group">
                      <div className="gs-group-title">행사</div>
                      {results.events.map((e, i) => (
                        <button className={`gs-item${active === results.tasks.length + i ? " kb-active" : ""}`} onMouseEnter={() => setActive(results.tasks.length + i)} key={e.id} onClick={() => go(`/events/${e.id}`)}>
                          <span className="gs-item-dots">
                            {e.teams.slice(0, 3).map((tm, i) => <span className="dot" key={i} style={{ background: tm.color }} />)}
                          </span>
                          <span className="gs-item-title">
                            {e.title}
                            {(e.matchedItems?.length ?? 0) > 0 && (
                              <span className="gs-item-sub"> — {e.matchedItems!.join(", ")}</span>
                            )}
                          </span>
                          <span className="gs-item-meta">{e.eventDate ? fmtDate(e.eventDate) : `할 일 ${e.itemsTotal}개`}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {(results.resources?.length ?? 0) > 0 && (
                    <div className="gs-group">
                      <div className="gs-group-title">장비</div>
                      {results.resources.map((r, i) => (
                        <button className={`gs-item${active === results.tasks.length + results.events.length + i ? " kb-active" : ""}`} onMouseEnter={() => setActive(results.tasks.length + results.events.length + i)} key={r.id} onClick={() => go("/resources")}>
                          <span className="gs-item-dots">
                            {r.category && <span className="dot" style={{ background: r.category.color }} />}
                          </span>
                          <span className="gs-item-title">{r.name}</span>
                          <span className="gs-item-meta">{r.category?.name ?? ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {results.directives.length > 0 && (
                    <div className="gs-group">
                      <div className="gs-group-title">TODO</div>
                      {results.directives.map((d, i) => (
                        <button className={`gs-item${active === results.tasks.length + results.events.length + (results.resources?.length ?? 0) + i ? " kb-active" : ""}`} onMouseEnter={() => setActive(results.tasks.length + results.events.length + (results.resources?.length ?? 0) + i)} key={d.id} onClick={() => go("/directives")}>
                          <span className="gs-item-dots">
                            {d.team && <span className="dot" style={{ background: d.team.color }} />}
                          </span>
                          <span className="gs-item-title">{d.title}</span>
                          <span className="gs-item-meta">{d.dueDate ? `마감 ${fmtDate(d.dueDate)}` : ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
