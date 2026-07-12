import { Card } from "@/components/ui/Card";
import { SectionMoreLink } from "@/components/ui/SectionMoreLink";
import { newClubs } from "@/data/homeData";
import Link from "next/link";

const clubThumbs = [
  "/images/banner-course.jpg",
  "/images/banner-community.jpg",
  "/images/banner-equipment.jpg",
  "/images/hero-park-golf.jpg",
];

const CORE_CARD_CLASS = "lg:h-full";

type NewClubSectionProps = {
  /** 모바일에서만 적용되는 노출 개수 (PC는 전체) */
  mobileLimit?: number;
};

export function NewClubSection({ mobileLimit }: NewClubSectionProps) {
  const clubs = newClubs;
  const mobileClubs = mobileLimit ? clubs.slice(0, mobileLimit) : clubs;

  return (
    <Card
      dense
      fullHeight
      className={CORE_CARD_CLASS}
      title="신규 등록 동호회"
      action={
        <Link
          href="/clubs"
          className="text-sm font-semibold text-pul-point hover:underline"
        >
          더보기
        </Link>
      }
      bodyClassName="flex flex-1 flex-col p-3.5"
    >
      <ul className="flex-1 space-y-1.5 lg:hidden">
        {mobileClubs.map((club, i) => (
          <ClubRow key={club.id} club={club} thumb={clubThumbs[i]} />
        ))}
      </ul>
      <ul className="hidden flex-1 space-y-1.5 lg:block">
        {clubs.map((club, i) => (
          <ClubRow key={club.id} club={club} thumb={clubThumbs[i]} />
        ))}
      </ul>
      {mobileLimit && clubs.length > mobileLimit ? (
        <SectionMoreLink href="/clubs" label="동호회 전체보기" mobileOnly />
      ) : null}
      <Link
        href="/clubs/register"
        className="mt-auto flex h-10 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-pul-point/45 text-sm font-bold text-pul-point transition-colors hover:border-pul-point hover:bg-pul-light/50"
      >
        + 동호회 등록하기
      </Link>
    </Card>
  );
}

function ClubRow({
  club,
  thumb,
}: {
  club: (typeof newClubs)[number];
  thumb: string;
}) {
  return (
    <li>
      <Link
        href={`/clubs/${club.id}`}
        className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-pul-border/60 hover:bg-pul-light/50"
      >
        <div
          className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-emerald-100 bg-cover bg-center ring-1 ring-emerald-200/70"
          style={{ backgroundImage: `url('${thumb}')` }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold">{club.name}</p>
            <span className="shrink-0 rounded bg-pul-light px-1.5 py-0.5 text-[10px] font-semibold text-pul-point">
              {club.tag}
            </span>
          </div>
          <p className="truncate text-xs text-pul-muted">
            {club.location} · 회원 {club.members}명
          </p>
        </div>
      </Link>
    </li>
  );
}
