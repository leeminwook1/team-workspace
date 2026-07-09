"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/** 데스크톱 좌측 세로 네비게이션 */
export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "on" : undefined}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** 모바일 하단 탭바 (Toss 스타일) */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "on" : undefined}>
          <Icon name={item.icon} size={23} strokeWidth={2} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
