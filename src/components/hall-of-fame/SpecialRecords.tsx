"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { listPublicCourses, type PublicCourse } from "@/lib/courses/courseDirectory";
import { PhotoUploadStatus, usePhotoUploadProgress } from "@/components/ui/PhotoUploadStatus";
import { preparePhoto } from "@/lib/images/preparePhoto";
import { MessagingSessionBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { clubButton, clubInput } from "@/components/clubs/detail/ClubEditorDialog";
import { specialPhotoUrl, specialRpc, specialTypes, type SpecialApplication, type SpecialMember, type SpecialPage, type SpecialRecord, type SpecialType, type SpecialWorkspace } from "@/lib/hall-of-fame/hallSpecialRecords";
import { ConfirmedCompanions, SpecialPending } from "./SpecialConfirmation";
import { SpecialDialog } from "./SpecialDialog";
import { SpecialMemberSummary } from "./SpecialMemberSummary";

export function SpecialRecords({ clubKey, memberKey, compactEmpty=false }: { clubKey?: string; memberKey?: string; compactEmpty?:boolean }) {
 const [pages, setPages] = useState<Partial<Record<SpecialType, SpecialPage>>>({}), [offsets, setOffsets] = useState<Record<SpecialType, number>>({condor: 0, albatross: 0, hole_in_one: 0}), [members, setMembers] = useState<SpecialMember[]>([]), [error, setError] = useState(""), [detail, setDetail] = useState<SpecialRecord | null>(null), [large, setLarge] = useState<string | null>(null), [busy, setBusy] = useState(false);
 const revision = useRef(0);
 const load = useCallback(async () => {
  const ticket = ++revision.current; setBusy(true);
  try {
   const client = createClient(), entries = await Promise.all((Object.keys(specialTypes) as SpecialType[]).map(async type => [type, await specialRpc<SpecialPage>(client, "list_hall_special_records", {p_club_key: clubKey ?? null, p_member_key: memberKey ?? null, p_type: type, p_offset: offsets[type], p_limit: 10})] as const));
   const next = Object.fromEntries(entries), keys = [...new Set(entries.flatMap(([, page]) => page.items.flatMap(r => r.member_key ? [r.member_key] : [])))];
   const summaries = keys.length ? await specialRpc<SpecialMember[]>(client, "get_hall_special_member_summaries", {p_keys: keys}) : [];
   if (ticket === revision.current) { setPages(next); setMembers(summaries); setError(""); }
  } catch (e) { if (ticket === revision.current) setError((e as Error).message); } finally { if (ticket === revision.current) setBusy(false); }
 }, [clubKey, memberKey, offsets]);
 useEffect(() => { const epoch = revision; const timer = setTimeout(() => void load(), 0); const changed = () => { setDetail(null); setLarge(null); void load(); }; window.addEventListener("pul:special-records-changed", changed); return () => { clearTimeout(timer); epoch.current++; window.removeEventListener("pul:special-records-changed", changed); }; }, [load]);
 const author = (r: SpecialRecord) => { const m = members.find(m => m.key === r.member_key); return m ? <SpecialMemberSummary member={m} /> : <span>{r.name}</span>; };
 const loaded=(Object.keys(specialTypes) as SpecialType[]).every(type=>pages[type]!==undefined);
 const allEmpty=loaded&&(Object.keys(specialTypes) as SpecialType[]).every(type=>pages[type]?.total===0);
 return <div className="min-w-0" aria-busy={busy}><div className="flex flex-wrap gap-3"><Link className={clubButton} href={`/hall-of-fame/special?mine=1${clubKey ? `&club=${encodeURIComponent(clubKey)}` : ""}`}>기록 등록·승인 / 전체 보기</Link><button type="button" className={clubButton} disabled={busy} onClick={() => { setDetail(null); setLarge(null); void load(); }}>새로고침</button></div>
 {error ? <p role="alert" className="mt-3 text-rose-700">{error}</p> : null}
 {compactEmpty&&!loaded?(!error?<p className="mt-3 text-sm text-pul-muted" role="status">기록을 불러오고 있습니다.</p>:null):compactEmpty&&allEmpty?<div className="mt-3 text-sm"><p className="font-semibold text-pul-deep">콘도르 0 · 알바트로스 0 · 홀인원 0</p><p className="mt-1 text-pul-muted">아직 공개된 특별 기록이 없습니다. 기록 등록·승인에서 추가할 수 있습니다.</p></div>:(Object.entries(specialTypes) as [SpecialType, string][]).map(([type, label]) => <section key={type} className="mt-5" aria-label={label + " 기록"}><h3 className="text-lg font-bold text-pul-deep">{label} <span className="text-sm font-normal">인증 {pages[type]?.certified ?? pages[type]?.total ?? 0}건</span></h3>
 <ul className="mt-2 divide-y divide-pul-border">{pages[type]?.items.map(r => <li key={r.id} id={`special-${r.id}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]"><div className="min-w-0 break-words">{author(r)}<SpecialPending status={r.companion_status} /><ConfirmedCompanions status={r.companion_status} /><p className="mt-1 text-sm text-pul-muted">{r.played_on}</p></div><p className="col-start-1 min-w-0 break-words text-sm sm:col-start-auto">{r.course_name} · {r.course_segment} {r.hole_number}홀</p><button type="button" className={clubButton + " col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"} onClick={() => setDetail(r)}>기록 보기</button></li>)}</ul>
 {pages[type] && !pages[type]!.items.length ? <p className="py-3 text-sm text-pul-muted">공개된 기록이 없습니다.</p> : null}
 {(pages[type]?.total ?? 0) > 10 ? <div className="mt-2 flex items-center gap-2"><button className={clubButton} disabled={busy || offsets[type] === 0} onClick={() => setOffsets(v => ({...v, [type]: Math.max(0, v[type] - 10)}))}>이전</button><span className="text-sm">{offsets[type] / 10 + 1}쪽</span><button className={clubButton} disabled={busy || offsets[type] + 10 >= (pages[type]?.total ?? 0)} onClick={() => setOffsets(v => ({...v, [type]: v[type] + 10}))}>다음</button></div> : null}</section>)}
 {detail ? <SpecialDialog title={specialTypes[detail.record_type_code] + " 기록"} onClose={() => setDetail(null)}>{author(detail)}<SpecialPending status={detail.companion_status} /><ConfirmedCompanions status={detail.companion_status} /><p className="mt-3">{detail.played_on} · {detail.course_name}</p><p className="mt-2">{detail.course_segment} {detail.hole_number}홀 · 파{detail.hole_par} · {detail.strokes}타</p>{detail.club_name ? <p className="mt-2 text-sm text-pul-muted">확인 동호회 · {detail.club_name}</p> : null}{detail.photos.length ? <div className="mt-5 flex flex-wrap gap-2">{detail.photos.map((id, n) => <button type="button" key={id} onClick={() => setLarge(id)} aria-label={`공개 사진 ${n + 1} 확대`}><Image unoptimized width={120} height={90} className="h-24 w-32 rounded-lg border border-pul-border object-cover" src={specialPhotoUrl(id)} alt={`공개 첨부 ${n + 1}`} /></button>)}</div> : null}
 {large ? <SpecialDialog title="공개 사진 크게 보기" onClose={() => setLarge(null)}><Image unoptimized width={800} height={800} src={specialPhotoUrl(large)} className="max-h-[70dvh] w-full object-contain" alt="공개 첨부 확대" /></SpecialDialog> : null}</SpecialDialog> : null}</div>;
}

type Draft = { club_id: string; target_user_id: string; played_on: string; time: string; course_name: string; course_region: string; course_segment: string; course_environment: string; hole_number: string; hole_par: string };
const empty: Draft = {club_id: "", target_user_id: "", played_on: "", time: "", course_name: "", course_region: "", course_segment: "", course_environment: "outdoor", hole_number: "1", hole_par: "3"};
function payload(d: Draft) { return {...d, started_at: `${d.played_on}T${d.time}:00+09:00`, hole_number: Number(d.hole_number), hole_par: Number(d.hole_par), strokes: 1, record_type_code: d.hole_par === "3" ? "hole_in_one" : d.hole_par === "4" ? "albatross" : "condor"}; }
const statusLabels: Record<string, string> = {draft: "작성 중", submitted: "승인 대기", approved: "승인 완료", rejected: "반려", revoked: "취소", cancelled: "작성 취소", corrected: "정정"};
export function SpecialWorkspacePanel({ workspace, clubKey }: { workspace: SpecialWorkspace; clubKey?: string }) {
 return <MessagingSessionBoundary viewerId={workspace.viewer_id}><Workspace key={workspace.viewer_id} initial={workspace} clubKey={clubKey} /></MessagingSessionBoundary>;
}
function Workspace({ initial, clubKey }: { initial: SpecialWorkspace; clubKey?: string }) {
 const initialClub = initial.clubs.find(club => club.key === clubKey)
   ?? initial.clubs.find(club => club.can_register) ?? initial.clubs[0];
 const [presidentEntry, setPresidentEntry] = useState(initialClub?.can_register ?? false);
 const [workspace, setWorkspace] = useState(initial), [draft, setDraft] = useState<Draft>({...empty, club_id: initialClub?.id ?? ""}), [selected, setSelected] = useState<SpecialApplication | null>(null), [correcting, setCorrecting] = useState<SpecialApplication | null>(null), [correction, setCorrection] = useState<Draft>(empty), [reason, setReason] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [companions, setCompanions] = useState({name: "", contact: ""}), [consent, setConsent] = useState(false), [courses, setCourses] = useState<PublicCourse[]>([]), [search, setSearch] = useState(""), [photoFiles, setPhotoFiles] = useState<Record<string, File>>({});
 const presidentClubs = workspace.clubs.filter(club => club.can_register);
 const registrationClubs = presidentEntry ? presidentClubs : workspace.clubs;
 const progress = usePhotoUploadProgress();
 const [witnesses, setWitnesses] = useState<string[]>([]);
 const selectedClub = workspace.clubs.find(club => club.id === selected?.club_id && club.can_register);
 const [publicMediaKind, setPublicMediaKind] = useState("photo");
 const request = useRef<{fp: string; id: string} | null>(null), lock = useRef(false), live = useRef(true), uploadRequests = useRef(new Map<string, string>());
 useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
 useEffect(() => { let valid = true; const timer = setTimeout(() => { if (!search.trim()) {setCourses([]); return;} void listPublicCourses(createClient(), {keyword: search}, 20).then(page => { if (valid) setCourses(page.items); }).catch(() => { if (valid) setCourses([]); }); }, 300); return () => { valid = false; clearTimeout(timer); }; }, [search]);
 async function checkIdentity() { const {data, error} = await createClient().auth.getUser(); if (error || data.user?.id !== initial.viewer_id) throw Error("로그인 계정이 변경되었습니다. 새로고침해 주세요."); }
 async function refresh() { await checkIdentity(); const next = await specialRpc<SpecialWorkspace>(createClient(), "get_hall_special_workspace"); if (next.viewer_id !== initial.viewer_id) throw Error("로그인 계정이 변경되었습니다."); if (live.current) { setWorkspace(next); setSelected(old => old ? next.items.find(i => i.application_record_id === old.application_record_id) ?? null : null); window.dispatchEvent(new Event("pul:special-records-changed")); } return next; }
 async function mutate(action: string, input: Record<string, unknown>) {
  const fp = JSON.stringify({action, input}), id = request.current?.fp === fp ? request.current.id : crypto.randomUUID(); request.current = {fp, id};
  await checkIdentity(); return specialRpc<{application_record_id: string}>(createClient(), "mutate_hall_special_record", {p_action: action, p_request_id: id, p_input: input});
 }
 async function run(task: () => Promise<unknown>) { if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice(""); try { await task(); if (live.current) setNotice("저장된 상태를 다시 불러왔습니다."); } catch (e) { if (live.current) setError((e as Error).message); } finally { lock.current = false; if (live.current) setBusy(false); } }
 const fields = (d: Draft, set: (d: Draft) => void, club = false) => <div className="grid min-w-0 gap-3 sm:grid-cols-2">{club && registrationClubs.length > 0 ? <>
 <label>{presidentEntry ? "등록 동호회" : "제출 동호회"}<select required className={clubInput} value={d.club_id}
   onChange={e => set({...d, club_id: e.target.value, target_user_id: ""})}>
   {registrationClubs.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}
 </select></label>
 {presidentEntry && <label>달성 회원<select required className={clubInput} value={d.target_user_id}
   onChange={e => set({...d, target_user_id: e.target.value})}>
   <option value="">회원 선택</option>
   {workspace.clubs.find(c => c.id === d.club_id)?.members?.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}
 </select></label>}
 </> : null}
 <label>달성일<input type="date" required className={clubInput} value={d.played_on} onChange={e => set({...d, played_on: e.target.value})} /></label><label>라운드 시작 시각<input type="time" required className={clubInput} value={d.time} onChange={e => set({...d, time: e.target.value})} /><span className="text-xs text-pul-muted">한국 시각 기준의 라운드 정보입니다. 시작 시각이 달라도 같은 날짜·구장·코스·홀의 중복 등록은 차단됩니다.</span></label>
 <label>구장명<input required maxLength={200} className={clubInput} value={d.course_name} onChange={e => set({...d, course_name: e.target.value})} /></label><label>구장 지역<input required maxLength={100} className={clubInput} value={d.course_region} onChange={e => set({...d, course_region: e.target.value})} /></label>
 <label>코스명<input required maxLength={100} className={clubInput} placeholder="예: A코스" value={d.course_segment} onChange={e => set({...d, course_segment: e.target.value})} /></label><label>환경<select className={clubInput} value={d.course_environment} onChange={e => set({...d, course_environment: e.target.value})}><option value="outdoor">야외</option><option value="screen">스크린</option></select></label>
 <label>홀 번호<input type="number" min={1} max={36} required className={clubInput} value={d.hole_number} onChange={e => set({...d, hole_number: e.target.value})} /></label><label>홀의 파<select className={clubInput} value={d.hole_par} onChange={e => set({...d, hole_par: e.target.value})}><option value="3">파3 · 1타 → 홀인원</option><option value="4">파4 · 1타 → 알바트로스</option><option value="5">파5 · 1타 → 콘도르</option></select></label><p className="text-sm text-pul-muted sm:col-span-2">실제 타수: 1타. 홀의 파는 실제 내용을 확인해 선택해 주세요.</p></div>;
 const create = (event: FormEvent) => {
  event.preventDefault();
  void run(async () => {
   const { target_user_id, ...input } = payload(draft);
   const created = await mutate("draft", presidentEntry ? {...input, target_user_id} : input);
   const next = await refresh();
   if (live.current && next.viewer_id === initial.viewer_id) {
    setSelected(next.items.find(item => item.application_record_id === created.application_record_id) ?? null);
    setWitnesses([]);
    setPhotoFiles({});
    setConsent(false);
    setPublicMediaKind("photo");
    setReason("");
    setCompanions({name: "", contact: ""});
    setDraft({...empty, club_id: draft.club_id});
   }
  });
 };
 async function upload(file: File, purpose: string) {
  if (!selected) return;
  await checkIdentity(); const attempt = progress.begin();
  try {
  const mediaKind = purpose === "private_score" || (purpose === "public_photo" && publicMediaKind === "document") ? "document" : "photo";
  const prepared = await preparePhoto(file, {purpose: mediaKind, onProcessing: () => attempt.processing()});
  const key = JSON.stringify([selected.application_record_id, purpose, mediaKind, prepared.name, prepared.size, prepared.lastModified]), req = uploadRequests.current.get(key) ?? crypto.randomUUID(); uploadRequests.current.set(key, req);
  const form = new FormData(); form.set("file", prepared); form.set("application_record_id", selected.application_record_id); form.set("version", String(selected.version)); form.set("purpose", purpose); form.set("media_kind", mediaKind); form.set("request_id", req); form.set("viewer_id", initial.viewer_id);
  attempt.uploading();
  const response = await fetch("/hall-of-fame/special/photos", {method: "POST", body: form}); const data = await response.json(); if (!response.ok) throw Error(data.error ?? "사진을 저장하지 못했습니다. 다시 시도해 주세요."); await checkIdentity(); await refresh();
  } finally { attempt.clear(); }
 }
 return <section className="my-6 min-w-0 rounded-xl border border-pul-border bg-white p-4 sm:p-6"><h2 className="text-xl font-bold text-pul-deep">내 등록·승인</h2><p className="mt-2 text-sm text-pul-muted">승인된 기록은 개인 누적 횟수에 자동 반영됩니다.</p>
 <details className="mt-4"><summary className="min-h-11 cursor-pointer font-semibold text-pul-point">특별 기록 등록</summary><form onSubmit={create} className="mt-3 space-y-4">
 {presidentClubs.length > 0 && <label className="block">작성 방식
  <select className={clubInput} value={presidentEntry ? "president" : "self"} onChange={e => {
   const asPresident = e.target.value === "president";
   const clubs = asPresident ? presidentClubs : workspace.clubs;
   setPresidentEntry(asPresident);
   setDraft(d => ({...d, club_id: clubs.find(c => c.id === d.club_id)?.id ?? clubs[0]?.id ?? "", target_user_id: ""}));
  }}>
   <option value="president">회장 등록</option>
   <option value="self">본인 기록 신청</option>
  </select>
 </label>}
 <label className="block">기존 구장 찾기<input className={clubInput} value={search} onChange={e => setSearch(e.target.value)} placeholder="구장명 검색 후 선택, 또는 아래에 직접 입력" /></label>{courses.length ? <ul className="max-h-48 overflow-y-auto border border-pul-border">{courses.map(c => <li key={c.courseKey}><button type="button" className="min-h-11 w-full break-words px-3 text-left" onClick={() => {setDraft(d => ({...d, course_name: c.name, course_region: c.region + " " + c.city, course_environment: c.courseType === "screen" ? "screen" : "outdoor"})); setSearch("");}}>{c.name} · {c.region}</button></li>)}</ul> : null}{fields(draft, setDraft, true)}<button disabled={busy} className={clubButton}>{presidentEntry ? "내용 저장 후 동반회원·사진 확인" : "내용 저장 후 사진·제출 확인"}</button></form></details>
 <button className={clubButton + " mt-4"} disabled={busy} onClick={() => void run(refresh)}>내 등록·승인 새로고침</button>
 <ul className="mt-3 divide-y divide-pul-border">{workspace.items.map(a => <li key={a.application_record_id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0 break-words"><p className="font-semibold">{a.name} · {specialTypes[a.record_type_code]}<SpecialPending status={a.companion_status} /></p><p className="mt-1 text-sm">{a.played_on} · {a.course_name} · {a.companion_status ? "회장 확인 · 공개 중" : statusLabels[a.validity === "revoked" ? "revoked" : a.status] ?? a.status}</p></div><button className={clubButton} disabled={busy} onClick={() => { setSelected(a); setPhotoFiles({}); setPublicMediaKind("photo"); setConsent(false); setWitnesses([]); setCompanions({name: a.companion_name ?? "", contact: a.companion_contact ?? ""}); setReason(""); }}>내용·처리</button></li>)}</ul>{!workspace.items.length ? <p className="mt-3 text-sm text-pul-muted">등록하거나 승인할 기록이 없습니다.</p> : null}
 {notice ? <p role="status" className="mt-3 text-pul-point">{notice}</p> : null}{error ? <p role="alert" className="mt-3 text-rose-700">{error}</p> : null}
 {selected ? <SpecialDialog title="등록 내용·처리" onClose={() => { if (!busy) setSelected(null); }}><p className="font-bold">{selected.name} · {specialTypes[selected.record_type_code]}<SpecialPending status={selected.companion_status} /></p><p className="mt-2">{selected.played_on} · {selected.course_name} · {selected.course_segment} {selected.hole_number}홀 · 파{selected.hole_par} 1타</p><p className="mt-2 text-sm">{selected.club_name ?? "무소속 · PUL 확인"} · {selected.companion_status ? "회장 확인 · 공개 중" : statusLabels[selected.validity === "revoked" ? "revoked" : selected.status]}</p>
 {selected.photos.length && ["draft", "submitted"].includes(selected.status) ? <div className="mt-4 flex flex-wrap gap-3">{selected.photos.map(p => <a key={p.id} href={specialPhotoUrl(p.id)} target="_blank" rel="noopener noreferrer" className="block max-w-32 text-sm"><Image unoptimized width={120} height={90} className="h-24 w-32 rounded-lg object-cover" src={specialPhotoUrl(p.id)} alt={p.purpose === "public_photo" ? (selected.required_companions != null ? "공개 사진 (등록 후 공개)" : "공개 사진 (승인 후 공개)") : "비공개 확인 사진"} />{p.purpose === "public_photo" ? "공개용" : p.purpose === "private_score" ? "비공개 스코어" : "비공개 동반자"}</a>)}</div> : null}
 {selected.companion_name ? <p className="mt-4 break-words text-sm">비공개 확인 자료 · {selected.companion_name} · {selected.companion_contact}</p> : null}
 {selected.can_submit ? <button className={clubButton + " mt-4"} disabled={busy} onClick={() => void run(async () => {await mutate("cancel_draft", {application_record_id: selected.application_record_id, version: selected.version}); await refresh();})}>작성 취소</button> : null}{selected.can_submit ? <div className="mt-4 space-y-4">
 {selected.required_companions != null && (
  <fieldset className="rounded-lg border border-pul-border p-3">
   <legend className="px-1 font-semibold">동반회원 선택</legend>
   <p className="mb-2 text-sm text-pul-muted">실제로 함께 경기한 회원을 선택해 주세요. 선택한 회원에게 동반 확인 쪽지가 전달됩니다.</p>
   <p className="mb-2 text-sm">{selected.required_companions
    ? `최소 ${selected.required_companions}명과 공개 사진이 필요합니다. 동반 확인을 받으면 인증됩니다.`
    : "선택 사항입니다. 회장이 등록하면 즉시 인증됩니다."} · 선택 {witnesses.length}명</p>
   <div className="max-h-48 overflow-auto">
    {selectedClub?.members?.filter(member => member.id !== selected.target_user_id).map(member => (
     <label key={member.id} className="flex min-h-10 items-center gap-2 text-sm">
      <input type="checkbox" checked={witnesses.includes(member.id)} disabled={busy}
       onChange={e => setWitnesses(ids => e.target.checked ? [...ids, member.id] : ids.filter(id => id !== member.id))} />
      {member.name}
     </label>
    ))}
   </div>
  </fieldset>
 )}
 <label className="block">공개 첨부 사진 용도<select className={clubInput} disabled={busy} value={publicMediaKind} onChange={e => setPublicMediaKind(e.target.value)}><option value="photo">일반·기념 사진</option><option value="document">스코어카드·글자 자료 사진</option></select></label>{(["public_photo", ...(!selected.club_id ? ["private_score", "private_companion"] : [])]).map(purpose => <div key={purpose}><label className="block">{purpose === "public_photo" ? (selected.required_companions ? "공개 사진 첨부(필수)" : "공개 사진 첨부(선택)") : purpose === "private_score" ? "스코어 사진(비공개·필수)" : "동반자와 함께 찍은 사진(비공개·필수)"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="mt-2 block w-full max-w-full text-sm" onChange={e => {const file = e.target.files?.[0]; if (file) setPhotoFiles(v => ({...v, [purpose]: file}));}} /></label><button type="button" className={clubButton + " mt-2"} disabled={busy || !photoFiles[purpose]} onClick={() => void run(() => upload(photoFiles[purpose], purpose))}>사진 저장·다시 시도</button></div>)}{!selected.club_id ? <><label className="block">동반자 이름<input maxLength={100} className={clubInput} value={companions.name} onChange={e => setCompanions(v => ({...v, name: e.target.value}))} /></label><label className="block">동반자 연락처<input maxLength={100} className={clubInput} value={companions.contact} onChange={e => setCompanions(v => ({...v, contact: e.target.value}))} /></label></> : null}{selected.required_companions != null ? <button
  className={clubButton}
  disabled={busy || witnesses.length < selected.required_companions ||
    (selected.required_companions > 0 && !selected.photos.some(photo => photo.purpose === "public_photo"))}
  onClick={() => void run(async () => {
   await mutate("submit", {application_record_id: selected.application_record_id, version: selected.version, companion_ids: witnesses});
   await refresh();
  })}>회장 확인 · 기록 등록 및 공개</button> : <>
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />이름·달성일·구장·홀과 선택한 공개 사진의 기록 공개에 동의합니다.</label><p className="text-sm text-pul-muted">승인된 기록은 개인 누적 횟수에 자동 반영됩니다.</p><button className={clubButton} disabled={busy || !consent} onClick={() => void run(async () => { await mutate("submit", {application_record_id: selected.application_record_id, version: selected.version, publication_consent: true, companion_name: selected.club_id ? null : companions.name, companion_contact: selected.club_id ? null : companions.contact}); await refresh(); })}>{selected.can_review ? "본인 기록 등록·즉시 공개" : "승인 요청"}</button></>}</div> : null}
 {selected.can_review && selected.status === "submitted" ? <div className="mt-5 flex flex-wrap gap-2"><button className={clubButton} disabled={busy} onClick={() => void run(async () => { await mutate("approve", {application_record_id: selected.application_record_id, version: selected.version}); await refresh(); })}>승인·즉시 공개</button><label className="w-full">반려 사유<input maxLength={500} className={clubInput} value={reason} onChange={e => setReason(e.target.value)} /></label><button className={clubButton} disabled={busy || reason.trim().length < 2} onClick={() => void run(async () => {await mutate("reject", {application_record_id: selected.application_record_id, version: selected.version, reason: reason.trim()}); await refresh();})}>반려</button></div> : null}
 {(selected.can_correct || selected.can_revoke) && selected.record_id && selected.validity === "active" ? <div className="mt-5 space-y-3"><label className="block">정정·취소 사유<input className={clubInput} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><div className="flex flex-wrap gap-2">{selected.can_correct && <button className={clubButton} disabled={busy || reason.trim().length < 2} onClick={() => { setCorrecting(selected); const start = new Date(selected.started_at); const time = new Intl.DateTimeFormat("sv-SE", {timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit"}).format(start); setCorrection({...empty, ...selected, club_id: selected.club_id ?? "", target_user_id: "", time, hole_number: String(selected.hole_number), hole_par: String(selected.hole_par)}); }}>기록 정정</button>}<button className={clubButton} disabled={busy || !selected.can_revoke || reason.trim().length < 2} onClick={() => void run(async () => {await mutate("revoke", {application_record_id: selected.application_record_id, version: selected.version, record_id: selected.record_id, record_version: selected.record_version, reason: reason.trim()}); await refresh();})}>기록 취소·공개 제외</button></div></div> : null}
 <PhotoUploadStatus message={progress.message}/>{busy ? <p className="mt-4" role="status">처리 중입니다. 작성 내용과 사진 선택을 유지하고 있습니다.</p> : null}{error ? <p role="alert" className="mt-4 text-rose-700">{error}</p> : null}{notice ? <p role="status" className="mt-4 text-pul-point">{notice}</p> : null}
 {correcting ? <SpecialDialog title="기록 정정" onClose={() => {if (!busy) setCorrecting(null);}}><form className="space-y-4" onSubmit={e => {e.preventDefault(); void run(async () => {await mutate("correct", {...payload(correction), application_record_id: correcting.application_record_id, version: correcting.version, record_id: correcting.record_id, record_version: correcting.record_version, reason: reason.trim()}); await refresh(); setCorrecting(null);});}}>{fields(correction, setCorrection)}<p className="text-sm">사유 · {reason}</p><button className={clubButton} disabled={busy}>정정 저장</button>{error ? <p role="alert" className="text-rose-700">{error}</p> : null}</form></SpecialDialog> : null}</SpecialDialog> : null}</section>;
}

