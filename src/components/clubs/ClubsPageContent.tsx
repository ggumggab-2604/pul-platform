"use client";

import { ClubEventsSection } from "@/components/clubs/ClubEventsSection";
import { ClubCard } from "@/components/clubs/ClubCard";
import { ClubDetailModal } from "@/components/clubs/ClubDetailModal";
import { ClubPartnerBanner } from "@/components/clubs/ClubPartnerBanner";
import { ClubRecruitPostsSection } from "@/components/clubs/ClubRecruitPostsSection";
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
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { InfoModal } from "@/components/ui/InfoModal";
import {
  CLUB_DISTRICT_EMPTY_SUBTITLE,
  CLUB_DISTRICT_EMPTY_TITLE,
  CLUB_FEATURED_MOBILE_PREVIEW,
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
import { useEffect, useMemo, useState } from "react";

function getRegionSummary(filters: { province: string; district: string }) {
  if (filters.province === "전체") return "전국";
  if (filters.district === "전체") return filters.province;
  return `${filters.province} > ${filters.district}`;
}

export function ClubsPageContent({ registerSignal = 0 }: { registerSignal?: number }) {
  const [filters, setFilters] = useState(createDefaultClubFilters);
  const [selectedClub, setSelectedClub] = useState<ParkGolfClub | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [infoModal, setInfoModal] = useState<
    "apply" | "register" | "report" | "partner" | null
  >(null);
  const [actionClub, setActionClub] = useState<ParkGolfClub | null>(null);
  const [showAllClubs, setShowAllClubs] = useState(false);

  useEffect(() => {
    setShowAllClubs(false);
  }, [filters]);

  const filterResult = useMemo(
    () => filterClubsWithMeta(parkGolfClubs, filters),
    [filters],
  );

  const resolvedBanner = useMemo(
    () => resolveClubPartnerBanner(filters),
    [filters],
  );

  const featuredIds = useMemo(
    () =>
      new Set(
        featuredClubs.slice(0, CLUB_FEATURED_MOBILE_PREVIEW).map((club) => club.id),
      ),
    [],
  );

  /** 모바일 전체 목록 펼침 시에도 추천과 중복되지 않도록 제외 */
  const mobileListClubs = useMemo(
    () => filterResult.clubs.filter((club) => !featuredIds.has(club.id)),
    [filterResult.clubs, featuredIds],
  );

  const resetFilters = () => setFilters(createDefaultClubFilters());

  useEffect(() => {
    if (registerSignal > 0) {
      setInfoModal("register");
    }
  }, [registerSignal]);

  const handleApply = (club: ParkGolfClub) => {
    setActionClub(club);
    setInfoModal("apply");
  };

  const handleReport = (club: ParkGolfClub) => {
    setActionClub(club);
    setInfoModal("report");
  };

  const expandAllClubs = () => {
    setShowAllClubs(true);
    window.setTimeout(() => {
      document
        .getElementById("clubs-all-list")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
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
          mobileVisibleCount={CLUB_FEATURED_MOBILE_PREVIEW}
        />

        <ClubPartnerBanner
          banner={resolvedBanner}
          onInquiry={() => setInfoModal("partner")}
        />

        <ClubRecruitPostsSection
          clubs={filterResult.clubs}
          onApply={handleApply}
          onDetail={setSelectedClub}
        />

        {/* PC: 행사·월례회 유지 / 모바일: 숨김 (모집글로 대체) */}
        <ClubEventsSection clubs={parkGolfClubs} onClubDetail={setSelectedClub} />

        {/* 모바일: 첫 화면에는 전체 목록 미리보기 없음 → 더보기로 펼침 */}
        {!showAllClubs ? (
          <div className="lg:hidden">
            <button
              type="button"
              onClick={expandAllClubs}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-pul-border bg-white text-base font-bold text-pul-deep hover:bg-pul-light/70"
            >
              전체 동호회 보기 ({filterResult.clubs.length}곳) →
            </button>
          </div>
        ) : null}

        <section
          id="clubs-all-list"
          className={showAllClubs ? "scroll-mt-4" : "hidden scroll-mt-4 lg:block"}
        >
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
            <>
              {/* 모바일 펼침: 추천과 중복 제외 */}
              <div className="grid grid-cols-1 gap-2 lg:hidden">
                {mobileListClubs.map((club) => (
                  <ClubCard
                    key={club.id}
                    club={club}
                    onApply={handleApply}
                    onDetail={setSelectedClub}
                  />
                ))}
              </div>
              {/* PC: 전체 (기존과 동일) */}
              <div className="hidden grid-cols-1 gap-2 lg:grid lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
                {filterResult.clubs.map((club) => (
                  <ClubCard
                    key={club.id}
                    club={club}
                    onApply={handleApply}
                    onDetail={setSelectedClub}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* 모바일: 하단 파트너 배너 1회만 (상단과 중복 축소) */}
        <div className="hidden lg:block">
          <ClubPartnerBanner
            banner={resolveClubPartnerBanner({
              province: filters.province === "전체" ? "전체" : filters.province,
              district: "전체",
            })}
            onInquiry={() => setInfoModal("partner")}
            showPriority={filters.province !== "전체"}
          />
        </div>

        <div className="space-y-3 lg:hidden">
          <CollapsibleSection
            title="동호회 등록 안내"
            summary="PUL에 동호회 정보를 등록하는 방법을 확인하세요."
          >
            <ClubRegisterGuide onRegister={() => setInfoModal("register")} />
          </CollapsibleSection>
          <CollapsibleSection
            title="가입·이용 안내"
            summary="가입 신청 후 운영자 확인 절차를 안내합니다."
          >
            <ul className="space-y-2 text-sm leading-relaxed text-pul-muted">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
                <span>{CLUB_JOIN_APPLICATION_MESSAGE}</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
                <span>{CLUB_MINI_BOARD_APPROVAL_MESSAGE}</span>
              </li>
            </ul>
          </CollapsibleSection>
        </div>
        <div className="hidden lg:block">
          <ClubRegisterGuide onRegister={() => setInfoModal("register")} />
        </div>

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
