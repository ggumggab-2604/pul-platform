"use client";

import { ClubEventsSection } from "@/components/clubs/ClubEventsSection";
import { ClubCard } from "@/components/clubs/ClubCard";
import { ClubDetailModal } from "@/components/clubs/ClubDetailModal";
import { ClubPartnerBanner } from "@/components/clubs/ClubPartnerBanner";
import { ClubRegisterGuide } from "@/components/clubs/ClubRegisterGuide";
import {
  ClubSearchFilter,
  MobileRegionQuickFilter,
  MobileSearchToolbar,
  createDefaultClubFilters,
  filterClubsWithMeta,
} from "@/components/clubs/ClubSearchFilter";
import { ClubsIntroCard } from "@/components/clubs/ClubsIntroCard";
import { FeaturedClubCards } from "@/components/clubs/FeaturedClubCards";
import {
  CLUB_DISTRICT_EMPTY_SUBTITLE,
  CLUB_DISTRICT_EMPTY_TITLE,
  CLUB_JOIN_APPLICATION_MESSAGE,
  CLUB_MINI_BOARD_APPROVAL_MESSAGE,
  CLUB_PAGE_DISCLAIMER,
  CLUB_PARTNER_INQUIRY_MESSAGE,
  CLUB_PARTNER_INQUIRY_URL,
  CLUB_REGISTER_FORM_URL,
  featuredClubs,
  parkGolfClubs,
  resolveClubPartnerBanner,
} from "@/data/clubData";
import type { ParkGolfClub } from "@/types";
import { useMemo, useState } from "react";

function InfoModal({
  title,
  message,
  onClose,
  actionLabel,
  actionHref,
}: {
  title: string;
  message: string;
  onClose: () => void;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-pul-border bg-white p-5 shadow-[0_12px_40px_rgba(6,78,59,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-pul-muted">
          {message}
        </p>
        <div className="mt-5 flex gap-2">
          {actionLabel && actionHref && (
            <a
              href={actionHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep"
            >
              {actionLabel}
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-pul-border text-sm font-bold text-pul-muted hover:text-pul-deep"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function getRegionSummary(filters: { province: string; district: string }) {
  if (filters.province === "전체") return "전국";
  if (filters.district === "전체") return filters.province;
  return `${filters.province} > ${filters.district}`;
}

export function ClubsPageContent() {
  const [filters, setFilters] = useState(createDefaultClubFilters);
  const [selectedClub, setSelectedClub] = useState<ParkGolfClub | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [infoModal, setInfoModal] = useState<
    "apply" | "register" | "report" | "partner" | null
  >(null);
  const [actionClub, setActionClub] = useState<ParkGolfClub | null>(null);

  const filterResult = useMemo(
    () => filterClubsWithMeta(parkGolfClubs, filters),
    [filters],
  );

  const resolvedBanner = useMemo(
    () => resolveClubPartnerBanner(filters),
    [filters],
  );

  const resetFilters = () => setFilters(createDefaultClubFilters());

  const handleApply = (club: ParkGolfClub) => {
    setActionClub(club);
    setInfoModal("apply");
  };

  const handleReport = (club: ParkGolfClub) => {
    setActionClub(club);
    setInfoModal("report");
  };

  const regionSummary = getRegionSummary(filters);

  return (
    <>
      <div className="space-y-4 pb-6 lg:space-y-8 lg:pb-2">
        <ClubsIntroCard />

        <div className="space-y-2 lg:hidden">
          <MobileSearchToolbar
            keyword={filters.keyword}
            onKeywordChange={(keyword) => setFilters({ ...filters, keyword })}
            onFilterToggle={() => setShowMobileFilters((value) => !value)}
            showFilters={showMobileFilters}
            resultCount={filterResult.clubs.length}
            regionSummary={regionSummary}
          />
          <MobileRegionQuickFilter filters={filters} onChange={setFilters} />
          {showMobileFilters && (
            <ClubSearchFilter
              filters={filters}
              onChange={setFilters}
              onReset={resetFilters}
              resultCount={filterResult.clubs.length}
              showSearch={false}
              onClose={() => setShowMobileFilters(false)}
            />
          )}
        </div>

        <div className="hidden lg:block">
          <ClubSearchFilter
            filters={filters}
            onChange={setFilters}
            onReset={resetFilters}
            resultCount={filterResult.clubs.length}
          />
        </div>

        <FeaturedClubCards
          clubs={featuredClubs}
          onApply={handleApply}
          onDetail={setSelectedClub}
        />

        <ClubPartnerBanner
          banner={resolvedBanner}
          onInquiry={() => setInfoModal("partner")}
        />

        <ClubEventsSection clubs={parkGolfClubs} onClubDetail={setSelectedClub} />

        <section>
          <div className="mb-3 lg:mb-4">
            <h2 className="text-lg font-bold text-foreground lg:text-xl">동호회 목록</h2>
            <p className="mt-0.5 text-xs text-pul-muted lg:mt-1 lg:text-sm">
              {filterResult.clubs.length === parkGolfClubs.length &&
              filters.province === "전체"
                ? "전국 파크골프 동호회 전체입니다."
                : `${regionSummary} 기준 동호회입니다.`}
            </p>
          </div>

          {filterResult.districtEmpty ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 px-5 py-8 text-center">
                <p className="text-base font-semibold text-foreground">
                  {CLUB_DISTRICT_EMPTY_TITLE}
                </p>
                <p className="mt-1 text-sm text-pul-muted">
                  {CLUB_DISTRICT_EMPTY_SUBTITLE}
                </p>
              </div>
              {filterResult.provinceFallbackClubs.length > 0 && (
                <div>
                  <h3 className="mb-3 text-base font-bold text-foreground">
                    {filters.province} 전체 동호회
                  </h3>
                  <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
                    {filterResult.provinceFallbackClubs.map((club) => (
                      <ClubCard
                        key={club.id}
                        club={club}
                        onApply={handleApply}
                        onDetail={setSelectedClub}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : filterResult.clubs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-14 text-center">
              <p className="text-base font-semibold text-foreground">
                조건에 맞는 동호회가 없습니다.
              </p>
              <p className="mt-1 text-sm text-pul-muted">
                필터를 변경하거나 검색어를 수정해 보세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
              {filterResult.clubs.map((club) => (
                <ClubCard
                  key={club.id}
                  club={club}
                  onApply={handleApply}
                  onDetail={setSelectedClub}
                />
              ))}
            </div>
          )}
        </section>

        <ClubPartnerBanner
          banner={resolveClubPartnerBanner({
            province: filters.province === "전체" ? "전체" : filters.province,
            district: "전체",
          })}
          onInquiry={() => setInfoModal("partner")}
          showPriority={filters.province !== "전체"}
        />

        <ClubRegisterGuide onRegister={() => setInfoModal("register")} />

        <aside className="rounded-lg border border-pul-border/80 bg-white px-3 py-3 text-xs leading-relaxed text-pul-muted lg:px-4 lg:py-3.5 lg:text-sm">
          <p>{CLUB_PAGE_DISCLAIMER}</p>
        </aside>
      </div>

      <ClubDetailModal
        club={selectedClub}
        onClose={() => setSelectedClub(null)}
        onApply={handleApply}
        onReport={handleReport}
      />

      {infoModal === "apply" && (
        <InfoModal
          title="가입 신청"
          message={`${actionClub?.name ?? "동호회"} 가입 신청\n\n${CLUB_JOIN_APPLICATION_MESSAGE}\n\n${CLUB_MINI_BOARD_APPROVAL_MESSAGE}`}
          onClose={() => {
            setInfoModal(null);
            setActionClub(null);
          }}
        />
      )}

      {infoModal === "register" && (
        <InfoModal
          title="동호회 등록 문의"
          message="PUL 동호회 등록 기능은 준비 중입니다. Google Form을 통해 임시 등록 문의가 가능합니다."
          actionLabel="등록 문의 양식"
          actionHref={CLUB_REGISTER_FORM_URL}
          onClose={() => setInfoModal(null)}
        />
      )}

      {infoModal === "partner" && (
        <InfoModal
          title="제휴 · 입점 문의"
          message={CLUB_PARTNER_INQUIRY_MESSAGE}
          actionLabel="문의 양식"
          actionHref={CLUB_PARTNER_INQUIRY_URL}
          onClose={() => setInfoModal(null)}
        />
      )}

      {infoModal === "report" && (
        <InfoModal
          title="신고하기"
          message={`${actionClub?.name ?? "동호회"} 관련 신고는 운영자 확인 후 처리됩니다. 정식 오픈 전에는 PUL 문의 채널로 접수해 주세요.`}
          onClose={() => {
            setInfoModal(null);
            setActionClub(null);
          }}
        />
      )}
    </>
  );
}
