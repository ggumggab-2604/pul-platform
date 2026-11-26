import Link from "next/link";

export function AccountingBodyLink({ body }: { body: string }) {
  const match = body.match(/\n\n(\/accounting\/(?:(?:shared|payment)\/[a-f0-9-]{36}|(?:club|tournament|university|course)\/[a-f0-9-]{36}(?:\/entry\/[a-f0-9-]{36})?))$/);
  if (!match || match.index === undefined) return body;
  return <>{body.slice(0, match.index)}{"\n\n"}<Link className="font-bold text-pul-deep underline underline-offset-4" href={match[1]} prefetch={false}>
    {match[1].includes("/shared/") ? "정산표 열기" : match[1].includes("/payment/") ? "내 납부 요청 열기" : "회계장부 열기"}
  </Link></>;
}

