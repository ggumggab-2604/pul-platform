import { ClubRegistrationForm } from "@/components/clubs/ClubRegistrationForm";
import { Container } from "@/components/ui/Container";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "동호회 등록",
  description: "PUL에 파크골프 동호회의 기본 공개 정보를 등록합니다.",
};

export default async function ClubRegistrationPage() {
  const client = await createClient();
  const { data } = await client.auth.getUser();
  if (!data.user) {
    redirect(`/login?next=${encodeURIComponent("/clubs/register")}`);
  }

  return (
    <div className="bg-pul-page">
      <Container className="max-w-3xl px-3 py-6 sm:py-10">
        <nav aria-label="경로" className="mb-4 flex items-center gap-1.5 text-sm text-pul-muted">
          <Link href="/clubs" className="font-semibold hover:text-pul-point">동호회</Link>
          <span aria-hidden="true">›</span>
          <span className="font-semibold text-foreground">등록</span>
        </nav>
        <section className="rounded-xl border border-pul-border bg-white p-5 shadow-sm sm:p-8">
          <p className="text-sm font-bold text-pul-point">PUL Clubs</p>
          <h1 className="mt-1 text-2xl font-bold text-pul-deep sm:text-3xl">동호회 등록</h1>
          <p className="mt-2 text-sm leading-relaxed text-pul-muted sm:text-base">
            공개 목록에 필요한 기본 정보만 입력합니다. 사진과 상세 운영 정보는 등록 후 기존 동호회 관리 기능에서 추가할 수 있습니다.
          </p>
          <div className="mt-6">
            <ClubRegistrationForm />
          </div>
        </section>
      </Container>
    </div>
  );
}
