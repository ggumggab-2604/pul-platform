"use client";

import { useClubJoinApplication } from "@/components/clubs/detail/ClubJoinApplicationProvider";
import { useClubJoinInquiry } from "@/components/clubs/detail/ClubJoinInquiryProvider";
import { useClubParticipationRequest } from "@/components/clubs/detail/ClubParticipationRequestProvider";
import { getHomeCourseHref } from "@/data/clubData";
import type { ParkGolfClub } from "@/types";
import { ClipboardList, Flag, HelpCircle, Users } from "lucide-react";
import Link from "next/link";

type ClubDetailActionsProps = {
  club: ParkGolfClub;
  variant: "top" | "sidebar" | "participation";
  membershipApplicationsManagementHref?: string;
  memberManagementHref?: string;
};

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-3 text-[15px] font-bold text-pul-deep hover:bg-pul-light";
const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-point bg-pul-point px-3 text-[15px] font-bold text-white hover:bg-pul-deep";
const disabledButtonClass =
  "inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-100 px-3 text-[15px] font-bold text-pul-muted";

export function ClubDetailActions({
  club,
  variant,
  membershipApplicationsManagementHref,
  memberManagementHref,
}: ClubDetailActionsProps) {
  const { openApplication } = useClubJoinApplication();
  const { openInquiry } = useClubJoinInquiry();
  const { openRequest } = useClubParticipationRequest();
  const canApply = club.recruitStatus !== "closed";
  const applyLabel = club.recruitStatus === "waiting" ? "대기 신청" : "가입 신청";
  const applyButton = (
    <button
      type="button"
      onClick={canApply ? (event) => openApplication(event.currentTarget) : undefined}
      disabled={!canApply}
      className={canApply ? primaryButtonClass : disabledButtonClass}
      aria-label={canApply ? "동호회 가입 신청" : "현재 회원 모집 마감"}
    >
      <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
      {canApply ? applyLabel : "모집 마감"}
    </button>
  );
  const hasHomeCourse = club.directoryDataAvailability?.homeCourse !== false;
  const managementActionCount = Number(Boolean(membershipApplicationsManagementHref)) + Number(Boolean(memberManagementHref));
  const topActionCount = 2 + Number(hasHomeCourse) + managementActionCount;
  const topGridClass = topActionCount === 5 ? "grid grid-cols-2 gap-2 sm:grid-cols-5" : topActionCount === 4 ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : topActionCount === 3 ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "grid grid-cols-2 gap-2";

  let content;
  if (variant === "top") {
    content = (
      <div className={topGridClass}>
        {applyButton}
        <button type="button" onClick={(event) => openInquiry(event.currentTarget)} className={buttonClass} aria-label="동호회 가입 문의">
          <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />가입 문의
        </button>
        {hasHomeCourse ? <Link href={getHomeCourseHref(club.homeCourseId)} className={buttonClass} aria-label="주 활동 골프장 상세보기"><Flag className="h-4 w-4 shrink-0" aria-hidden="true" />주 활동 골프장</Link> : null}
        {membershipApplicationsManagementHref ? (
          <Link href={membershipApplicationsManagementHref} className={buttonClass} aria-label="동호회 가입 신청 관리">
            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />가입 신청 관리
          </Link>
        ) : null}
        {memberManagementHref ? (
          <Link href={memberManagementHref} className={buttonClass} aria-label="동호회 회원 관리">
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />회원 관리
          </Link>
        ) : null}
      </div>
    );
  } else if (variant === "sidebar") {
    content = (
      <div className="grid grid-cols-2 gap-2">
        {applyButton}
        <button type="button" onClick={(event) => openInquiry(event.currentTarget)} className={buttonClass} aria-label="동호회 가입 문의">
          <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />가입 문의
        </button>
        {hasHomeCourse ? <Link href={getHomeCourseHref(club.homeCourseId)} className={buttonClass} aria-label="주 활동 골프장 상세보기"><Flag className="h-4 w-4 shrink-0" aria-hidden="true" />활동 구장</Link> : null}
        {membershipApplicationsManagementHref ? (
          <Link href={membershipApplicationsManagementHref} className={buttonClass} aria-label="동호회 가입 신청 관리">
            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />가입 신청 관리
          </Link>
        ) : null}
        {memberManagementHref ? (
          <Link href={memberManagementHref} className={buttonClass} aria-label="동호회 회원 관리">
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />회원 관리
          </Link>
        ) : null}
      </div>
    );
  } else {
    content = (
      <div className="grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={(event) =>
            openRequest("informationCorrection", event.currentTarget)
          }
          className={buttonClass}
          aria-label="동호회 정보 수정 제보"
        >
          정보 수정 제보
        </button>
        <button
          type="button"
          onClick={(event) =>
            openRequest("representativePhoto", event.currentTarget)
          }
          className={buttonClass}
          aria-label="동호회 대표사진 등록 안내"
        >
          대표사진 등록 안내
        </button>
        <button
          type="button"
          onClick={(event) =>
            openRequest("operatorVerification", event.currentTarget)
          }
          className={buttonClass}
          aria-label="동호회 운영자 인증 안내"
        >
          운영자 인증 안내
        </button>
      </div>
    );
  }

  return content;
}
