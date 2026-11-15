import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { UniversityActionForm } from "@/components/lessons/UniversityForms";
import { UniversityScoreCourse } from "@/components/lessons/UniversityScoreCourse";
import { universityButton, universityInput } from "@/components/lessons/universityStyles";
import { monthlyGameLabels, rankLabel, rankScores } from "@/lib/clubs/monthlyScores";
import { comparisonBases } from "@/lib/clubs/personalBests";
import { universityHref, universityKey, uuid } from "@/lib/lessons/universityWorkspace";
import type { UniversityMonthlyScore } from "@/lib/lessons/universityScores";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { saveUniversityScores } from "../actions";

export const metadata = { title: "학과 월례회 성적표" };

export default async function Page({ params }: { params: Promise<{ key: string; meeting: string }> }) {
  const { key, meeting } = await params;
  if (!universityKey(key) || !uuid(meeting)) notFound();
  const students = universityHref(key) + "/students";
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(students + "/scores/" + meeting));
  const result = await auth.supabase.rpc("get_university_monthly_score", { p_key: key, p_entry: meeting });
  if (result.error?.code === "42501" || (!result.error && !result.data)) notFound();
  if (result.error) return <Container><p role="alert">성적표를 불러오지 못했습니다.</p></Container>;
  const sheet = result.data as UniversityMonthlyScore;

  return <Container className="max-w-4xl space-y-4 px-3 py-6 pb-24">
    <div className="flex flex-wrap gap-2">
      <Link className={universityButton} href={students + "?section=event"}>모임·월례회</Link>
      <Link className={universityButton} href={students + "/scores?year=" + Number(sheet.date.slice(0, 4)) + "&month=" + Number(sheet.date.slice(5, 7)) + "&game=" + (sheet.game ?? "field")}>학과 성적</Link>
    </div>
    <header className="space-y-2">
      <p className="break-words font-bold text-pul-point">{sheet.department}</p>
      <h1 className="break-words text-2xl font-bold text-pul-deep">{sheet.title}</h1>
      <p className="break-words">{sheet.date} {sheet.time.slice(0, 5)} · {sheet.place}{sheet.game && " · " + monthlyGameLabels[sheet.game]}</p>
      {sheet.courseKey && <Link className="break-words text-pul-point underline" href={"/courses/" + encodeURIComponent(sheet.courseKey)}>{sheet.courseName} · 구장 보기</Link>}
      <p className="whitespace-pre-wrap break-words">{sheet.body}</p>
    </header>
    <Card title="18홀 성적표">
      {sheet.rows.length ? <table className="w-full text-left text-sm">
        <thead><tr><th scope="col">순위</th><th scope="col">참가자</th><th scope="col">타수</th></tr></thead>
        <tbody>{rankScores(sheet.rows).map(row => <tr key={row.id} className="border-t border-pul-border">
          <td className="py-2">{rankLabel(row)}</td><th scope="row" className="break-all font-normal">{row.name}</th>
          <td>{row.score === null ? "미입력" : row.score + "타"}</td>
        </tr>)}</tbody>
      </table> : <p>{sheet.recorded ? "실제 참가자가 없습니다." : "아직 성적표가 등록되지 않았습니다."}</p>}
    </Card>
    {sheet.manager && <Card title={sheet.started ? "실제 참가 확인 및 타수 입력" : "월례회 경기 설정"}>
      <UniversityActionForm action={saveUniversityScores.bind(null, key, auth.userId, sheet.id, sheet.eventVersion, sheet.version, sheet.started)}
        button={sheet.started ? "성적표 저장" : "경기 설정 저장"}>
        <label className="grid gap-1 font-bold">18홀 경기 종류
          <select required name="game" className={universityInput} defaultValue={sheet.game ?? ""}>
            <option value="" disabled>경기 종류 선택</option>
            {Object.entries(monthlyGameLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <UniversityScoreCourse courseKey={sheet.courseKey} courseName={sheet.courseName} />
        <label className="grid gap-1 font-bold">명예의 전당 비교 기준
          <select name="basis" className={universityInput} defaultValue={sheet.basis}>
            {Object.entries(comparisonBases).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="public_ranking" defaultChecked={sheet.public} className="mt-1" />
          <span>자격을 충족한 타수를 구장·전국 공개 순위에 반영</span>
        </label>
        {sheet.started && <fieldset className="space-y-2">
          <legend className="font-bold">참가 신청 명단</legend>
          <p className="text-sm text-pul-muted">실제 참가자만 선택하세요. 타수를 비워 두면 참가만 기록됩니다. 기존 참가를 해제하면 해당 성적이 집계에서 제외됩니다.</p>
          {sheet.roster.length ? <ul className="divide-y divide-pul-border">{sheet.roster.map(row => <li key={row.id} className="flex flex-wrap items-end justify-between gap-2 py-2">
            <label className="flex min-h-11 items-center gap-2 break-all"><input type="checkbox" name="attendee" value={row.id} defaultChecked={row.attended} />{row.name}</label>
            <label className="grid gap-1 text-sm">{row.name} 타수<input type="number" name={"score-" + row.id} className={universityInput + " w-28"}
              min={1} max={2147483647} step={1} defaultValue={row.score ?? ""} /></label>
          </li>)}</ul> : <p>참가를 신청한 승인 학생이 없습니다.</p>}
        </fieldset>}
      </UniversityActionForm>
    </Card>}
  </Container>;
}

