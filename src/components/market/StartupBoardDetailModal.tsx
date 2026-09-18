"use client";
import {
  startupBoardCategoryLabels,
  startupBoardConsultationLabels,
} from "@/data/marketData";
import type { StartupDetailV2 } from "@/lib/market/marketPhaseOne";
import { MarketDialog } from "./MarketDialog";
import { MarketPhotoGallery } from "./MarketPhotos";
import { MarketContactPanel } from "./MarketContact";
export function StartupBoardDetailModal({
  post,
  busy,
  authenticated,
  onClose,
  onEdit,
  onClosePost,
  onRemove,
}: {
  post: StartupDetailV2 | null;
  busy: boolean;
  authenticated: boolean;
  onClose: () => void;
  onEdit: (post: StartupDetailV2) => void;
  onClosePost: (post: StartupDetailV2) => void;
  onRemove: (post: StartupDetailV2) => void;
}) {
  if (!post) return null;
  const r = post.resale;
  const number = (value: number | null | undefined, unit: string) =>
    value === null || value === undefined
      ? "미기재"
      : `${value.toLocaleString("ko-KR")}${unit}`;
  return (
    <MarketDialog title={post.title} busy={busy} onClose={onClose}>
      <p className="text-sm text-pul-muted">
        {startupBoardCategoryLabels[post.category]} ·{" "}
        {startupBoardConsultationLabels[post.consultationType]} ·{" "}
        {post.status === "open" ? "진행 중" : "종료"}
      </p>
      {post.category === "screenResale" ? (
        <div className="mt-3">
          <MarketPhotoGallery images={post.images} title={post.title} />
        </div>
      ) : null}
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">
        {post.body}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-pul-page p-3 text-sm">
        <div>
          <dt>지역</dt>
          <dd className="font-bold">{post.region}</dd>
        </div>
        <div>
          <dt>희망 규모 / 기존 기재</dt>
          <dd className="break-words font-bold">{post.desiredScale}</dd>
        </div>
        {post.category === "screenResale" ? (
          <>
            {[
              ["면적", number(r?.areaSqm, "㎡")],
              ["타석 수", number(r?.bayCount, "개")],
              ["보증금", number(r?.deposit, "원")],
              ["월세", number(r?.monthlyRent, "원")],
              ["관리비", number(r?.maintenance, "원/월")],
              ["희망 양도가", number(r?.askingPrice, "원")],
              [
                "가격 협의",
                r?.negotiable === true
                  ? "협의 가능"
                  : r?.negotiable === false
                    ? "협의 불가"
                    : "미기재",
              ],
              ["월매출 (작성자 제공)", number(r?.monthlyRevenue, "원")],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className="break-words font-bold">{value}</dd>
              </div>
            ))}
            <div className="col-span-2">
              <dt>임대조건</dt>
              <dd className="whitespace-pre-wrap break-words">
                {r?.rentTerms ?? "미기재"}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      {post.category === "screenResale" ? (
        <MarketContactPanel
          contact={post}
          owner={post.canEdit}
          ended={post.status === "closed"}
          authenticated={authenticated}
          onEdit={() => onEdit(post)}
        />
      ) : null}
      <p className="mt-3 text-xs text-pul-muted">
        {post.authorNickname} · {post.createdAt}
      </p>
      {post.canEdit ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {post.status === "open" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onEdit(post)}
                className="min-h-11 rounded-lg border px-3"
              >
                수정
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onClosePost(post)}
                className="min-h-11 rounded-lg border px-3"
              >
                게시글 종료
              </button>
            </>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(post)}
            className="min-h-11 rounded-lg border border-rose-200 px-3 text-rose-700"
          >
            삭제
          </button>
        </div>
      ) : null}
      <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-6">
        금액·매출 등은 작성자가 제공한 정보이며 PUL이 검증하거나 수익을 보장하지
        않습니다. 실제 계약·매매·창업 비용·수익성은 당사자와 전문가에게 확인해
        주세요.
      </p>
    </MarketDialog>
  );
}
