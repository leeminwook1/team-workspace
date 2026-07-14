import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import AccountSettings from "@/components/AccountSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  await connectDB();
  const me: any = await User.findById(session.user.id).populate("teamId", "name").lean();
  if (!me) redirect("/login");

  return (
    <AccountSettings
      initialName={me.name}
      email={me.email}
      roleLabel={ROLE_LABEL[(me.role ?? "member") as Role] ?? "팀원"}
      teamName={me.teamId?.name ?? null}
      initialTelegramChatId={me.telegramChatId ?? ""}
      initialNotifyPrefs={{
        assign: me.notifyPrefs?.assign !== false,
        due: me.notifyPrefs?.due !== false,
        late: me.notifyPrefs?.late !== false,
        directive: me.notifyPrefs?.directive !== false,
        equip: me.notifyPrefs?.equip !== false,
      }}
    />
  );
}
