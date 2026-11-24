"use client";

import { PostForm, PreviewDialog, SelectField, primary, secondary } from "@/components/community/CommunityPromotionForms";
import { BannerForm } from "./CommunityPromotionPreviewBanner";
import { Destination, PostCard, PromotionFilters, sourceNames } from "./CommunityPromotionBoardUI";
import { demoPlacements, demoPosts, nearbyCourses } from "@/lib/community/communityPromotionsFixtures";
import { emptyFilters, fields, isPublic, listPosts, recruitmentLabel, regionLabel, type Post, type SourceKind } from "@/lib/community/communityPromotionsPreview";
import { ArrowUpRight, ChevronRight, Pin } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Panel =
  | { type: "write"; post?: Post }
  | { type: "banner"; postId: string }
  | { type: "detail" | "report" | "withdraw"; post: Post }
  | { type: "moderation" };
type Report = { postId: string; reason: string };

const sourceGuidance: Record<SourceKind, string> = {
  event: "접수 안내", club: "가입 안내", education: "교육 신청 안내", lesson: "수강 안내", course: "이용 안내", sale: "쪽지 문의",
};
const regionDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });

export function CommunityPromotionsPreview({ initialTime }: { initialTime: number }) {
  const [posts, setPosts] = useState(() => demoPosts(initialTime));
  const [placements, setPlacements] = useState(() => demoPlacements(initialTime));
  const [now, setNow] = useState(initialTime);
  const [filters, setFilters] = useState(emptyFilters);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [message, setMessage] = useState("");
  const sourceParam = useSearchParams().get("source");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const { notices, regular } = listPosts(posts, placements, filters, now);
  const districtOptions = [...new Set(posts.filter((post) => isPublic(post) && post.province === filters.province).flatMap((post) => post.districts))].sort((a, b) => a.localeCompare(b, "ko"));
  const sources = [...nearbyCourses, ...posts.filter(isPublic).flatMap((post) => [post.source, post.relatedSale, post.nearbyCourse])];
  const example = sources.find((source) => source?.example && source.visibility === "public" && `${source.kind}:${source.key}` === sourceParam);
  const examplePost = example && posts.find((post) => isPublic(post) && post.source?.kind === example.kind && post.source.key === example.key);

  function open(next: Panel) {
    setMessage("");
    setPanel(next);
  }

  function closeExample() {
    window.history.replaceState(null, "", "/community");
  }

  function savePost(post: Post) {
    setPosts((items) => items.some((item) => item.id === post.id) ? items.map((item) => item.id === post.id ? post : item) : [post, ...items]);
    setPanel(null);
    setMessage(panel?.type === "write" && panel.post ? "홍보 글을 수정했습니다." : "홍보 글이 공개되었습니다.");
  }

  function hidePost(post: Post, visibility: "withdrawn" | "blinded") {
    setPosts((items) => items.map((item) => item.id === post.id ? { ...item, visibility } : item));
    setPlacements((items) => items.map((item) => item.postId === post.id ? { ...item, paused: true } : item));
    setPanel(null);
    setMessage(`‘${post.title}’ 글을 비공개로 전환했습니다. 연결 배너도 일시 중지됩니다.`);
  }

  function report(event: FormEvent<HTMLFormElement>, post: Post) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
    if (!reason || post.owner || !isPublic(post)) return;
    setReports((items) => items.some((item) => item.postId === post.id) ? items : [...items, { postId: post.id, reason }]);
    setPanel(null);
    setMessage("운영 시연의 검토 목록에 신고를 추가했습니다.");
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <PromotionFilters filters={filters} districtOptions={districtOptions} setFilters={setFilters} preview
        onWrite={() => open({ type: "write" })} onBanner={() => open({ type: "banner", postId: "travel" })} />

      {message ? <p role="status" className="rounded-lg border border-emerald-200 bg-pul-light px-4 py-3 text-sm font-semibold text-pul-deep [overflow-wrap:anywhere]">{message}</p> : null}

      {notices.length > 0 ? <section className="rounded-2xl border border-amber-200 bg-amber-50/65 p-3.5 sm:p-5" aria-labelledby="notice-title">
        <h2 id="notice-title" className="flex items-center gap-2 text-lg font-extrabold text-pul-deep"><Pin size={19} className="text-amber-800" aria-hidden="true" /> 상단 유료 공지 <span className="text-sm font-semibold text-amber-900">({notices.length})</span></h2>
        <ul className="mt-3 grid gap-2.5 md:grid-cols-2">{notices.map((post) => <PostCard key={post.id} post={post} now={now} paid onOpen={() => open({ type: "detail", post })} />)}</ul>
      </section> : null}

      <section aria-labelledby="regular-title">
        <h2 id="regular-title" className="flex items-center gap-2 text-xl font-extrabold text-pul-deep">일반 게시글 <span className="text-sm font-semibold text-pul-muted">({regular.length})</span></h2>
        {regular.length ? <ul className="mt-3 grid gap-2.5 md:grid-cols-2">{regular.map((post) => <PostCard key={post.id} post={post} now={now} onOpen={() => open({ type: "detail", post })} />)}</ul> : <p className="mt-3 rounded-xl border border-pul-border bg-white p-5 text-sm text-pul-muted">조건에 맞는 일반 게시글이 없습니다.</p>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-pul-border bg-white px-4 py-3">
        <p className="text-xs leading-relaxed text-pul-muted">예시 글과 시연 변경은 페이지를 새로고침하면 초기화됩니다.</p>
        <button type="button" className={secondary} onClick={() => open({ type: "moderation" })}>운영 시연</button>
      </div>

      {panel?.type === "write" ? <PreviewDialog title={panel.post ? "홍보 글 수정" : "홍보 글쓰기"} description="회원 글은 무료이며 게시 즉시 공개됩니다." onClose={() => setPanel(null)}>
        <PostForm post={panel.post} filters={filters} onSave={savePost} courseExamples={nearbyCourses} />
      </PreviewDialog> : null}

      {panel?.type === "banner" ? <PreviewDialog title="배너 신청" description="선택한 배너 자리와 홍보 글을 함께 노출하는 로컬 시연입니다." onClose={() => setPanel(null)}>
        <BannerForm posts={posts} placements={placements} now={now} initialPostId={panel.postId} onAdd={(placement) => setPlacements((items) => [...items, placement])}
          onUpdate={(id, action) => setPlacements((items) => items.map((item) => item.id === id ? action === "pause" ? { ...item, paused: true } : { ...item, endsAt: now } : item))} />
      </PreviewDialog> : null}

      {panel?.type === "detail" ? <PreviewDialog title={panel.post.title} description={`${regionLabel(panel.post)} · ${panel.post.trade || fields[panel.post.field].label}`} onClose={() => setPanel(null)}>
        <div className="space-y-4">
          <p className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{panel.post.body}</p>
          <p className="text-xs text-pul-muted">작성 {regionDate.format(panel.post.createdAt)}{panel.post.deadline ? ` · 마감 ${panel.post.deadline} · ${recruitmentLabel(panel.post, now)}` : ""}</p>
          {panel.post.address || panel.post.contact ? <dl className="space-y-2 rounded-xl border border-pul-border bg-pul-page p-4 text-sm [overflow-wrap:anywhere]">
            {panel.post.address ? <div><dt className="font-bold text-pul-deep">주소</dt><dd>{panel.post.address}</dd><dd><a className="inline-flex min-h-11 items-center gap-1 font-bold text-pul-point underline" href={`https://map.kakao.com/?q=${encodeURIComponent(panel.post.address)}`} target="_blank" rel="noreferrer">지도에서 주소 보기 <ArrowUpRight size={15} aria-hidden="true" /></a></dd></div> : null}
            {panel.post.contact ? <div><dt className="font-bold text-pul-deep">문의 방법</dt><dd className="whitespace-pre-wrap">{panel.post.contact}</dd></div> : null}
          </dl> : null}
          {panel.post.nearbyCourse || panel.post.relatedSale ? <div className="flex flex-wrap gap-2">
            {panel.post.nearbyCourse ? <Destination source={panel.post.nearbyCourse} className={secondary}>가까운 구장 보기 <ChevronRight size={16} aria-hidden="true" /></Destination> : null}
            {panel.post.relatedSale ? <Destination source={panel.post.relatedSale} className={secondary}>관련 판매 글 보기 <ChevronRight size={16} aria-hidden="true" /></Destination> : null}
          </div> : null}
          <div className="flex flex-wrap gap-2 border-t border-pul-border pt-4">
            {panel.post.owner ? <>
              <button type="button" className={secondary} onClick={() => open({ type: "write", post: panel.post })}>수정</button>
              <button type="button" className={secondary} onClick={() => open({ type: "withdraw", post: panel.post })}>글 내리기</button>
              <button type="button" className={secondary} onClick={() => open({ type: "banner", postId: panel.post.id })}>이 글에 배너 연결</button>
            </> : <button type="button" className={secondary} disabled={reports.some((item) => item.postId === panel.post.id)} onClick={() => open({ type: "report", post: panel.post })}>
              {reports.some((item) => item.postId === panel.post.id) ? "신고 접수됨" : "신고하기"}
            </button>}
          </div>
        </div>
      </PreviewDialog> : null}

      {example?.example ? <PreviewDialog title={example.title} description={`${sourceNames[example.kind]} · 연결 예시`} onClose={closeExample}>
        <div className="space-y-4">
          <p className="font-semibold text-pul-deep">{example.example.summary}</p>
          {examplePost ? <p className="text-sm font-bold text-pul-point">{recruitmentLabel(examplePost, now)}{examplePost.deadline ? ` · ${examplePost.deadline} 마감` : ""}</p> : null}
          <section className="rounded-xl border border-pul-border bg-pul-page p-4 text-sm leading-relaxed"><h3 className="font-bold text-pul-deep">{sourceGuidance[example.kind]}</h3><p className="mt-1">{example.example.guidance}</p></section>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondary} onClick={closeExample}>{panel?.type === "detail" ? "홍보 글로 돌아가기" : "홍보 목록으로 돌아가기"}</button>
            {examplePost && !examplePost.owner && !reports.some((item) => item.postId === examplePost.id) ? <button type="button" className={secondary} onClick={() => {
              closeExample();
              open({ type: "report", post: examplePost });
            }}>신고하기</button> : null}
          </div>
        </div>
      </PreviewDialog> : null}

      {panel?.type === "withdraw" ? <PreviewDialog title="홍보 글 내리기" onClose={() => setPanel(null)}>
        <p className="text-sm leading-relaxed">공개 목록과 상단 공지에서 ‘{panel.post.title}’ 글을 내립니다. 이 글에 연결된 배너도 일시 중지됩니다.</p>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => open({ type: "detail", post: panel.post })}>취소</button><button type="button" className={primary} onClick={() => hidePost(panel.post, "withdrawn")}>글 내리기 확인</button></div>
      </PreviewDialog> : null}

      {panel?.type === "report" ? <PreviewDialog title="홍보 글 신고" description={panel.post.title} onClose={() => setPanel(null)}>
        <form className="space-y-4" onSubmit={(event) => report(event, panel.post)}>
          <SelectField label="신고 사유" name="reason" required defaultValue="">
            <option value="">사유 선택</option><option>허위 또는 과장 홍보</option><option>부적절한 내용</option><option>게시 기준 위반</option>
          </SelectField>
          <button type="submit" className={primary}>시연 신고 접수</button>
        </form>
      </PreviewDialog> : null}

      {panel?.type === "moderation" ? <PreviewDialog title="운영 시연" description="신고 내용을 검토하고 게시 기준에 따라 글을 블라인드할 수 있습니다." onClose={() => setPanel(null)}>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          const id = new FormData(event.currentTarget).get("post");
          const post = posts.find((item) => item.id === id && isPublic(item));
          if (post) hidePost(post, "blinded");
        }}>
          <ul aria-label="신고 검토 목록" className="space-y-2">
            {reports.length ? reports.map((item) => {
              const post = posts.find((entry) => entry.id === item.postId);
              return post ? <li key={item.postId} className="rounded-lg bg-pul-page p-3 text-sm [overflow-wrap:anywhere]"><strong>{post.title}</strong><p className="mt-1 text-pul-muted">{item.reason} · {isPublic(post) ? "검토 대기" : "비공개"}</p></li> : null;
            }) : <li className="text-sm text-pul-muted">접수된 신고가 없습니다.</li>}
          </ul>
          <SelectField label="블라인드할 글" name="post" required defaultValue="">
            <option value="">공개 글 선택</option>{posts.filter(isPublic).map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}
          </SelectField>
          <button type="submit" className={primary}>시연 블라인드 적용</button>
        </form>
      </PreviewDialog> : null}
    </div>
  );
}
