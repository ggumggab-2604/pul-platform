import Link from "next/link";
import { Container } from "@/components/ui/Container";

export const certificationLink = "inline-flex min-h-11 items-center font-bold text-pul-point underline underline-offset-2";

export function CertificationDetailFrame({ title, back, wide = false, children }: { title: string; back: string; wide?: boolean; children: React.ReactNode }) {
  return <Container className={`px-3 py-6 sm:py-10 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
    <Link href={back} className={`mb-3 ${certificationLink}`}>← 목록으로</Link>
    <section className="space-y-5 rounded-xl border border-pul-border bg-white p-4 sm:p-8">
      <h1 className="break-words text-2xl font-bold text-pul-deep">{title}</h1>
      {children}
    </section>
  </Container>;
}

export function CertificationDetailFields({ fields }: { fields: readonly (readonly [string, string | null | undefined])[] }) {
  return <dl className="grid gap-3 sm:grid-cols-2">
    {fields.map(([name, value]) => <div key={name} className="min-w-0 rounded-lg border border-pul-border p-3">
      <dt className="text-sm font-semibold text-pul-muted">{name}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words">{value || "미등록"}</dd>
    </div>)}
  </dl>;
}
