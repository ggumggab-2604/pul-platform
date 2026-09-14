import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HallOfFameApplicationForm } from "@/components/hall-of-fame/HallOfFameApplicationForm";
import { Container } from "@/components/ui/Container";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { applicantError, isUuid, loadApplicantEligibility, loadApplicantWorkspace } from "@/lib/hall-of-fame/hallOfFameApplicant";

export const metadata: Metadata = { title: "명예의 전당 신규 기록 신청", robots: { index: false, follow: false } };
export default async function HallOfFameApplyPage({ searchParams }: { searchParams: Promise<{ batch?: string; offset?: string }> }) {
  const query = await searchParams;
  const batchId = isUuid(query.batch) ? query.batch : null;
  const rawOffset = Number(query.offset ?? 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 10000 ? rawOffset : 0;
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent(batchId ? `/hall-of-fame/apply?batch=${batchId}` : "/hall-of-fame/apply")}`);
  let loaded;
  let loadError;
  try {
    const [workspace, eligibility] = await Promise.all([
      loadApplicantWorkspace(context.supabase, batchId, offset), loadApplicantEligibility(context.supabase),
    ]);
    loaded = { workspace, eligibility };
  } catch (error) {
    loadError = applicantError(error);
  }
  return <Container className="max-w-3xl px-3 py-8 pb-24">
    <Link href="/hall-of-fame" className="inline-flex min-h-11 items-center font-bold text-pul-deep">명예의 전당으로</Link>
    <h1 className="mt-3 text-2xl font-black sm:text-3xl">신규 기록 신청</h1>
    <p className="mt-3 mb-6 leading-7 text-pul-muted">본인의 기록을 신청하세요. 신청 후 검토를 거쳐 승인 여부가 결정되며, 사실과 다른 정보는 반려될 수 있습니다.</p>
    {loaded ? <HallOfFameApplicationForm key={context.userId} userId={context.userId} workspace={loaded.workspace} eligibility={loaded.eligibility} selectedBatchId={batchId} offset={offset} /> : <div role="alert" className="rounded-xl border border-pul-border bg-white p-5"><p>{loadError}</p><Link className="mt-4 inline-flex min-h-12 items-center font-bold text-pul-deep" href="/hall-of-fame/apply">다시 불러오기</Link></div>}
  </Container>;
}
