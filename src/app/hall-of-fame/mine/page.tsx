import type { Metadata } from "next";

import { HallOfFamePageContent } from "@/components/hall-of-fame/HallOfFamePageContent";
import {
  listMyHallOfFameApplications,
  listMyHallOfFameDisputes,
  listMyHallOfFameRecords,
  type MyHallOfFameApplication,
  type MyHallOfFameDispute,
  type MyHallOfFameRecord,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "내 명예의 전당",
  description: "PUL 파크골프 명예 기록과 내 신청·정정 요청을 확인합니다.",
};

type LoadResult<T> = { data: T; failed: boolean };

async function settle<T>(promise: Promise<T>, fallback: T): Promise<LoadResult<T>> {
  try {
    return { data: await promise, failed: false };
  } catch {
    return { data: fallback, failed: true };
  }
}

export default async function MyHallOfFamePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims().catch(() => null);
  const authenticatedUserId = claimsResult?.data?.claims?.sub;
  const signedIn =
    !claimsResult?.error &&
    typeof authenticatedUserId === "string" &&
    authenticatedUserId.length > 0;

  let applications: LoadResult<MyHallOfFameApplication[]> = {
    data: [],
    failed: false,
  };
  let records: LoadResult<MyHallOfFameRecord[]> = {
    data: [],
    failed: false,
  };
  let disputes: LoadResult<MyHallOfFameDispute[]> = {
    data: [],
    failed: false,
  };
  let canManageHallOfFame = false;

  if (signedIn) {
    const [nextApplications, nextRecords, nextDisputes, permissionResult] = await Promise.all([
      settle(listMyHallOfFameApplications(supabase), []),
      settle(listMyHallOfFameRecords(supabase), []),
      settle(listMyHallOfFameDisputes(supabase), []),
      Promise.resolve(
        supabase.rpc("current_user_has_platform_permission", {
          p_permission_code: "hall_of_fame.disputes.read",
        }),
      )
        .then(({ data, error }) => !error && data === true)
        .catch(() => false),
    ]);
    applications = nextApplications;
    records = nextRecords;
    disputes = nextDisputes;
    canManageHallOfFame = permissionResult;
  }

  return (
    <HallOfFamePageContent
      key={tab === "applications" ? "applications" : "records"}
      initialMemberTab={tab === "applications" ? "applications" : "records"}
      authenticatedUserId={signedIn ? authenticatedUserId : undefined}
      applications={applications.data}
      applicationsLoadFailed={applications.failed}
      records={records.data}
      recordsLoadFailed={records.failed}
      disputes={disputes.data}
      disputesLoadFailed={disputes.failed}
      canManageHallOfFame={canManageHallOfFame}
    />
  );
}
