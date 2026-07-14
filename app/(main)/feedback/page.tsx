import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canManageFeedback, type SessionUser } from "@/lib/permissions";
import FeedbackBoard from "@/components/feedback/FeedbackBoard";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as SessionUser; // (main) 레이아웃에서 인증 보장

  return <FeedbackBoard canManage={canManageFeedback(user)} />;
}
