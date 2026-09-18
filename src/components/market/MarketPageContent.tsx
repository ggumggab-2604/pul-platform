"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  createMarketMediaUploadIntentAction,
  finalizeMarketMediaUploadAction,
  getMarketListingAction,
  listMarketListingsAction,
  listMarketStartupPostsAction,
  mutateMarketListingAction,
} from "@/app/market/actions";
import {
  createStartupMediaUploadIntentAction,
  finalizeStartupMediaUploadAction,
  getBuyRequestV2Action,
  getStartupContextV2Action,
  getStartupV2Action,
  listBuyRequestsV2Action,
  mutateBuyRequestV2Action,
  mutateStartupV2Action,
} from "@/app/market/phaseOneActions";
import { MarketProductCard } from "./MarketProductCard";
import { MarketListSearch } from "./MarketListSearch";
import {
  MarketBuyGuidePanel,
  MarketCareAndRepairPanel,
  MarketPriceGuidePanel,
} from "./MarketInfoPanels";
import { MarketOperationGuide } from "./MarketOperationGuide";
import { MarketSafetyGuide } from "./MarketSafetyGuide";
import { StartupBoardPostCard } from "./StartupBoardPostCard";
import { PromotionBanner } from "@/components/promotions/PromotionBanner";
import { createClient } from "@/lib/supabase/client";
import { validateClubMediaDeclaration } from "@/lib/clubs/clubMediaValidation";
import { MarketPhotoSaveProgress, photoKey } from "@/lib/market/marketPhotos";
import {
  anchorViews,
  marketHref,
  MarketRequestEpoch,
  type MarketQuery,
  type MarketView,
} from "@/lib/market/marketNavigation";
import type {
  MarketListingFilters,
  MarketListingInput,
  MarketPage,
  MarketStartupPostFilters,
} from "@/lib/market/market";
import type {
  BuyRequestDetail,
  BuyRequestInputV2,
  StartupContextV2,
  StartupDetailV2,
  StartupInputV2,
} from "@/lib/market/marketPhaseOne";
import type { ActiveSlotPromotion } from "@/lib/promotions/promotionDirectory";
import type {
  MarketBuyRequest,
  MarketListing,
  MarketListingDetail,
  StartupBoardCategory,
  StartupBoardConsultationType,
  StartupBoardPost,
} from "@/types";
import {
  cleanupMarketMediaAction,
  marketMediaStateAction,
} from "@/app/market/phaseOneActions";
import {
  recoverMarketUpload,
  type UploadIntent,
} from "@/lib/market/marketUploadRecovery";
import { observeMarketIdentity } from "@/lib/market/marketAuthLifecycle";
const Entry = dynamic(() =>
  import("./MarketEntryDialog").then((m) => m.MarketEntryDialog),
);
const Confirm = dynamic(() =>
  import("./MarketEntryDialog").then((m) => m.MarketConfirmDialog),
);
const Detail = dynamic(() =>
  import("./MarketDetailModal").then((m) => m.MarketDetailModal),
);
const BuyDetail = dynamic(() =>
  import("./BuyRequestDetailModal").then((m) => m.BuyRequestDetailModal),
);
const StartupEntry = dynamic(() =>
  import("./StartupBoardEntryDialog").then((m) => m.StartupBoardEntryDialog),
);
const StartupDetail = dynamic(() =>
  import("./StartupBoardDetailModal").then((m) => m.StartupBoardDetailModal),
);
const Report = dynamic(() =>
  import("./MarketListingReportDialog").then(
    (m) => m.MarketListingReportDialog,
  ),
);
const Partnership = dynamic(() =>
  import("./MarketPartnershipInquiryDialog").then(
    (m) => m.MarketPartnershipInquiryDialog,
  ),
);
const Repair = dynamic(() =>
  import("./MarketRepairShopInquiryDialog").then(
    (m) => m.MarketRepairShopInquiryDialog,
  ),
);
const labels: Record<MarketView, string> = {
  home: "장터 홈",
  sale: "판매 매물",
  buy: "삽니다",
  startup: "창업·매매",
  care: "장비관리센터",
  price: "가격 확인 가이드",
  guide: "초보 구매 가이드",
  safety: "안전거래·이용안내",
};
type EntryState =
  | { kind: "listing"; item?: MarketListingDetail }
  | { kind: "buy"; item?: BuyRequestDetail }
  | {
      kind: "startup";
      item?: StartupContextV2;
      category: StartupBoardCategory;
      consultation: StartupBoardConsultationType;
    };
type ConfirmationInput =
  | {
      kind: "listing";
      item: MarketListingDetail;
      operation: "reserve" | "sell" | "delete";
    }
  | { kind: "buy"; item: BuyRequestDetail; operation: "close" | "delete" }
  | { kind: "startup"; item: StartupContextV2; operation: "close" | "remove" };
type Confirmation = ConfirmationInput & { requestId: string };

type Props = {
  query: MarketQuery;
  search: string;
  initialListings: MarketPage<MarketListing>;
  initialBuyRequests: MarketPage<MarketBuyRequest>;
  initialStartupPosts: MarketPage<StartupBoardPost>;
  initialErrors: { sale: boolean; buy: boolean; startup: boolean };
  initialUserId: string | null;
  promotion: ActiveSlotPromotion | null;
  secondPromotion: ActiveSlotPromotion | null;
};
const empty = <T,>(): MarketPage<T> => ({
  items: [],
  total: 0,
  limit: 24,
  offset: 0,
  hasMore: false,
});
const safeError = (error: unknown) =>
  error instanceof Error && /[가-힣]/.test(error.message)
    ? error.message
    : "요청을 처리하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";

function BuyCards({
  items,
  busy,
  onSelect,
}: {
  items: MarketBuyRequest[];
  busy: boolean;
  onSelect: (item: MarketBuyRequest, button: HTMLButtonElement) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={busy}
          className="rounded-xl border border-pul-border bg-white p-4 text-left hover:border-pul-point"
          onClick={(event) => onSelect(item, event.currentTarget)}
        >
          <span className="text-xs text-pul-point">
            {item.requestStatus === "closed" ? "요청 종료" : "구매 희망"} ·{" "}
            {item.region}
          </span>
          <h3 className="mt-2 font-bold">{item.title}</h3>
          <p className="mt-1 text-sm">희망 {item.budget}</p>
          <p className="mt-2 line-clamp-2 text-sm text-pul-muted">
            {item.summary}
          </p>
          <span className="mt-3 block text-xs text-pul-muted">
            {item.authorNickname} · {item.createdAt}
          </span>
        </button>
      ))}
    </div>
  );
}

export function MarketPageContent({
  query,
  search,
  initialListings,
  initialBuyRequests,
  initialStartupPosts,
  initialErrors,
  initialUserId,
  promotion,
  secondPromotion,
}: Props) {
  const router = useRouter();
  const [navigating, startTransition] = useTransition();
  const [listings, setListings] = useState(initialListings),
    [buys, setBuys] = useState(initialBuyRequests),
    [posts, setPosts] = useState(initialStartupPosts);
  const [errors, setErrors] = useState(initialErrors),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [message, setMessage] = useState<string>();
  const [userId, setUserId] = useState(initialUserId),
    [selected, setSelected] = useState<MarketListingDetail | null>(null),
    [selectedBuy, setSelectedBuy] = useState<BuyRequestDetail | null>(null),
    [selectedPost, setSelectedPost] = useState<StartupDetailV2 | null>(null);
  const [entry, setEntry] = useState<EntryState>(),
    [confirmation, updateConfirmation] = useState<Confirmation>(),
    [report, setReport] = useState<MarketListingDetail | null>(null),
    [repair, setRepair] = useState<HTMLButtonElement | null>(null),
    [partnership, setPartnership] = useState<HTMLButtonElement | null>(null),
    [saved, setSaved] = useState(false);
  const epoch = useRef(new MarketRequestEpoch()),
    detailEpoch = useRef(new MarketRequestEpoch()),
    identity = useRef(initialUserId),
    main = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  const saveProgress = useRef(new MarketPhotoSaveProgress()),
    mutationBusy = useRef(false);
  const uploadIntents = useRef(new Map<string, UploadIntent>());
  const setConfirmation = (value?: ConfirmationInput) =>
    updateConfirmation(
      value ? { ...value, requestId: crypto.randomUUID() } : undefined,
    );
  const home = query.view === "home",
    listView = ["sale", "buy", "startup"].includes(query.view);
  const saleFilters: MarketListingFilters = {
    keyword: home ? "" : query.keyword,
    category: (home
      ? "all"
      : query.category) as MarketListingFilters["category"],
    region: home ? "전체" : query.region,
    saleStatus: (home
      ? "all"
      : query.status) as MarketListingFilters["saleStatus"],
  };
  const startupFilters: MarketStartupPostFilters = {
    keyword: query.keyword,
    category: query.category as MarketStartupPostFilters["category"],
    region: query.region,
  };
  const href = (view: MarketView) => marketHref(search, view);
  const restore = () => {
    requestAnimationFrame(() => {
      (trigger.current?.isConnected ? trigger.current : main.current)?.focus({
        preventScroll: true,
      });
    });
  };
  const clearDetails = () => {
    detailEpoch.current.next();
    if (!mutationBusy.current) setBusy(false);
    setSelected(null);
    setSelectedBuy(null);
    setSelectedPost(null);
    setReport(null);
  };
  const navigate = (url: string) => {
    epoch.current.next();
    clearDetails();
    startTransition(() => router.push(url, { scroll: false }));
  };

  useEffect(() => {
    const currentEpoch = epoch.current,
      currentDetailEpoch = detailEpoch.current;
    const hash = () => {
      const view = anchorViews[window.location.hash];
      if (view && view !== query.view)
        router.replace(marketHref(search, view) + window.location.hash, {
          scroll: false,
        });
    };
    hash();
    window.addEventListener("hashchange", hash);
    const stopIdentity = observeMarketIdentity(
      createClient().auth,
      (next) => {
        if (next === identity.current) return;
        identity.current = next;
        currentEpoch.next();
        currentDetailEpoch.next();
        setUserId(next);
        if (!mutationBusy.current) setBusy(false);
        setLoading(false);
        setSelected(null);
        setSelectedBuy(null);
        setSelectedPost(null);
        setReport(null);
        setEntry(undefined);
        setConfirmation(undefined);
        setRepair(null);
        setPartnership(null);
        setListings(empty());
        setBuys(empty());
        setPosts(empty());
        setError(undefined);
        setMessage(undefined);
        saveProgress.current = new MarketPhotoSaveProgress();
        uploadIntents.current.clear();
        router.refresh();
      },
      () => {
        currentDetailEpoch.next();
        setSelected(null);
        setSelectedBuy(null);
        setSelectedPost(null);
        setReport(null);
        if (!mutationBusy.current) setBusy(false);
      },
    );
    return () => {
      currentEpoch.next();
      currentDetailEpoch.next();
      stopIdentity();
      window.removeEventListener("hashchange", hash);
    };
  }, [query.view, router, search]);

  const refresh = async (more = false) => {
    const ticket = epoch.current.next();
    setLoading(true);
    setError(undefined);
    try {
      const results = await Promise.allSettled([
        home || query.view === "sale"
          ? listMarketListingsAction(
              saleFilters,
              home ? 4 : 24,
              more ? listings.items.length : 0,
            )
          : Promise.resolve(null),
        home || query.view === "buy"
          ? listBuyRequestsV2Action(
              home
                ? {
                    view: "buy",
                    keyword: "",
                    category: "all",
                    region: "전체",
                    status: "all",
                  }
                : query,
              home ? 3 : 24,
              more ? buys.items.length : 0,
            )
          : Promise.resolve(null),
        query.view === "startup"
          ? listMarketStartupPostsAction(
              startupFilters,
              24,
              more ? posts.items.length : 0,
            )
          : Promise.resolve(null),
      ]);
      if (!epoch.current.current(ticket)) return false;
      const [a, b, c] = results;
      if (a.status === "fulfilled" && a.value)
        setListings((previous) => ({
          ...a.value!,
          items: more ? [...previous.items, ...a.value!.items] : a.value!.items,
        }));
      if (b.status === "fulfilled" && b.value)
        setBuys((previous) => ({
          ...b.value!,
          items: more ? [...previous.items, ...b.value!.items] : b.value!.items,
        }));
      if (c.status === "fulfilled" && c.value)
        setPosts((previous) => ({
          ...c.value!,
          items: more ? [...previous.items, ...c.value!.items] : c.value!.items,
        }));
      setErrors({
        sale: a.status === "rejected",
        buy: b.status === "rejected",
        startup: c.status === "rejected",
      });
      return results.every((result) => result.status === "fulfilled");
    } finally {
      if (epoch.current.current(ticket)) setLoading(false);
    }
  };
  const openEntry = async (value: EntryState, button?: HTMLElement) => {
    trigger.current = button ?? trigger.current;
    const ticket = detailEpoch.current.next();
    const { data } = await createClient().auth.getUser();
    if (!detailEpoch.current.current(ticket)) return;
    if (!data.user) {
      router.push(`/login?next=${encodeURIComponent(href(query.view))}`);
      return;
    }
    clearDetails();
    saveProgress.current = new MarketPhotoSaveProgress();
    uploadIntents.current.clear();
    setSaved(false);
    setError(undefined);
    setMessage(undefined);
    setEntry(value);
  };
  const openDetail = async (
    kind: "sale" | "buy" | "startup",
    id: string,
    button: HTMLButtonElement,
  ) => {
    trigger.current = button;
    const ticket = detailEpoch.current.next();
    setBusy(true);
    setError(undefined);
    try {
      if (kind === "sale") {
        const value = await getMarketListingAction(id);
        if (detailEpoch.current.current(ticket)) setSelected(value);
      } else if (kind === "buy") {
        const value = await getBuyRequestV2Action(id);
        if (detailEpoch.current.current(ticket)) setSelectedBuy(value);
      } else {
        const value = await getStartupV2Action(id);
        if (detailEpoch.current.current(ticket)) setSelectedPost(value);
      }
    } catch (cause) {
      if (detailEpoch.current.current(ticket)) setError(safeError(cause));
    } finally {
      if (detailEpoch.current.current(ticket)) setBusy(false);
    }
  };
  const startupManage = async (
    post: StartupDetailV2,
    operation: "edit" | "close" | "remove",
  ) => {
    const ticket = detailEpoch.current.next();
    setBusy(true);
    setError(undefined);
    try {
      const item = await getStartupContextV2Action(post.postKey);
      if (!detailEpoch.current.current(ticket)) return;
      setSelectedPost(null);
      if (operation === "edit")
        await openEntry({
          kind: "startup",
          item,
          category: item.category,
          consultation: item.consultationType,
        });
      else setConfirmation({ kind: "startup", item, operation });
    } catch (cause) {
      if (detailEpoch.current.current(ticket)) setError(safeError(cause));
    } finally {
      if (detailEpoch.current.current(ticket)) setBusy(false);
    }
  };
  const upload = async (
    kind: "listing" | "startup",
    id: string,
    file: File,
  ) => {
    const declaration = {
      declaredMimeType: validateClubMediaDeclaration(file.type, file.size),
      declaredByteSize: file.size,
      originalFilename: file.name,
    };
    await recoverMarketUpload(uploadIntents.current, photoKey(file), {
      state: (mediaId) => marketMediaStateAction(kind, mediaId),
      cleanup: (mediaId) => cleanupMarketMediaAction(kind, mediaId),
      create: () =>
        kind === "listing"
          ? createMarketMediaUploadIntentAction({
              ...declaration,
              listingId: id,
            })
          : createStartupMediaUploadIntentAction({
              ...declaration,
              postKey: id,
            }),
      upload: async (intent) => {
        const result = await createClient()
          .storage.from(intent.bucket)
          .uploadToSignedUrl(intent.path, intent.token, file, {
            contentType: intent.mimeType,
            cacheControl: "0",
          });
        if (result.error) throw result.error;
      },
      finalize: (mediaId) =>
        kind === "listing"
          ? finalizeMarketMediaUploadAction(mediaId)
          : finalizeStartupMediaUploadAction(mediaId),
    });
  };
  const submit = async (
    input: MarketListingInput | BuyRequestInputV2 | StartupInputV2,
    files: File[] = [],
  ) => {
    if (!entry || mutationBusy.current) return;
    mutationBusy.current = true;
    setBusy(true);
    setError(undefined);
    const actor = identity.current,
      progress = saveProgress.current;
    progress.requestId ??= crypto.randomUUID();
    try {
      if (entry.kind === "buy")
        await mutateBuyRequestV2Action({
          operation: entry.item ? "update" : "create",
          id: entry.item?.id ?? null,
          version: entry.item?.version ?? null,
          payload: input as BuyRequestInputV2,
          requestId: progress.requestId,
        });
      else
        await progress.run(
          files,
          async () => {
            if (entry.kind === "listing") {
              const result = await mutateMarketListingAction({
                operation: entry.item ? "update" : "create",
                listingId: entry.item?.id ?? null,
                expectedVersion: entry.item?.version ?? null,
                payload: input as MarketListingInput,
                requestId: progress.requestId!,
              });
              return { id: result.id, version: result.version };
            }
            const result = await mutateStartupV2Action({
              operation: entry.item ? "update" : "create",
              postKey: entry.item?.postKey ?? null,
              version: entry.item?.version ?? null,
              payload: input as StartupInputV2,
              requestId: progress.requestId!,
            });
            return { id: result.postKey, version: result.version };
          },
          async (id, file) => {
            if (identity.current !== actor)
              throw new Error(
                "로그인 계정이 변경되어 사진 처리를 중단했습니다.",
              );
            await upload(
              entry.kind === "startup" ? "startup" : "listing",
              id,
              file,
            );
          },
        );
      if (identity.current !== actor) return;
      const refreshed = await refresh();
      setEntry(undefined);
      setSaved(false);
      setMessage(
        refreshed
          ? "저장되었습니다. 현재 검색조건과 다르면 목록에 보이지 않을 수 있습니다. 조건을 초기화해 확인해 주세요."
          : "글은 저장됐지만 목록 갱신에 실패했습니다. 다시 불러와 주세요.",
      );
      restore();
    } catch (cause) {
      if (identity.current === actor) {
        setSaved(Boolean(progress.saved));
        setError(safeError(cause));
      }
    } finally {
      mutationBusy.current = false;
      setBusy(false);
    }
  };
  const closeEntry = () => {
    setEntry(undefined);
    setError(undefined);
    if (saveProgress.current.saved) void refresh();
    restore();
  };
  const confirm = async () => {
    if (!confirmation || mutationBusy.current) return;
    mutationBusy.current = true;
    setBusy(true);
    setError(undefined);
    const actor = identity.current;
    try {
      let cleanupPending = false;
      if (confirmation.kind === "listing") {
        const result = await mutateMarketListingAction({
          operation: confirmation.operation,
          listingId: confirmation.item.id,
          expectedVersion: confirmation.item.version ?? null,
          payload: null,
          requestId: confirmation.requestId,
        });
        cleanupPending = result.cleanupPending;
      } else if (confirmation.kind === "buy")
        await mutateBuyRequestV2Action({
          operation: confirmation.operation,
          id: confirmation.item.id,
          version: confirmation.item.version ?? null,
          payload: null,
          requestId: confirmation.requestId,
        });
      else {
        const result = await mutateStartupV2Action({
          operation: confirmation.operation,
          postKey: confirmation.item.postKey,
          version: confirmation.item.version,
          payload: null,
          requestId: confirmation.requestId,
        });
        cleanupPending = result.cleanupPending;
      }
      if (identity.current !== actor) return;
      if (cleanupPending)
        throw new Error(
          "글 상태는 변경됐지만 사진 정리가 남아 있습니다. 같은 작업을 다시 시도해 주세요.",
        );
      setConfirmation(undefined);
      clearDetails();
      const refreshed = await refresh();
      setMessage(
        refreshed
          ? "글 상태가 변경되었습니다."
          : "글 상태는 변경됐지만 목록 갱신에 실패했습니다.",
      );
      restore();
    } catch (cause) {
      if (identity.current === actor) setError(safeError(cause));
    } finally {
      mutationBusy.current = false;
      if (identity.current === actor) setBusy(false);
    }
  };
  const writeButton = (bottom = false) => (
    <button
      type="button"
      disabled={busy || navigating}
      onClick={(event) =>
        void openEntry(
          query.view === "buy"
            ? { kind: "buy" }
            : query.view === "startup"
              ? {
                  kind: "startup",
                  category:
                    query.category === "all"
                      ? "screenResale"
                      : (query.category as StartupBoardCategory),
                  consultation:
                    query.category === "all" ||
                    query.category === "screenResale"
                      ? "transfer"
                      : query.category === "screenStartup"
                        ? "startupInquiry"
                        : query.category === "fieldCourseDevelopment"
                          ? "courseDevelopment"
                          : query.category === "idleLandUse"
                            ? "idleLandUse"
                            : "facilityConsulting",
                }
              : { kind: "listing" },
          event.currentTarget,
        )
      }
      className={`min-h-11 rounded-lg bg-pul-point px-4 font-bold text-white disabled:opacity-50 ${bottom ? "w-full" : ""}`}
    >
      {query.view === "buy"
        ? "삽니다 글쓰기"
        : query.view === "startup"
          ? "창업·매매 글쓰기"
          : "판매글 쓰기"}
    </button>
  );

  const failed = (board: "sale" | "buy" | "startup") =>
    errors[board] ? (
      <div
        role="alert"
        className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm"
      >
        목록을 불러오지 못했습니다.{" "}
        <button
          type="button"
          className="min-h-11 font-bold underline"
          disabled={loading}
          onClick={() => void refresh()}
        >
          다시 불러오기
        </button>
      </div>
    ) : null;
  const noResults = (
    <p className="rounded-xl border border-dashed border-pul-border bg-white p-8 text-center text-sm text-pul-muted">
      조건에 맞는 글이 없습니다. 검색조건을 초기화하거나 새 글을 등록해 주세요.
    </p>
  );
  const currentPage =
    query.view === "buy" ? buys : query.view === "startup" ? posts : listings;
  return (
    <>
      <div ref={main} tabIndex={-1} className="space-y-5 pb-4 outline-none">
        <nav aria-label="장터 화면" className="flex flex-wrap gap-2">
          {(["home", "sale", "buy", "care", "startup"] as const).map((view) => (
            <Link
              key={view}
              prefetch={false}
              href={href(view)}
              onClick={() => {
                epoch.current.next();
                clearDetails();
              }}
              aria-current={query.view === view ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-bold ${query.view === view ? "border-pul-deep bg-pul-point text-white" : "border-pul-border bg-white"}`}
            >
              {labels[view]}
            </Link>
          ))}
        </nav>
        {(navigating || loading || busy) && !entry && !confirmation ? (
          <p role="status" className="text-sm text-pul-muted">
            불러오는 중…
          </p>
        ) : null}
        {message ? (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900"
          >
            {message}
          </p>
        ) : null}
        {error && !entry ? (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
          >
            {error}
          </p>
        ) : null}
        {home ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["price", "guide", "safety"] as const).map((view) => (
                <Link
                  prefetch={false}
                  href={href(view)}
                  key={view}
                  className="rounded-xl border border-pul-border bg-white p-4"
                >
                  <h2 className="font-bold">{labels[view]} →</h2>
                  <p className="mt-1 text-sm text-pul-muted">
                    {view === "price"
                      ? "상태·구성품에 따라 가격 비교하기"
                      : view === "guide"
                        ? "처음 장비를 고를 때 확인할 내용"
                        : "거래 전 필독 · 신고와 이용 기준"}
                  </p>
                </Link>
              ))}
            </div>
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">최근 판매 매물</h2>
                <Link
                  prefetch={false}
                  className="min-h-11 content-center font-bold text-pul-point"
                  href={href("sale")}
                >
                  판매 매물 전체보기 →
                </Link>
              </div>
              {failed("sale") ??
                (listings.items.length ? (
                  <div className="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
                    {listings.items.slice(0, 4).map((item) => (
                      <MarketProductCard
                        key={item.id}
                        item={item}
                        onSelect={(value, button) =>
                          void openDetail("sale", value.id, button)
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-pul-border bg-white p-6 text-sm text-pul-muted">
                    등록된 판매 매물이 없습니다.
                  </p>
                ))}
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">최근 삽니다</h2>
                <Link
                  prefetch={false}
                  href={href("buy")}
                  className="min-h-11 content-center font-bold text-pul-point"
                >
                  삽니다 전체보기 →
                </Link>
              </div>
              {failed("buy") ??
                (buys.items.length ? (
                  <BuyCards
                    items={buys.items.slice(0, 3)}
                    busy={busy}
                    onSelect={(item, button) =>
                      void openDetail("buy", item.id, button)
                    }
                  />
                ) : (
                  <p className="rounded-xl border border-pul-border bg-white p-6 text-sm text-pul-muted">
                    등록된 구매요청이 없습니다.
                  </p>
                ))}
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                prefetch={false}
                href={href("care")}
                className="rounded-xl border border-pul-border bg-white p-4"
              >
                <h2 className="font-bold">장비관리센터 →</h2>
                <p className="mt-1 text-sm text-pul-muted">
                  관리 팁·수리 시 확인사항·수리업체 등록 문의
                </p>
              </Link>
              <Link
                prefetch={false}
                href={href("startup")}
                className="rounded-xl border border-pul-border bg-white p-4"
              >
                <h2 className="font-bold">창업·매매 →</h2>
                <p className="mt-1 text-sm text-pul-muted">
                  스크린 매장매매와 창업·시설 상담 글
                </p>
              </Link>
            </div>
          </>
        ) : null}
        {listView ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{labels[query.view]}</h2>
              {writeButton()}
            </div>
            <p className="rounded-lg bg-pul-light/30 p-3 text-sm">
              필독 ·{" "}
              {query.view === "startup"
                ? "비용·매출·계약 조건은 작성자 제공 정보입니다. 당사자와 전문가에게 확인하세요."
                : "상태·가격·연락 방법을 확인한 뒤 거래하세요. 연락처는 상세에서 확인할 수 있습니다."}{" "}
              <Link href={href("safety")} className="font-bold underline">
                안전거래 안내
              </Link>
            </p>
            <MarketListSearch
              key={search}
              query={query}
              onApply={(filters) =>
                navigate(marketHref(search, query.view, filters))
              }
            />
            {promotion ? (
              <PromotionBanner promotion={promotion} variant="horizontal" />
            ) : null}
            <section
              id={query.view === "sale" ? "market-all-listings" : undefined}
              aria-busy={loading || navigating}
              className="space-y-3"
            >
              <p className="text-sm font-bold" role="status">
                검색 결과 {currentPage.total}건
              </p>
              {failed(query.view as "sale" | "buy" | "startup") ??
                (currentPage.items.length ? (
                  query.view === "sale" ? (
                    <div className="grid gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {listings.items.map((item) => (
                        <MarketProductCard
                          key={item.id}
                          item={item}
                          onSelect={(value, button) =>
                            void openDetail("sale", value.id, button)
                          }
                        />
                      ))}
                    </div>
                  ) : query.view === "buy" ? (
                    <BuyCards
                      items={buys.items}
                      busy={busy}
                      onSelect={(item, button) =>
                        void openDetail("buy", item.id, button)
                      }
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {posts.items.map((post) => (
                        <StartupBoardPostCard
                          key={post.postKey}
                          post={post}
                          onDetail={(value, button) =>
                            void openDetail("startup", value.postKey, button)
                          }
                        />
                      ))}
                    </div>
                  )
                ) : loading ? (
                  <p role="status">불러오는 중…</p>
                ) : (
                  noResults
                ))}
              {currentPage.hasMore ? (
                <button
                  type="button"
                  disabled={loading || navigating}
                  onClick={() => void refresh(true)}
                  className="min-h-11 w-full rounded-lg border bg-white font-bold disabled:opacity-50"
                >
                  {loading ? "불러오는 중…" : "더 보기"}
                </button>
              ) : null}
            </section>
            {secondPromotion &&
            secondPromotion.promotionKey !== promotion?.promotionKey ? (
              <PromotionBanner
                promotion={secondPromotion}
                variant="horizontal"
              />
            ) : null}
            {currentPage.items.length > 0 ? writeButton(true) : null}
          </>
        ) : null}
        {query.view === "care" ? (
          <MarketCareAndRepairPanel
            onEquipmentCareInquiry={(button) => {
              trigger.current = button;
              setRepair(button);
            }}
          />
        ) : null}
        {query.view === "price" ? <MarketPriceGuidePanel /> : null}
        {query.view === "guide" ? <MarketBuyGuidePanel /> : null}
        {query.view === "safety" ? (
          <>
            <MarketSafetyGuide />
            <MarketOperationGuide />
          </>
        ) : null}
        <div className="flex flex-wrap justify-between gap-2 border-t border-pul-border pt-3 text-sm">
          <Link
            href={href("safety")}
            className="inline-flex min-h-11 items-center font-bold text-pul-point"
          >
            안전거래·신고 안내
          </Link>
          <button
            type="button"
            className="min-h-11 font-bold underline"
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setPartnership(event.currentTarget);
            }}
          >
            제휴·광고 문의
          </button>
        </div>
      </div>
      {selected ? (
        <Detail
          item={selected}
          authenticated={Boolean(userId)}
          onClose={() => {
            clearDetails();
            restore();
          }}
          onEdit={(item) => void openEntry({ kind: "listing", item })}
          onStatus={(item, operation) => {
            setSelected(null);
            setConfirmation({ kind: "listing", item, operation });
          }}
          onDelete={(item) => {
            setSelected(null);
            setConfirmation({ kind: "listing", item, operation: "delete" });
          }}
          onReport={(item) => {
            setSelected(null);
            setReport(item);
          }}
        />
      ) : null}
      {selectedBuy ? (
        <BuyDetail
          item={selectedBuy}
          authenticated={Boolean(userId)}
          onClose={() => {
            clearDetails();
            restore();
          }}
          onEdit={() => void openEntry({ kind: "buy", item: selectedBuy })}
          onEnd={() => {
            setSelectedBuy(null);
            setConfirmation({
              kind: "buy",
              item: selectedBuy,
              operation: "close",
            });
          }}
          onDelete={() => {
            setSelectedBuy(null);
            setConfirmation({
              kind: "buy",
              item: selectedBuy,
              operation: "delete",
            });
          }}
        />
      ) : null}
      {selectedPost ? (
        <StartupDetail
          post={selectedPost}
          authenticated={Boolean(userId)}
          busy={busy}
          onClose={() => {
            clearDetails();
            restore();
          }}
          onEdit={(post) => void startupManage(post, "edit")}
          onClosePost={(post) => void startupManage(post, "close")}
          onRemove={(post) => void startupManage(post, "remove")}
        />
      ) : null}
      {entry?.kind === "listing" ? (
        <Entry
          kind="listing"
          item={entry.item}
          busy={busy}
          saved={saved}
          error={error}
          onClose={closeEntry}
          onSubmit={(input, files) => void submit(input, files)}
        />
      ) : entry?.kind === "buy" ? (
        <Entry
          kind="buy"
          item={entry.item}
          busy={busy}
          error={error}
          onClose={closeEntry}
          onSubmit={(input) => void submit(input)}
        />
      ) : entry?.kind === "startup" ? (
        <StartupEntry
          item={entry.item}
          initialCategory={entry.category}
          initialConsultation={entry.consultation}
          busy={busy}
          saved={saved}
          error={error}
          onClose={closeEntry}
          onSubmit={(input, files) => void submit(input, files)}
        />
      ) : null}
      {confirmation ? (
        <Confirm
          title={
            confirmation.operation === "delete" ||
            confirmation.operation === "remove"
              ? "글을 삭제할까요?"
              : "글 상태를 변경할까요?"
          }
          message={
            error ??
            (confirmation.operation === "delete" ||
            confirmation.operation === "remove"
              ? "삭제한 글은 목록에서 사라지며 되돌릴 수 없습니다."
              : "종료된 글은 수정하거나 연락처를 조회할 수 없습니다. 예약중 전환은 거래 종료가 아닙니다.")
          }
          confirmLabel="확인"
          busy={busy}
          destructive={
            confirmation.operation === "delete" ||
            confirmation.operation === "remove"
          }
          onClose={() => {
            setConfirmation(undefined);
            setError(undefined);
            restore();
          }}
          onConfirm={() => void confirm()}
        />
      ) : null}
      {report ? (
        <Report
          item={report}
          onClose={() => {
            setReport(null);
            restore();
          }}
        />
      ) : null}
      {repair ? (
        <Repair trigger={repair} onClose={() => setRepair(null)} />
      ) : null}
      {partnership ? (
        <Partnership
          trigger={partnership}
          onClose={() => setPartnership(null)}
        />
      ) : null}
    </>
  );
}
