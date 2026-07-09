"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton({ small = false }: { small?: boolean }) {
  return (
    <button
      className={small ? "btn btn-ghost btn-sm" : "btn btn-ghost btn-lg"}
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      로그아웃
    </button>
  );
}
