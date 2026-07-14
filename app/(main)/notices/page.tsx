import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canCreateNotice, type SessionUser } from "@/lib/permissions";
import NoticeBoard from "@/components/notices/NoticeBoard";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as SessionUser; // (main) 레이아웃에서 인증 보장

  return <NoticeBoard canCreate={canCreateNotice(user)} />;
}
