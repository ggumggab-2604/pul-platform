import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "회원 탈퇴" };

export default async function WithdrawalPage() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/login?next=%2Fmy%2Fwithdraw");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <section aria-labelledby="withdrawal-title" className="space-y-4 rounded-2xl border border-pul-border bg-white p-6 text-base leading-7">
        <h1 id="withdrawal-title" className="text-2xl font-bold">회원 탈퇴</h1>
        <p>현재 앱에서 직접 탈퇴를 처리할 수 없습니다. 탈퇴 요청과 처리 상태 확인은 PUL 운영자에게 이메일로 문의해 주세요.</p>
        <a href="mailto:pulpark.help@gmail.com" className="inline-flex min-h-11 items-center break-all font-semibold text-pul-deep underline">pulpark.help@gmail.com</a>
        <div className="flex flex-wrap gap-x-4">
          <Link href="/my?view=settings" className="inline-flex min-h-11 items-center font-semibold underline">계속 이용하기</Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center underline">개인정보처리방침</Link>
        </div>
      </section>
    </main>
  );
}
