export const voteLabels = { yes: "참가", no: "불참", maybe: "미정", unanswered: "미응답" };
export const audienceLabels = { all: "전체 회원", yes: "참가 응답 회원", unanswered: "미응답 회원" };
export const fieldLabels = { name: "이름", phone: "전화번호", club: "동호회", division: "참가 부문" };

export type Vote = "yes" | "no" | "maybe";
export type Audience = keyof typeof audienceLabels;
export type EntryField = keyof typeof fieldLabels;
export type RoomKind = "tournament" | "monthly";
export type RoomSummary = { id: string; title: string; kind: RoomKind; open: boolean; archived: boolean };
export type RoomList = {
  clubName: string;
  rooms: RoomSummary[];
  tournaments: { id: string; label: string }[];
  monthly: { id: string; label: string }[];
};
type Response = { response: Vote | null; division: string | null; phoneAllowed: boolean };
export type RoomMember = Response & { id: string; name: string; consented: boolean };
export type Room = RoomSummary & {
  clubKey: string;
  clubName: string;
  eventKey: string | null;
  date: string | null;
  divisions: string[] | null;
  entryOpen: boolean | null;
  chair: boolean;
  ended: boolean;
  closed: boolean;
  allowPhone: boolean;
  requiredFields: EntryField[] | null;
  own: Response | null;
  contact: { name: string | null; phone: string | null } | null;
  members?: RoomMember[];
  notices?: { id: string; at: string; body: string; count: number; audience: Audience }[];
  submittedAt: string | null;
  submission?: { count: number; fields: EntryField[]; members: { name: string; division: string }[] } | null;
};
export type SharedEntry = Partial<Record<EntryField, string>> & { name: string };
export type SharedRoster = { id: string; at: string; fields: EntryField[]; members: SharedEntry[] };
export type EntryPreview = { token: string; fields: EntryField[]; members: (SharedEntry & { id: string })[] };
export type NoticePreview = { token: string; count: number; recipients: string[] };
export type RoomOperation = "create" | "respond" | "preview_notice" | "notice" | "close" | "archive" | "preview_submit" | "submit";
export type RoomResult = Partial<EntryPreview & NoticePreview> & {
  error?: string; roomId?: string; done?: boolean; sent?: number; submitted?: number;
};
export const roomHref = (id: string) => "/club-participation/" + encodeURIComponent(id);
export const roomListHref = (clubKey: string) => "/clubs/" + encodeURIComponent(clubKey) + "/manage/participation";
export const annualHref = (clubKey: string) => "/clubs/" + encodeURIComponent(clubKey) + "/scores/annual";
export const validRoomId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

