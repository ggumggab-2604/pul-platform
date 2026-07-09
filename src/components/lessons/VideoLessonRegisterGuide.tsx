import {
  VIDEO_LESSON_REGISTER_FORM_URL,
  VIDEO_LESSON_REGISTER_NOTES,
} from "@/data/videoLessonData";
import { Icon } from "@/components/ui/Icon";

const mobileNotes = VIDEO_LESSON_REGISTER_NOTES.slice(0, 2);

type VideoLessonRegisterGuideProps = {
  onRegister: () => void;
};

export function VideoLessonRegisterGuide({
  onRegister,
}: VideoLessonRegisterGuideProps) {
  return (
    <section className="rounded-xl border border-dashed border-pul-point/30 bg-gradient-to-br from-pul-light/30 to-white p-2.5 lg:p-5">
      <div className="mb-2 flex items-center gap-2 lg:mb-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-pul-deep shadow-sm ring-1 ring-pul-border/60 lg:h-9 lg:w-9">
          <Icon name="news" className="h-4 w-4 lg:h-5 lg:w-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground lg:text-lg">
            유튜브 강의 등록 안내
          </h2>
          <p className="text-[10px] text-pul-muted lg:text-sm">
            YouTube 링크로 PUL에 영상을 소개할 수 있습니다.
          </p>
        </div>
      </div>

      <ul className="space-y-1 lg:hidden">
        {mobileNotes.map((note) => (
          <li
            key={note}
            className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point" />
            {note}
          </li>
        ))}
      </ul>

      <ul className="hidden space-y-2 lg:block">
        {VIDEO_LESSON_REGISTER_NOTES.map((note) => (
          <li
            key={note}
            className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
          >
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
            {note}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onRegister}
        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg border border-pul-point/40 bg-white text-xs font-bold text-pul-deep transition-colors hover:bg-pul-light lg:mt-4 lg:h-11 lg:w-auto lg:px-6 lg:text-sm"
      >
        영상 등록 문의
      </button>
      <a
        href={VIDEO_LESSON_REGISTER_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="sr-only"
      >
        영상 등록 문의 양식
      </a>
    </section>
  );
}
