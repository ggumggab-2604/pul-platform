"use client";

import {
  createMarketMediaUploadIntentAction,
  failMarketMediaUploadAction,
  finalizeMarketMediaUploadAction,
  getMarketStartupPostAction,
  getMyMarketStartupPostMutationContextAction,
  listMarketBuyRequestsAction,
  listMarketListingsAction,
  listMarketStartupPostsAction,
  mutateMarketBuyRequestAction,
  mutateMarketListingAction,
  mutateMarketStartupPostAction,
} from "@/app/market/actions";
import { FeaturedMarketCards } from "@/components/market/FeaturedMarketCards";
import { MarketActionButtons } from "@/components/market/MarketActionButtons";
import { MarketAdPlaceholder } from "@/components/market/MarketAdPlaceholder";
import { MarketConfirmDialog, MarketEntryDialog } from "@/components/market/MarketEntryDialog";
import { MarketDetailModal } from "@/components/market/MarketDetailModal";
import { MarketHubNav, type MarketHubSection } from "@/components/market/MarketHubNav";
import {
  MarketBuyGuidePanel,
  MarketCareAndRepairPanel,
  MarketOpenEventPanel,
  MarketPriceGuidePanel,
} from "@/components/market/MarketInfoPanels";
import { MarketOperationGuide } from "@/components/market/MarketOperationGuide";
import { MarketProductCard } from "@/components/market/MarketProductCard";
import {
  MarketSearchFilter,
  MobileQuickFilterRow,
  MobileSearchToolbar,
  createDefaultMarketFilters,
  isStartupResaleMode,
  type MarketFilters,
} from "@/components/market/MarketSearchFilter";
import { MarketSafetyGuide } from "@/components/market/MarketSafetyGuide";
import { StartupBoardDetailModal } from "@/components/market/StartupBoardDetailModal";
import { StartupBoardEntryDialog } from "@/components/market/StartupBoardEntryDialog";
import { StartupBoardGuideBox } from "@/components/market/StartupBoardGuideBox";
import { StartupBoardSection } from "@/components/market/StartupBoardSection";
import { StartupBoardWritePrompt } from "@/components/market/StartupBoardWritePrompt";
import { StartupVendorRecommendBanner } from "@/components/market/StartupVendorRecommendBanner";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { MARKET_PAGE_DISCLAIMER, categoryLabels } from "@/data/marketData";
import { validateClubMediaDeclaration } from "@/lib/clubs/clubMediaValidation";
import { MarketError } from "@/lib/market/market";
import type {
  MarketBuyRequestInput,
  MarketListingFilters,
  MarketListingInput,
  MarketPage,
  MarketStartupPostFilters,
  MarketStartupPostInput,
  MarketStartupPostMutationContext,
} from "@/lib/market/market";
import { createClient } from "@/lib/supabase/client";
import type {
  MarketBuyRequest,
  MarketListing,
  MarketSaleStatus,
  StartupBoardCategory,
  StartupBoardCategoryFilter,
  StartupBoardConsultationType,
  StartupBoardPost,
  StartupBoardPostDetail,
} from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = { initialListings: MarketPage<MarketListing>; initialBuyRequests: MarketPage<MarketBuyRequest>; initialLoadFailed: boolean };
type EntryDialog = { kind: "listing"; item?: MarketListing } | { kind: "buy"; item?: MarketBuyRequest };
type StartupEntryDialog = {
  item?: MarketStartupPostMutationContext;
  initialCategory: StartupBoardCategory;
  initialConsultation: StartupBoardConsultationType;
};
type Confirmation =
  | { kind: "listing"; item: MarketListing; operation: "reserve" | "sell" | "delete" }
  | { kind: "buy"; item: MarketBuyRequest; operation: "close" | "delete" }
  | { kind: "startup"; item: MarketStartupPostMutationContext; operation: "close" | "remove" };

function safeError(cause: unknown) {
  return cause instanceof Error && cause.message && !/^[A-Z0-9_]+$/.test(cause.message)
    ? cause.message
    : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function BuyRequestCard({ item, onEdit, onClose, onDelete }: { item: MarketBuyRequest; onEdit: (item: MarketBuyRequest, trigger: HTMLButtonElement) => void; onClose: (item: MarketBuyRequest, trigger: HTMLButtonElement) => void; onDelete: (item: MarketBuyRequest, trigger: HTMLButtonElement) => void }) {
  return <article className="flex h-full flex-col rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.05)]">
    <div className="flex flex-wrap items-center gap-1">
      <span className="rounded-md bg-pul-light px-2 py-0.5 text-[11px] font-bold text-pul-deep">{categoryLabels[item.category]}</span>
      <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${item.requestStatus === "closed" ? "bg-gray-100 text-pul-muted" : "bg-emerald-50 text-emerald-800"}`}>{item.requestStatus === "closed" ? "요청 종료" : "구매 희망"}</span>
    </div>
    <h3 className="mt-2 text-base font-bold text-foreground">{item.title}</h3>
    <p className="mt-1 text-sm text-pul-muted">{item.region} · 희망 {item.budget}</p>
    <p className="mt-3 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{item.summary}</p>
    <p className="mt-3 text-xs text-pul-muted">{item.authorNickname} · {item.createdAt}</p>
    {item.canEdit ? <div className="mt-3 grid grid-cols-2 gap-2 border-t border-pul-border pt-3">
      {item.requestStatus === "open" ? <><button type="button" onClick={(event) => onEdit(item, event.currentTarget)} className="min-h-11 rounded-lg border border-pul-border text-sm font-bold">수정</button><button type="button" onClick={(event) => onClose(item, event.currentTarget)} className="min-h-11 rounded-lg bg-pul-point text-sm font-bold text-white">요청 종료</button></> : null}
      <button type="button" onClick={(event) => onDelete(item, event.currentTarget)} className="min-h-11 rounded-lg border border-rose-200 text-sm font-bold text-rose-700">삭제</button>
    </div> : null}
  </article>;
}

export function MarketPageContent({ initialListings, initialBuyRequests, initialLoadFailed }: Props) {
  const [filters, setFilters] = useState<MarketFilters>(createDefaultMarketFilters);
  const [listings, setListings] = useState(initialListings);
  const [buyRequests, setBuyRequests] = useState(initialBuyRequests);
  const [startupPosts, setStartupPosts] = useState<MarketPage<StartupBoardPost>>({ items: [], total: 0, limit: 24, offset: 0, hasMore: false });
  const [hubSection, setHubSection] = useState<MarketHubSection>("browse");
  const [boardCategory, setBoardCategory] = useState<StartupBoardCategoryFilter>("all");
  const [selectedItem, setSelectedItem] = useState<MarketListing | null>(null);
  const [selectedBoardPost, setSelectedBoardPost] = useState<StartupBoardPostDetail | null>(null);
  const [entryDialog, setEntryDialog] = useState<EntryDialog>();
  const [startupEntryDialog, setStartupEntryDialog] = useState<StartupEntryDialog>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(initialLoadFailed);
  const [startupLoading, setStartupLoading] = useState(false);
  const [startupError, setStartupError] = useState<string>();
  const [error, setError] = useState<string | undefined>(initialLoadFailed ? "장터 정보를 불러오지 못했습니다." : undefined);
  const [message, setMessage] = useState<string>();
  const generationRef = useRef(0);
  const startupGenerationRef = useRef(0);
  const startupLoadedRef = useRef(false);
  const firstFilterRun = useRef(true);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pendingFocusRestoreRef = useRef(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const startupMode = isStartupResaleMode(filters);
  const productSellerFilter = filters.sellerType === "all" || filters.sellerType === "personal";
  const visibleListings = productSellerFilter ? listings.items : [];
  const resultCount = startupMode ? startupPosts.total : productSellerFilter ? listings.total : 0;
  const newest = visibleListings.slice(0, 4);
  const serverFilters = useMemo<MarketListingFilters>(() => ({
    keyword: filters.keyword,
    category: filters.category as MarketListingFilters["category"],
    region: filters.region,
    saleStatus: filters.saleStatus as "all" | MarketSaleStatus,
  }), [filters.category, filters.keyword, filters.region, filters.saleStatus]);
  const startupFilters = useMemo<MarketStartupPostFilters>(() => ({
    keyword: filters.keyword,
    category: boardCategory,
    region: filters.region,
  }), [boardCategory, filters.keyword, filters.region]);

  const focusBack = useCallback(() => {
    pendingFocusRestoreRef.current = true;
  }, []);

  useEffect(() => {
    if (entryDialog || startupEntryDialog || confirmation || selectedItem || selectedBoardPost || !pendingFocusRestoreRef.current) return;
    pendingFocusRestoreRef.current = false;
    if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    else mainRef.current?.focus({ preventScroll: true });
  }, [confirmation, entryDialog, selectedBoardPost, selectedItem, startupEntryDialog]);

  const refreshListings = useCallback(async (target = serverFilters) => {
    const generation = ++generationRef.current;
    setLoading(true);
    try {
      const next = await listMarketListingsAction(target, 24, 0);
      if (generation !== generationRef.current) return false;
      setListings(next);
      setSelectedItem((current) => current ? next.items.find((item) => item.id === current.id) ?? null : null);
      setError(undefined);
      return true;
    } catch (cause) {
      if (generation === generationRef.current) setError(safeError(cause));
      return false;
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [serverFilters]);

  const refreshBuyRequests = useCallback(async () => {
    try { const next = await listMarketBuyRequestsAction(24, 0); setBuyRequests(next); return true; }
    catch (cause) { setError(safeError(cause)); return false; }
  }, []);

  const refreshStartupPosts = useCallback(async (target = startupFilters) => {
    const generation = ++startupGenerationRef.current;
    setStartupLoading(true);
    try {
      const next = await listMarketStartupPostsAction(target, 24, 0);
      if (generation !== startupGenerationRef.current) return false;
      setStartupPosts(next);
      startupLoadedRef.current = true;
      setStartupError(undefined);
      return true;
    } catch (cause) {
      if (generation === startupGenerationRef.current) setStartupError(safeError(cause));
      return false;
    } finally {
      if (generation === startupGenerationRef.current) setStartupLoading(false);
    }
  }, [startupFilters]);

  useEffect(() => {
    if (firstFilterRun.current) { firstFilterRun.current = false; return; }
    if (startupMode || !productSellerFilter) return;
    const handle = window.setTimeout(() => { void refreshListings(); }, 300);
    return () => window.clearTimeout(handle);
  }, [productSellerFilter, refreshListings, startupMode]);

  useEffect(() => {
    if (!startupMode) return;
    const handle = window.setTimeout(() => { void refreshStartupPosts(); }, 300);
    return () => window.clearTimeout(handle);
  }, [refreshStartupPosts, startupMode]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let identity: string | undefined;
    const synchronize = async (next?: string) => {
      if (!active) return;
      const key = next ?? "signedOut";
      if (identity === undefined) { identity = key; return; }
      if (identity === key) return;
      identity = key;
      generationRef.current += 1;
      startupGenerationRef.current += 1;
      setEntryDialog(undefined); setStartupEntryDialog(undefined); setConfirmation(undefined); setSelectedItem(null); setSelectedBoardPost(null); setError(undefined); setMessage(undefined);
      await Promise.all([refreshListings(), refreshBuyRequests(), startupLoadedRef.current ? refreshStartupPosts() : Promise.resolve(true)]);
    };
    void supabase.auth.getSession().then(({ data }) => synchronize(data.session?.user.id));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { void synchronize(session?.user.id); });
    return () => { active = false; generationRef.current += 1; startupGenerationRef.current += 1; subscription.unsubscribe(); };
  }, [refreshBuyRequests, refreshListings, refreshStartupPosts]);

  const openEntry = (dialog: EntryDialog, trigger: HTMLButtonElement) => { triggerRef.current = trigger; setEntryDialog(dialog); setError(undefined); setMessage(undefined); };
  const openConfirmation = (value: Confirmation, trigger?: HTMLButtonElement) => { if (trigger) triggerRef.current = trigger; setSelectedItem(null); setConfirmation(value); setError(undefined); };
  const closeOverlay = () => { if (busy) return; setEntryDialog(undefined); setStartupEntryDialog(undefined); setConfirmation(undefined); setError(undefined); focusBack(); };

  const openStartupEntry = async (
    initialCategory: StartupBoardCategory,
    initialConsultation: StartupBoardConsultationType,
    trigger: HTMLButtonElement,
  ) => {
    triggerRef.current = trigger;
    const { data } = await createClient().auth.getSession();
    if (!data.session) {
      window.location.assign("/login?next=/market");
      return;
    }
    setStartupEntryDialog({ initialCategory, initialConsultation });
    setError(undefined);
    setMessage(undefined);
  };

  const openStartupDetail = async (post: StartupBoardPost, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setBusy(true);
    setStartupError(undefined);
    try {
      setSelectedBoardPost(await getMarketStartupPostAction(post.postKey));
    } catch (cause) {
      setStartupError(safeError(cause));
    } finally {
      setBusy(false);
    }
  };

  const openStartupEdit = async (post: StartupBoardPostDetail) => {
    setBusy(true);
    setError(undefined);
    try {
      const item = await getMyMarketStartupPostMutationContextAction(post.postKey);
      setSelectedBoardPost(null);
      setStartupEntryDialog({ item, initialCategory: item.category, initialConsultation: item.consultationType });
    } catch (cause) {
      setSelectedBoardPost(null);
      setStartupError(safeError(cause));
      focusBack();
    } finally {
      setBusy(false);
    }
  };

  const openStartupConfirmation = async (post: StartupBoardPostDetail, operation: "close" | "remove") => {
    setBusy(true);
    setError(undefined);
    try {
      const item = await getMyMarketStartupPostMutationContextAction(post.postKey);
      setSelectedBoardPost(null);
      setConfirmation({ kind: "startup", item, operation });
    } catch (cause) {
      setSelectedBoardPost(null);
      setStartupError(safeError(cause));
      focusBack();
    } finally {
      setBusy(false);
    }
  };

  const submitListing = async (input: MarketListingInput, files: File[]) => {
    if (!entryDialog || entryDialog.kind !== "listing") return;
    setBusy(true); setError(undefined);
    try {
      const result = await mutateMarketListingAction({ operation: entryDialog.item ? "update" : "create", listingId: entryDialog.item?.id ?? null, expectedVersion: entryDialog.item?.version ?? null, payload: input, requestId: crypto.randomUUID() });
      for (const file of files) {
        const mimeType = validateClubMediaDeclaration(file.type, file.size);
        const intent = await createMarketMediaUploadIntentAction({ listingId: result.id, declaredMimeType: mimeType, declaredByteSize: file.size, originalFilename: file.name });
        const uploaded = await createClient().storage.from(intent.bucket).uploadToSignedUrl(intent.path, intent.token, file, { contentType: mimeType });
        if (uploaded.error) { await failMarketMediaUploadAction(intent.mediaId).catch(() => undefined); throw new Error("사진 업로드에 실패했습니다. 판매글은 저장되었으며 수정 화면에서 다시 추가할 수 있습니다."); }
        await finalizeMarketMediaUploadAction(intent.mediaId);
      }
      const refreshed = await refreshListings();
      setEntryDialog(undefined);
      setMessage(refreshed ? `판매글이 ${entryDialog.item ? "수정" : "등록"}되었습니다.` : "판매글은 저장됐지만 화면을 갱신하지 못했습니다. 다시 불러와 주세요.");
      focusBack();
    } catch (cause) { setError(safeError(cause)); }
    finally { setBusy(false); }
  };

  const submitBuyRequest = async (input: MarketBuyRequestInput) => {
    if (!entryDialog || entryDialog.kind !== "buy") return;
    setBusy(true); setError(undefined);
    try {
      await mutateMarketBuyRequestAction({ operation: entryDialog.item ? "update" : "create", buyRequestId: entryDialog.item?.id ?? null, expectedVersion: entryDialog.item?.version ?? null, payload: input, requestId: crypto.randomUUID() });
      const refreshed = await refreshBuyRequests();
      setEntryDialog(undefined);
      setMessage(refreshed ? `구매요청이 ${entryDialog.item ? "수정" : "등록"}되었습니다.` : "구매요청은 저장됐지만 화면을 갱신하지 못했습니다.");
      focusBack();
    } catch (cause) { setError(safeError(cause)); }
    finally { setBusy(false); }
  };

  const submitStartupPost = async (input: MarketStartupPostInput) => {
    if (!startupEntryDialog) return;
    const item = startupEntryDialog.item;
    setBusy(true);
    setError(undefined);
    try {
      await mutateMarketStartupPostAction({
        operation: item ? "update" : "create",
        postKey: item?.postKey ?? null,
        expectedVersion: item?.version ?? null,
        payload: input,
      });
      const refreshed = await refreshStartupPosts();
      setStartupEntryDialog(undefined);
      setMessage(refreshed ? `창업·매매 게시글이 ${item ? "수정" : "등록"}되었습니다.` : "게시글은 저장됐지만 화면을 갱신하지 못했습니다. 다시 불러와 주세요.");
      focusBack();
    } catch (cause) {
      setError(safeError(cause));
      if (cause instanceof MarketError && cause.shouldRefresh) await refreshStartupPosts();
    } finally {
      setBusy(false);
    }
  };

  const confirmMutation = async () => {
    if (!confirmation) return;
    setBusy(true); setError(undefined);
    try {
      if (confirmation.kind === "listing") {
        await mutateMarketListingAction({ operation: confirmation.operation, listingId: confirmation.item.id, expectedVersion: confirmation.item.version ?? null, payload: null, requestId: crypto.randomUUID() });
        await refreshListings();
      } else if (confirmation.kind === "buy") {
        await mutateMarketBuyRequestAction({ operation: confirmation.operation, buyRequestId: confirmation.item.id, expectedVersion: confirmation.item.version ?? null, payload: null, requestId: crypto.randomUUID() });
        await refreshBuyRequests();
      } else {
        await mutateMarketStartupPostAction({ operation: confirmation.operation, postKey: confirmation.item.postKey, expectedVersion: confirmation.item.version, payload: null });
        await refreshStartupPosts();
      }
      setConfirmation(undefined); setMessage("장터 글 상태가 변경되었습니다."); focusBack();
    } catch (cause) {
      if (confirmation.kind === "startup") {
        setConfirmation(undefined);
        setStartupError(safeError(cause));
        if (cause instanceof MarketError && cause.shouldRefresh) await refreshStartupPosts();
        focusBack();
      } else {
        setError(safeError(cause));
      }
    }
    finally { setBusy(false); }
  };

  const loadMoreListings = async () => {
    if (loading || !listings.hasMore) return;
    setLoading(true);
    try { const next = await listMarketListingsAction(serverFilters, 24, listings.items.length); setListings({ ...next, items: [...listings.items, ...next.items] }); }
    catch (cause) { setError(safeError(cause)); }
    finally { setLoading(false); }
  };
  const loadMoreBuyRequests = async () => {
    if (loading || !buyRequests.hasMore) return;
    setLoading(true);
    try { const next = await listMarketBuyRequestsAction(24, buyRequests.items.length); setBuyRequests({ ...next, items: [...buyRequests.items, ...next.items] }); }
    catch (cause) { setError(safeError(cause)); }
    finally { setLoading(false); }
  };

  const loadMoreStartupPosts = async () => {
    if (startupLoading || !startupPosts.hasMore) return;
    const generation = ++startupGenerationRef.current;
    setStartupLoading(true);
    try {
      const next = await listMarketStartupPostsAction(startupFilters, 24, startupPosts.items.length);
      if (generation !== startupGenerationRef.current) return;
      setStartupPosts({ ...next, items: [...startupPosts.items, ...next.items] });
      setStartupError(undefined);
    } catch (cause) {
      if (generation === startupGenerationRef.current) setStartupError(safeError(cause));
    } finally {
      if (generation === startupGenerationRef.current) setStartupLoading(false);
    }
  };

  const scrollToSafety = () => { setHubSection("safety"); document.getElementById("market-safety")?.scrollIntoView({ behavior: "smooth" }); };
  const handleHubChange = (section: MarketHubSection) => { setHubSection(section); if (section === "price") document.getElementById("market-price-guide")?.scrollIntoView({ behavior: "smooth" }); else if (section === "guide") document.getElementById("market-buy-guide")?.scrollIntoView({ behavior: "smooth" }); else if (section === "safety") scrollToSafety(); };

  return <>
    <div ref={mainRef} tabIndex={-1} className="space-y-5 pb-4 outline-none lg:space-y-8 lg:pb-2">
      <span className="sr-only" aria-live="polite">{message ?? error}</span>
      {!startupMode ? <><MarketActionButtons onRegister={(trigger) => openEntry({ kind: "listing" }, trigger)} onBuyRegister={(trigger) => openEntry({ kind: "buy" }, trigger)} onSafety={scrollToSafety} /><MarketHubNav active={hubSection} onChange={handleHubChange} /><MarketOpenEventPanel /></> : null}
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900" role="status">{message}</div> : null}
      {error && !entryDialog && !startupEntryDialog && !confirmation ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800" role="alert">{error} <button type="button" onClick={() => void (startupMode ? refreshStartupPosts() : Promise.all([refreshListings(), refreshBuyRequests()]))} className="ml-1 min-h-11 font-bold underline">다시 불러오기</button></div> : null}

      <div className="space-y-2.5 lg:hidden"><MobileSearchToolbar keyword={filters.keyword} onKeywordChange={(keyword) => setFilters({ ...filters, keyword })} resultCount={resultCount} startupMode={startupMode} /><MobileQuickFilterRow title="판매자 유형" filters={filters} onChange={setFilters} type="sellerType" />{!startupMode ? <MobileQuickFilterRow title="카테고리" filters={filters} onChange={setFilters} type="category" /> : null}<MobileQuickFilterRow title="지역" filters={filters} onChange={setFilters} type="region" />{!startupMode ? <MobileQuickFilterRow title="판매 상태" filters={filters} onChange={setFilters} type="saleStatus" /> : null}</div>
      <div className="hidden lg:block"><MarketSearchFilter filters={filters} onChange={setFilters} onReset={() => { setFilters(createDefaultMarketFilters()); setBoardCategory("all"); }} resultCount={resultCount} startupMode={startupMode} /></div>

      {startupMode ? <><StartupBoardGuideBox /><StartupBoardSection posts={startupPosts.items} mode="full" boardCategory={boardCategory} onBoardCategoryChange={setBoardCategory} onDetail={(post, trigger) => void openStartupDetail(post, trigger)} showCategories loading={startupLoading} loadError={startupError} hasMore={startupPosts.hasMore} onRetry={() => void refreshStartupPosts()} onLoadMore={() => void loadMoreStartupPosts()} /><StartupVendorRecommendBanner /><StartupBoardWritePrompt onStartupInquiry={(trigger) => void openStartupEntry("screenStartup", "startupInquiry", trigger)} onResalePost={(trigger) => void openStartupEntry("screenResale", "transfer", trigger)} onFieldInquiry={(trigger) => void openStartupEntry("fieldCourseDevelopment", "courseDevelopment", trigger)} /></> : hubSection === "wanted" ? <section>
        <div className="mb-4"><h2 className="text-xl font-bold">삽니다</h2><p className="mt-1 text-sm text-pul-muted">회원이 등록한 실제 구매 희망 글입니다.</p></div>
        {buyRequests.items.length === 0 ? <div className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-12 text-center text-pul-muted">등록된 구매요청이 없습니다.</div> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{buyRequests.items.map((item) => <BuyRequestCard key={item.id} item={item} onEdit={(value, trigger) => openEntry({ kind: "buy", item: value }, trigger)} onClose={(value, trigger) => openConfirmation({ kind: "buy", item: value, operation: "close" }, trigger)} onDelete={(value, trigger) => openConfirmation({ kind: "buy", item: value, operation: "delete" }, trigger)} />)}</div>}
        {buyRequests.hasMore ? <button type="button" onClick={() => void loadMoreBuyRequests()} disabled={loading} className="mt-4 min-h-11 w-full rounded-lg border border-pul-border bg-white font-bold">{loading ? "불러오는 중…" : "구매요청 더 보기"}</button> : null}
      </section> : <>
        {newest.length > 0 ? <FeaturedMarketCards items={newest} onSelect={(item, trigger) => { triggerRef.current = trigger; setSelectedItem(item); }} /> : null}
        <MarketAdPlaceholder />
        <section id="market-all-listings"><div className="mb-4"><h2 className="text-xl font-bold">전체 상품</h2><p className="mt-1 text-sm text-pul-muted">검색 조건에 맞는 실제 등록 상품 {resultCount}건입니다.</p></div>
          {loading && visibleListings.length === 0 ? <div className="rounded-xl border border-pul-border bg-white px-6 py-12 text-center text-pul-muted" role="status">상품을 불러오는 중입니다.</div> : visibleListings.length === 0 ? <div className="rounded-xl border border-dashed border-pul-border bg-white px-6 py-12 text-center text-pul-muted">조건에 맞는 상품이 없습니다.</div> : <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleListings.map((item) => <MarketProductCard key={item.id} item={item} onSelect={(value, trigger) => { triggerRef.current = trigger; setSelectedItem(value); }} />)}</div>}
          {listings.hasMore && productSellerFilter ? <button type="button" onClick={() => void loadMoreListings()} disabled={loading} className="mt-4 min-h-11 w-full rounded-lg border border-pul-border bg-white font-bold">{loading ? "불러오는 중…" : "상품 더 보기"}</button> : null}
        </section>
        <div className="lg:hidden"><MarketPriceGuidePanel /></div>
        <div className="space-y-3 lg:hidden"><CollapsibleSection title="시세·구매 가이드" summary="실제 거래 전 상품 상태와 시세를 확인하세요."><MarketBuyGuidePanel /></CollapsibleSection><CollapsibleSection title="거래 안내" summary="장터 운영 기준과 장비 관리 안내입니다."><MarketOperationGuide /><MarketCareAndRepairPanel onEquipmentCareInquiry={() => alert("수리 문의 기능은 준비 중입니다.")} /></CollapsibleSection><CollapsibleSection title="안전거래 안내" summary="직거래·선입금·개인정보 안전 수칙입니다."><MarketSafetyGuide /></CollapsibleSection></div>
        <div className="hidden space-y-5 lg:block"><MarketPriceGuidePanel /><MarketBuyGuidePanel /><MarketCareAndRepairPanel onEquipmentCareInquiry={() => alert("수리 문의 기능은 준비 중입니다.")} /><MarketOperationGuide /><MarketSafetyGuide /></div>
      </>}
      <p className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-3 text-center text-xs leading-relaxed text-pul-muted lg:text-sm">{MARKET_PAGE_DISCLAIMER}</p>
    </div>

    <MarketDetailModal item={selectedItem} onClose={() => { setSelectedItem(null); focusBack(); }} onEdit={(item) => { setSelectedItem(null); setEntryDialog({ kind: "listing", item }); }} onStatus={(item, operation) => openConfirmation({ kind: "listing", item, operation })} onDelete={(item) => openConfirmation({ kind: "listing", item, operation: "delete" })} />
    <StartupBoardDetailModal post={selectedBoardPost} busy={busy} onClose={() => { setSelectedBoardPost(null); focusBack(); }} onEdit={(post) => void openStartupEdit(post)} onClosePost={(post) => void openStartupConfirmation(post, "close")} onRemove={(post) => void openStartupConfirmation(post, "remove")} />
    {entryDialog?.kind === "listing" ? <MarketEntryDialog kind="listing" item={entryDialog.item} busy={busy} error={error} onClose={closeOverlay} onSubmit={(input, files) => void submitListing(input, files)} /> : null}
    {entryDialog?.kind === "buy" ? <MarketEntryDialog kind="buy" item={entryDialog.item} busy={busy} error={error} onClose={closeOverlay} onSubmit={(input) => void submitBuyRequest(input)} /> : null}
    {startupEntryDialog ? <StartupBoardEntryDialog item={startupEntryDialog.item} initialCategory={startupEntryDialog.initialCategory} initialConsultation={startupEntryDialog.initialConsultation} busy={busy} error={error} onClose={closeOverlay} onSubmit={(input) => void submitStartupPost(input)} /> : null}
    {confirmation ? <MarketConfirmDialog title={confirmation.operation === "delete" || confirmation.operation === "remove" ? "정말 삭제할까요?" : confirmation.kind === "listing" ? confirmation.operation === "reserve" ? "예약중으로 변경할까요?" : "거래완료로 변경할까요?" : confirmation.kind === "startup" ? "게시글을 종료할까요?" : "구매요청을 종료할까요?"} message={confirmation.operation === "delete" || confirmation.operation === "remove" ? "삭제한 글은 목록에서 사라지며 되돌릴 수 없습니다." : "현재 상태와 version을 다시 확인한 뒤 안전하게 변경합니다."} confirmLabel={confirmation.operation === "delete" || confirmation.operation === "remove" ? "삭제" : "변경"} destructive={confirmation.operation === "delete" || confirmation.operation === "remove"} busy={busy} onClose={closeOverlay} onConfirm={() => void confirmMutation()} /> : null}
  </>;
}
