"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

// 모바일 하단 탭에 고정할 핵심 메뉴 (나머지는 '더보기' 시트로)
const PRIMARY_HREFS = ["/home", "/calendar", "/resources", "/events"];

/** 데스크톱 좌측 세로 네비게이션 */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "on" : undefined}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
          {!!item.badge && <span className="nav-badge">{item.badge > 99 ? "99+" : item.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** 모바일 하단 탭바 (Toss 스타일) — 핵심 4개 + 더보기 시트 */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const goSheet = (href: string) => { setSheetOpen(false); router.push(href); };

  const primary = PRIMARY_HREFS.map((h) => items.find((i) => i.href === h)).filter(Boolean) as NavItem[];
  const more = items.filter((i) => !PRIMARY_HREFS.includes(i.href));
  const moreBadge = more.reduce((sum, i) => sum + (i.badge ?? 0), 0);
  const moreActive = more.some((i) => isActive(pathname, i.href));

  // 라우트 이동 시 시트 닫기 + 열렸을 때 배경 스크롤 잠금
  useEffect(() => { setSheetOpen(false); }, [pathname]);
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [sheetOpen]);

  return (
    <>
      <nav className="bottom-nav">
        {primary.map((item) => (
          <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "on" : undefined}>
            <span className="bn-icon">
              <Icon name={item.icon} size={23} strokeWidth={2} />
              {!!item.badge && <span className="nav-badge bn-badge">{item.badge > 9 ? "9+" : item.badge}</span>}
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`bn-more-btn${sheetOpen || moreActive ? " on" : ""}`}
          aria-label="더보기"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((v) => !v)}
        >
          <span className="bn-icon">
            <Icon name="menu" size={23} strokeWidth={2} />
            {moreBadge > 0 && <span className="nav-badge bn-badge">{moreBadge > 9 ? "9+" : moreBadge}</span>}
          </span>
          <span>더보기</span>
        </button>
      </nav>

      {sheetOpen && (
        <div className="bn-sheet-overlay" onClick={() => setSheetOpen(false)}>
          <div className="bn-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bn-sheet-grab" aria-hidden />
            <div className="bn-sheet-grid">
              {more.map((item) => (
                <button type="button" key={item.href} className={`bn-sheet-item${isActive(pathname, item.href) ? " on" : ""}`} onClick={() => goSheet(item.href)}>
                  <span className="bn-sheet-ico">
                    <Icon name={item.icon} size={22} />
                    {!!item.badge && <span className="nav-badge bn-badge">{item.badge > 9 ? "9+" : item.badge}</span>}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
              <button type="button" className={`bn-sheet-item${isActive(pathname, "/help") ? " on" : ""}`} onClick={() => goSheet("/help")}>
                <span className="bn-sheet-ico"><Icon name="book" size={22} /></span>
                <span>사용 안내</span>
              </button>
              <button type="button" className={`bn-sheet-item${isActive(pathname, "/settings") ? " on" : ""}`} onClick={() => goSheet("/settings")}>
                <span className="bn-sheet-ico"><Icon name="gear" size={22} /></span>
                <span>내 계정</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
