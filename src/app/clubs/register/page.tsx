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
            활동 구장, 모임·회비 안내와 연락 담당자를 함께 등록할 수 있습니다. 선택 정보는 비워 두어도 됩니다.
          </p>
          <div className="mt-6">
            <ClubRegistrationForm viewerId={data.user.id} />
          </div>
        </section>
      </Container>
    </div>
  );
}
