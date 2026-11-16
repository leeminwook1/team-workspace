// 운영 배포 식별 — 같은 GitHub 저장소가 옛 Vercel 프로젝트(team-workspace-one.vercel.app)에도
// 연결돼 있어 푸시마다 양쪽에 배포된다. 옛 계정에 접근할 수 없으므로, 현 운영 프로젝트에만
// PRIMARY_DEPLOYMENT=1 을 두고 그 표시가 없는 Vercel 배포는 "은퇴"로 보고 스스로 꺼지게 한다.
// (페이지는 새 주소로 이동, 크론은 실행하지 않음 → 중복 알림 방지)

export const CANONICAL_ORIGIN = "https://team-workspace-dusky.vercel.app";

export function isRetiredDeployment(host?: string | null) {
  if (process.env.VERCEL !== "1") return false; // 로컬 개발은 항상 정상
  if (process.env.PRIMARY_DEPLOYMENT === "1") return false;
  // 안전장치: 표시가 빠졌더라도 정식 주소 자체에서는 절대 리다이렉트하지 않는다 (무한 루프 방지)
  if (host && host === new URL(CANONICAL_ORIGIN).host) return false;
  return true;
}
