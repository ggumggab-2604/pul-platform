import { ClubsPageContent } from "@/components/clubs/ClubsPageContent";
import { ClubsPageHero } from "@/components/clubs/ClubsPageHero";
import { Container } from "@/components/ui/Container";
import type { PublicClubFilters, PublicClubPage } from "@/lib/clubs/clubDirectory";

type ClubsPageShellProps = { page: PublicClubPage; filters: PublicClubFilters; pageNumber: number; error?: string };

export function ClubsPageShell(props: ClubsPageShellProps) {
  return (
    <div className="bg-pul-page">
      <Container className="px-2 pt-3 sm:px-3 sm:pt-4"><ClubsPageHero /></Container>
      <Container className="px-3 py-4 lg:py-6"><ClubsPageContent {...props} /></Container>
    </div>
  );
}
