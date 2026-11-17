import { redirect } from "next/navigation";

// 통계는 /stats 로 옮겼다 (사진과 전용 통계)
export default function OldAdminStats() {
  redirect("/stats");
}
