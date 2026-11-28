import Form from "next/form";
import Link from "next/link";
import { categoryLabels } from "@/data/marketData";
import { contentRpc } from "@/lib/courses/courseContent";
import { isDateOnly } from "@/lib/courses/courseSteward";
import { lostItemBack, lostItemButton, lostItemInput, lostItemRegions, lostItemsPath, type LostItemReport } from "@/lib/market/lostItems";
import { createClient } from "@/lib/supabase/server";
import { LostItemFacts } from "@/components/market/LostItemFacts";

export default async function LostItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const read = (key: string, length = 100) => typeof query[key] === "string" ? query[key].trim().slice(0, length) : "";
  const back = lostItemBack(query.back);
  const own = read("scope") === "mine";
  const filters = {
    category: Object.hasOwn(categoryLabels, read("category")) ? read("category") : "",
    q: read("q"), brand: read("brand", 80), model: read("model", 80), color: read("color", 80),
    region: lostItemRegions.includes(read("region")) ? read("region") : "",
    course: read("course"), from: isDateOnly(read("from")) ? read("from") : "", to: isDateOnly(read("to")) ? read("to") : "",
    scope: own ? "mine" : "",
  };
  const page = /^[0-9]{1,4}$/.test(read("page")) ? Math.max(1, Math.min(1001, Number(read("page")))) : 1;
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  if (back !== "/market") params.set("back", back);
  if (page > 1) params.set("page", String(page));
  const listHref = lostItemsPath + (params.size ? "?" + params : "");
  const byPage = (pageNumber: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(pageNumber));
    return lostItemsPath + "?" + next;
  };
  const db = await createClient();
  const [auth, result] = await Promise.all([
    db.auth.getClaims().catch(() => null),
    contentRpc<LostItemReport[]>(db, "market_lost_read", { p_id: null, p_filters: filters, p_offset: (page - 1) * 20 }).catch(() => null),
  ]);
  const signedIn = !!auth?.data?.claims?.sub;
  const advanced = !!(filters.region || filters.course || filters.from || filters.to);

  return <>
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link href={back} prefetch={false} className="inline-flex min-h-11 items-center text-sm font-bold text-pul-point">
          ← {back === "/market" ? "PUL 장터" : "보던 판매글로 돌아가기"}
        </Link>
        <h1 className="text-2xl font-bold text-pul-deep sm:text-3xl">분실물 확인</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {signedIn && <Link prefetch={false} className={lostItemButton} href={own ? lostItemsPath : lostItemsPath + "?scope=mine"}>{own ? "전체 분실 신고" : "내 분실 신고"}</Link>}
        <Link prefetch={false} className={lostItemButton + " !bg-pul-point !text-white"} href={lostItemsPath + "/new"}>분실 신고하기</Link>
      </div>
    </header>
    <Form action={lostItemsPath} className="space-y-3 rounded-xl border border-pul-border bg-white p-4 sm:p-5">
      {back !== "/market" && <input type="hidden" name="back" value={back} />}
      {own && <input type="hidden" name="scope" value="mine" />}
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <label className="text-sm font-bold">품목<select name="category" defaultValue={filters.category} className={lostItemInput}>
          <option value="">전체 품목</option>
          {Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label className="text-sm font-bold">키워드<input name="q" maxLength={100} defaultValue={filters.q} placeholder="품명이나 기억나는 특징" className={lostItemInput} /></label>
      </div>
      <details open={!!(filters.brand || filters.model || filters.color)}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">브랜드·모델·색상</summary>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["brand", "model", "color"] as const).map((key, index) => <label key={key} className="text-sm font-bold">
            {["브랜드", "모델", "색상"][index]}<input name={key} defaultValue={filters[key]} maxLength={80} className={lostItemInput} />
          </label>)}
        </div>
      </details>
      <details open={advanced}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">지역·구장·기간</summary>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-bold">지역<select name="region" defaultValue={filters.region} className={lostItemInput}>
            <option value="">전체 지역</option>
            {lostItemRegions.map(region => <option key={region}>{region}</option>)}
          </select></label>
          <label className="text-sm font-bold">구장 이름<input name="course" defaultValue={filters.course} maxLength={100} className={lostItemInput} /></label>
          <label className="min-w-0 text-sm font-bold">분실일 시작<input name="from" type="date" defaultValue={filters.from} className={lostItemInput} /></label>
          <label className="min-w-0 text-sm font-bold">분실일 끝<input name="to" type="date" defaultValue={filters.to} className={lostItemInput} /></label>
        </div>
      </details>
      <button type="submit" className={lostItemButton + " !bg-pul-point !text-white"}>조회</button>
    </Form>
    <section className="space-y-3" aria-label={own ? "내 분실 신고" : "조회 결과"}>
      {own && <h2 className="text-xl font-bold text-pul-deep">내 분실 신고</h2>}
      {own && !signedIn ? <Link className={lostItemButton} href={"/login?next=" + encodeURIComponent(listHref)}>로그인 후 내 신고 보기</Link>
        : result === null ? <p role="alert" className="rounded-xl border border-rose-200 bg-white p-5">
          분실 신고를 조회하지 못했습니다. <a className="font-bold text-pul-point underline" href={listHref}>다시 조회</a>
        </p> : result.length === 0 ? <p className="rounded-xl border border-pul-border bg-white p-5">
          {own ? "등록한 공개 분실 신고가 없습니다." : "PUL에서 일치 신고를 찾지 못했습니다"}
        </p> : <ul className="space-y-3">
          {result.slice(0, 20).map(report => <li key={report.id} className="min-w-0 rounded-xl border border-pul-border bg-white p-4 sm:p-5">
            <Link href={lostItemsPath + "/" + report.id + (params.size ? "?" + params : "")} prefetch={false} className="inline-flex min-h-11 items-center break-words text-lg font-bold text-pul-deep underline-offset-4 hover:underline">{report.item}</Link>
            <LostItemFacts report={report} compact />
          </li>)}
        </ul>}
      {result && (page > 1 || result.length > 20) && <nav className="flex gap-2" aria-label="조회 결과 페이지">
        {page > 1 && <Link className={lostItemButton} href={byPage(page - 1)}>이전</Link>}
        {result.length > 20 && page < 1001 && <Link className={lostItemButton} href={byPage(page + 1)}>다음</Link>}
      </nav>}
    </section>
  </>;
}
