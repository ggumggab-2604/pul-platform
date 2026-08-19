import Link from "next/link";
import { Trophy } from "lucide-react";

import type { HallOfFamePublicBadge } from "@/lib/hall-of-fame/hallOfFameMemberUi";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_ACHIEVEMENTS = 2;

function achievementLabel(achievement: HallOfFamePublicBadge): string {
  return `${achievement.name} ${achievement.sourceCount}회`;
}

export function HallOfFameAchievementBadges({
  achievements,
  className,
}: {
  achievements: readonly HallOfFamePublicBadge[];
  className?: string;
}) {
  if (achievements.length === 0) return null;

  const visibleAchievements = achievements.slice(0, MAX_VISIBLE_ACHIEVEMENTS);
  const hiddenCount = achievements.length - visibleAchievements.length;
  const fullLabel = `명예의 전당 성취: ${achievements.map(achievementLabel).join(" · ")}`;

  return (
    <Link
      href="/hall-of-fame"
      aria-label={fullLabel}
      title={fullLabel}
      className={cn(
        "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-sm font-bold text-amber-900 outline-none hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2",
        className,
      )}
    >
      <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span aria-hidden="true" className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {visibleAchievements.map((achievement, index) => (
          <span key={achievement.code} className="whitespace-nowrap">
            {index > 0 ? <span className="mr-1.5 text-amber-600">·</span> : null}
            {achievementLabel(achievement)}
          </span>
        ))}
        {hiddenCount > 0 ? <span className="whitespace-nowrap">+{hiddenCount}</span> : null}
      </span>
    </Link>
  );
}
