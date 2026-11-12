import { videoLessonCategoryLabels } from "@/data/videoLessonData";

const menuItems = [
  { tab: "free-videos", title: "무료 영상", description: "기술별로 여러 교습가의 영상을 찾아보세요." },
  { tab: "instructor-promotion", title: "교습가 채널", description: "교습가의 유튜브 채널과 대표 영상을 둘러보세요." },
  { tab: "paid-lessons", title: "필드·오프라인 레슨", description: "레슨 장소와 교육 일정을 확인하고 문의하세요." },
  { tab: "university-departments", title: "대학·평생교육", description: "파크골프 관련 대학·학과와 입학 안내를 찾아보세요." },
];

const videoShortcuts = ["basic_stance", "tee_shot", "putting", "practical_strategy"] as const;

export function isLessonDetailTab(tab: string | null) {
  return tab === "intro-guide" || menuItems.some((item) => item.tab === tab);
}

// Full page navigation preserves Back during Next.js hydration after a reload.
export function LessonsMenu() {
  return (
    <>
      <nav aria-label="레슨·교육 메뉴" className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:gap-4">
        {menuItems.map(({ tab, title, description }) => (
          <a
            key={tab}
            href={`/lessons?tab=${tab}`}
            className="flex min-h-24 flex-col justify-center rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)] transition-colors hover:border-pul-point/40 hover:bg-pul-light/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point lg:min-h-32 lg:p-6"
          >
            <h2 className="text-lg font-bold text-pul-deep lg:text-xl">{title}</h2>
            <p className="mt-1 text-sm leading-snug text-pul-muted">{description}</p>
          </a>
        ))}
      </nav>
      <nav aria-label="무료 영상 바로가기" className="flex flex-wrap items-center gap-2">
        <p className="mr-1 text-sm font-bold text-pul-deep">무료 영상 바로가기</p>
        {videoShortcuts.map((category) => (
          <a
            key={category}
            href={`/lessons?tab=free-videos&videoCategory=${category}`}
            className="inline-flex min-h-11 items-center rounded-full border border-pul-border bg-white px-3 text-sm font-semibold text-pul-deep hover:bg-pul-light"
          >
            {videoLessonCategoryLabels[category]}
          </a>
        ))}
      </nav>
      <a href="/lessons?tab=intro-guide" className="inline-flex min-h-11 flex-wrap items-center gap-x-1.5 py-2 text-sm text-pul-muted hover:text-pul-deep">
        파크골프가 처음이신가요? <span className="font-bold text-pul-deep underline underline-offset-4">→ 입문 가이드 보기</span>
      </a>
    </>
  );
}
