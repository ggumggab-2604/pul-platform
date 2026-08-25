import { MyActivityHub } from "@/components/account/MyActivityHub";
import { ProfileForm } from "@/components/account/ProfileForm";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Container } from "@/components/ui/Container";
import { listMyLessonVideoBookmarks } from "@/lib/lessons/lessonVideoBookmarks";
import type { PublicLessonVideoPage } from "@/lib/lessons/lessonDirectory";
import {
  fetchMyActivityOverview,
  type MyActivityOverview,
} from "@/lib/my/myActivity";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { CircleUserRound, ShieldCheck, UserRoundCog } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "내 정보",
  description: "PUL에서 내 활동과 계정 상태, 프로필 정보를 한곳에서 확인하고 관리합니다.",
};

const accountStatusLabels: Record<string, string> = {
  active: "정상",
  suspended: "이용 제한",
  withdrawn: "이용 종료",
};

const platformRoleLabels: Record<string, string> = {
  member: "일반회원",
  platform_moderator: "플랫폼 운영 지원",
  platform_admin: "플랫폼 관리자",
};

export default async function MyPage() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/my");

  const { supabase, userId } = context;
  const [{ data: account, error: accountError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("user_accounts")
      .select("account_status, platform_role")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("display_name, nickname, profile_visibility")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const hasFoundationError = Boolean(accountError || profileError || !account || !profile);
  const isActive = account?.account_status === "active";
  const profileVisibility =
    profile?.profile_visibility === "public" ||
    profile?.profile_visibility === "members" ||
    profile?.profile_visibility === "private"
      ? profile.profile_visibility
      : "private";

  let activity: MyActivityOverview | null = null;
  let bookmarkPage: PublicLessonVideoPage | null = null;
  let activityLoadFailed = false;

  if (!hasFoundationError) {
    const [activityResult, bookmarkResult] = await Promise.allSettled([
      fetchMyActivityOverview(supabase, 6),
      listMyLessonVideoBookmarks(supabase, null, undefined, 6, 0),
    ]);

    if (activityResult.status === "fulfilled") {
      activity = activityResult.value;
    } else {
      activityLoadFailed = true;
    }

    if (bookmarkResult.status === "fulfilled") {
      bookmarkPage = bookmarkResult.value;
    } else {
      activityLoadFailed = true;
    }
  }

  return (
    <div className="bg-pul-page">
      <Container className="max-w-5xl px-3 py-7 pb-12 sm:py-10 lg:py-12 lg:pb-16">
        <main aria-labelledby="my-page-title">
          <div className="rounded-2xl bg-gradient-to-r from-pul-deep to-pul-point px-5 py-6 text-white shadow-[0_8px_28px_rgba(6,78,59,0.18)] sm:px-8 sm:py-8">
            <div className="flex items-center gap-3">
              <CircleUserRound className="h-10 w-10 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-white/80">PUL 계정</p>
                <h1 id="my-page-title" className="mt-0.5 text-2xl font-bold sm:text-3xl">
                  내 정보
                </h1>
              </div>
            </div>
            <p className="mt-4 text-base leading-7 text-white/90">
              내 활동을 다시 찾고 계정 상태와 공개 프로필 정보를 관리할 수 있습니다.
            </p>
          </div>

          {hasFoundationError ? (
            <section className="mt-5 rounded-2xl border border-red-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="account-error-title">
              <h2 id="account-error-title" className="text-xl font-bold text-foreground">
                계정 정보를 불러오지 못했습니다
              </h2>
              <p className="mt-3 text-base leading-7 text-pul-muted">
                계정 정보를 준비하는 중 문제가 발생했습니다. 잠시 후 다시 로그인해 주세요.
              </p>
              <LogoutButton className="mt-5 min-h-12 rounded-xl bg-pul-deep px-5 font-bold text-white hover:bg-pul-point" />
            </section>
          ) : (
            <>
              <MyActivityHub
                activity={activity}
                bookmarkPage={bookmarkPage}
                partialLoadFailed={activityLoadFailed}
              />

              <div className="mt-5 grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_16px_rgba(6,78,59,0.06)] sm:p-6" aria-labelledby="account-summary-title">
                  <div className="flex items-center gap-2 text-pul-deep">
                    <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                    <h2 id="account-summary-title" className="text-xl font-bold">계정 정보</h2>
                  </div>
                  <dl className="mt-5 space-y-4">
                    <div className="rounded-xl bg-pul-light/30 p-4">
                      <dt className="text-sm font-semibold text-pul-muted">계정 상태</dt>
                      <dd className="mt-1 text-lg font-bold text-pul-deep">
                        {accountStatusLabels[account!.account_status] ?? "확인 필요"}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-pul-light/30 p-4">
                      <dt className="text-sm font-semibold text-pul-muted">회원 구분</dt>
                      <dd className="mt-1 text-lg font-bold text-pul-deep">
                        {platformRoleLabels[account!.platform_role] ?? "일반회원"}
                      </dd>
                    </div>
                  </dl>
                  <LogoutButton className="mt-5 min-h-12 w-full rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light" />
                </aside>

                <section className="rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_16px_rgba(6,78,59,0.06)] sm:p-7" aria-labelledby="profile-title">
                  <div className="flex items-center gap-2 text-pul-deep">
                    <UserRoundCog className="h-6 w-6" aria-hidden="true" />
                    <h2 id="profile-title" className="text-xl font-bold">프로필 관리</h2>
                  </div>

                  {isActive ? (
                    <div className="mt-6">
                      <ProfileForm
                        displayName={profile!.display_name}
                        nickname={profile!.nickname}
                        profileVisibility={profileVisibility}
                      />
                    </div>
                  ) : (
                    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
                      <p className="font-bold text-amber-950">
                        현재 계정에서는 프로필을 수정할 수 없습니다.
                      </p>
                      <p className="mt-2 text-[15px] leading-6 text-amber-900">
                        자세한 내용은 운영자에게 문의해 주세요. 로그아웃은 왼쪽 계정 정보에서 할 수 있습니다.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </main>
      </Container>
    </div>
  );
}
