export const kinds = { club: "동호회", tournament: "대회", university: "대학·학과", course: "구장" } as const;
export type Kind = keyof typeof kinds;
export const isKind = (value: string): value is Kind => Object.hasOwn(kinds, value);
export const isId = (value: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const accountingHref = (kind: Kind, id: string) => `/accounting/${kind}/${id}`;
export const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const won = (amount: number | string | bigint) => (typeof amount === "string" ? BigInt(amount) : amount).toLocaleString("ko-KR") + "원";
const seoulTimestamp = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function timestamp(value: string) {
  const parts = Object.fromEntries(seoulTimestamp.formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
  return parts.year + "-" + parts.month + "-" + parts.day + " " + parts.hour + ":" + parts.minute;
}

export const directions = { income: "수입", expense: "지출" } as const;
export const receipts = { attached: "첨부 완료", later: "나중에 첨부", missing: "증빙 없음", na: "해당 없음" } as const;
export const statuses = { unpaid: "미납", pending: "입금 확인 대기", partial: "일부 납부", paid: "완납", exempt: "면제", cancelled: "취소", refunded: "환불" } as const;
export const routes = { standard: "장부로 수납", agency: "동호회 대리 수납", direct: "주최자에게 직접 납부", official: "학교 공식 납부 안내" } as const;
export const columnLabels = { counterparty: "거래 상대·업체", member: "연결 회원", event: "행사", receipt: "증빙", facility: "시설 위치", work_date: "작업일" } as const;
export const reports = { all: "전체 장부", movement: "수입·지출 내역서", expense: "지출 내역서", dues: "회비 납부 내역서", donation: "찬조금 내역서", event: "행사 정산표" } as const;
export type ReportKind = keyof typeof reports;
export type OptionalColumn = keyof typeof columnLabels;
export type Scope = { kind: Kind; id: string; key: string; name: string; access: number };
export type Category = { id: string; direction: keyof typeof directions; label: string; group_name: string };
export type Person = { user_id: string; name: string };
export type Event = { id: string; name: string; external: boolean; confirmed: string[] };
export type Entry = {
  id: string; entry_date: string; category_id: string; amount: number; description: string;
  counterparty: string | null; member_id: string | null; event_id: string | null; agency_event: string | null;
  daily_total: boolean; facility: string | null; work_date: string | null;
  receipt_status: keyof typeof receipts; receipt_reason: string | null; receipt_id: string | null;
  receipt_mime: string | null; refund_of: string | null; transfer_id: string | null; return_of: string | null; cancelled: boolean; version: number;
  created_name: string; created_at: string; updated_name: string; updated_at: string;
};
export type Audit = { version: number; reason: string; before_values: Entry; after_values: Entry };
export type Summary = { from: string; to: string; opening: string; income: string; expense: string; closing: string; items: { direction: Category["direction"]; label: string; amount: string }[] };
export type Target = Person & { paid: number; refunded: number; pledged: number | null; status: keyof typeof statuses };
export type PaymentRequest = {
  id: string; title: string; category_id: string; amount: number; starts: string; due: string; period_start: string | null;
  period_end: string | null; route: keyof typeof routes; guidance: string; link: string | null;
  event_id: string | null; sent_at: string | null; targets: Target[];
};
export type MemberPayment = Omit<PaymentRequest, "id" | "targets" | "sent_at" | "event_id" | "category_id"> &
  Pick<Target, "pledged" | "paid" | "refunded" | "status"> & { donation: boolean };
export type Publication = { id: string; previous_id: string | null; from: string; to: string; created_at: string };
export type Workspace = {
  scope: Scope; book: { opening_date: string; opening_amount: number; columns: OptionalColumn[] } | null;
  report: Summary | null; categories: Category[]; entries: Entry[]; events: Event[]; people: Person[];
  delegates: { user_id: string; can_share: boolean }[]; requests: PaymentRequest[]; publications: Publication[];
  transfers: { id: string; name: string; date: string; amount: number }[];
  agency: { event_id: string; income: number | null; expense: number | null; balance: number }[];
};
export type Query = Record<string, string | string[] | undefined>;
export function period(query: Query) {
  const current = today();
  const month = typeof query.month === "string" && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(query.month) ? query.month : current.slice(0, 7);
  const year = typeof query.year === "string" && /^[1-9]\d{3}$/.test(query.year) ? query.year : current.slice(0, 4);
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  if (typeof query.from === "string" && typeof query.to === "string" && datePattern.test(query.from) && datePattern.test(query.to) &&
    query.from >= "1900-01-01" && query.to <= "9999-12-31" && query.from <= query.to && Number.isFinite(Date.parse(query.from)) && Number.isFinite(Date.parse(query.to)) &&
    (Date.parse(query.to) - Date.parse(query.from)) / 86400000 <= 3660 &&
    new Date(query.from).toISOString().slice(0,10) === query.from && new Date(query.to).toISOString().slice(0,10) === query.to) {
    return { from: query.from, to: query.to };
  }
  return query.period === "year" ? { from: year + "-01-01", to: year + "-12-31" } :
    { from: month + "-01", to: month + "-" + end };
}

export function selectEntries(data: Workspace, query: Query) {
  const report: ReportKind = typeof query.report === "string" && Object.hasOwn(reports, query.report) ? query.report as ReportKind : "all";
  const categories = new Map(data.categories.map(category => [category.id, category]));
  return {
    report,
    rows: data.entries.filter(row => {
      const category = categories.get(row.category_id);
      if (query.category && query.category !== row.category_id) return false;
      if (query.receipt && query.receipt !== row.receipt_status) return false;
      if (query.event && query.event !== row.event_id) return false;
      if (report === "all") return true;
      if (row.cancelled) return false;
      if (report === "event") return Boolean(row.event_id);
      if (row.agency_event) return false;
      if (report === "expense") return category?.direction === "expense";
      if (report === "dues") return category?.group_name === "dues";
      if (report === "donation") return category?.group_name === "donation";
      return true;
    }),
  };
}

