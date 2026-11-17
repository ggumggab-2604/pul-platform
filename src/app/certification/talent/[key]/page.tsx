import Link from "next/link";
import { notFound } from "next/navigation";
import { CertificationDetailFields, CertificationDetailFrame, certificationLink } from "@/components/certification/CertificationDetailFrame";
import { certificationUuidPattern, talentFields, type TalentProfile } from "@/lib/certification/certificationPhaseOne";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CertificationTalentDetail({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!certificationUuidPattern.test(key)) notFound();
  const client = await createClient();
  const [{ data, error }, viewer] = await Promise.all([
    client.rpc("certification_profiles", { p_id: key, p_own: false, p_offset: 0 }),
    getAuthenticatedSupabaseContext(),
  ]);
  if (error) throw new Error("공개 구직 프로필을 불러오지 못했습니다.");
  const profile = data as TalentProfile | null;
  if (!profile) notFound();
  const href = `/certification/talent/${key}`;
  const compose = `/messages/new?${new URLSearchParams({ certificationKind: "talent", certificationKey: key })}`;
  return <CertificationDetailFrame title={profile.nickname} back="/certification?tab=activity">
    <p className="text-sm font-bold text-pul-point">본인 등록 자격</p>
    <CertificationDetailFields fields={talentFields.map(([field, label]) => [label, profile[field]])} />
    {profile.is_owner ? <Link className={certificationLink} href="/certification/talent/edit">내 구직 프로필 수정</Link> :
      <Link className={certificationLink} prefetch={false} href={viewer ? compose : `/login?next=${encodeURIComponent(href)}`}>
        {viewer ? "구직 회원에게 쪽지" : "로그인하고 구직 회원에게 쪽지 보내기"}
      </Link>}
  </CertificationDetailFrame>;
}
