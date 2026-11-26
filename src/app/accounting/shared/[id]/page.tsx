import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { MemberReport } from "@/components/accounting/Reports";
import { PrintButton } from "@/components/accounting/WorkspaceForms";
import { buttonClass, panelClass } from "@/components/accounting/styles";
import { isId, timestamp, type Summary } from "@/lib/accounting/model";
import { accountingSession } from "@/lib/accounting/server";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const { supabase } = await accountingSession("/accounting/shared/" + id);
  const result = await supabase.rpc("get_accounting_publication", { p_id: id });
  if (result.error) notFound();
  const row = result.data as { previous_id: string | null; is_correction: boolean; superseded: boolean; latest_correction_id: string | null; owner_name: string; snapshot: Summary; created_at: string };
  return <Container className="max-w-4xl space-y-4 px-3 py-6 pb-24">
    <div className="flex flex-wrap gap-2"><Link className={buttonClass} href="/accounting">공유받은 정산표</Link><PrintButton /></div>
    <article id="accounting-print" className={panelClass}>
      <h1 className="text-2xl font-black text-pul-deep">{row.is_correction ? "회원용 정정 정산표" : "회원용 정산표"}</h1>
      <p className="break-words font-bold">{row.owner_name}</p>
      <p>발행 · {timestamp(row.created_at)}</p>
      {row.superseded && <p className="font-semibold">이전 발행본</p>}
      {row.latest_correction_id && <p className="print:hidden">
        <Link href={"/accounting/shared/" + row.latest_correction_id} prefetch={false} className="font-bold underline">열람할 수 있는 최신 정정본</Link>
      </p>}
      {row.previous_id && <Link href={"/accounting/shared/" + row.previous_id} className="font-bold underline">이전 발행본 열기</Link>}
      <MemberReport report={row.snapshot} />
    </article>
  </Container>;
}


