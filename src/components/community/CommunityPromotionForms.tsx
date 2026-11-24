"use client";

import { useBodyScrollLock } from "@/components/ui/InfoModal";
import { fields, type Field, type Filters, type Post, type Scope, type Source, type SourceKind } from "@/lib/community/communityPromotionsPreview";
import { courseAddressRegion, courseProvinces } from "@/lib/courses/courseRegions";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

const control = "mt-1.5 block min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white px-3 text-base text-foreground focus:border-pul-point focus:outline-none focus:ring-2 focus:ring-pul-point/20 disabled:bg-pul-page";
export const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pul-deep px-4 text-sm font-bold text-white hover:bg-pul-point focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point disabled:opacity-50";
export const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-4 text-sm font-bold text-pul-deep hover:border-pul-point/50 hover:bg-pul-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point";

export function PreviewDialog({ title, description, children, onClose }: { title: string; description?: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useBodyScrollLock(true);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={ref} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-pul-border bg-white p-0 text-foreground shadow-2xl backdrop:bg-slate-950/45">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-pul-border bg-white px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 id={id} className="break-words text-xl font-extrabold text-pul-deep">{title}</h2>
          {description ? <p className="mt-1 text-sm text-pul-muted">{description}</p> : null}
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="grid size-11 shrink-0 place-items-center rounded-full bg-pul-page text-pul-deep hover:bg-pul-light"><X size={20} /></button>
      </header>
      <div className="p-4 sm:p-6">{children}</div>
    </dialog>
  );
}

export function SelectField({ label, children, ...props }: React.ComponentProps<"select"> & { label: string }) {
  return <label className="block min-w-0 text-sm font-bold text-pul-deep">{label}<select {...props} className={control}>{children}</select></label>;
}

export function TextField({ label, ...props }: React.ComponentProps<"input"> & { label: string }) {
  return <label className="block min-w-0 text-sm font-bold text-pul-deep">{label}<input {...props} className={control} /></label>;
}

const sourceTypes: Record<SourceKind, string> = {
  event: "대회·행사", club: "동호회", education: "자격증 교육과정", lesson: "레슨·교육", course: "구장", sale: "장터 판매 글",
};

function reference(kind: SourceKind, key: string): Source | undefined {
  return key ? { kind, key, title: key, visibility: "public" } : undefined;
}

export function PostForm({ post, filters, onSave, courseExamples, busy = false, saveError }: {
  post?: Post; filters: Filters; onSave: (post: Post) => void; courseExamples?: Source[]; busy?: boolean; saveError?: string;
}) {
  const initialField = post?.field || filters.field || "local";
  const initialTrades: string[] = fields[initialField].trades;
  const [field, setField] = useState<Field>(initialField);
  const [trade, setTrade] = useState(post?.trade ?? (initialTrades.includes(filters.trade) ? filters.trade : initialTrades[0] ?? ""));
  const [scope, setScope] = useState<Scope>(post?.scope ?? (initialField === "service" ? "service" : "visit"));
  const [error, setError] = useState("");
  const [sourceKind, setSourceKind] = useState<SourceKind | "">(post?.source?.kind ?? "");
  const hasRegion = scope === "visit" || scope === "service";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const address = value("address");
    const identifiedArea = scope === "visit" ? courseAddressRegion(address) : null;
    const province = identifiedArea?.province || value("province");
    const districts = identifiedArea?.district ? [identifiedArea.district] : [...new Set(value("districts").split(",").map((part) => part.trim()).filter(Boolean))];
    if (!value("title") || !value("body") || (hasRegion && (!province || !districts.length))) {
      setError("제목, 내용과 선택한 공개 범위의 지역을 입력해 주세요.");
      return;
    }
    if (scope === "visit" && districts.length !== 1) {
      setError("방문 위치는 시·군·구 한 곳을 입력해 주세요.");
      return;
    }
    onSave({
      ...post,
      id: post?.id ?? crypto.randomUUID(),
      createdAt: post?.createdAt ?? Date.now(),
      owner: true, visibility: "public",
      title: value("title"), body: value("body"), field, trade, scope,
      province: hasRegion ? province : "", districts: hasRegion ? districts : [],
      address, contact: value("contact"), deadline: value("deadline"),
      source: courseExamples ? post?.source : sourceKind ? reference(sourceKind, value("sourceKey")) : undefined,
      nearbyCourse: courseExamples ? courseExamples.find((course) => course.key === value("course")) : reference("course", value("course")),
      relatedSale: courseExamples ? post?.relatedSale : reference("sale", value("sale")),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="분야" value={field} onChange={(event) => {
          const next = event.target.value as Field;
          setField(next);
          setTrade(fields[next].trades[0] ?? "");
          if (next === "service") setScope("service");
          else if (scope === "service") setScope("visit");
        }}>
          {Object.entries(fields).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
        </SelectField>
        <SelectField label="세부 업종" value={trade} onChange={(event) => setTrade(event.target.value)} disabled={!fields[field].trades.length}>
          {fields[field].trades.length ? fields[field].trades.map((item) => <option key={item}>{item}</option>) : <option value="">해당 없음</option>}
        </SelectField>
      </div>
      <TextField label="제목" name="title" defaultValue={post?.title} required maxLength={100} />
      <label className="block text-sm font-bold text-pul-deep">내용<textarea name="body" className={`${control} min-h-28 py-2.5`} defaultValue={post?.body} required maxLength={3000} /></label>
      <SelectField label="이용 범위" value={scope} onChange={(event) => setScope(event.target.value as Scope)}>
        <option value="visit">방문 위치</option><option value="service">이용 가능 지역</option><option value="delivery">전국 배송</option><option value="online">온라인 강좌</option>
      </SelectField>
      {hasRegion ? <div className="grid grid-cols-2 gap-3">
        <SelectField label="시·도" name="province" defaultValue={post?.province || filters.province}>
          <option value="">시·도 선택</option>{courseProvinces.map((option) => <option key={option}>{option}</option>)}
        </SelectField>
        <TextField label="시·군·구" name="districts" defaultValue={post?.districts.join(", ") || filters.district} placeholder={scope === "service" ? "괴산군, 청주시" : "예: 괴산군"} maxLength={100} />
      </div> : null}
      <TextField label={scope === "service" ? "사무실 주소 (선택)" : "주소 (선택)"} name="address" defaultValue={post?.address} maxLength={160} />
      <TextField label="문의 방법 (선택)" name="contact" defaultValue={post?.contact} maxLength={160} />
      {courseExamples ? <SelectField label="가까운 구장 (선택 · 예시)" name="course" defaultValue={post?.nearbyCourse?.key ?? ""}>
        <option value="">선택 안 함</option>{courseExamples.map((course) => <option key={course.key} value={course.key}>{course.title}</option>)}
      </SelectField> : <fieldset className="space-y-3 rounded-lg border border-pul-border p-3">
        <legend className="px-1 text-sm font-bold text-pul-deep">공개 원본 연결 (선택)</legend>
        <p className="text-xs leading-relaxed text-pul-muted">공개 상세 주소의 마지막 키를 입력하세요. 장터는 주소의 listing 값입니다.</p>
        <SelectField label="원본 종류" value={sourceKind} onChange={(event) => setSourceKind(event.target.value as SourceKind | "")}>
          <option value="">선택 안 함</option>{Object.entries(sourceTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </SelectField>
        {sourceKind ? <TextField key={sourceKind} label="공개 원본 키" name="sourceKey" maxLength={64} required defaultValue={post?.source?.kind === sourceKind ? post.source.key : ""} /> : null}
        <TextField label="가까운 구장 공개 키" name="course" maxLength={64} defaultValue={post?.nearbyCourse?.key} />
        <TextField label="관련 판매 글 공개 키" name="sale" maxLength={36} defaultValue={post?.relatedSale?.key} />
      </fieldset>}
      <TextField label="모집 마감일 (선택)" type="date" name="deadline" defaultValue={post?.deadline} />
      {error || saveError ? <p role="alert" className="text-sm text-red-800">{error || saveError}</p> : null}
      <button type="submit" disabled={busy} className={primary}>{busy ? "저장 중…" : post ? "수정 저장" : "무료로 게시"}</button>
    </form>
  );
}
