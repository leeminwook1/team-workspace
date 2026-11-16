import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AssignmentDetail from "@/components/assignments/AssignmentDetail";

export const dynamic = "force-dynamic";

export default async function AssignmentPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  return <AssignmentDetail id={params.id} meId={session!.user.id} />;
}
