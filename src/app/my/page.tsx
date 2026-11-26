import { MyActivityHub } from "@/components/account/MyActivityHub";
import { MyCard, MyDashboard, profileLinkClass, type Dashboard } from "@/components/account/MyDashboard";
import { ProfileForm, type PostingNameSettings } from "@/components/account/ProfileForm";
import { MemberBasicsForm } from "@/components/account/MemberBasicsForm";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Container } from "@/components/ui/Container";
import { MessagingSessionBoundary } from "@/components/messaging/MessagingSessionBoundary";
import { InterestList } from "@/components/interests/InterestList";
import { listInterests } from "@/lib/interests/interests";
import type { MemberBasics } from "@/lib/auth/memberBasics";
import { fetchMyActivityOverview } from "@/lib/my/myActivity";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { listAccountingScopes } from "@/lib/accounting/server";

export const metadata = { title: "내 정보", description: "내 소속, 일정, 활동과 계정 정보를 확인합니다." };

export default async function MyPage({ searchParams }: {
  searchParams: Promise<{ club?: string | string[]; view?: string | string[] }>;
}) {
  const { club, view } = await searchParams;
  const clubKey = typeof club === "string" && /^[\p{L}\p{N}_-]{1,160}$/u.test(club) ? club : null;
  const settings = view === "settings" || Boolean(clubKey);
  const query = new URLSearchParams();
  if (clubKey) query.set("club", clubKey);
  if (view === "settings" || view === "posts" || view === "market" || view === "interests") query.set("view", view);
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=" + (query.size ? encodeURIComponent("/my?" + query) : "/my"));
  const { supabase, userId } = context;
  const [{ data: account, error: accountError }, { data: postingName, error: nameError }] = await Promise.all([
    supabase.from("user_accounts").select("account_status, platform_role").eq("id", userId).maybeSingle(),
    supabase.rpc("get_my_posting_name"),
  ]);
  const name = postingName as PostingNameSettings | null;
  const active = account?.account_status === "active";
  const returnHref = clubKey ? "/clubs/" + encodeURIComponent(clubKey) + "#club-official-events" : null;
  let content;
  if (!account || accountError) {
    content = <><h1 className="mb-5 text-3xl font-black">내 정보</h1><MyCard title="계정 정보를 불러오지 못했습니다">
      <LogoutButton className={profileLinkClass + " mt-3"} />
    </MyCard></>;
  } else if (settings || !active) {
    const basics = active ? await supabase.rpc("get_my_member_basics") : null;
    content = <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black sm:text-4xl">프로필·계정 설정</h1>
        <Link href="/my" prefetch={false} className={profileLinkClass}>내 정보로 돌아가기</Link>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {active && <>
          <MyCard title="이름·공개 설정">
            <div className="mt-4">{name && !nameError ? <ProfileForm settings={name} /> :
              <p role="alert">이름 설정을 불러오지 못했습니다.</p>}</div>
          </MyCard>
          <MyCard id="member-basics" title="기본정보">
            <p className="my-3 text-sm text-pul-muted">동호회 월례회 등에 사용하는 기본정보를 확인하고 수정합니다.</p>
            {basics?.error ? <p role="alert">기본정보를 불러오지 못했습니다.</p> :
              <MemberBasicsForm viewerId={userId} initial={basics?.data as MemberBasics | null} />}
            {returnHref && <Link href={returnHref} className="mt-3 inline-flex min-h-11 items-center font-semibold text-pul-deep underline">월례회 참가로 돌아가기</Link>}
          </MyCard>
        </>}
        <MyCard title="계정">
          {!active && <p className="mt-3">현재 계정에서는 프로필을 수정할 수 없습니다.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {active && <Link href="/my/course-invitations" prefetch={false} className={profileLinkClass}>내 운영권 요청</Link>}
            {active && <Link href="/my/withdraw" prefetch={false} className={profileLinkClass}>회원 탈퇴</Link>}
            <LogoutButton className={profileLinkClass} />
          </div>
        </MyCard>
      </div>
    </>;
  } else if (view === "posts" || view === "market" || view === "interests") {
    const result = view === "interests" ? await listInterests(supabase).catch(() => null) : null;
    const activity = view !== "interests" ? await fetchMyActivityOverview(supabase, 12).catch(() => null) : null;
    const title = view === "posts" ? "내가 쓴 글" : view === "market" ? "내 장터" : "관심목록";
    content = <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black sm:text-4xl">{title}</h1>
        <Link href="/my" prefetch={false} className={profileLinkClass}>내 정보로 돌아가기</Link>
      </div>
      {view === "interests" ? <>
        <InterestList initialPage={result} initialFailed={result === null} />
        <Link href="/my/operational-notices" prefetch={false} className={profileLinkClass + " mt-4"}>골프장 관심·운영알림 관리</Link>
      </> : <MyActivityHub activity={activity} partialLoadFailed={activity === null} section={view} />}
    </>;
  } else {
    const [result, accounting] = await Promise.all([supabase.rpc("get_my_dashboard"), listAccountingScopes(supabase)]);
    content = <>
      <MyDashboard dashboard={result.error ? null : result.data as Dashboard | null}
        name={name ? (name.use_real_name ? name.real_name ?? name.nickname : name.nickname) : ""}
        platformAdmin={account.platform_role === "platform_admin"} accounting={accounting.length > 0} />
      {nameError && <p role="alert" className="mt-3 text-sm">이름 설정을 불러오지 못했습니다.</p>}
    </>;
  }

  return <div className="bg-[#edf3f1]">
    <Container className="max-w-[1536px] px-3 py-5 pb-10 sm:px-6 sm:py-8 lg:px-8">
      <main>
        <MessagingSessionBoundary viewerId={userId}>{content}</MessagingSessionBoundary>
      </main>
    </Container>
  </div>;
}
