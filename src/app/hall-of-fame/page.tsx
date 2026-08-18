import type { Metadata } from "next";

import { HallOfFamePageContent } from "@/components/hall-of-fame/HallOfFamePageContent";
import {
  listHallOfFamePublicRecords,
  listMyHallOfFameApplications,
  listMyHallOfFameDisputes,
  listMyHallOfFameRecords,
  type HallOfFamePublicRecord,
  type MyHallOfFameApplication,
  type MyHallOfFameDispute,
  type MyHallOfFameRecord,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "명예의 전당",
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

export default async function HallOfFamePage() {
  const supabase = await createClient();
  const publicPromise = settle<HallOfFamePublicRecord[]>(
    listHallOfFamePublicRecords(supabase),
    [],
  );
  const claimsPromise = supabase.auth.getClaims().catch(() => null);
  const [publicResult, claimsResult] = await Promise.all([
    publicPromise,
    claimsPromise,
  ]);
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

  if (signedIn) {
    [applications, records, disputes] = await Promise.all([
      settle(listMyHallOfFameApplications(supabase), []),
      settle(listMyHallOfFameRecords(supabase), []),
      settle(listMyHallOfFameDisputes(supabase), []),
    ]);
  }

  return (
    <HallOfFamePageContent
      publicRecords={publicResult.data}
      publicLoadFailed={publicResult.failed}
      authenticatedUserId={signedIn ? authenticatedUserId : undefined}
      applications={applications.data}
      applicationsLoadFailed={applications.failed}
      records={records.data}
      recordsLoadFailed={records.failed}
      disputes={disputes.data}
      disputesLoadFailed={disputes.failed}
    />
  );
}
