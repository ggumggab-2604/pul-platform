import Image from "next/image";
import Link from "next/link";
import type { CourseResource } from "@/lib/courses/courseContent";
import type { MaterialKind } from "@/lib/courses/courseMaterialSelection";

const materialKinds = [["video", "동영상"], ["yardage", "야디지북"]] as const;

export function CourseMaterialTabs({ kind, counts, href }: {
  kind: MaterialKind;
  counts?: Record<MaterialKind, number>;
  href: (kind: MaterialKind) => string;
}) {
  return <nav aria-label="코스 자료 종류" className="flex gap-2 border-b border-pul-border pb-2.5">
    {materialKinds.map(([value, label]) => {
      const active = value === kind;
      return <Link key={value} href={href(value)} scroll={false} prefetch={false} aria-current={active ? "true" : undefined}
        className={"inline-flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point " +
          (active ? "border-pul-deep bg-pul-deep text-white" : "border-pul-border bg-white text-pul-deep hover:bg-pul-light")}>
        {label}
        {counts && <span className={"rounded-full px-2 py-0.5 text-xs tabular-nums " + (active ? "bg-white/20" : "bg-pul-page")}>{counts[value]}</span>}
      </Link>;
    })}
  </nav>;
}

export function YardageCardContent({ title, images }: Pick<CourseResource, "title" | "images">) {
  return <>
    <div className="aspect-[2.25] border-b border-pul-border bg-pul-page p-2" aria-hidden="true">
      {images[0] && <Image unoptimized width={600} height={338} src={"/courses/resource-images/" + images[0].id}
        className="h-full w-full object-contain" alt="" />}
    </div>
    <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-sm sm:px-3">
      <div className="min-w-0">
        <p className="leading-5 font-bold break-words">{title}</p>
        {images.length > 0 && <p className="mt-0.5 text-xs text-pul-muted">{images.length}장</p>}
      </div>
      <span aria-hidden="true" className="shrink-0 text-xs font-bold">보기</span>
    </div>
  </>;
}
