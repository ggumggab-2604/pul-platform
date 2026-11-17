import Link from "next/link";
import { redirect } from "next/navigation";
import { saveTalentProfileAction } from "@/app/certification/phaseOneActions";
import { CertificationDetailFrame, certificationLink } from "@/components/certification/CertificationDetailFrame";
import { CertificationLocalForm, certificationInput } from "@/components/certification/CertificationLocalForms";
import { talentFields, type TalentProfile } from "@/lib/certification/certificationPhaseOne";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export default async function EditCertificationTalent() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=%2Fcertification%2Ftalent%2Fedit");
  const { data, error } = await context.supabase.rpc("certification_profiles", { p_id: null, p_own: true, p_offset: 0 });
  const profile = data as TalentProfile | null;
  return <CertificationDetailFrame title="내 구직 프로필" back="/certification?tab=activity">
    {error ? <p role="alert">프로필을 불러오지 못했습니다. 가입 상태를 확인하거나 다시 시도해 주세요.</p> : <>
      <p className="text-sm leading-6">공개를 선택하면 닉네임과 아래 활동 정보가 표시됩니다. 전화번호, 이메일, 개인 자격증 번호와 증빙은 입력하지 마세요.</p>
      <CertificationLocalForm action={saveTalentProfileAction}>
        <div className="grid gap-3 sm:grid-cols-2">
          {talentFields.map(([name, label, max, required]) => <label key={name} className={name === "experience" ? "sm:col-span-2" : ""}>{label}
            {name === "experience" ? <textarea name={name} maxLength={max} defaultValue={profile?.[name]} className={certificationInput} />
              : <input name={name} required={required} maxLength={max} defaultValue={profile?.[name]} className={certificationInput} />}
          </label>)}
        </div>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="is_public" defaultChecked={profile?.is_public ?? false} />구직 프로필 공개</label>
      </CertificationLocalForm>
      {profile?.is_public && <Link className={certificationLink} href={`/certification/talent/${profile.id}`}>내 공개 프로필 보기</Link>}
    </>}
  </CertificationDetailFrame>;
}
