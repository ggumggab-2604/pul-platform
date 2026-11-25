import Link from "next/link";
import { Bookmark, CalendarDays, ChevronRight, ClipboardPenLine, Flag, GraduationCap, Settings, Store, Trophy, UsersRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Kind = "club" | "course" | "event" | "university";
type Scope = { kind: Kind; key: string; name: string };
type Affiliation = Scope & { label: string; parent: string | null; deadline?: string | null };
type Shortcut = Scope & { action: string };
type Task = Shortcut & { count: number };
type Schedule = Scope & { title: string; starts_at: string };
export type Dashboard = { affiliations: Affiliation[]; shortcuts: Shortcut[]; tasks: Task[]; upcoming: Schedule[] };

const scopeIcons = { club: UsersRound, course: Flag, event: Trophy, university: GraduationCap };
const roots = { club: "/clubs", course: "/courses", event: "/events", university: "/lessons/university-departments" };
const scopeHref = ({ kind, key }: Scope) => roots[kind] + "/" + encodeURIComponent(key);
const actionLinks: Record<Kind, Record<string, [string, string, string?]>> = {
  club: {
    members: ["회원 관리", "/manage/members"],
    notices: ["공지 관리", "#club-notices"],
    schedule: ["일정 관리", "#club-official-events"],
    scores: ["월례회 성적", "/scores/edit", "성적 입력"],
    applications: ["가입 신청", "/manage/membership-applications?pending=1", "검토하기"],
    inquiries: ["가입 문의", "/manage/inquiries?pending=1", "답변하기"],
  },
  course: {
    operations: ["운영·휴장 설정", "/manage"],
    reservation: ["예약 안내 관리", "/manage#reservation_guide"],
    inquiries: ["구장 문의", "/inquiries", "답변하기"],
  },
  event: {
    applications: ["참가 신청 목록", "#tournament-roster", "확인하기"],
    notices: ["대회 공지", "#tournament-host"],
    scores: ["대회 성적 등록", "#tournament-host", "성적 등록"],
  },
  university: {
    consultations: ["입학 상담", "/manage?section=consultations", "답변하기"],
    students: ["재학생 승인", "/manage?section=students", "검토하기"],
    recruitment: ["모집 공고", "/manage?section=profile#recruitment_title"],
  },
};
const taskLabels: Record<string, string> = {
  "club:inquiries": "미답변 가입 문의",
  "club:scores": "월례회 성적 입력",
  "course:inquiries": "미답변 구장 문의",
  "event:applications": "참가 신청 확인",
  "university:consultations": "미답변 입학 상담",
};
const calendarDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
const deadlineDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function MyCard({ id, title, children, compact = false, className = "" }: {
  id?: string; title: string; children: ReactNode; compact?: boolean; className?: string;
}) {
  return <section id={id} className={`min-w-0 scroll-mt-28 rounded-[15px] border border-[#c7d5d5] bg-white px-4 sm:px-6 sm:py-5 ${compact ? "py-2.5" : "py-4"} ${className}`}>
    <h2 className="text-[1.25rem] font-extrabold tracking-tight text-foreground sm:text-[1.55rem]">{title}</h2>
    {children}
  </section>;
}

function Tile({ href, label, detail, icon: Icon }: { href: string; label: string; detail?: string; icon: LucideIcon }) {
  return <Link href={href} prefetch={false} className="flex min-h-14 min-w-0 items-center gap-3 rounded-[10px] border border-[#c4d1d1] px-3 py-2.5 text-foreground hover:border-pul-point hover:bg-pul-light/40 sm:min-h-[67px] sm:px-4">
    <Icon className="size-6 shrink-0 text-pul-deep sm:size-7" aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block break-words font-bold sm:text-lg">{label}</span>
      {detail && <span className="block break-words text-sm text-pul-muted">{detail}</span>}
    </span>
    <ChevronRight className="size-4 shrink-0 text-pul-deep" aria-hidden="true" />
  </Link>;
}

function Upcoming({ items, className }: { items: Schedule[]; className: string }) {
  return <MyCard title="다가오는 일정" className={className}>
    {items.length ? <ul className="mt-3 divide-y divide-pul-border border-t border-pul-border">
      {items.map((item) => <li key={item.key + item.title + item.starts_at}>
        <Link prefetch={false} href={scopeHref(item) + (item.kind === "club" ? "#club-official-events" : item.kind === "university" ? "/students?section=event" : "")}
          className="flex min-h-14 items-center gap-3 py-3 hover:text-pul-point">
          <CalendarDays className="size-6 shrink-0 text-pul-deep" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="break-words font-bold">{item.title}</p>
            {item.name !== item.title && <p className="break-words text-sm text-pul-muted">{item.name}</p>}
          </div>
          <time dateTime={item.starts_at} className="shrink-0 text-sm">{calendarDate.format(new Date(item.starts_at))}</time>
        </Link>
      </li>)}
    </ul> : <div className="mt-3 flex min-h-28 flex-col items-center justify-center gap-2 border-t border-pul-border py-4">
      <CalendarDays className="size-7 text-pul-deep" aria-hidden="true" />
      <p>예정된 일정이 없습니다.</p>
    </div>}
  </MyCard>;
}

function Tasks({ items }: { items: Task[] }) {
  return <MyCard title="처리할 일" compact={items.length === 0} className="lg:col-start-1 lg:row-start-1">
    {items.length ? <ul className="mt-3 divide-y divide-pul-border border-t border-pul-border">
      {items.map((item) => {
        const [label, suffix, button] = actionLinks[item.kind][item.action];
        return <li key={item.kind + item.key + item.action} className="flex items-center justify-between gap-3 py-3 sm:py-4">
          <div className="min-w-0">
            <p className="break-words text-sm sm:text-base">{item.name}</p>
            <p className="mt-0.5 break-words text-base font-extrabold sm:text-xl">{taskLabels[item.kind + ":" + item.action] ?? label}
              {" "}<span className="inline-block rounded-md bg-[#fff0d9] px-2 py-0.5 text-sm font-bold text-[#8c3600]">{item.count}건</span>
            </p>
          </div>
          <Link href={scopeHref(item) + suffix} prefetch={false}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-pul-deep px-3 text-sm font-bold text-white hover:bg-pul-point sm:px-5">{button ?? "확인하기"}</Link>
        </li>;
      })}
    </ul> : <p className="mt-1 text-sm text-pul-muted sm:mt-3 sm:border-t sm:border-pul-border sm:pt-4 sm:text-base">처리할 일이 없습니다.</p>}
  </MyCard>;
}

function Affiliations({ items }: { items: Affiliation[] }) {
  const coursesOnly = items.length > 0 && items.every((item) => item.kind === "course");
  const eventsOnly = items.length > 0 && items.every((item) => item.kind === "event");
  return <MyCard title={coursesOnly ? "관리하는 곳" : eventsOnly ? "내가 주최한 대회" : "내 소속"}
    className="lg:col-start-2 lg:row-start-1">
    {items.length ? <ul className="mt-3 divide-y divide-pul-border border-t border-pul-border">
      {items.map((item) => {
        const Icon = scopeIcons[item.kind];
        const suffix = item.kind === "university" ? (item.label.includes("담당자") ? "/manage" : "/students") : item.kind === "course" ? "/manage" : "";
        return <li key={item.kind + item.key}>
          <Link href={scopeHref(item) + suffix} prefetch={false} className="flex min-h-14 items-center gap-3 py-3 hover:text-pul-point">
            <Icon className="size-6 shrink-0 text-pul-deep sm:size-7" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              {item.parent && <p className="break-words text-sm text-pul-muted">{item.parent}</p>}
              <p className="break-words font-bold sm:text-lg">{item.name}</p>
              {item.deadline && <p className="text-sm text-pul-muted">
                접수 마감 <time dateTime={item.deadline}>{deadlineDate.format(new Date(item.deadline))}</time>
              </p>}
            </div>
            <span className="max-w-[42%] text-right text-sm">{item.label}</span>
          </Link>
          {item.kind === "university" && item.label.includes("재학생") && <Link href={scopeHref(item) + "/students"} prefetch={false}
            className="mb-2 ml-9 inline-flex min-h-11 items-center font-bold text-pul-deep underline underline-offset-4">재학생 공간</Link>}
        </li>;
      })}
    </ul> : <p className="mt-3 flex items-center gap-3 border-t border-pul-border py-4"><UsersRound className="size-6 text-pul-deep" aria-hidden="true" />가입한 동호회가 없습니다.</p>}
    <div className="flex flex-wrap gap-x-4">
      {items.length === 0 && <Link href="/clubs" prefetch={false} className="inline-flex min-h-11 items-center rounded-lg border border-pul-deep px-4 font-bold text-pul-deep">동호회 찾기</Link>}
      <Link href="/my/clubs" prefetch={false} className="inline-flex min-h-11 items-center text-sm font-bold text-pul-deep underline underline-offset-4">내 소속 관리</Link>
    </div>
  </MyCard>;
}

export const profileLinkClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-deep bg-white px-3 py-2 text-sm font-bold text-pul-deep hover:bg-pul-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point sm:px-4 sm:text-base";

export function MyDashboard({ dashboard, name, platformAdmin }: { dashboard: Dashboard | null; name: string; platformAdmin: boolean }) {
  const hasOperations = Boolean(dashboard?.shortcuts.length);
  const hasTasks = Boolean(dashboard?.tasks.length);
  const multipleScopes = new Set(dashboard?.shortcuts.map((item) => item.kind + ":" + item.key)).size > 1;
  const upcoming = dashboard && <Upcoming items={dashboard.upcoming}
    className={hasOperations ? "lg:col-start-2 lg:row-start-2" : "lg:col-start-1 lg:row-start-1"} />;
  return <>
    <header className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-3xl font-black tracking-tight sm:text-5xl">내 정보</h1>
        {name && <p className="mt-1 break-words text-base font-semibold sm:text-[1.35rem]">{name}님</p>}
      </div>
      <Link href="/my?view=settings" prefetch={false} className={profileLinkClass}><Settings className="size-5" aria-hidden="true" />프로필·계정 설정</Link>
    </header>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.47fr)_minmax(0,1fr)]">
      {dashboard ? <>
        {hasOperations ? <Tasks items={dashboard.tasks} /> : upcoming}
        <Affiliations items={dashboard.affiliations} />
        {hasOperations && <>
          {hasTasks && upcoming}
          <MyCard title="운영 바로가기" className="lg:col-start-1 lg:row-start-2">
            <div className="mt-3 grid gap-2 min-[520px]:grid-cols-2">
              {dashboard.shortcuts.map((item) => {
                const [label, suffix] = actionLinks[item.kind][item.action];
                return <Tile key={item.kind + item.key + item.action} icon={scopeIcons[item.kind]} href={scopeHref(item) + suffix} label={label} detail={multipleScopes ? item.name : undefined} />;
              })}
              {platformAdmin && <Tile href="/manage" label="운영 관리센터" icon={Settings} />}
            </div>
          </MyCard>
          {!hasTasks && upcoming}
        </>}
      </> : <p role="alert" className="rounded-lg border border-pul-border bg-white p-4 lg:col-span-2">소속·일정·처리할 일을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>}
      {platformAdmin && !hasOperations && <Link href="/manage" prefetch={false} className={profileLinkClass + " justify-self-start lg:col-span-2"}>운영 관리센터</Link>}
      <MyCard title="내 활동" className="lg:col-span-2">
        <div className="mt-3 grid gap-2 min-[520px]:grid-cols-2 lg:grid-cols-4">
          <Tile href="/my/practice" label="내 연습기록" icon={Flag} />
          <Tile href="/my?view=posts" label="내가 쓴 글" icon={ClipboardPenLine} />
          <Tile href="/my?view=market" label="내 장터" icon={Store} />
          <Tile href="/my?view=interests" label="관심목록" icon={Bookmark} />
        </div>
      </MyCard>
    </div>
  </>;
}
