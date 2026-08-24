"use client";

import {
  createCourseMediaUploadIntentAction,
  failCourseMediaUploadAction,
  finalizeCourseMediaUploadAction,
  removeCourseMediaAction,
} from "@/app/courses/media/actions";
import { useBodyScrollLock } from "@/components/ui/InfoModal";
import {
  emptyPublicCourseMediaPage,
  listPublicCourseMedia,
  type CourseMediaSnapshot,
  type PublicCourseMediaItem,
} from "@/lib/courses/courseMedia";
import {
  CLUB_MEDIA_MAX_BYTES,
  validateClubMediaDeclaration,
} from "@/lib/clubs/clubMediaValidation";
import { createClient } from "@/lib/supabase/client";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

type DialogState =
  | { type: "upload" }
  | { type: "remove"; photo: PublicCourseMediaItem };
type AuthStatus = "loading" | "signedOut" | "signedIn";

const coursePhotoDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
});

function safeMessage(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  if (/AUTHENTICATION/.test(code)) return "로그인 상태를 다시 확인해 주세요.";
  if (/PERMISSION/.test(code)) return "현재 계정으로 이 사진을 처리할 수 없습니다.";
  if (/INPUT|MIME|SIZE|FILENAME|EXTENSION/.test(code)) {
    return "JPG, PNG, WebP 형식의 8MB 이하 사진을 선택해 주세요.";
  }
  if (/OBJECT_VALIDATION|MAGIC|CONTENT_TYPE/.test(code)) {
    return "실제 이미지 파일을 확인할 수 없습니다. 다른 사진을 선택해 주세요.";
  }
  return "활동사진을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function focusableElements(container: HTMLElement | null): HTMLElement[] {
  return container
    ? Array.from(
        container.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), textarea:not([disabled])",
        ),
      )
    : [];
}

function useDialogKeyboard(
  containerRef: React.RefObject<HTMLElement | null>,
  busy: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const focusable = focusableElements(containerRef.current);
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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, containerRef, onClose]);
}

function UploadDialog({
  busy,
  stage,
  error,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  stage?: string;
  error?: string;
  onClose: () => void;
  onSubmit: (file: File, caption: string) => Promise<void>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const [file, setFile] = useState<File>();
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [localError, setLocalError] = useState<string>();
  useBodyScrollLock(true);
  useDialogKeyboard(formRef, busy, onClose);

  useEffect(() => {
    fileRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const selectFile = (nextFile?: File) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreview = nextFile ? URL.createObjectURL(nextFile) : undefined;
    previewUrlRef.current = nextPreview;
    setFile(nextFile);
    setPreviewUrl(nextPreview);
  };

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
    void onSubmit(file, caption);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <form
        ref={formRef}
        onSubmit={submit}
        className="flex max-h-[calc(100dvh-24px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl"
      >
        <header className="flex items-center justify-between border-b border-pul-border px-5 py-4">
          <h2 id={titleId} className="text-xl font-bold">골프장 활동사진 등록</h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="닫기"
            className="min-h-11 min-w-11 rounded-full text-2xl"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p
            id={descriptionId}
            className="rounded-lg bg-pul-light/50 p-3 text-sm leading-relaxed text-pul-muted"
          >
            골프장 현장과 코스 분위기를 보여주는 사진을 올려주세요. 다른 사람의 개인정보나 동의 없이 촬영한 얼굴이 포함된 사진은 등록하지 마세요.
          </p>
          <label className="block font-semibold">
            사진 파일
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              required
              disabled={busy}
              onChange={(event) => selectFile(event.target.files?.[0])}
              className="mt-1 block min-h-11 w-full rounded-lg border border-pul-border p-2 font-normal"
            />
          </label>
          <p className="text-sm text-pul-muted">
            JPG, PNG, WebP · 최대 {CLUB_MEDIA_MAX_BYTES / 1024 / 1024}MB · 한 번에 1장
          </p>
          {previewUrl ? (
            <div className="overflow-hidden rounded-lg border border-pul-border bg-pul-light">
              <Image
                src={previewUrl}
                alt="등록 전 활동사진 미리보기"
                width={640}
                height={360}
                unoptimized
                className="max-h-64 w-full object-contain"
              />
            </div>
          ) : null}
          <label className="block font-semibold">
            짧은 설명 <span className="font-normal text-pul-muted">(선택)</span>
            <textarea
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={180}
              rows={3}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-pul-border p-3 font-normal"
            />
          </label>
          {stage ? <p role="status" className="rounded-lg bg-pul-light p-3 text-sm font-semibold text-pul-deep">{stage}</p> : null}
          {localError || error ? (
            <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-800">
              {localError ?? error}
            </p>
          ) : null}
        </div>
        <footer className="flex gap-2 border-t border-pul-border px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg border border-pul-border font-bold"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 flex-1 rounded-lg bg-pul-point font-bold text-white disabled:opacity-60"
          >
            {busy ? "등록 중..." : "사진 등록"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function RemoveDialog({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useBodyScrollLock(true);
  useDialogKeyboard(dialogRef, busy, onClose);
  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div ref={dialogRef} className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-xl">
        <h2 id={titleId} className="text-xl font-bold">내 활동사진 삭제</h2>
        <p className="mt-3 leading-relaxed text-pul-muted">
          이 사진을 골프장 상세에서 내립니다. 삭제 후에는 공개 목록에 표시되지 않습니다.
        </p>
        {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p> : null}
        <div className="mt-5 flex gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg border border-pul-border font-bold"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="min-h-11 flex-1 rounded-lg bg-rose-700 font-bold text-white disabled:opacity-60"
          >
            {busy ? "삭제 중..." : "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CourseActivityPhotoSection({
  courseKey,
  courseName,
  initialSnapshot,
}: {
  courseKey: string;
  courseName: string;
  initialSnapshot: CourseMediaSnapshot;
}) {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [dialog, setDialog] = useState<DialogState>();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const identityRef = useRef<string | undefined>(undefined);
  const generationRef = useRef(0);
  const operationRef = useRef(false);

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current;
    try {
      const page = await listPublicCourseMedia(createClient(), courseKey, 12, 0);
      if (generation !== generationRef.current) return false;
      setSnapshot({ availability: "available", page });
      return true;
    } catch {
      if (generation === generationRef.current) {
        setSnapshot((current) => ({ ...current, availability: "loadFailed" }));
        setError("활동사진을 다시 불러오지 못했습니다.");
      }
      return false;
    }
  }, [courseKey]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const synchronize = async (userId?: string) => {
      if (!active) return;
      const identity = userId ?? "signedOut";
      setAuthStatus(userId ? "signedIn" : "signedOut");
      if (identityRef.current === undefined) {
        identityRef.current = identity;
        return;
      }
      if (identityRef.current === identity) return;
      identityRef.current = identity;
      generationRef.current += 1;
      setDialog(undefined);
      setBusy(false);
      setStage(undefined);
      setError(undefined);
      setMessage(undefined);
      setSnapshot({ availability: "available", page: emptyPublicCourseMediaPage() });
      await refresh();
    };
    void supabase.auth.getSession().then(({ data }) => synchronize(data.session?.user.id));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void synchronize(session?.user.id);
    });
    const handleServerSignOut = () => {
      void synchronize(undefined);
    };
    window.addEventListener("pul-auth-signed-out", handleServerSignOut);
    return () => {
      active = false;
      generationRef.current += 1;
      subscription.unsubscribe();
      window.removeEventListener("pul-auth-signed-out", handleServerSignOut);
    };
  }, [refresh]);

  const close = useCallback(() => {
    if (busy) return;
    setDialog(undefined);
    setStage(undefined);
    setError(undefined);
    requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) {
        triggerRef.current.focus({ preventScroll: true });
      } else {
        sectionRef.current?.focus({ preventScroll: true });
      }
    });
  }, [busy]);

  const focusAfterMutation = () => {
    requestAnimationFrame(() => sectionRef.current?.focus({ preventScroll: true }));
  };

  const openUpload = (trigger: HTMLButtonElement) => {
    if (authStatus === "signedOut") {
      router.push(`/login?next=/courses/${courseKey}`);
      return;
    }
    if (authStatus !== "signedIn") return;
    triggerRef.current = trigger;
    setError(undefined);
    setMessage(undefined);
    setDialog({ type: "upload" });
  };

  const upload = async (file: File, caption: string) => {
    if (operationRef.current) return;
    operationRef.current = true;
    setBusy(true);
    setError(undefined);
    let mediaKey: string | undefined;
    try {
      const mimeType = validateClubMediaDeclaration(file.type, file.size);
      setStage("업로드를 준비하고 있습니다.");
      const intent = await createCourseMediaUploadIntentAction({
        courseKey,
        caption: caption.trim() || undefined,
        declaredMimeType: mimeType,
        declaredByteSize: file.size,
        originalFilename: file.name,
      });
      mediaKey = intent.mediaKey;
      setStage("사진을 업로드하고 있습니다.");
      const uploaded = await createClient().storage
        .from(intent.bucket)
        .uploadToSignedUrl(intent.path, intent.token, file, { contentType: mimeType });
      if (uploaded.error) {
        await failCourseMediaUploadAction(mediaKey).catch(() => undefined);
        throw new Error("COURSE_MEDIA_UPLOAD_FAILED");
      }
      setStage("사진 파일을 확인하고 있습니다.");
      await finalizeCourseMediaUploadAction(mediaKey);
      const refreshed = await refresh();
      setDialog(undefined);
      setStage(undefined);
      setMessage(
        refreshed
          ? "활동사진이 등록되었습니다."
          : "사진은 등록됐지만 화면을 갱신하지 못했습니다. 다시 불러오기를 눌러 주세요.",
      );
      focusAfterMutation();
    } catch (cause) {
      setError(safeMessage(cause));
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  };

  const openRemove = (photo: PublicCourseMediaItem, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setError(undefined);
    setMessage(undefined);
    setDialog({ type: "remove", photo });
  };

  const remove = async () => {
    if (!dialog || dialog.type !== "remove" || operationRef.current) return;
    operationRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await removeCourseMediaAction(dialog.photo.mediaKey);
      const refreshed = await refresh();
      setDialog(undefined);
      setMessage(
        !result.storageRemoved
          ? "사진은 목록에서 삭제됐지만 저장소 정리가 지연되고 있습니다."
          : refreshed
            ? "활동사진이 삭제되었습니다."
            : "사진은 삭제됐지만 화면을 갱신하지 못했습니다. 다시 불러오기를 눌러 주세요.",
      );
      focusAfterMutation();
    } catch (cause) {
      setError(safeMessage(cause));
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <section
        ref={sectionRef}
        tabIndex={-1}
        aria-labelledby="course-activity-photo-title"
        className="rounded-xl border border-pul-border bg-white p-4 outline-none shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="course-activity-photo-title" className="text-xl font-bold">활동사진</h2>
            <p className="mt-1 text-sm leading-relaxed text-pul-muted">
              회원이 직접 공유한 골프장 현장과 코스 분위기입니다.
            </p>
          </div>
          <button
            type="button"
            disabled={authStatus === "loading"}
            onClick={(event) => openUpload(event.currentTarget)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-pul-point px-4 text-sm font-bold text-white hover:bg-pul-deep disabled:opacity-60"
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {authStatus === "signedOut" ? "로그인하고 사진 등록" : "활동사진 등록"}
          </button>
        </div>

        {message ? <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{message}</p> : null}
        {snapshot.availability === "loadFailed" ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            활동사진을 불러오지 못했습니다.
            <button type="button" onClick={() => void refresh()} className="ml-2 min-h-11 font-bold underline">다시 불러오기</button>
          </p>
        ) : null}

        {snapshot.page.items.length === 0 ? (
          <div className="mt-4 flex min-h-44 flex-col items-center justify-center rounded-lg bg-pul-light/40 px-5 py-8 text-center">
            <Camera className="h-10 w-10 text-pul-muted/40" aria-hidden="true" />
            <p className="mt-3 font-bold">아직 등록된 활동사진이 없습니다.</p>
            <p className="mt-1 text-sm text-pul-muted">이 골프장의 모습을 공유해 보세요.</p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={`${courseName} 활동사진`}>
            {snapshot.page.items.map((photo) => (
              <li key={photo.mediaKey} className="overflow-hidden rounded-lg border border-pul-border bg-white">
                <div className="relative aspect-[4/3] bg-pul-light">
                  <Image
                    src={photo.imageUrl}
                    alt={photo.caption ?? `${courseName} 활동사진`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw"
                    className="object-cover"
                  />
                </div>
                <div className="space-y-2 p-3">
                  <p className="min-h-5 text-sm leading-relaxed text-foreground">
                    {photo.caption ?? "골프장 활동사진"}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <time dateTime={photo.createdAt} className="text-xs text-pul-muted">
                      {coursePhotoDateFormatter.format(new Date(photo.createdAt))}
                    </time>
                    {photo.canDelete ? (
                      <button
                        type="button"
                        onClick={(event) => openRemove(photo, event.currentTarget)}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-bold text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />내 사진 삭제
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {snapshot.page.total > snapshot.page.items.length ? (
          <p className="mt-3 text-sm text-pul-muted">최근 사진 {snapshot.page.items.length}장을 표시하고 있습니다.</p>
        ) : null}
      </section>

      {dialog?.type === "upload" ? (
        <UploadDialog busy={busy} stage={stage} error={error} onClose={close} onSubmit={upload} />
      ) : null}
      {dialog?.type === "remove" ? (
        <RemoveDialog busy={busy} error={error} onClose={close} onConfirm={remove} />
      ) : null}
    </>
  );
}
