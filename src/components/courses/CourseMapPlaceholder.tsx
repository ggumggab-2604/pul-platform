import { Icon } from "@/components/ui/Icon";

/**
 * 지도 연동 placeholder.
 * 추후 Kakao Maps 또는 Naver Maps SDK를 #course-map-root 에 마운트합니다.
 */
export function CourseMapPlaceholder() {
  return (
    <section aria-label="골프장 지도">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-foreground">지도에서 보기</h2>
        <p className="mt-1 text-sm text-pul-muted">
          골프장 위치를 지도에서 확인할 수 있습니다.
        </p>
      </div>

      <div
        id="course-map-root"
        data-map-provider="kakao"
        data-map-ready="false"
        className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-pul-point/30 bg-gradient-to-br from-pul-light via-white to-emerald-50 sm:h-72 lg:h-80"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(#0f766e 1px, transparent 1px), linear-gradient(90deg, #0f766e 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 px-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-pul-border">
            <Icon name="flag" className="h-7 w-7 text-pul-point" />
          </div>
          <p className="mt-3 text-base font-bold text-pul-deep">지도 연동 예정</p>
          <p className="mt-1 text-sm text-pul-muted">
            카카오맵 · 네이버지도 API 연동 준비 중입니다.
          </p>
        </div>
      </div>
    </section>
  );
}
