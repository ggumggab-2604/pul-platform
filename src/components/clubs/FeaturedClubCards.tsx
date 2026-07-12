import { ClubCard } from "@/components/clubs/ClubCard";
import type { ParkGolfClub } from "@/types";

type FeaturedClubCardsProps = {
  clubs: ParkGolfClub[];
  onApply: (club: ParkGolfClub) => void;
  onDetail: (club: ParkGolfClub) => void;
  /** 모바일 첫 화면 노출 개수 (기본 4) */
  mobileVisibleCount?: number;
};

export function FeaturedClubCards({
  clubs,
  onApply,
  onDetail,
  mobileVisibleCount = 4,
}: FeaturedClubCardsProps) {
  const mobileClubs = clubs.slice(0, mobileVisibleCount);
  const pcClubs = clubs.slice(0, 4);

  return (
    <section>
      <div className="mb-3 lg:mb-4">
        <h2 className="text-lg font-bold text-foreground lg:text-xl">추천 동호회</h2>
        <p className="mt-0.5 text-xs text-pul-muted lg:mt-1 lg:text-sm">
          PUL에서 추천하는 활발한 파크골프 동호회입니다.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:hidden">
        {mobileClubs.map((club) => (
          <ClubCard
            key={club.id}
            club={club}
            onApply={onApply}
            onDetail={onDetail}
            featured
          />
        ))}
      </div>
      <div className="hidden grid-cols-1 gap-2 lg:grid lg:grid-cols-4 lg:gap-4">
        {pcClubs.map((club) => (
          <ClubCard
            key={club.id}
            club={club}
            onApply={onApply}
            onDetail={onDetail}
            featured
          />
        ))}
      </div>
    </section>
  );
}
