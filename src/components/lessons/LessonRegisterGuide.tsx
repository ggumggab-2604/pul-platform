import {
  LESSON_REGISTER_FORM_URL,
  lessonRegisterNotes,
} from "@/data/lessonData";
import { Icon } from "@/components/ui/Icon";

type LessonRegisterGuideProps = {
  onRegister: () => void;
  title?: string;
  description?: string;
  buttonLabel?: string;
  notes?: string[];
};

export function LessonRegisterGuide({
  onRegister,
  title = "강사·교육기관 등록 안내",
  description = "PUL에 교육 정보를 등록할 수 있습니다.",
  buttonLabel = "등록 문의",
  notes = lessonRegisterNotes,
}: LessonRegisterGuideProps) {
  const mobileNotes = notes.slice(0, 2);

  return (
    <section className="rounded-xl border border-pul-border bg-white p-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
      <div className="mb-2 flex items-center gap-2 lg:mb-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pul-light text-pul-deep lg:h-9 lg:w-9">
          <Icon name="doc" className="h-3.5 w-3.5 lg:h-5 lg:w-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground lg:text-lg">{title}</h2>
          <p className="text-[10px] text-pul-muted lg:text-sm">{description}</p>
        </div>
      </div>

      <ul className="space-y-1 lg:hidden">
        {mobileNotes.map((note) => (
          <li
            key={note}
            className="flex items-start gap-1.5 rounded-md bg-[#fafbfa] px-2 py-1 text-[11px] leading-snug text-foreground"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-pul-point" />
            {note}
          </li>
        ))}
      </ul>

      <ul className="hidden space-y-2.5 lg:block">
        {notes.map((note) => (
          <li
            key={note}
            className="flex items-start gap-2 rounded-lg bg-[#fafbfa] px-3 py-2.5 text-sm leading-relaxed text-foreground"
          >
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pul-point" />
            {note}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onRegister}
        className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-lg bg-pul-point text-xs font-bold text-white transition-colors hover:bg-pul-deep lg:mt-4 lg:h-11 lg:w-auto lg:px-6 lg:text-sm"
      >
        {buttonLabel}
      </button>
      <a
        href={LESSON_REGISTER_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="sr-only"
      >
        교육 등록 양식
      </a>
    </section>
  );
}
