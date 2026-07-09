"use client";

import { CertificationLinkBanner } from "@/components/lessons/CertificationLinkBanner";
import {
  INTRO_GUIDE_DISCLAIMER,
  introGuideCtaButtons,
  starterGuideAudienceLabels,
  starterGuideCards,
  starterGuideSectionCopy,
  starterPathOptions,
  starterPathSectionCopy,
  type StarterGuideAudience,
  type StarterGuideCard,
} from "@/data/beginnerGuideData";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/utils";
import Link from "next/link";

type LessonsIntroGuideTabProps = {
  onGoToFreeVideos: () => void;
  onGoToPaidLessons: () => void;
  onViewCertification: () => void;
};

const CARD_BASE =
  "flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4";
const SECTION_TITLE = "text-base font-bold text-foreground lg:text-lg";
const SECTION_DESC = "mt-2 text-xs leading-relaxed text-pul-muted lg:text-sm";

function scrollToSection(targetId: string) {
  document.getElementById(targetId)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function handleGuideDetail(id: string, title: string) {
  // TODO: 입문 가이드 상세 페이지 연결
  console.log("[intro-guide] 자세히 보기:", id, title);
}

function AudienceBadge({ audience }: { audience: StarterGuideAudience }) {
  const isGolf = audience === "golfExperienced";

  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold lg:text-[11px]",
        isGolf ? "bg-teal-50 text-teal-800" : "bg-pul-light text-pul-deep",
      )}
    >
      {starterGuideAudienceLabels[audience]}
    </span>
  );
}

function StarterGuideCardItem({
  card,
  sectionId,
}: {
  card: StarterGuideCard;
  sectionId?: string;
}) {
  return (
    <article id={sectionId} className={CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <AudienceBadge audience={card.audience} />
        <h4 className="mt-2 text-sm font-bold text-foreground lg:text-base">{card.title}</h4>
        <p className="mt-2 text-xs leading-relaxed text-pul-muted lg:text-sm">
          {card.summary}
        </p>
        <ul className="mt-3 space-y-1.5">
          {card.highlights.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-[11px] leading-snug text-foreground lg:text-sm"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => handleGuideDetail(card.id, card.title)}
        className="mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-pul-point text-[11px] font-bold text-white hover:bg-pul-deep lg:min-h-11 lg:text-xs"
      >
        자세히 보기
      </button>
    </article>
  );
}

export function LessonsIntroGuideTab({
  onGoToFreeVideos,
  onGoToPaidLessons,
  onViewCertification,
}: LessonsIntroGuideTabProps) {
  const handleCta = (href: string) => {
    if (href === "tab:free-videos") onGoToFreeVideos();
    if (href === "tab:paid-lessons") onGoToPaidLessons();
  };

  return (
    <div className="space-y-3 lg:space-y-5">
      <div className="rounded-xl border border-pul-border bg-white p-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
        <p className="text-[10px] font-bold tracking-[0.14em] text-pul-point lg:text-[11px]">
          GETTING STARTED
        </p>
        <h2 className="mt-1 text-lg font-bold text-foreground lg:text-xl">
          입문 가이드
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          파크골프를 처음 시작하는 분과 기존 골프 경험자를 위한 맞춤 안내입니다.
          골프장 찾기, 동호회, 무료 영상, 유료 레슨으로 이어지는 시작 경로를
          확인하세요.
        </p>
      </div>

      <section id="intro-starter-guides">
        <h3 className={SECTION_TITLE}>{starterGuideSectionCopy.title}</h3>
        <p className={SECTION_DESC}>{starterGuideSectionCopy.description}</p>
        <div className="mt-3 grid grid-cols-1 gap-2 lg:mt-4 lg:grid-cols-3 lg:gap-4">
          {starterGuideCards.map((card) => (
            <div key={card.id} className="h-full">
              <StarterGuideCardItem
                card={card}
                sectionId={
                  card.id === "starter-1"
                    ? "intro-absolute-beginner"
                    : card.id === "starter-5"
                      ? "intro-golf-experienced"
                      : undefined
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className={SECTION_TITLE}>{starterPathSectionCopy.title}</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 lg:mt-4 lg:grid-cols-3 lg:gap-4">
          {starterPathOptions.map((option) => (
            <article
              key={option.id}
              className="flex h-full flex-col rounded-xl border border-pul-border bg-[#fafbfa] p-3 lg:p-4"
            >
              <h4 className="text-sm font-bold text-foreground lg:text-base">
                {option.title}
              </h4>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
                {option.description}
              </p>
              <button
                type="button"
                onClick={() => scrollToSection(option.scrollTargetId)}
                className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep hover:bg-pul-light lg:min-h-11 lg:text-sm"
              >
                {option.buttonLabel}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-pul-border bg-gradient-to-br from-pul-light/40 to-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4">
        <div className="mb-2.5 flex items-center gap-2 lg:mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pul-point text-white lg:h-9 lg:w-9">
            <Icon name="flag" className="h-4 w-4 lg:h-5 lg:w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground lg:text-base">시작하기</h3>
            <p className="text-[11px] text-pul-muted lg:text-xs">
              바로 이동할 수 있는 다음 단계를 선택하세요.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {introGuideCtaButtons.map((cta) => {
            const isTab = cta.href.startsWith("tab:");
            if (isTab) {
              return (
                <button
                  key={cta.id}
                  type="button"
                  onClick={() => handleCta(cta.href)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-2 text-center text-[11px] font-bold leading-snug text-pul-deep transition-colors hover:border-pul-point/40 hover:bg-pul-light lg:min-h-12 lg:text-sm"
                >
                  {cta.label}
                </button>
              );
            }
            return (
              <Link
                key={cta.id}
                href={cta.href}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white px-2 text-center text-[11px] font-bold leading-snug text-pul-deep transition-colors hover:border-pul-point/40 hover:bg-pul-light lg:min-h-12 lg:text-sm"
              >
                {cta.label}
              </Link>
            );
          })}
        </div>
      </section>

      <CertificationLinkBanner variant="compact" onViewCertification={onViewCertification} />

      <p className="whitespace-pre-line rounded-xl border border-pul-border bg-[#fafbfa] px-3 py-3 text-[11px] leading-relaxed text-pul-muted lg:px-4 lg:py-4 lg:text-xs">
        {INTRO_GUIDE_DISCLAIMER}
      </p>
    </div>
  );
}
