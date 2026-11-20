import Link from "next/link";
import { redirect } from "next/navigation";
import { CertificationDetailFrame, certificationLink } from "@/components/certification/CertificationDetailFrame";
import { CertificationTalentEditor } from "@/components/certification/CertificationTalentEditor";
import { certificationActivityPath } from "@/lib/certification/certificationJobActivity";
import type { TalentProfile } from "@/lib/certification/certificationPhaseOne";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export default async function EditCertificationTalent() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=%2Fcertification%2Ftalent%2Fedit");
  const [{ data, error }, { data: accountProfile, error: accountError }] = await Promise.all([
    context.supabase.rpc("certification_profiles", { p_id: null, p_own: true, p_offset: 0 }),
    context.supabase.from("user_profiles").select("nickname").eq("user_id", context.userId).maybeSingle(),
  ]);
  const profile = data as TalentProfile | null;
  return <CertificationDetailFrame title="내 구직 프로필 등록·관리" back={certificationActivityPath + "#certification-talent"}>
    {error || accountError ? <p role="alert">프로필을 불러오지 못했습니다. 가입 상태를 확인하거나 다시 시도해 주세요.</p> : <>
      <CertificationTalentEditor profile={profile} nickname={accountProfile?.nickname ?? ""} />
      {profile?.is_public && <Link prefetch={false} className={certificationLink} href={"/certification/talent/" + profile.id}>내 공개 프로필 보기</Link>}
    </>}
  </CertificationDetailFrame>;
}
