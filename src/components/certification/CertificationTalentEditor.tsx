"use client";

import { useState } from "react";
import { saveTalentProfileAction } from "@/app/certification/phaseOneActions";
import { CertificationDetailFields } from "@/components/certification/CertificationDetailFrame";
import { CertificationLocalForm, certificationInput } from "@/components/certification/CertificationLocalForms";
import { talentFields, talentPublicFields, type TalentProfile } from "@/lib/certification/certificationPhaseOne";

export function CertificationTalentEditor({ profile, nickname }: { profile: TalentProfile | null; nickname: string }) {
  const [values, setValues] = useState(() => Object.fromEntries(talentFields.map(([name]) => [name, profile?.[name] ?? ""])));
  const [publish, setPublish] = useState(profile?.is_public ?? false);
  const draft = { ...values, nickname } as Pick<TalentProfile, "nickname" | (typeof talentFields)[number][0]>;
  const privateText = /@|https?:\/\/|자격증\s*번호|(?:^|[^0-9])0[0-9]{1,2}[- .]?[0-9]{3,4}[- .]?[0-9]{4}(?:[^0-9]|$)|[0-9]{8,}/i;
  return <CertificationLocalForm action={saveTalentProfileAction} label={publish ? "공개 저장" : "비공개 저장"}>
    <p className="text-sm font-semibold text-pul-deep">저장 상태 · {profile?.is_public ? "공개" : "비공개"}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {talentFields.map(([name, label, max, required]) => {
        const input = {
          name, maxLength: max, required, value: values[name],
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues({ ...values, [name]: event.target.value }),
          className: certificationInput,
        };
        return <label key={name} className={name === "experience" ? "sm:col-span-2" : ""}>{label}
          {name === "experience" ? <textarea {...input} /> : <input {...input} />}
        </label>;
      })}
    </div>
    <label className="flex min-h-11 items-center gap-2 rounded-lg bg-pul-light px-3 font-bold text-pul-deep">
      <input type="checkbox" name="is_public" checked={publish} onChange={event => setPublish(event.target.checked)} />구직 프로필 공개
    </label>
    <section className="space-y-3 rounded-xl border border-pul-border bg-pul-page p-3" aria-labelledby="talent-preview">
      <h2 id="talent-preview" className="text-lg font-bold text-pul-deep">공개 화면 미리보기</h2>
      <p className="text-sm text-pul-muted">{publish ? "저장하면 닉네임과 자격·활동 정보가 공개됩니다." : "비공개로 저장하면 공개 목록과 상세에 표시되지 않습니다."}</p>
      <p className="text-sm text-pul-muted">전화번호·이메일·계정 ID는 공개 프로필에 표시되지 않습니다. 연락처나 개인 자격증 번호를 입력하지 마세요.</p>
      <CertificationDetailFields fields={talentPublicFields(draft).map(([label, value]) => [label, privateText.test(value) ? "공개할 수 없는 입력" : value])} />
    </section>
  </CertificationLocalForm>;
}
