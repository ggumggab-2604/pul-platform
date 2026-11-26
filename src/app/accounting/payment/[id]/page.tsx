import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { buttonClass, fieldClass, panelClass } from "@/components/accounting/styles";
import { isId, routes, statuses, today, won, type MemberPayment } from "@/lib/accounting/model";
import { accountingSession } from "@/lib/accounting/server";
import { respondToAccountingPayment } from "../../actions";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ failed?: string }> }) {
  const { id } = await params;
  if (!isId(id)) notFound();
  const { supabase } = await accountingSession("/accounting/payment/" + id);
  const result = await supabase.rpc("get_accounting_payment", { p_id: id });
  if (result.error) notFound();
  const p = result.data as MemberPayment;
  const collect = p.route === "standard" || p.route === "agency";
  const canRespond = collect && today() >= p.starts && !["paid", "exempt", "cancelled", "refunded"].includes(p.status);
  const failed = (await searchParams).failed;
  return <Container className="max-w-3xl px-3 py-6 pb-24">
    <article className={panelClass}>
      <h1 className="break-words text-2xl font-black text-pul-deep">{p.title}</h1>
      <p>{p.starts} ~ {p.due} · {won(p.amount)} · {routes[p.route]}</p>
      {p.period_start && <p>대상 기간 · {p.period_start} ~ {p.period_end}</p>}
      <p className="whitespace-pre-wrap break-words">{p.guidance}</p>
      {p.link && <a className={buttonClass} href={p.link} target="_blank" rel="noreferrer">공식 납부 안내 열기</a>}
      {collect && <p className="font-bold">{statuses[p.status]} · 확인 {won(p.paid)} · 환불 {won(p.refunded)}</p>}
      {failed && <p role="alert">납부 응답을 저장하지 못했습니다.</p>}
      {canRespond && p.status !== "pending" && <form action={respondToAccountingPayment.bind(null, id)}><button className={buttonClass} name="ack" value="yes">입금했어요</button></form>}
      {collect && today() >= p.starts && p.donation && <form className="flex flex-wrap gap-2" action={respondToAccountingPayment.bind(null, id)}>
        <label className="grid gap-1 text-sm font-bold">찬조 희망액 (원)<input name="pledge" className={fieldClass} type="number" min={0} max={1000000000000} required defaultValue={p.pledged ?? ""} /></label>
        <button className={buttonClass + " self-end"}>희망액 저장</button>
      </form>}
    </article>
  </Container>;
}

