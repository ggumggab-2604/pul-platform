"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { publishLostItem } from "@/app/market/lost-items/actions";
import { CourseLostFields, CourseLostSummary, LostPublicationConfirmation, LostPublicationOptions } from "./CourseLostItemFields";
import { PhotoUploadStatus, usePhotoUploadProgress } from "@/components/ui/PhotoUploadStatus";
import { validatePhotoInput } from "@/lib/images/photoPolicy";
import { photoUploadForm } from "@/lib/images/preparePhoto";
import { lostItemButton, lostItemInput, lostItemRegions, lostItemsPath, type CourseLostDetails, type CourseLostSettings, type LostItemCourse, type LostPublication, type LostPublicationDelay } from "@/lib/market/lostItems";

const formats = ["image/jpeg", "image/png", "image/webp"] as const;
type Source = {
  courseKey: string; courseName: string; region: string; postKey: string; version: number; legacy: boolean; resolved: boolean;
  images: string[]; details?: CourseLostDetails | null; settings?: CourseLostSettings | null;
  createdAt: string;
};
type SelectedPhoto = { key: string; file: File; preview: string; uploaded?: { scope: string; id: string } };

export function LostItemEditor({ today, now, courses, source }: { today: string; now: number; courses: LostItemCourse[]; source?: Source }) {
  const router = useRouter();
  const progress = usePhotoUploadProgress();
  const picker = useRef<HTMLInputElement>(null);
  const pendingRequest = useRef<{ key: string; id: string } | null>(null);
  const uploadRequests = useRef<Record<string, string>>({});
  const urls = useRef<string[]>([]);
  const busy = useRef(false);
  const [pending, startTransition] = useTransition();
  const [courseKey, setCourseKey] = useState("");
  const [courseQuery, setCourseQuery] = useState("");
  const [manualPlace, setManualPlace] = useState(false);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [selected, setSelected] = useState<string[]>(source?.settings?.photos ?? []);
  const [publication, setPublication] = useState<LostPublication>(source?.resolved ? "hidden" : source?.settings?.publication ?? "immediate");
  const [delay, setDelay] = useState<LostPublicationDelay>(source?.settings?.publication_delay_hours ?? 48);
  const [publicationNow, setPublicationNow] = useState(now);
  const [error, setError] = useState("");
  useEffect(() => {
    const previews = urls.current;
    return () => previews.forEach(URL.revokeObjectURL);
  }, []);
  const selectedCourse = courses.find(course => course.course_key === courseKey);
  const terms = courseQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const courseResults = !source && !manualPlace && !selectedCourse
    ? courses.filter(course => {
      const text = `${course.name} ${course.city} ${course.region}`.toLowerCase();
      return terms.every(term => text.includes(term));
    }) : [];
  const region = source?.region || selectedCourse?.region;
  const placeName = source?.courseName || selectedCourse?.name;
  const returnTo = source ? `/courses/${source.courseKey}/stories/${source.postKey}` : lostItemsPath;
  const showPublicFields = !source || publication !== "hidden";
  const sourceImages = source ? [...new Set([...source.images, ...(source.settings?.photos ?? [])])] : [];

  function setLocationMode(manual: boolean) {
    setManualPlace(manual);
    if (manual) setCourseKey("");
    setError("");
  }

  function pick(files: FileList | null) {
    const incoming = Array.from(files ?? []);
    try {
      if (photos.length + selected.length + incoming.length > 5) throw new Error("공개 사진은 최대 5장입니다.");
      incoming.forEach(file => validatePhotoInput(file, formats));
      const next = incoming.map(file => {
        const preview = URL.createObjectURL(file);
        urls.current.push(preview);
        return { key: crypto.randomUUID(), file, preview };
      });
      setPhotos(current => [...current, ...next]);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사진을 확인해 주세요.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (!source && !manualPlace && !selectedCourse) {
      setError("검색 결과에서 등록 구장을 선택하거나 장소 직접 입력을 선택해 주세요.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const row = Object.fromEntries(["category", "item", "brand", "model", "color", "region", "place", "lost_on", "features"]
      .map(key => [key, String(form.get(key) ?? "").trim()]));
    const scope = source ? "" : courseKey;
    const requestCourse = source?.courseKey || courseKey || null;
    const toUpload = showPublicFields ? photos.filter(photo => photo.uploaded?.scope !== scope) : [];
    const fields = {
      ...row, confirmed: form.has("confirmed"), legacy_lost: form.has("legacy_lost"),
      ...(source ? { publication, ...(publication === "scheduled" ? { publication_delay_hours: delay } : {}) } : {}),
    };
    busy.current = true;
    setError("");
    startTransition(async () => {
      const phase = progress.begin();
      try {
        const ids = new Map(photos.filter(photo => photo.uploaded?.scope === scope).map(photo => [photo.key, photo.uploaded!.id]));
        for (const [index, photo] of toUpload.entries()) {
          const requestId = scope + "/" + photo.key;
          const key = uploadRequests.current[requestId] ??= crypto.randomUUID();
          const body = await photoUploadForm(photo.file, { courseKey: scope, requestId: key, marketLost: "1" }, {
            onProcessing: () => phase.processing(index + 1, toUpload.length),
          });
          phase.uploading();
          const res = await fetch("/courses/story-images", { method: "POST", body });
          const result = await res.json();
          if (!res.ok || typeof result.id !== "string") throw new Error(result.error || "사진 저장을 확인하지 못했습니다.");
          ids.set(photo.key, result.id);
          setPhotos(current => current.map(value => value.key === photo.key ? { ...value, uploaded: { scope, id: result.id } } : value));
        }
        const payload = { ...fields, photos: showPublicFields ? [...selected, ...photos.map(photo => ids.get(photo.key)!)] : [] };
        const key = JSON.stringify([requestCourse, source?.postKey, source?.version, payload]);
        if (pendingRequest.current?.key !== key) pendingRequest.current = { key, id: crypto.randomUUID() };
        const result = await publishLostItem({
          courseKey: requestCourse, postKey: source?.postKey ?? null, version: source?.version ?? null,
          requestId: pendingRequest.current.id, fields: payload,
        });
        if (!result.ok) { setError(result.message); return; }
        router.replace(source ? returnTo : lostItemsPath + "/" + result.id);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "등록 결과를 확인하지 못했습니다. 입력과 사진을 유지했습니다.");
      } finally {
        phase.clear();
        busy.current = false;
      }
    });
  }
  return <>
    <Link href={returnTo} prefetch={false} className={lostItemButton}>← {source ? "구장 글로 돌아가기" : "분실물 확인"}</Link>
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-pul-border bg-white p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-pul-deep">{source ? (source.settings ? "장터 공개 설정" : "장터에도 표시") : "분실 신고하기"}</h1>
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        {source?.legacy && <label className="flex items-start gap-2 rounded-lg bg-pul-light p-3 text-sm">
          <input required type="checkbox" name="legacy_lost" className="mt-1" />이 글은 제가 잃어버린 물건의 분실 신고입니다.
        </label>}
        {!source && <section className="space-y-3 rounded-lg border border-pul-border p-3" aria-label="분실 장소 선택">
          <div className="flex flex-wrap gap-2" role="group" aria-label="장소 입력 방식">
            <button type="button" className={lostItemButton + (!manualPlace ? " !border-pul-point !bg-pul-light" : "")}
              aria-pressed={!manualPlace} onClick={() => setLocationMode(false)}>등록 구장 선택</button>
            <button type="button" className={lostItemButton + (manualPlace ? " !border-pul-point !bg-pul-light" : "")}
              aria-pressed={manualPlace} onClick={() => setLocationMode(true)}>장소 직접 입력</button>
          </div>
          {manualPlace ? <p className="text-sm text-pul-muted">직접 입력한 장소의 신고는 장터에만 표시됩니다.</p>
            : selectedCourse ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-pul-light p-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold">{selectedCourse.name}</p>
                <p className="text-sm text-pul-muted">{[selectedCourse.region, selectedCourse.city].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" className={lostItemButton} onClick={() => setCourseKey("")}>변경</button>
              <p className="w-full text-sm text-pul-muted">{selectedCourse.course_type === "screen"
                ? "장터와 시설의 장터 연동 분실 신고에 표시됩니다."
                : "장터와 구장 이야기방에 함께 표시됩니다."}</p>
            </div> : <>
              <label className="block text-sm font-bold">등록 구장 찾기<input type="search" className={lostItemInput} value={courseQuery}
                onChange={event => setCourseQuery(event.target.value)} placeholder="구장 이름, 시·군, 지역" /></label>
              {courseResults.length ? <ul className="max-h-72 divide-y divide-pul-border overflow-y-auto rounded-lg border border-pul-border" aria-label="등록 구장 검색 결과">
                {courseResults.slice(0, 12).map(course => <li className="flex items-center justify-between gap-2 px-3 py-2" key={course.course_key}>
                  <div className="min-w-0 text-sm">
                    <p className="break-words font-semibold">{course.name}</p>
                    <p className="text-xs text-pul-muted">{[course.region, course.city, course.course_type === "screen" ? "스크린" : "야외"].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button type="button" className={lostItemButton + " shrink-0"} aria-label={`${course.name} 선택`}
                    onClick={() => { setCourseKey(course.course_key); setError(""); }}>선택</button>
                </li>)}
              </ul> : <p role="status" className="text-sm text-pul-muted">일치하는 등록 구장이 없습니다. 장소 직접 입력으로 신고할 수 있습니다.</p>}
              {courseResults.length > 12 && <p className="text-xs text-pul-muted">등록 구장 {courseResults.length}곳 중 12곳을 표시합니다. 검색어를 더 입력해 주세요.</p>}
            </>}
        </section>}
        {source && placeName && !source.details && <p className="rounded-lg bg-pul-light p-3 text-sm"><strong>공개 지역·구장</strong> {region} · {placeName}</p>}
        {source ? (source.details
          ? <CourseLostSummary details={source.details} venue={source.courseName} region={source.region} />
          : <CourseLostFields today={today} />) : <>
          {manualPlace && <label className="block text-sm font-bold">지역<select name="region" required className={lostItemInput}><option value="">지역 선택</option>
            {lostItemRegions.map(value => <option key={value}>{value}</option>)}
          </select></label>}
          <CourseLostFields today={today} manualPlace={manualPlace} />
          <details className="rounded-lg border border-pul-border px-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold">추가 정보 (선택)</summary>
            <div className="grid gap-3 pb-3 sm:grid-cols-3">
              {[["brand", "브랜드"], ["model", "모델"], ["color", "색상"]].map(([key, label]) => <label key={key} className="text-sm font-bold">
                {label}<input name={key} maxLength={80} className={lostItemInput} />
              </label>)}
            </div>
          </details>
        </>}
        {source && (source.resolved
          ? <p className="text-sm text-pul-muted">찾음 완료된 신고는 장터에서만 내릴 수 있습니다.</p>
          : <LostPublicationOptions value={publication} delay={delay} registeredAt={source.createdAt} now={publicationNow}
            onChange={choice => { setPublication(choice); setPublicationNow(Date.now()); }}
            onDelayChange={hours => { setDelay(hours); setPublicationNow(Date.now()); }} />)}
        {showPublicFields && <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-bold">공개 사진 (선택) · {photos.length + selected.length}/5</p>
            <button type="button" className={lostItemButton} onClick={() => picker.current?.click()}>＋ 사진 추가</button>
            <input ref={picker} type="file" hidden multiple accept={formats.join(",")} aria-label="장터 공개 사진 파일"
              onChange={event => { pick(event.target.files); event.target.value = ""; }} />
          </div>
          {sourceImages.length > 0 && <p className="text-sm text-pul-muted">장터에 공개할 사진을 선택하세요.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {sourceImages.map((id, index) => <div key={id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- source access is checked on every request */}
              <img src={source?.images.includes(id) ? "/courses/story-images/" + id
                : lostItemsPath + "/" + source?.settings?.report_id + "/photos/" + id + "?preview=1"}
                alt={"공개 후보 사진 " + (index + 1)} className="aspect-square w-full rounded-lg object-cover" />
              <button type="button" className={lostItemButton + " mt-1 w-full px-1"} aria-pressed={selected.includes(id)}
                aria-label={"이야기방 사진 " + (index + 1) + (selected.includes(id) ? " 공개 제외" : " 공개 선택")}
                disabled={!selected.includes(id) && selected.length + photos.length >= 5}
                onClick={() => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])}>
                {selected.includes(id) ? "공개 제외" : "공개 선택"}
              </button>
            </div>)}
            {photos.map((photo, index) => <div key={photo.key}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local file preview */}
              <img src={photo.preview} alt={"추가 사진 " + (index + 1)} className="aspect-square w-full rounded-lg object-cover" />
              <button type="button" className={lostItemButton + " mt-1 w-full px-1"} aria-label={"추가 사진 " + (index + 1) + " 제외"}
                onClick={() => setPhotos(current => current.filter(value => value.key !== photo.key))}>제외</button>
            </div>)}
          </div>
        </div>}
        <p className="text-sm"><strong>공개 상태</strong> {source?.resolved ? "찾음 완료" : "찾는 중"}</p>
        {showPublicFields && <LostPublicationConfirmation />}
        <button type="submit" className={lostItemButton + " !bg-pul-point !text-white"}>
          {pending ? "저장 중…" : source ? "장터 공개 설정 저장" : "장터에 공개 등록"}
        </button>
      </fieldset>
      <PhotoUploadStatus message={progress.message} />
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    </form>
  </>;
}
