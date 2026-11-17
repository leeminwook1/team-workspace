import PipelineBoard from "@/components/pipeline/PipelineBoard";

export const dynamic = "force-dynamic";

// 촬영 진행 — 촬영 → 백업 → 셀렉 → 보정 → 보고 단계별 보드
export default function PipelinePage() {
  return <PipelineBoard />;
}
