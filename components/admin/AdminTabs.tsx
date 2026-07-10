"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="admin-tabs" role="tablist">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={`admin-tab${pathname === t.href ? " active" : ""}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
