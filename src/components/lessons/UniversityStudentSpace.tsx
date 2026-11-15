import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { UniversityUploadForm } from "./UniversityUploadForm";
import { universityButton, universityInput } from "./universityStyles";
import { sections, type Space, type SpaceEntry, type SpaceKind } from "@/lib/lessons/universityFollowup";

export function UniversityStudentSpace({ href, section, page, space, viewer }: {
  href: string; section: keyof typeof sections; page: number; space: Space; viewer: string;
}) {
  const kind: SpaceKind = section === "photos" ? "story" : section;
  const endpoint = href + "/activity";
  const items = space.items.slice(0,20);
  const canCreate = kind === "story" || space.manager;
  function edit(entry?: SpaceEntry) {
    return <UniversityUploadForm key={entry ? entry.id + ":" + entry.version : kind} endpoint={endpoint} viewer={viewer} reset={!entry}
      button={entry ? "변경 저장" : kind === "event" ? "일정 등록" : kind === "notice" ? "공지 등록" : "글 등록"}>
      <input type="hidden" name="kind" value={kind}/>
      <input type="hidden" name="operation" value={entry ? "edit" : "create"}/>
      {entry && <><input type="hidden" name="id" value={entry.id}/><input type="hidden" name="version" value={entry.version}/></>}
      <label className="grid gap-1 font-bold">제목<input name="title" defaultValue={entry?.title} minLength={2} maxLength={160} required className={universityInput}/></label>
      <label className="grid gap-1 font-bold">내용<textarea name="body" defaultValue={entry?.body} rows={4} maxLength={3000} required className={universityInput}/></label>
      {kind === "event" && <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 font-bold">날짜<input type="date" name="event_date" defaultValue={entry?.event_date ?? ""} required className={universityInput}/></label>
        <label className="grid gap-1 font-bold">시간 (한국 시간)<input type="time" name="event_time" defaultValue={entry?.event_time?.slice(0,5)} required className={universityInput}/></label>
        <label className="grid gap-1 font-bold sm:col-span-2">장소<input name="place" defaultValue={entry?.place ?? ""} required maxLength={200} className={universityInput}/></label>
      </div>}
      {kind === "story" && <label className="grid gap-1 font-bold">활동사진 {section !== "photos" || entry?.has_photo ? "(선택)" : ""}
        <input name="file" type="file" accept="image/jpeg,image/png,image/webp" required={section==="photos" && !entry?.has_photo} className={universityInput}/>
      </label>}
    </UniversityUploadForm>;
  }
  function command(entry: SpaceEntry, operation: "delete" | "join" | "cancel", label: string) {
    return <UniversityUploadForm endpoint={endpoint} viewer={viewer} button={label}>
      <input type="hidden" name="kind" value={kind}/>
      <input type="hidden" name="operation" value={operation}/>
      <input type="hidden" name="id" value={entry.id}/>
      <input type="hidden" name="version" value={entry.version}/>
    </UniversityUploadForm>;
  }
  return <>
    <nav aria-label="학과 공간 메뉴" className="flex flex-wrap gap-2">{Object.entries(sections).map(([key,label]) =>
      <Link key={key} href={href + "?section=" + key} aria-current={key===section ? "page" : undefined}
        className={universityButton + (key===section ? " bg-pul-light" : "")}>{label}</Link>)}
      <Link className={universityButton} href={href + "/scores"}>학과 성적·명예의 전당</Link>
    </nav>
    {canCreate && <Card title={kind === "event" ? "새 모임 일정" : kind === "notice" ? "새 공지사항" : section === "photos" ? "활동사진 올리기" : "새 이야기"}>{edit()}</Card>}
    <Card title={sections[section]}>
      {items.length ? <ul className="divide-y divide-pul-border">{items.map(entry => <li key={entry.id} className="space-y-3 py-4">
        <article className="space-y-2">
          <h3 className="break-words text-lg font-bold text-pul-deep">{entry.title}</h3>
          <p className="break-words text-sm text-pul-muted">{entry.author} · {entry.created_at.slice(0,10)}</p>
          {entry.event_date && <p className="break-words font-bold">{entry.event_date} {entry.event_time?.slice(0,5)} · {entry.place} · 참가 {entry.participants}명</p>}
          <p className="whitespace-pre-wrap break-words">{entry.body}</p>
          {entry.has_photo && <Image unoptimized src={endpoint + "/" + entry.id + "?v=" + entry.version} alt={entry.title + " 활동사진"} width={800} height={480} className="h-auto max-w-full rounded-lg"/>}
        </article>
        {kind === "event" && <Link className={universityButton} href={href + "/scores/" + entry.id}>{space.manager ? "참가 확인·성적 관리" : "성적표 보기"}</Link>}
        {kind === "event" && space.student && command(entry,entry.joined ? "cancel" : "join",entry.joined ? "참가 취소" : "참가 신청")}
        {(kind === "story" ? entry.own : space.manager) && <details className="rounded-lg border border-pul-border p-3"><summary className="cursor-pointer font-bold">수정</summary><div className="mt-3">{edit(entry)}</div></details>}
        {(entry.own || space.manager) && <details className="rounded-lg border border-pul-border p-3"><summary className="cursor-pointer font-bold">삭제 확인</summary><div className="mt-3">{command(entry,"delete","이 항목 삭제")}</div></details>}
      </li>)}</ul> : <p>등록된 항목이 없습니다.</p>}
      <div className="mt-3 flex gap-2">{page>1 && <Link className={universityButton} href={href + "?section=" + section + "&page=" + (page-1)}>이전</Link>}
        {space.items.length>20 && <Link className={universityButton} href={href + "?section=" + section + "&page=" + (page+1)}>다음</Link>}</div>
    </Card>
  </>;
}

