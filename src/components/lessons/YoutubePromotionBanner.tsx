type YoutubePromotionBannerProps = {
  onRegister: () => void;
};

export function YoutubePromotionBanner({ onRegister }: YoutubePromotionBannerProps) {
  return (
    <aside
      data-ad-slot="youtube-lesson-promotion"
      className="rounded-lg border border-dashed border-pul-point/30 bg-gradient-to-r from-pul-light/40 via-white to-emerald-50/50 px-2.5 py-2.5 lg:rounded-xl lg:px-4 lg:py-4"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-pul-deep lg:text-base">
            유튜브 강의 홍보를 원하시나요?
          </h3>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-pul-muted max-lg:line-clamp-1 lg:line-clamp-none lg:text-sm lg:leading-relaxed">
            <span className="lg:hidden">
              파크골프 강사·채널 운영자는 자신의 영상을 PUL에 소개할 수 있습니다.
            </span>
            <span className="max-lg:hidden">
              파크골프 강사·채널 운영자는 자신의 대표 영상과 채널을 PUL에 소개할 수
              있습니다. 초기에는 운영자 확인 후 수동 등록합니다.
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onRegister}
          className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-lg bg-pul-point px-4 text-sm font-bold text-white transition-colors hover:bg-pul-deep max-lg:min-h-11 lg:h-11 lg:w-auto lg:text-sm"
        >
          영상 등록 문의
        </button>
      </div>
    </aside>
  );
}
