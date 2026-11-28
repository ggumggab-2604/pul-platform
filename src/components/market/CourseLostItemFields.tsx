import { categoryLabels } from "@/data/marketData";
import { lostItemInput, lostPublicationDate, type CourseLostDetails, type LostPublication } from "@/lib/market/lostItems";

export function CourseLostFields({ today }: { today: string }) {
  return <>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-bold">분실일<input required type="date" name="lost_on" max={today} min="0001-01-01" className={lostItemInput} /></label>
      <label className="text-sm font-bold">물건 종류<select name="category" required className={lostItemInput}>
        <option value="">종류 선택</option>
        {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="text-sm font-bold">물건 이름<input name="item" required minLength={2} maxLength={100} className={lostItemInput} /></label>
      <label className="text-sm font-bold">구장 내 세부 장소 (선택)<input name="place" maxLength={160} className={lostItemInput} placeholder="예: 3번 홀 근처" /></label>
    </div>
    <label className="block text-sm font-bold">공개할 물건 특징<textarea required name="features" minLength={10} maxLength={600}
      className={lostItemInput + " min-h-24"} /></label>
    <p className="text-sm text-pul-muted">연락처, 이름표, 전체 일련번호와 쪽지 내용은 설명과 사진에서 빼 주세요.</p>
  </>;
}

export function CourseLostSummary({ details, venue, region }: { details: CourseLostDetails; venue?: string; region?: string }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-lg bg-pul-light p-3 text-sm">
    {venue && <><dt className="font-bold">지역·구장</dt><dd>{region} · {venue}</dd></>}
    <dt className="font-bold">분실일</dt><dd>{details.lost_on}</dd>
    <dt className="font-bold">물건</dt><dd className="break-words">{categoryLabels[details.category]} · {details.item}</dd>
    {details.place && <><dt className="font-bold">구장 내 장소</dt><dd className="break-words">{details.place}</dd></>}
    <dt className="font-bold">공개 특징</dt><dd className="whitespace-pre-wrap break-words">{details.features}</dd>
  </dl>;
}

const choices: Array<{ value: LostPublication; label: string }> = [
  { value: "immediate", label: "장터에 즉시 공개" },
  { value: "scheduled", label: "48시간 후 자동 공개" },
  { value: "hidden", label: "장터에 표시 안 함" },
];

export function LostPublicationOptions({ value, onChange, publishAt, alreadyDue = false }: {
  value: LostPublication; onChange: (value: LostPublication) => void; publishAt?: string; alreadyDue?: boolean;
}) {
  return <fieldset className="space-y-2 rounded-lg border border-pul-border px-3 pb-3">
    <legend className="px-1 text-sm font-bold">장터 공개</legend>
    {choices.map(choice => <label className="flex min-h-9 items-center gap-2 text-sm" key={choice.value}>
      <input type="radio" name="publication" value={choice.value}
        checked={choice.value === value} onChange={() => onChange(choice.value)} />{choice.label}
    </label>)}
    {value === "scheduled" && <p className="text-sm text-pul-muted">{alreadyDue
      ? "최초 등록 후 48시간이 지나 저장하면 바로 공개됩니다."
      : publishAt
      ? <>공개 예정 <time dateTime={publishAt}>{lostPublicationDate(publishAt)} (한국 시간)</time></>
      : "등록부터 48시간 뒤까지 찾는 중이면 공개합니다. 저장 후 한국 시간 기준 예정 시각을 확인할 수 있습니다."}</p>}
  </fieldset>;
}

export function LostPublicationConfirmation() {
  return <label className="flex items-start gap-2 rounded-lg bg-pul-light p-3 text-sm">
    <input required type="checkbox" name="confirmed" className="mt-1" />
    위 분실 정보와 선택한 사진을 장터에 공개하는 데 동의합니다.
  </label>;
}
