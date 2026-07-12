"use client";

import { FeaturedYoutubeInstructors } from "@/components/lessons/FeaturedYoutubeInstructors";
import { LessonRegisterGuide } from "@/components/lessons/LessonRegisterGuide";
import { VideoLessonRegisterGuide } from "@/components/lessons/VideoLessonRegisterGuide";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import {
  instructorPromoRegisterNotes,
  instructorPromotionNotes,
} from "@/data/lessonData";

type LessonsInstructorPromotionTabProps = {
  onVideoRegister: () => void;
  onLessonRegister: () => void;
  onPartnerInquiry: () => void;
};

export function LessonsInstructorPromotionTab({
  onVideoRegister,
  onLessonRegister,
  onPartnerInquiry,
}: LessonsInstructorPromotionTabProps) {
  return (
    <div className="space-y-3 lg:space-y-5">
      <div className="rounded-xl border border-pul-border bg-white p-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
        <p className="text-[10px] font-bold tracking-[0.14em] text-pul-point lg:text-[11px]">
          INSTRUCTOR PROMOTION
        </p>
        <h2 className="mt-1 text-lg font-bold text-foreground lg:text-xl">
          교습가 홍보
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          유튜브 교습가, 레슨 강사, 아카데미가 자신의 채널과 레슨 프로그램을 PUL에
          소개할 수 있습니다. 자격증·심판 과정 등록은 별도 「자격증·심판」 메뉴에서
          다룹니다.
        </p>
      </div>

      <FeaturedYoutubeInstructors
        title="추천 유튜브 교습가 미리보기"
        className="mb-0"
      />

      <div className="lg:hidden">
        <CollapsibleSection
          title="유튜브·레슨 등록 안내"
          summary="채널·레슨 홍보 등록 방법과 노출 안내를 확인하세요."
        >
          <div className="space-y-3">
            <VideoLessonRegisterGuide onRegister={onVideoRegister} />
            <section className="rounded-xl border border-pul-border bg-[#fafbfa] p-2.5">
              <h3 className="text-sm font-bold text-foreground">
                추천 교습가·채널 노출 안내
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-pul-muted">
                입문자에게 도움이 되는 유튜브 채널을 PUL이 선별해 소개합니다. 무료
                영상 탭 상단에서 추천 교습가가 노출됩니다.
              </p>
              <ul className="mt-2 space-y-1">
                {instructorPromotionNotes.map((note) => (
                  <li
                    key={note}
                    className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point" />
                    {note}
                  </li>
                ))}
              </ul>
            </section>
            <LessonRegisterGuide
              onRegister={onLessonRegister}
              title="레슨 강사·아카데미 홍보 등록 안내"
              description="파크골프 레슨 강사, 유튜브 교습가, 아카데미, 동호회 교육 담당자는 PUL에 자신의 레슨·영상·교육 프로그램을 홍보할 수 있습니다."
              buttonLabel="홍보 등록 문의"
              notes={instructorPromoRegisterNotes}
            />
          </div>
        </CollapsibleSection>
      </div>

      <div className="hidden space-y-5 lg:block">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <VideoLessonRegisterGuide onRegister={onVideoRegister} />

          <section className="rounded-xl border border-pul-border bg-[#fafbfa] p-2.5 lg:p-4">
            <h3 className="text-sm font-bold text-foreground lg:text-base">
              추천 교습가·채널 노출 안내
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
              입문자에게 도움이 되는 유튜브 채널을 PUL이 선별해 소개합니다. 무료
              영상 탭 상단에서 추천 교습가가 노출됩니다.
            </p>
            <ul className="mt-2 space-y-1">
              {instructorPromotionNotes.slice(0, 2).map((note) => (
                <li
                  key={note}
                  className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground lg:text-sm"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point" />
                  {note}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <LessonRegisterGuide
          onRegister={onLessonRegister}
          title="레슨 강사·아카데미 홍보 등록 안내"
          description="파크골프 레슨 강사, 유튜브 교습가, 아카데미, 동호회 교육 담당자는 PUL에 자신의 레슨·영상·교육 프로그램을 홍보할 수 있습니다."
          buttonLabel="홍보 등록 문의"
          notes={instructorPromoRegisterNotes}
        />
      </div>

      <div className="lg:hidden">
        <CollapsibleSection
          title="유료 홍보 슬롯 (예정)"
          summary="추천 노출·배너 등 유료 홍보 상품 안내"
        >
          <p className="text-sm leading-relaxed text-pul-muted">
            카테고리별 대표 강사 상단 노출, 추천 채널 배너 등 유료 홍보 상품을
            준비 중입니다. 레슨 강사·유튜브 채널 홍보 문의를 남겨 주시면 오픈 시
            안내드립니다.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-pul-muted">
            초기에는 우수한 무료 영상 제공자와 활동 교습가를 우선 소개하고, 향후에는
            추천 채널, 대표 영상, 카테고리 상단 노출 등의 홍보 상품으로 확장할 수
            있습니다.
          </p>
          <button
            type="button"
            onClick={onPartnerInquiry}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-orange-200 bg-white px-4 text-base font-bold text-pul-deep hover:bg-orange-50"
          >
            홍보·제휴 문의
          </button>
        </CollapsibleSection>
      </div>

      <section className="hidden rounded-xl border border-dashed border-orange-200/70 bg-gradient-to-r from-orange-50/50 via-white to-pul-light/30 p-2.5 lg:block lg:p-4">
        <h3 className="text-sm font-bold text-foreground lg:text-base">
          유료 홍보 슬롯 (예정)
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          카테고리별 대표 강사 상단 노출, 추천 채널 배너 등 유료 홍보 상품을
          준비 중입니다. 레슨 강사·유튜브 채널 홍보 문의를 남겨 주시면 오픈 시
          안내드립니다.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-pul-muted lg:text-sm">
          초기에는 우수한 무료 영상 제공자와 활동 교습가를 우선 소개하고, 향후에는
          추천 채널, 대표 영상, 카테고리 상단 노출 등의 홍보 상품으로 확장할 수
          있습니다.
        </p>
        <button
          type="button"
          onClick={onPartnerInquiry}
          className="mt-2.5 inline-flex min-h-10 items-center justify-center rounded-lg border border-orange-200 bg-white px-4 text-xs font-bold text-pul-deep hover:bg-orange-50 lg:min-h-11 lg:text-sm"
        >
          홍보·제휴 문의
        </button>
      </section>
    </div>
  );
}
