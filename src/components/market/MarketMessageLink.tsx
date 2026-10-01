import Link from "next/link";

export function MarketMessageLink({ listingId, owner, status, authenticated, compact = false }: { listingId: string; owner: boolean; status: string; authenticated: boolean; compact?: boolean }) {
  if (owner || !["selling", "reserved"].includes(status)) return null;
  const compose = `/messages/new?listing=${encodeURIComponent(listingId)}`;
  return <Link prefetch={false} href={authenticated ? compose : `/login?next=${encodeURIComponent(compose)}`}
    className={`inline-flex min-h-11 max-w-full items-center justify-center rounded-lg bg-pul-point px-4 py-2 font-bold text-white ${compact ? "flex-1 whitespace-nowrap" : "mt-4"}`}>쪽지 보내기</Link>;
}
