import Link from "next/link";
import { notFound } from "next/navigation";
import { CertificationDetailFields, CertificationDetailFrame, certificationLink } from "@/components/certification/CertificationDetailFrame";
import { certificationUuidPattern, talentPublicFields, type TalentProfile } from "@/lib/certification/certificationPhaseOne";
import { certificationInquiryHref, safeCertificationActivityReturn } from "@/lib/certification/certificationJobActivity";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CertificationTalentDetail({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ returnTo?: string | string[]; inquiry?: string | string[] }>;
}) {
  const { key } = await params;
  if (!certificationUuidPattern.test(key)) notFound();
  const [client, query] = await Promise.all([createClient(), searchParams]);
  const [{ data, error }, viewer] = await Promise.all([
    client.rpc("certification_profiles", { p_id: key, p_own: false, p_offset: 0 }),
    getAuthenticatedSupabaseContext(),
  ]);
  if (error) throw new Error("공개 구직 프로필을 불러오지 못했습니다.");
  const profile = data as TalentProfile | null;
  if (!profile) notFound();
  const back = safeCertificationActivityReturn(query.returnTo);

  return <CertificationDetailFrame title={profile.nickname} back={back}>
    <p className="text-sm font-bold text-pul-point">본인 등록 자격</p>
    <CertificationDetailFields fields={talentPublicFields(profile)} />
    {profile.is_owner ? <Link className={certificationLink} href="/certification/talent/edit">내 구직 프로필 수정</Link> :
      <div>
        <Link className={certificationLink} prefetch={false} href={certificationInquiryHref("talent", key, back, !!viewer)}>
          {viewer && query.inquiry === "1" ? "쪽지 작성 계속" : "쪽지로 문의"}
        </Link>
        {!viewer && <p className="text-sm text-pul-muted">로그인 후 같은 프로필에서 쪽지 작성을 이어갈 수 있습니다.</p>}
      </div>}
  </CertificationDetailFrame>;
}
