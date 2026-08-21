import { CourseDiscussionSection } from "@/components/courses/CourseDiscussionSection";
import { Container } from "@/components/ui/Container";
import { CourseDirectoryError, getPublicCourse } from "@/lib/courses/courseDirectory";
import {
  CourseDiscussionError,
  listPublicCourseDiscussionPosts,
} from "@/lib/courses/courseDiscussions";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

const PAGE_SIZE = 20;

function pageNumber(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

export default async function CourseStoriesPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const currentPage = pageNumber(query.page);
  const offset = (currentPage - 1) * PAGE_SIZE;
  let course;
  let discussionPage;

  try {
    const client = await createClient();
    [course, discussionPage] = await Promise.all([
      getPublicCourse(client, id),
      listPublicCourseDiscussionPosts(client, id, PAGE_SIZE, offset),
    ]);
  } catch (error) {
    if (
      (error instanceof CourseDirectoryError || error instanceof CourseDiscussionError) &&
      error.code === "notFound"
    ) notFound();
    throw error;
  }

  if (currentPage > 1 && discussionPage.items.length === 0) notFound();

  return (
    <div className="bg-pul-page">
      <Container className="max-w-4xl px-3 py-5 sm:py-8">
        <nav aria-label="경로" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-pul-muted">
          <Link href="/courses" className="font-medium hover:text-pul-point">골프장</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/courses/${course.courseKey}`} className="font-medium hover:text-pul-point">{course.name}</Link>
          <span aria-hidden="true">›</span>
          <span className="font-semibold text-foreground">이야기방</span>
        </nav>

        <CourseDiscussionSection courseKey={course.courseKey} courseName={course.name} page={discussionPage} full />

        {currentPage > 1 || discussionPage.hasMore ? (
          <nav aria-label="이야기방 페이지" className="mt-5 flex items-center justify-between gap-3">
            {currentPage > 1 ? <Link href={currentPage === 2 ? `/courses/${course.courseKey}/stories` : `/courses/${course.courseKey}/stories?page=${currentPage - 1}`} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep">이전</Link> : <span />}
            <span className="text-sm font-bold text-pul-muted">{currentPage}페이지</span>
            {discussionPage.hasMore ? <Link href={`/courses/${course.courseKey}/stories?page=${currentPage + 1}`} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border bg-white px-4 font-bold text-pul-deep">다음</Link> : <span />}
          </nav>
        ) : null}
      </Container>
    </div>
  );
}
