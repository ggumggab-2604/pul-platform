"use client";
import { useEffect, useState, type ReactNode } from "react";
import { getMarketContentAction } from "@/app/market/contentActions";
import { contentUnavailable, type ContentKey, type ContentRevision, type ContentSnapshot } from "@/lib/market/marketContent";

export function MarketContentBody({ revision }: { revision: ContentRevision }) {
  const c = revision.content;
  return <article className="min-w-0 space-y-5 break-words text-base leading-7" data-market-policy-version={revision.consentVersion ?? undefined}>
    <h2 className="text-xl font-bold">{c.title}</h2>
    {revision.effectiveNotice ? <p className="rounded-lg bg-pul-page p-3 text-sm text-pul-muted">{revision.effectiveNotice}</p> : null}
    {c.intro ? <p className="whitespace-pre-wrap text-pul-muted">{c.intro}</p> : null}
    {c.body ? <p className="whitespace-pre-wrap">{c.body}</p> : null}
    {c.sections.map((section, i) => <section key={i}><h3 className="font-bold">{section.title}</h3><p className="mt-2 whitespace-pre-wrap text-pul-muted">{section.description}</p><ul className="mt-3 list-disc space-y-2 pl-5">{section.items.map((text, j) => <li className="whitespace-pre-wrap" key={j}>{text}</li>)}</ul></section>)}
    {c.attachments.length ? <section><h3 className="font-bold">첨부 자료</h3><ul>{c.attachments.map((id, i) => <li key={id}><a className="inline-flex min-h-11 items-center text-pul-point underline" href={`/market/content-media/${id}`} target="_blank" rel="noreferrer">첨부 {i + 1} 열기</a></li>)}</ul></section> : null}
    {revision.key === "policy" ? <p className="border-t border-pul-border pt-4 text-sm">운영 주체: PUL 운영자<br />문의·결과 확인·이의신청: <a href="mailto:pulpark.help@gmail.com" className="break-all text-pul-point underline">pulpark.help@gmail.com</a></p> : null}
  </article>;
}
export function MarketManagedSlot({ contentKey, children, footer }: { contentKey: ContentKey; children: ReactNode; footer?: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ContentSnapshot | null>(null), [error, setError] = useState("");
  const reload = () => { setError(""); getMarketContentAction().then(r => r.ok ? setSnapshot(r.snapshot) : setError(r.message)).catch(() => setError(contentUnavailable)); };
  useEffect(() => { let active = true; getMarketContentAction().then(r => { if (active) { if (r.ok) setSnapshot(r.snapshot); else setError(r.message); } }).catch(() => { if (active) setError(contentUnavailable); }); return () => { active = false; }; }, []);
  if (error) return <div role="alert" className="rounded-xl border border-pul-border p-4"><p>{error}</p><button className="min-h-11 underline" onClick={reload}>다시 확인</button></div>;
  if (!snapshot) return <p role="status" className="p-4">안내를 불러오는 중…</p>;
  if (snapshot.mode === "legacy") return children;
  const revision = snapshot.current[contentKey];
  return revision?.content.visible ? <div className="rounded-xl border border-pul-border bg-white p-4"><MarketContentBody revision={revision} />{footer}</div> : null;
}
