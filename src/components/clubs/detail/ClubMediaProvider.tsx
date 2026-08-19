"use client";

import {
  createClubMediaUploadIntentAction,
  failClubMediaUploadAction,
  finalizeClubMediaUploadAction,
  removeClubMediaAction,
} from "@/app/clubs/media/actions";
import { ClubPhotosSection, ClubRecentActivitySection } from "@/components/clubs/detail/ClubDetailSections";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import { fetchClubMedia, type ClubMediaSnapshot } from "@/lib/clubs/clubMedia";
import {
  CLUB_MEDIA_MAX_BYTES,
  validateClubMediaDeclaration,
} from "@/lib/clubs/clubMediaValidation";
import { createClient } from "@/lib/supabase/client";
import type { ClubActivityPhoto, ClubDetailData } from "@/types";
import { Camera, ImagePlus } from "lucide-react";
import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";

type UploadKind = "representative" | "activity";
type DialogState =
  | { type: "upload"; kind: UploadKind }
  | { type: "remove"; photo: ClubActivityPhoto };

type ClubMediaContextValue = {
  snapshot: ClubMediaSnapshot;
  detail: ClubDetailData;
  fallbackRef: RefObject<HTMLDivElement | null>;
  openUpload: (kind: UploadKind, trigger: HTMLButtonElement) => void;
  openRemove: (photo: ClubActivityPhoto, trigger: HTMLButtonElement) => void;
  refresh: () => Promise<boolean>;
};

const ClubMediaContext = createContext<ClubMediaContextValue | undefined>(undefined);

function useClubMedia() {
  const context = useContext(ClubMediaContext);
  if (!context) throw new Error("ClubMediaProvider is required.");
  return context;
}

function safeMessage(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "CLUB_MEDIA_AUTHENTICATION_REQUIRED") return "로그인 상태를 다시 확인해 주세요.";
  if (code === "CLUB_MEDIA_PERMISSION_DENIED") return "동호회 사진을 관리할 권한이 없습니다.";
  if (code === "CLUB_MEDIA_INPUT_INVALID" || /MIME|SIZE|FILENAME|EXTENSION/.test(code)) return "JPG, PNG, WebP 형식의 8MB 이하 사진을 선택해 주세요.";
  if (code === "CLUB_MEDIA_OBJECT_VALIDATION_FAILED" || /MAGIC|CONTENT_TYPE/.test(code)) return "실제 이미지 파일을 확인할 수 없습니다. 다른 사진을 선택해 주세요.";
  return "사진을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function focusableElements(container: HTMLElement | null): HTMLElement[] {
  return container
    ? Array.from(container.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])"))
    : [];
}

function UploadDialog({
  kind,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  kind: UploadKind;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: { file: File; caption: string; activityType: string; takenOn: string }) => Promise<void>;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [caption, setCaption] = useState("");
  const [activityType, setActivityType] = useState("other");
  const [takenOn, setTakenOn] = useState("");
  const [localError, setLocalError] = useState<string>();
  useBodyScrollLock(true);

  useEffect(() => {
    fileRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialogRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [busy, onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setLocalError("등록할 사진을 선택해 주세요.");
      fileRef.current?.focus();
      return;
    }
    try {
      validateClubMediaDeclaration(file.type, file.size);
    } catch {
      setLocalError("JPG, PNG, WebP 형식의 8MB 이하 사진을 선택해 주세요.");
      fileRef.current?.focus();
      return;
    }
    setLocalError(undefined);
    void onSubmit({ file, caption, activityType, takenOn });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <form ref={dialogRef} onSubmit={submit} className="flex max-h-[calc(100dvh-24px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
        <header className="flex items-center justify-between border-b border-pul-border px-5 py-4">
          <h2 id={titleId} className="text-xl font-bold">{kind === "representative" ? "대표사진 등록" : "활동사진 등록"}</h2>
          <button type="button" disabled={busy} onClick={onClose} aria-label="닫기" className="min-h-11 min-w-11 rounded-full text-2xl">×</button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="rounded-lg bg-pul-light/50 p-3 text-sm leading-relaxed text-pul-muted">다른 회원이 나온 사진은 동의를 확인한 후 올려주세요.</p>
          <label className="block font-semibold">
            사진 파일
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={(event) => setFile(event.target.files?.[0])}
              required
              className="mt-1 block min-h-11 w-full rounded-lg border border-pul-border p-2 font-normal"
            />
          </label>
          <p className="text-sm text-pul-muted">JPG, PNG, WebP · 최대 {CLUB_MEDIA_MAX_BYTES / 1024 / 1024}MB</p>
          <label className="block font-semibold">
            짧은 설명 <span className="font-normal text-pul-muted">(선택)</span>
            <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={180} rows={3} className="mt-1 w-full rounded-lg border border-pul-border p-3 font-normal" />
          </label>
          {kind === "activity" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block font-semibold">활동 종류
                <select value={activityType} onChange={(event) => setActivityType(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal">
                  <option value="monthly_meeting">월례회</option><option value="tournament">대회</option><option value="friendly_match">친선 경기</option><option value="screen_event">스크린 행사</option><option value="outing">원정</option><option value="training">교육</option><option value="community_event">친목 행사</option><option value="other">기타</option>
                </select>
              </label>
              <label className="block font-semibold">활동일 <span className="font-normal text-pul-muted">(선택)</span>
                <input type="date" value={takenOn} onChange={(event) => setTakenOn(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-pul-border px-3 font-normal" />
              </label>
            </div>
          ) : null}
          {localError || error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-800">{localError ?? error}</p> : null}
        </div>
        <footer className="flex gap-2 border-t border-pul-border px-5 py-4">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-pul-border font-bold">취소</button>
          <button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-lg bg-pul-point font-bold text-white disabled:opacity-60">{busy ? "등록 중..." : "사진 등록"}</button>
        </footer>
      </form>
    </div>
  );
}

function RemoveDialog({ photo, busy, error, onClose, onConfirm }: { photo: ClubActivityPhoto; busy: boolean; error?: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(true);
  useEffect(() => { cancelRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const focusable = focusableElements(dialogRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [busy, onClose]);
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div ref={dialogRef} className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-xl">
      <h2 id={titleId} className="text-xl font-bold">{photo.mediaKind === "representative" ? "대표사진 해제" : "활동사진 삭제"}</h2>
      <p className="mt-3 leading-relaxed text-pul-muted">이 사진을 동호회 상세에서 내립니다. 삭제 후에는 목록에 표시되지 않습니다.</p>
      {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p> : null}
      <div className="mt-5 flex gap-2">
        <button ref={cancelRef} type="button" disabled={busy} onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-pul-border font-bold">취소</button>
        <button type="button" disabled={busy} onClick={() => void onConfirm()} className="min-h-11 flex-1 rounded-lg bg-rose-700 font-bold text-white disabled:opacity-60">{busy ? "처리 중..." : "삭제"}</button>
      </div>
    </div>
  </div>;
}

export function ClubMediaProvider({ detail, clubUuid, initialSnapshot, children }: { detail: ClubDetailData; clubUuid?: string; initialSnapshot: ClubMediaSnapshot; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [dialog, setDialog] = useState<DialogState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<string | undefined>(undefined);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!clubUuid) return false;
    const generation = ++generationRef.current;
    try {
      const next = await fetchClubMedia(createClient(), clubUuid, detail.club.id);
      if (generation === generationRef.current) setSnapshot(next);
      return generation === generationRef.current;
    } catch {
      if (generation === generationRef.current) setError("동호회 사진을 다시 불러오지 못했습니다.");
      return false;
    }
  }, [clubUuid, detail.club.id]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const synchronize = async (userId?: string) => {
      if (!active) return;
      const identity = userId ?? "signedOut";
      const previous = identityRef.current;
      if (previous === undefined) { identityRef.current = identity; return; }
      if (previous === identity) return;
      identityRef.current = identity;
      generationRef.current += 1;
      setDialog(undefined); setError(undefined); setMessage(undefined);
      setSnapshot({ availability: "available", activityPhotos: [], recentActivities: [], capabilities: { canManageMedia: false } });
      await refresh();
    };
    void supabase.auth.getSession().then(({ data }) => synchronize(data.session?.user.id));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { void synchronize(session?.user.id); });
    const coreChanged = () => { void refresh(); };
    window.addEventListener("pul:club-core-content-changed", coreChanged);
    return () => { active = false; generationRef.current += 1; subscription.unsubscribe(); window.removeEventListener("pul:club-core-content-changed", coreChanged); };
  }, [refresh]);

  const openUpload = (kind: UploadKind, trigger: HTMLButtonElement) => { triggerRef.current = trigger; setError(undefined); setDialog({ type: "upload", kind }); };
  const openRemove = (photo: ClubActivityPhoto, trigger: HTMLButtonElement) => { triggerRef.current = trigger; setError(undefined); setDialog({ type: "remove", photo }); };
  const close = useCallback(() => {
    if (busy) return;
    setDialog(undefined); setError(undefined);
    requestAnimationFrame(() => triggerRef.current?.isConnected && triggerRef.current.focus({ preventScroll: true }));
  }, [busy]);
  const focusAfterMutation = () => requestAnimationFrame(() => {
    if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    else fallbackRef.current?.focus({ preventScroll: true });
  });

  const upload = async (input: { file: File; caption: string; activityType: string; takenOn: string }) => {
    if (!dialog || dialog.type !== "upload" || !clubUuid) return;
    setBusy(true); setError(undefined);
    let mediaId: string | undefined;
    try {
      const mimeType = validateClubMediaDeclaration(input.file.type, input.file.size);
      const intent = await createClubMediaUploadIntentAction({ clubId: clubUuid, mediaKind: dialog.kind, caption: input.caption.trim() || undefined, activityType: dialog.kind === "activity" ? input.activityType as "other" : undefined, takenOn: input.takenOn || undefined, declaredMimeType: mimeType, declaredByteSize: input.file.size, originalFilename: input.file.name });
      mediaId = intent.mediaId;
      const uploaded = await createClient().storage.from(intent.bucket).uploadToSignedUrl(intent.path, intent.token, input.file, { contentType: mimeType });
      if (uploaded.error) {
        await failClubMediaUploadAction(mediaId).catch(() => undefined);
        throw new Error("CLUB_MEDIA_UPLOAD_FAILED");
      }
      await finalizeClubMediaUploadAction(mediaId);
      const refreshed = await refresh();
      setDialog(undefined);
      setMessage(refreshed ? "사진이 등록되었습니다." : "사진은 등록됐지만 화면을 갱신하지 못했습니다. 다시 불러오기를 눌러 주세요.");
      focusAfterMutation();
    } catch (cause) {
      setError(safeMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!dialog || dialog.type !== "remove") return;
    setBusy(true); setError(undefined);
    try {
      await removeClubMediaAction(dialog.photo.id);
      const refreshed = await refresh();
      setDialog(undefined);
      setMessage(refreshed ? "사진이 삭제되었습니다." : "사진은 삭제됐지만 화면을 갱신하지 못했습니다. 다시 불러오기를 눌러 주세요.");
      focusAfterMutation();
    } catch (cause) {
      setError(safeMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const context = useMemo<ClubMediaContextValue>(() => ({ snapshot, detail, fallbackRef, openUpload, openRemove, refresh }), [snapshot, detail, refresh]);
  return <ClubMediaContext.Provider value={context}>
    <div className="contents">
      <span className="sr-only" aria-live="polite">{message ?? error}</span>
      {children}
      {dialog?.type === "upload" ? <UploadDialog kind={dialog.kind} busy={busy} error={error} onClose={close} onSubmit={upload} /> : null}
      {dialog?.type === "remove" ? <RemoveDialog photo={dialog.photo} busy={busy} error={error} onClose={close} onConfirm={remove} /> : null}
    </div>
  </ClubMediaContext.Provider>;
}

export function ClubRepresentativePhotoPanel() {
  const { snapshot, openUpload, openRemove } = useClubMedia();
  const photo = snapshot.representativePhoto;
  return <div className="order-2 flex min-h-72 flex-col overflow-hidden rounded-xl border border-pul-border bg-white shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:order-1 lg:row-span-2">
    {photo ? <div className="relative min-h-64 flex-1 sm:min-h-72"><Image src={photo.src} alt={photo.alt ?? "동호회 대표사진"} fill preload className="object-cover" sizes="(max-width: 1024px) 100vw, 46vw" /></div> : <div className="flex min-h-64 flex-1 flex-col items-center justify-center px-5 py-8 text-center"><Camera className="h-12 w-12 text-pul-muted/40" aria-hidden="true" /><h2 className="mt-3 text-lg font-bold">동호회 대표사진</h2><p className="mt-2 text-[15px] leading-relaxed text-pul-muted">등록된 대표사진이 없습니다.<br />동호회 운영진이 대표사진을 등록할 수 있습니다.</p></div>}
    {photo?.caption ? <p className="border-t border-pul-border px-4 py-3 text-sm leading-relaxed text-pul-muted">{photo.caption}</p> : null}
    {snapshot.capabilities.canManageMedia ? <div className="flex flex-wrap gap-2 border-t border-pul-border p-3">
      <button type="button" onClick={(event) => openUpload("representative", event.currentTarget)} className="min-h-11 rounded-lg bg-pul-point px-4 text-sm font-bold text-white hover:bg-pul-deep">{photo ? "대표사진 변경" : "대표사진 등록"}</button>
      {photo ? <button type="button" onClick={(event) => openRemove(photo, event.currentTarget)} className="min-h-11 rounded-lg border border-rose-200 px-4 text-sm font-bold text-rose-700 hover:bg-rose-50">대표사진 해제</button> : null}
    </div> : null}
  </div>;
}

export function ClubMediaContentSections() {
  const { snapshot, detail, fallbackRef, openUpload, openRemove, refresh } = useClubMedia();
  const runtimeDetail = useMemo(() => ({ ...detail, photos: snapshot.activityPhotos, recentActivities: snapshot.recentActivities }), [detail, snapshot.activityPhotos, snapshot.recentActivities]);
  const addAction = snapshot.capabilities.canManageMedia ? <button type="button" onClick={(event) => openUpload("activity", event.currentTarget)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-pul-point px-3 text-sm font-bold text-white hover:bg-pul-deep"><ImagePlus className="h-4 w-4" aria-hidden="true" />사진 등록</button> : undefined;
  return <div ref={fallbackRef} tabIndex={-1} className="space-y-4 outline-none lg:space-y-5">
    {snapshot.availability === "loadFailed" ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">동호회 사진을 불러오지 못했습니다. <button type="button" onClick={() => void refresh()} className="ml-1 min-h-11 font-bold underline">다시 불러오기</button></div> : null}
    <ClubPhotosSection detail={runtimeDetail} action={addAction} onDelete={openRemove} />
    <ClubRecentActivitySection detail={runtimeDetail} />
  </div>;
}
