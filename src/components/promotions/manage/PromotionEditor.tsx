"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from "react";

import {
  archivePromotionAction,
  createPromotionMediaUploadIntentAction,
  failPromotionMediaUploadAction,
  finalizePromotionMediaUploadAction,
  mutatePromotionPlacementAction,
  removePromotionMediaAction,
  savePromotionAction,
} from "@/app/manage/banners/actions";
import type {
  PromotionManagementDetail,
  PromotionManagementMedia,
  PromotionPlacementItem,
  PromotionSlotDefinition,
} from "@/lib/promotions/promotionManagement";
import {
  blankPromotionDraft,
  friendlySlotName,
  isoToKstLocalDateTime,
  mobileMediaGuidance,
  normalizePromotionEditorDraft,
  normalizePublicationPeriod,
  promotionContentKindLabels,
  promotionLinkTypeLabels,
  promotionStatusLabels,
  slotSpecification,
  validatePromotionImageFile,
  type PromotionEditorDraft,
  PromotionUiValidationError,
} from "@/lib/promotions/promotionManagementUi";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { PromotionConfirmDialog } from "./PromotionConfirmDialog";

type RequestEntry = { fingerprint: string; requestId: string };
type Confirmation =
  | { kind: "archive" }
  | { kind: "hide"; placement: PromotionPlacementItem };

function draftFromDetail(detail: PromotionManagementDetail | null): PromotionEditorDraft {
  if (!detail) return blankPromotionDraft();
  return {
    contentKind: detail.contentKind,
    title: detail.title,
    summary: detail.summary,
    linkType: detail.linkType,
    externalUrl: detail.externalUrl ?? "",
    slug: detail.slug ?? "",
    body: detail.body ?? "",
    detailCtaLabel: detail.detailCtaLabel ?? "",
    detailCtaUrl: detail.detailCtaUrl ?? "",
    contentStatus: detail.contentStatus === "ready" ? "ready" : "draft",
  };
}

function userError(error: unknown) {
  if (error instanceof PromotionUiValidationError) return error.userMessage;
  return "작업을 완료하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.";
}

function requestFingerprint(value: unknown) {
  return JSON.stringify(value);
}

function mediaLabel(variant: PromotionManagementMedia["variant"]) {
  if (variant === "desktop_banner") return "PC 이미지";
  if (variant === "mobile_banner") return "모바일 이미지";
  return "상세 이미지";
}

function placementStatusClass(status: PromotionPlacementItem["displayStatus"]) {
  if (status === "live") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "scheduled") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "ended") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "hidden") return "border-slate-200 bg-slate-100 text-slate-700";
  return "border-pul-border bg-pul-light text-pul-deep";
}

export function PromotionEditor({
  detail,
  slots,
  initialStartsAt,
  initialEndsAt,
  setupNotice,
}: {
  detail: PromotionManagementDetail | null;
  slots: PromotionSlotDefinition[];
  initialStartsAt: string;
  initialEndsAt: string;
  setupNotice?: "created" | "placement-error";
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState(() => draftFromDetail(detail));
  const [slotCode, setSlotCode] = useState(() => detail?.placements[0]?.slotCode ?? slots.find((slot) => slot.enabled)?.slotCode ?? "");
  const [startsAt, setStartsAt] = useState(() => detail?.placements[0] ? isoToKstLocalDateTime(detail.placements[0].startsAt) : initialStartsAt);
  const [endsAt, setEndsAt] = useState(() => detail?.placements[0] ? isoToKstLocalDateTime(detail.placements[0].endsAt) : initialEndsAt);
  const [selectedPlacementKey, setSelectedPlacementKey] = useState(() => detail?.placements[0]?.placementKey ?? "new");
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [desktopAlt, setDesktopAlt] = useState("");
  const [mobileAlt, setMobileAlt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState(() => {
    if (setupNotice === "created") return "초안과 게시 위치를 저장했습니다. 이미지를 등록한 뒤 게시할 수 있습니다.";
    if (setupNotice === "placement-error") return "홍보 초안은 저장됐지만 게시 위치를 저장하지 못했습니다. 아래에서 다시 설정해 주세요.";
    return "";
  });
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const requestIdsRef = useRef(new Map<string, RequestEntry>());
  const confirmTriggerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const selectedSlot = slots.find((slot) => slot.slotCode === slotCode) ?? null;
  const currentPlacement = detail?.placements.find((placement) => placement.placementKey === selectedPlacementKey) ?? null;
  const archived = detail?.contentStatus === "archived";
  const availableMedia = detail?.media.filter((media) => media.mediaStatus === "available") ?? [];

  const detailSignature = detail
    ? `${detail.promotionKey}:${detail.version}:${detail.updatedAt}:${detail.media.map((item) => `${item.mediaKey}:${item.version}`).join(",")}:${detail.placements.map((item) => `${item.placementKey}:${item.version}`).join(",")}`
    : "new";

  useEffect(() => {
    if (!detail) return;
    const frame = window.requestAnimationFrame(() => {
      setDraft(draftFromDetail(detail));
      setDesktopFile(null);
      setMobileFile(null);
      const placement = detail.placements.find((item) => item.placementKey === selectedPlacementKey) ?? detail.placements[0];
      if (placement) {
        setSelectedPlacementKey(placement.placementKey);
        setSlotCode(placement.slotCode);
        setStartsAt(isoToKstLocalDateTime(placement.startsAt));
        setEndsAt(isoToKstLocalDateTime(placement.endsAt));
      } else {
        setSelectedPlacementKey("new");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  // A server refresh changes the signature; selection is intentionally retained when possible.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailSignature]);

  function requestFor(action: string, payload: unknown) {
    const fingerprint = requestFingerprint(payload);
    const existing = requestIdsRef.current.get(action);
    if (existing?.fingerprint === fingerprint) return existing.requestId;
    const entry = { fingerprint, requestId: crypto.randomUUID() };
    requestIdsRef.current.set(action, entry);
    return entry.requestId;
  }

  function cancelConfirmation() {
    const trigger = confirmTriggerRef.current;
    setConfirmation(null);
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }

  function completeRequest(action: string) {
    requestIdsRef.current.delete(action);
  }

  function announceSuccess(nextMessage: string, focusHeading = true) {
    setError("");
    setMessage(nextMessage);
    if (focusHeading) {
      window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    }
  }

  function announceFailure(nextMessage: string, shouldRefresh = false) {
    setMessage("");
    setError(nextMessage);
    if (shouldRefresh) router.refresh();
  }

  function updateDraft<Key extends keyof PromotionEditorDraft>(key: Key, value: PromotionEditorDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy("content");
    try {
      const normalized = normalizePromotionEditorDraft(draft);
      const payload = {
        promotionKey: detail?.promotionKey ?? null,
        expectedVersion: detail?.version ?? null,
        draft: normalized,
      };
      const actionKey = detail ? "promotion.update" : "promotion.create";
      const result = await savePromotionAction({
        requestId: requestFor(actionKey, payload),
        ...payload,
      });
      if (!result.ok) {
        announceFailure(result.message, result.shouldRefresh);
        return;
      }
      completeRequest(actionKey);

      if (!detail && result.promotionKey) {
        const period = normalizePublicationPeriod(startsAt, endsAt);
        const placementPayload = {
          operation: "create" as const,
          promotionKey: result.promotionKey,
          placementKey: null,
          expectedVersion: null,
          slotCode,
          startsAt,
          endsAt,
        };
        const placementResult = await mutatePromotionPlacementAction({
          requestId: requestFor("placement.create", { ...placementPayload, period }),
          ...placementPayload,
        });
        if (placementResult.ok) completeRequest("placement.create");
        router.replace(`/manage/banners/${result.promotionKey}?setup=${placementResult.ok ? "created" : "placement-error"}`);
        router.refresh();
        return;
      }
      announceSuccess(result.message);
      router.refresh();
    } catch (cause) {
      announceFailure(userError(cause));
    } finally {
      setBusy(null);
    }
  }

  function selectPlacement(value: string) {
    setSelectedPlacementKey(value);
    if (value === "new") {
      setSlotCode(slots.find((slot) => slot.enabled)?.slotCode ?? "");
      setStartsAt(initialStartsAt);
      setEndsAt(initialEndsAt);
      return;
    }
    const placement = detail?.placements.find((item) => item.placementKey === value);
    if (!placement) return;
    setSlotCode(placement.slotCode);
    setStartsAt(isoToKstLocalDateTime(placement.startsAt));
    setEndsAt(isoToKstLocalDateTime(placement.endsAt));
  }

  async function savePlacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || archived) return;
    setBusy("placement");
    setError("");
    setMessage("");
    try {
      normalizePublicationPeriod(startsAt, endsAt);
      const operation = currentPlacement ? "update" : "create";
      const payload = {
        operation,
        promotionKey: detail.promotionKey,
        placementKey: currentPlacement?.placementKey ?? null,
        expectedVersion: currentPlacement?.version ?? null,
        slotCode: currentPlacement ? null : slotCode,
        startsAt,
        endsAt,
      };
      const actionKey = `placement.${operation}:${currentPlacement?.placementKey ?? slotCode}`;
      const result = await mutatePromotionPlacementAction({ requestId: requestFor(actionKey, payload), ...payload });
      if (!result.ok) {
        announceFailure(result.message, result.shouldRefresh);
        return;
      }
      completeRequest(actionKey);
      announceSuccess(result.message);
      router.refresh();
    } catch (cause) {
      announceFailure(userError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function publishPlacement(placement: PromotionPlacementItem) {
    if (!detail || archived) return;
    const actionKey = `placement.publish:${placement.placementKey}`;
    const payload = {
      operation: "publish" as const,
      promotionKey: detail.promotionKey,
      placementKey: placement.placementKey,
      expectedVersion: placement.version,
      slotCode: null,
      startsAt: null,
      endsAt: null,
    };
    setBusy(actionKey);
    setError("");
    setMessage("");
    const result = await mutatePromotionPlacementAction({ requestId: requestFor(actionKey, payload), ...payload });
    if (result.ok) {
      completeRequest(actionKey);
      announceSuccess(result.message);
      router.refresh();
    } else {
      announceFailure(result.message, result.shouldRefresh);
    }
    setBusy(null);
  }

  async function confirmDangerousAction() {
    if (!detail || !confirmation) return;
    const actionKey = confirmation.kind === "archive"
      ? "promotion.archive"
      : `placement.hide:${confirmation.placement.placementKey}`;
    setBusy(actionKey);
    setError("");
    setMessage("");
    const result = confirmation.kind === "archive"
      ? await archivePromotionAction({
          requestId: requestFor(actionKey, { promotionKey: detail.promotionKey, expectedVersion: detail.version }),
          promotionKey: detail.promotionKey,
          expectedVersion: detail.version,
        })
      : await mutatePromotionPlacementAction({
          requestId: requestFor(actionKey, {
            placementKey: confirmation.placement.placementKey,
            expectedVersion: confirmation.placement.version,
          }),
          operation: "hide",
          promotionKey: detail.promotionKey,
          placementKey: confirmation.placement.placementKey,
          expectedVersion: confirmation.placement.version,
          slotCode: null,
          startsAt: null,
          endsAt: null,
        });
    if (result.ok) {
      completeRequest(actionKey);
      confirmTriggerRef.current = null;
      setConfirmation(null);
      announceSuccess(result.message);
      router.refresh();
    } else {
      setConfirmation(null);
      announceFailure(result.message, result.shouldRefresh);
    }
    setBusy(null);
  }

  async function uploadMedia(variant: "desktop_banner" | "mobile_banner") {
    if (!detail || archived) return;
    const file = variant === "desktop_banner" ? desktopFile : mobileFile;
    const altText = (variant === "desktop_banner" ? desktopAlt : mobileAlt).trim();
    if (!file) {
      announceFailure("등록할 이미지 파일을 선택해 주세요.");
      return;
    }
    if ([...altText].length < 2 || [...altText].length > 500) {
      announceFailure("대체텍스트는 2~500자로 입력해 주세요.");
      return;
    }
    try {
      validatePromotionImageFile(file);
    } catch (cause) {
      announceFailure(userError(cause));
      return;
    }
    const actionKey = `media.upload:${variant}`;
    const input = {
      promotionKey: detail.promotionKey,
      variant,
      altText,
      mimeType: file.type,
      byteSize: file.size,
      filename: file.name,
    };
    setBusy(actionKey);
    setError("");
    setMessage("");
    let mediaKey: string | undefined;
    try {
      const intent = await createPromotionMediaUploadIntentAction({
        requestId: requestFor(`${actionKey}:intent`, input),
        ...input,
      });
      if (!intent.ok || !intent.upload) {
        announceFailure(intent.ok ? "이미지 업로드를 준비하지 못했습니다." : intent.message, !intent.ok && intent.shouldRefresh);
        return;
      }
      mediaKey = intent.upload.mediaKey;
      completeRequest(`${actionKey}:intent`);
      const uploaded = await supabase.storage
        .from(intent.upload.bucket)
        .uploadToSignedUrl(intent.upload.path, intent.upload.token, file, { contentType: intent.upload.mimeType });
      if (uploaded.error) {
        throw new PromotionUiValidationError("이미지 업로드에 실패했습니다. 기존 이미지는 유지됩니다.");
      }
      const finalizeInput = { promotionKey: detail.promotionKey, mediaKey };
      const finalized = await finalizePromotionMediaUploadAction({
        ...finalizeInput,
        requestId: requestFor(`${actionKey}:finalize`, finalizeInput),
      });
      if (!finalized.ok) {
        announceFailure(finalized.message, finalized.shouldRefresh);
        return;
      }
      completeRequest(`${actionKey}:finalize`);
      if (variant === "desktop_banner") {
        setDesktopFile(null);
        setDesktopAlt("");
        if (desktopInputRef.current) desktopInputRef.current.value = "";
      } else {
        setMobileFile(null);
        setMobileAlt("");
        if (mobileInputRef.current) mobileInputRef.current.value = "";
      }
      announceSuccess(`${mediaLabel(variant)}를 등록했습니다.`);
      router.refresh();
    } catch (cause) {
      if (mediaKey) await failPromotionMediaUploadAction({ mediaKey }).catch(() => undefined);
      announceFailure(userError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function removeMedia(media: PromotionManagementMedia) {
    if (!detail || archived) return;
    const actionKey = `media.remove:${media.mediaKey}`;
    const payload = {
      promotionKey: detail.promotionKey,
      mediaKey: media.mediaKey,
      expectedVersion: media.version,
    };
    setBusy(actionKey);
    setError("");
    setMessage("");
    const result = await removePromotionMediaAction({ requestId: requestFor(actionKey, payload), ...payload });
    if (result.ok) {
      completeRequest(actionKey);
      announceSuccess(result.message);
      router.refresh();
    } else {
      announceFailure(result.message, result.shouldRefresh);
    }
    setBusy(null);
  }

  function publicUrl(media: PromotionManagementMedia) {
    return supabase.storage.from(media.storageBucket).getPublicUrl(media.storagePath).data.publicUrl;
  }

  function mediaInput(
    variant: "desktop_banner" | "mobile_banner",
    title: string,
    file: File | null,
    altText: string,
    setFile: (file: File | null) => void,
    setAltText: (value: string) => void,
    inputRef: RefObject<HTMLInputElement | null>,
  ) {
    const existing = availableMedia.find((media) => media.variant === variant);
    const busyKey = `media.upload:${variant}`;
    return (
      <article className="rounded-2xl border border-pul-border bg-pul-page p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-foreground">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-pul-muted">
              {selectedSlot ? slotSpecification(selectedSlot) : "게시 슬롯을 선택하면 권장 규격을 확인할 수 있습니다."}
            </p>
          </div>
          {existing ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-800">등록됨</span> : null}
        </div>
        {existing ? (
          <div className="mt-3">
            <div
              role="img"
              aria-label={existing.altText}
              className={cn("w-full rounded-xl border border-pul-border bg-slate-100 bg-cover bg-center", variant === "desktop_banner" ? "aspect-[5/1]" : "aspect-[9/4]")}
              style={{ backgroundImage: `url("${publicUrl(existing)}")` }}
            />
            <p className="mt-2 break-words text-sm text-pul-muted">대체텍스트: {existing.altText}</p>
            <button
              type="button"
              disabled={busy !== null || archived}
              onClick={() => void removeMedia(existing)}
              className="mt-3 min-h-11 rounded-xl border border-red-200 bg-white px-4 font-bold text-red-700 disabled:opacity-60"
            >
              {busy === `media.remove:${existing.mediaKey}` ? "삭제 중…" : "이미지 삭제"}
            </button>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-bold text-foreground">
            {existing ? "교체할 이미지" : "이미지 파일"}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy !== null || archived}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
              className="min-h-12 rounded-xl border border-pul-border bg-white px-3 py-2 text-base file:mr-3 file:rounded-lg file:border-0 file:bg-pul-light file:px-3 file:py-2 file:font-bold file:text-pul-deep"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold text-foreground">
            대체텍스트 <span className="font-normal text-pul-muted">이미지를 보지 못해도 내용을 이해할 수 있게 적어 주세요.</span>
            <input
              value={altText}
              maxLength={500}
              disabled={busy !== null || archived}
              onChange={(event) => setAltText(event.target.value)}
              className="min-h-12 rounded-xl border border-pul-border bg-white px-3 text-base"
            />
          </label>
          <button
            type="button"
            disabled={busy !== null || archived || !file}
            onClick={() => void uploadMedia(variant)}
            className="min-h-12 rounded-xl bg-pul-deep px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === busyKey ? "업로드 중…" : existing ? "새 이미지로 교체" : "이미지 등록"}
          </button>
          <p className="text-sm text-pul-muted">JPG·PNG·WebP, 최대 5MB. 교체 성공 전까지 기존 이미지는 유지됩니다.</p>
        </div>
      </article>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-6" aria-labelledby="promotion-content-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="promotion-content-heading" className="text-2xl font-black text-foreground">콘텐츠 정보</h2>
              <p className="mt-1 text-sm leading-6 text-pul-muted">운영 목록과 접근성에 쓰이는 제목·요약을 이미지 글씨와 별도로 입력합니다.</p>
            </div>
            {detail ? <span className="rounded-full bg-pul-light px-3 py-1 text-sm font-black text-pul-deep">버전 {detail.version}</span> : null}
          </div>
          <form onSubmit={saveContent} className="mt-5 grid gap-4">
            <label className="grid gap-1 text-sm font-bold text-foreground">
              콘텐츠 구분
              <select
                value={draft.contentKind}
                disabled={busy !== null || archived}
                onChange={(event) => updateDraft("contentKind", event.target.value as PromotionEditorDraft["contentKind"])}
                className="min-h-12 rounded-xl border border-pul-border bg-white px-3 text-base"
              >
                {Object.entries(promotionContentKindLabels).map(([value, label]) => {
                  const unavailable = Boolean(selectedSlot && !selectedSlot.allowedContentKinds.includes(value as PromotionEditorDraft["contentKind"]));
                  return <option key={value} value={value} disabled={unavailable}>{label}{unavailable ? " · 이 위치에서 사용 불가" : ""}</option>;
                })}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold text-foreground">
              제목
              <input value={draft.title} minLength={2} maxLength={180} required disabled={busy !== null || archived} onChange={(event) => updateDraft("title", event.target.value)} className="min-h-12 rounded-xl border border-pul-border px-3 text-base" />
            </label>
            <label className="grid gap-1 text-sm font-bold text-foreground">
              요약
              <textarea value={draft.summary} minLength={10} maxLength={500} required rows={3} disabled={busy !== null || archived} onChange={(event) => updateDraft("summary", event.target.value)} className="rounded-xl border border-pul-border px-3 py-3 text-base leading-7" />
            </label>
            <fieldset disabled={busy !== null || archived}>
              <legend className="text-sm font-bold text-foreground">클릭 방식</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {Object.entries(promotionLinkTypeLabels).map(([value, label]) => (
                  <label key={value} className={cn("flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 font-bold", draft.linkType === value ? "border-pul-point bg-pul-light text-pul-deep" : "border-pul-border bg-white text-foreground")}>
                    <input type="radio" name="linkType" value={value} checked={draft.linkType === value} onChange={() => updateDraft("linkType", value as PromotionEditorDraft["linkType"])} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {draft.linkType === "external" ? (
              <label className="grid gap-1 text-sm font-bold text-foreground">
                외부 HTTPS 주소
                <input type="url" value={draft.externalUrl} required maxLength={2048} disabled={busy !== null || archived} onChange={(event) => updateDraft("externalUrl", event.target.value)} placeholder="https://example.com" className="min-h-12 rounded-xl border border-pul-border px-3 text-base" />
              </label>
            ) : null}
            {draft.linkType === "internal_detail" ? (
              <div className="grid gap-4 rounded-2xl border border-pul-border bg-pul-page p-4">
                <label className="grid gap-1 text-sm font-bold text-foreground">
                  상세 주소용 slug
                  <input value={draft.slug} required maxLength={80} pattern="[a-z0-9][a-z0-9-]{0,79}" disabled={busy !== null || archived} onChange={(event) => updateDraft("slug", event.target.value)} placeholder="pul-event-2026" className="min-h-12 rounded-xl border border-pul-border bg-white px-3 text-base" />
                </label>
                <label className="grid gap-1 text-sm font-bold text-foreground">
                  상세 본문
                  <textarea value={draft.body} required minLength={20} maxLength={20000} rows={8} disabled={busy !== null || archived} onChange={(event) => updateDraft("body", event.target.value)} className="rounded-xl border border-pul-border bg-white px-3 py-3 text-base leading-7" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-bold text-foreground">버튼 문구(선택)<input value={draft.detailCtaLabel} maxLength={40} disabled={busy !== null || archived} onChange={(event) => updateDraft("detailCtaLabel", event.target.value)} className="min-h-12 rounded-xl border border-pul-border bg-white px-3 text-base" /></label>
                  <label className="grid gap-1 text-sm font-bold text-foreground">버튼 주소(선택)<input value={draft.detailCtaUrl} maxLength={2048} disabled={busy !== null || archived} onChange={(event) => updateDraft("detailCtaUrl", event.target.value)} placeholder="/events 또는 https://…" className="min-h-12 rounded-xl border border-pul-border bg-white px-3 text-base" /></label>
                </div>
                <div className="rounded-xl border border-dashed border-pul-border bg-white p-4" aria-label="상세 본문 미리보기">
                  <p className="text-xs font-bold text-pul-muted">작성 내용 미리보기</p>
                  <h3 className="mt-2 text-xl font-black text-foreground">{draft.title || "제목을 입력해 주세요."}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-foreground">{draft.body || "상세 본문을 입력해 주세요."}</p>
                </div>
              </div>
            ) : null}
            {detail ? (
              <label className="grid gap-1 text-sm font-bold text-foreground">
                콘텐츠 준비 상태
                <select value={draft.contentStatus} disabled={busy !== null || archived} onChange={(event) => updateDraft("contentStatus", event.target.value as PromotionEditorDraft["contentStatus"])} className="min-h-12 rounded-xl border border-pul-border bg-white px-3 text-base">
                  <option value="draft">초안</option>
                  <option value="ready">게시 준비 완료</option>
                </select>
                <span className="font-normal leading-6 text-pul-muted">PC 이미지와 필수 내용을 등록한 뒤 준비 완료로 저장하세요.</span>
              </label>
            ) : null}
            <button type="submit" disabled={busy !== null || archived} className="min-h-12 rounded-xl bg-pul-point px-5 font-black text-white disabled:opacity-50">
              {busy === "content" ? "저장 중…" : detail ? "콘텐츠 저장" : "초안과 게시 위치 저장"}
            </button>
          </form>
        </section>

        {detail ? (
          <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-6" aria-labelledby="promotion-media-heading">
            <h2 id="promotion-media-heading" className="text-2xl font-black text-foreground">이미지</h2>
            <p className="mt-2 text-sm leading-6 text-pul-muted">signed upload로 전송하며 브라우저에는 관리자용 서버 비밀키가 전달되지 않습니다.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {mediaInput("desktop_banner", "PC 이미지 · 필수", desktopFile, desktopAlt, setDesktopFile, setDesktopAlt, desktopInputRef)}
              {mediaInput("mobile_banner", `모바일 이미지 · ${mobileMediaGuidance(selectedSlot)}`, mobileFile, mobileAlt, setMobileFile, setMobileAlt, mobileInputRef)}
            </div>
          </section>
        ) : null}
      </div>

      <aside className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5" aria-labelledby="promotion-placement-heading">
          <h2 id="promotion-placement-heading" className="text-xl font-black text-foreground">게시 위치와 기간</h2>
          <p className="mt-2 text-sm leading-6 text-pul-muted">한국 시간(KST) 기준입니다. 미래 시작 시각은 예약으로, 현재 기간은 게시중으로 계산됩니다.</p>
          {detail?.placements.length ? (
            <label className="mt-4 grid gap-1 text-sm font-bold text-foreground">
              관리할 게시 배정
              <select value={selectedPlacementKey} disabled={busy !== null || archived} onChange={(event) => selectPlacement(event.target.value)} className="min-h-12 rounded-xl border border-pul-border bg-white px-3 text-base">
                {detail.placements.map((placement) => <option key={placement.placementKey} value={placement.placementKey}>{friendlySlotName(slots.find((slot) => slot.slotCode === placement.slotCode) ?? { slotCode: placement.slotCode, displayName: placement.slotCode })} · {promotionStatusLabels[placement.displayStatus]}</option>)}
                <option value="new">새 위치 추가</option>
              </select>
            </label>
          ) : null}
          <form onSubmit={savePlacement} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-foreground">
              위치
              <select value={slotCode} disabled={busy !== null || archived || Boolean(currentPlacement)} onChange={(event) => setSlotCode(event.target.value)} className="min-h-12 rounded-xl border border-pul-border bg-white px-3 text-base">
                {slots.map((slot) => (
                  <option key={slot.slotCode} value={slot.slotCode} disabled={!slot.enabled}>
                    {friendlySlotName(slot)}{slot.enabled ? "" : " · 사용 중지"}
                  </option>
                ))}
              </select>
              {selectedSlot ? (
                <span className="font-normal leading-6 text-pul-muted">
                  {selectedSlot.slotCode} · {slotSpecification(selectedSlot)}{selectedSlot.formatCode === "vertical_rail" ? " · PC 전용" : ""}
                </span>
              ) : null}
            </label>
            <label className="grid gap-1 text-sm font-bold text-foreground">게시 시작<input type="datetime-local" value={startsAt} required disabled={busy !== null || archived} onChange={(event) => setStartsAt(event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-pul-border px-3 text-base" /></label>
            <label className="grid gap-1 text-sm font-bold text-foreground">게시 종료<input type="datetime-local" value={endsAt} required disabled={busy !== null || archived} onChange={(event) => setEndsAt(event.target.value)} className="min-h-12 min-w-0 rounded-xl border border-pul-border px-3 text-base" /></label>
            <button type="submit" disabled={busy !== null || archived || !detail} className="min-h-12 rounded-xl border border-pul-deep bg-white px-4 font-black text-pul-deep disabled:opacity-50">
              {busy === "placement" ? "저장 중…" : currentPlacement ? "게시 기간 수정" : detail ? "새 게시 위치 저장" : "초안 저장 시 함께 저장"}
            </button>
          </form>

          {detail?.placements.length ? (
            <ul className="mt-5 grid gap-3 border-t border-pul-border pt-5">
              {detail.placements.map((placement) => (
                <li key={placement.placementKey} className="rounded-xl border border-pul-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-black text-foreground">{friendlySlotName(slots.find((slot) => slot.slotCode === placement.slotCode) ?? { slotCode: placement.slotCode, displayName: placement.slotCode })}</p>
                    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-black", placementStatusClass(placement.displayStatus))}>{promotionStatusLabels[placement.displayStatus]}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-pul-muted">버전 {placement.version} · {placement.publicationStatus === "published" ? "게시 설정됨" : placement.publicationStatus === "hidden" ? "숨김" : "초안"}</p>
                  {!archived ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {placement.publicationStatus !== "published" ? (
                        <button type="button" disabled={busy !== null} onClick={() => void publishPlacement(placement)} className="min-h-11 rounded-xl bg-pul-point px-3 font-black text-white disabled:opacity-50">{busy === `placement.publish:${placement.placementKey}` ? "처리 중…" : "게시/예약"}</button>
                      ) : (
                        <button type="button" disabled={busy !== null} onClick={(event) => { confirmTriggerRef.current = event.currentTarget; setConfirmation({ kind: "hide", placement }); }} className="min-h-11 rounded-xl border border-red-200 bg-white px-3 font-black text-red-700 disabled:opacity-50">숨김</button>
                      )}
                      <button type="button" disabled={busy !== null} onClick={() => selectPlacement(placement.placementKey)} className="min-h-11 rounded-xl border border-pul-border bg-white px-3 font-bold text-foreground disabled:opacity-50">기간 수정</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5" aria-labelledby="promotion-status-heading">
          <h2 ref={headingRef} tabIndex={-1} id="promotion-status-heading" className="text-xl font-black text-foreground outline-none">현재 작업 상태</h2>
          {message ? <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold leading-6 text-emerald-800">{message}</p> : null}
          {error ? <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold leading-6 text-red-800">{error}</p> : null}
          {!message && !error ? <p className="mt-2 text-sm leading-6 text-pul-muted">저장 결과와 충돌 안내가 여기에 표시됩니다.</p> : null}
          {detail ? (
            <div className="mt-4 grid gap-2 text-sm">
              <p><span className="font-bold text-pul-muted">콘텐츠:</span> <span className="font-black text-foreground">{detail.contentStatus === "ready" ? "게시 준비 완료" : detail.contentStatus === "archived" ? "보관됨" : "초안"}</span></p>
              <p><span className="font-bold text-pul-muted">PC 이미지:</span> <span className="font-black text-foreground">{availableMedia.some((media) => media.variant === "desktop_banner") ? "등록됨" : "필요"}</span></p>
              <p><span className="font-bold text-pul-muted">게시 배정:</span> <span className="font-black text-foreground">{detail.placements.length}건</span></p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-pul-light p-3 text-sm font-bold leading-6 text-pul-deep">초안을 저장하면 이미지 등록과 실제 게시 버튼이 열립니다.</p>
          )}
          {detail && !archived ? (
            <button type="button" disabled={busy !== null} onClick={(event) => { confirmTriggerRef.current = event.currentTarget; setConfirmation({ kind: "archive" }); }} className="mt-5 min-h-11 w-full rounded-xl border border-red-200 bg-white px-4 font-black text-red-700 disabled:opacity-50">콘텐츠 보관</button>
          ) : null}
          {archived ? <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm font-bold leading-6 text-slate-700">보관된 콘텐츠는 수정하거나 다시 게시할 수 없습니다.</p> : null}
          <Link href="/manage/banners" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep">목록으로 돌아가기</Link>
        </section>
      </aside>

      {confirmation ? (
        <PromotionConfirmDialog
          title={confirmation.kind === "archive" ? "이 홍보 콘텐츠를 보관할까요?" : "이 배너를 숨길까요?"}
          description={confirmation.kind === "archive" ? "게시된 위치가 있다면 먼저 숨겨야 합니다. 보관 후에는 수정하거나 다시 게시할 수 없습니다." : "공개 페이지 연결 후에는 즉시 제외됩니다. 콘텐츠와 이미지는 보존됩니다."}
          confirmLabel={confirmation.kind === "archive" ? "보관" : "숨김"}
          danger
          busy={busy !== null}
          onCancel={cancelConfirmation}
          onConfirm={() => void confirmDangerousAction()}
        />
      ) : null}
    </div>
  );
}
