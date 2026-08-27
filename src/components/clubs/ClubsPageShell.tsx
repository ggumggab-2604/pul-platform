import { ClubsPageContent } from "@/components/clubs/ClubsPageContent";
import { ClubsPageHero } from "@/components/clubs/ClubsPageHero";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { Container } from "@/components/ui/Container";
import type { PublicClubFilters, PublicClubPage } from "@/lib/clubs/clubDirectory";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";

type ClubsPageShellProps = { page: PublicClubPage; filters: PublicClubFilters; pageNumber: number; error?: string; promotion: ActiveSlotPromotion | null; secondPromotion: ActiveSlotPromotion | null };

export function ClubsPageShell({ promotion, secondPromotion, ...contentProps }: ClubsPageShellProps) {
  return (
    <div className="bg-pul-page">
      <Container className="px-2 pt-3 sm:px-3 sm:pt-4"><ClubsPageHero /></Container>
      {promotion ? (
        <Container className="px-3 pt-3 lg:pt-5">
          <PromotionBanner promotion={promotion} variant="horizontal" />
        </Container>
      ) : null}
      <Container className="px-3 py-4 lg:py-6"><ClubsPageContent {...contentProps} /></Container>
      {secondPromotion ? (
        <Container className="px-3 pb-4 lg:pb-6">
          <PromotionBanner promotion={secondPromotion} variant="horizontal" />
        </Container>
      ) : null}
    </div>
  );
}
