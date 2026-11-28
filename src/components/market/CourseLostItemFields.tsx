import { categoryLabels } from "@/data/marketData";
import { lostItemInput, lostPublicationDate, lostPublicationDelays, type CourseLostDetails, type LostPublication, type LostPublicationDelay } from "@/lib/market/lostItems";

export function CourseLostFields({ today, manualPlace = false }: { today: string; manualPlace?: boolean }) {
  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">분실일<input required type="date" name="lost_on" max={today} min="0001-01-01" className={lostItemInput} /></label>
      <label className="text-sm font-bold">품목<select name="category" required className={lostItemInput}>
        <option value="">품목 선택</option>
        {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="text-sm font-bold">물건 이름<input name="item" required minLength={2} maxLength={100} className={lostItemInput} /></label>
      <label className="text-sm font-bold">{manualPlace ? "분실 장소" : "구장 내 세부 장소 (선택)"}
        <input name="place" required={manualPlace} minLength={manualPlace ? 2 : undefined} maxLength={160}
          className={lostItemInput} placeholder={manualPlace ? undefined : "예: 3번 홀 근처"} />
      </label>
    </div>
    <label className="block text-sm font-bold">분실 물건 설명<textarea required name="features" minLength={10} maxLength={600}
      className={lostItemInput + " min-h-24"} /></label>
    <p className="text-sm text-pul-muted">연락처, 이름표, 전체 일련번호와 쪽지 내용은 설명과 사진에서 빼 주세요.</p>
  </>;
}

export function CourseLostSummary({ details, venue, region, showDescription = true }: {
  details: CourseLostDetails; venue?: string; region?: string; showDescription?: boolean;
}) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg bg-pul-light p-3 text-sm">
    {venue && <><dt className="font-bold">지역·구장</dt><dd>{region} · {venue}</dd></>}
    <dt className="font-bold">분실일</dt><dd>{details.lost_on}</dd>
    <dt className="font-bold">물건</dt><dd className="break-words">{categoryLabels[details.category]} · {details.item}</dd>
    {details.place && <><dt className="font-bold">구장 내 장소</dt><dd className="break-words">{details.place}</dd></>}
    {showDescription && <><dt className="font-bold">분실 물건 설명</dt><dd className="whitespace-pre-wrap break-words">{details.features}</dd></>}
  </dl>;
}

const choices: Array<{ value: LostPublication; label: string }> = [
  { value: "hidden", label: "표시 안 함" },
  { value: "immediate", label: "즉시 공개" },
  { value: "scheduled", label: "예약 공개" },
];

export function LostPublicationOptions({ value, onChange, delay, onDelayChange, registeredAt, now }: {
  value: LostPublication; onChange: (value: LostPublication) => void;
  delay: LostPublicationDelay; onDelayChange: (delay: LostPublicationDelay) => void;
  registeredAt?: string; now: number;
}) {
  const deadline = (registeredAt ? Date.parse(registeredAt) : now) + delay * 3_600_000;
  const publishAt = new Date(deadline).toISOString();
  return <fieldset className="space-y-2 rounded-lg border border-pul-border px-3 pb-3">
    <legend className="px-1 text-sm font-bold">장터 공개</legend>
    <div className="flex flex-wrap gap-x-4">{choices.map(choice => <label className="flex min-h-11 items-center gap-2 text-sm" key={choice.value}>
      <input type="radio" name="publication" value={choice.value}
        checked={choice.value === value} onChange={() => onChange(choice.value)} />{choice.label}
    </label>)}</div>
    {value === "scheduled" && <fieldset className="border-t border-pul-border pt-2">
      <legend className="pr-2 text-sm font-semibold">최초 등록 후</legend>
      <div className="flex flex-wrap gap-x-4">{lostPublicationDelays.map(hours => <label key={hours} className="flex min-h-11 items-center gap-2 text-sm">
        <input type="radio" name="publication_delay_hours" value={hours} checked={delay === hours} onChange={() => onDelayChange(hours)} />{hours}시간
      </label>)}</div>
      <p className="text-sm text-pul-muted">{deadline <= now
        ? "저장하면 바로 공개됩니다."
        : <>공개 예정{!registeredAt && " (지금 저장 기준)"} <time dateTime={publishAt}>{lostPublicationDate(publishAt)} (한국 시간)</time></>}</p>
    </fieldset>}
  </fieldset>;
}

export function LostPublicationConfirmation() {
  return <label className="flex items-start gap-2 rounded-lg bg-pul-light p-3 text-sm">
    <input required type="checkbox" name="confirmed" className="mt-1" />
    위 분실 정보와 선택한 사진을 장터에 공개하는 데 동의합니다.
  </label>;
}
