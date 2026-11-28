"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { publishLostItem } from "@/app/market/lost-items/actions";
import { PhotoUploadStatus, usePhotoUploadProgress } from "@/components/ui/PhotoUploadStatus";
import { categoryLabels } from "@/data/marketData";
import { validatePhotoInput } from "@/lib/images/photoPolicy";
import { photoUploadForm } from "@/lib/images/preparePhoto";
import { lostItemButton, lostItemInput, lostItemRegions, lostItemsPath, type LostItemCourse } from "@/lib/market/lostItems";

const formats = ["image/jpeg", "image/png", "image/webp"] as const;
type Source = { courseKey: string; courseName: string; region: string; postKey: string; version: number; legacy: boolean; resolved: boolean; images: string[] };
type SelectedPhoto = { key: string; file: File; preview: string; uploaded?: { scope: string; id: string } };

export function LostItemEditor({ today, courses, source }: { today: string; courses: LostItemCourse[]; source?: Source }) {
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
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const previews = urls.current;
    return () => previews.forEach(URL.revokeObjectURL);
  }, []);
  const selectedCourse = courses.find(course => course.course_key === courseKey);
  const region = source?.region || selectedCourse?.region;
  const placeName = source?.courseName || selectedCourse?.name;
  const returnTo = source ? `/courses/${source.courseKey}/stories/${source.postKey}` : lostItemsPath;

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
    const form = new FormData(event.currentTarget);
    const row = Object.fromEntries(["category", "item", "brand", "model", "color", "region", "place", "lost_on", "features"]
      .map(key => [key, String(form.get(key) ?? "").trim()]));
    const scope = source ? "" : courseKey;
    const requestCourse = source?.courseKey || courseKey || null;
    const toUpload = photos.filter(photo => photo.uploaded?.scope !== scope);
    const fields = { ...row, confirmed: form.has("confirmed"), legacy_lost: form.has("legacy_lost") };
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
        const payload = { ...fields, photos: [...selected, ...photos.map(photo => ids.get(photo.key)!)] };
        const key = JSON.stringify([requestCourse, source?.postKey, source?.version, payload]);
        if (pendingRequest.current?.key !== key) pendingRequest.current = { key, id: crypto.randomUUID() };
        const result = await publishLostItem({
          courseKey: requestCourse, postKey: source?.postKey ?? null, version: source?.version ?? null,
          requestId: pendingRequest.current.id, fields: payload,
        });
        if (!result.ok) { setError(result.message); return; }
        router.replace(lostItemsPath + "/" + result.id);
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
      <h1 className="text-2xl font-bold text-pul-deep">{source ? "장터에도 표시" : "분실 신고하기"}</h1>
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        {source?.legacy && <label className="flex items-start gap-2 rounded-lg bg-pul-light p-3 text-sm">
          <input required type="checkbox" name="legacy_lost" className="mt-1" />이 글은 제가 잃어버린 물건의 분실 신고입니다.
        </label>}
        {!source && <div className="space-y-2">
          <label className="block text-sm font-bold">등록 구장 찾기<input type="search" className={lostItemInput} value={courseQuery}
            onChange={event => setCourseQuery(event.target.value)} placeholder="구장 이름 또는 시·군" /></label>
          <label className="block text-sm font-bold">구장 선택<select className={lostItemInput} value={courseKey} onChange={event => setCourseKey(event.target.value)}>
            <option value="">장소 직접 입력</option>
            {courses.filter(course => course.course_key === courseKey || (course.name + " " + course.city).toLowerCase().includes(courseQuery.trim().toLowerCase()))
              .map(course => <option key={course.course_key} value={course.course_key}>{course.name} · {course.region} {course.city}</option>)}
          </select></label>
          {selectedCourse && <p className="text-sm text-pul-muted">같은 신고가 이 구장 이야기방의 분실·습득에도 표시됩니다.</p>}
        </div>}
        {placeName && <p className="rounded-lg bg-pul-light p-3 text-sm"><strong>공개 지역·구장</strong> {region} · {placeName}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {!region && <label className="text-sm font-bold">지역<select name="region" required className={lostItemInput}><option value="">지역 선택</option>
            {lostItemRegions.map(value => <option key={value}>{value}</option>)}
          </select></label>}
          <label className="text-sm font-bold">{placeName ? "구장 내 장소 (선택)" : "분실 장소"}<input name="place" minLength={placeName ? undefined : 2}
            required={!placeName} maxLength={160} className={lostItemInput} /></label>
          <label className="min-w-0 text-sm font-bold">분실일<input required type="date" name="lost_on" max={today} min="0001-01-01" className={lostItemInput} /></label>
          <label className="text-sm font-bold">품목<select name="category" required className={lostItemInput}><option value="">품목 선택</option>
            {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label className="text-sm font-bold">물건 이름<input name="item" required minLength={2} maxLength={100} className={lostItemInput} /></label>
          {["brand", "model", "color"].map((key, index) => <label key={key} className="text-sm font-bold">
            {["브랜드", "모델", "색상"][index]} (선택)<input name={key} maxLength={80} className={lostItemInput} />
          </label>)}
        </div>
        <label className="block text-sm font-bold">공개할 물건 특징<textarea required name="features" minLength={10} maxLength={600}
          className={lostItemInput + " min-h-28"} aria-describedby="lost-public-info" /></label>
        <p id="lost-public-info" className="text-sm text-pul-muted">연락처, 이름표, 전체 일련번호와 쪽지 내용은 설명과 사진에서 빼 주세요. 소유 확인 정보는 쪽지로 주고받을 수 있습니다.</p>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-bold">공개 사진 · {photos.length + selected.length}/5</p>
            <button type="button" className={lostItemButton} onClick={() => picker.current?.click()}>＋ 사진 추가</button>
            <input ref={picker} type="file" hidden multiple accept={formats.join(",")} aria-label="장터 공개 사진 파일"
              onChange={event => { pick(event.target.files); event.target.value = ""; }} />
          </div>
          {!!source?.images.length && <p className="text-sm text-pul-muted">이야기방 사진 중 장터에도 공개할 사진을 선택하세요.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {source?.images.map((id, index) => <div key={id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- source access is checked on every request */}
              <img src={"/courses/story-images/" + id} alt={"이야기방 사진 " + (index + 1)} className="aspect-square w-full rounded-lg object-cover" />
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
        </div>
        <p className="text-sm"><strong>공개 상태</strong> {source?.resolved ? "찾음 완료" : "찾는 중"}</p>
        <label className="flex items-start gap-2 rounded-lg bg-pul-light p-3 text-sm">
          <input required type="checkbox" name="confirmed" className="mt-1" />위 설명과 선택 사진이 공개되는 것을 확인했습니다.
        </label>
        <button type="submit" className={lostItemButton + " !bg-pul-point !text-white"}>{pending ? "등록 중…" : "장터에 공개 등록"}</button>
      </fieldset>
      <PhotoUploadStatus message={progress.message} />
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    </form>
  </>;
}
