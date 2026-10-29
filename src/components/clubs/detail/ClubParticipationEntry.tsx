"use client";

import type { ClubParticipationRequestType } from "@/types";
import { useClubParticipationRequest } from "./ClubParticipationRequestProvider";

const labels: Record<ClubParticipationRequestType, string> = {
  informationCorrection: "정보 수정 제보",
  representativePhoto: "대표사진 등록 안내",
  operatorVerification: "운영 권한 안내",
};

export function ClubParticipationEntry({ requestType }: { requestType: ClubParticipationRequestType }) {
  const { openRequest } = useClubParticipationRequest();
  return <button type="button" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-pul-point hover:bg-pul-light" onClick={event => openRequest(requestType, event.currentTarget)}>{labels[requestType]}</button>;
}
