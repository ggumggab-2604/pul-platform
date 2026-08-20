"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import {
  mutateNewsArticleAction,
} from "@/app/news/manage/actions";
import { categoryLabels, sourceTypeLabels } from "@/data/newsData";
import type {
  ManagementNewsArticle,
  NewsCategory,
  NewsMutationOperation,
  NewsPage,
  NewsSourceType,
} from "@/lib/news/newsDirectory";
import { cn } from "@/lib/utils";

type Draft = {
  newsKey: string;
  category: NewsCategory;
  title: string;
  summary: string;
  body: string;
  region: string;
  sourceType: NewsSourceType;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  featured: boolean;
};

type ConfirmState = {
  article: ManagementNewsArticle;
  operation: Exclude<NewsMutationOperation, "create" | "update">;
  trigger: HTMLButtonElement;
};

const categoryOptions = Object.entries(categoryLabels) as [NewsCategory, string][];
const sourceOptions = Object.entries(sourceTypeLabels) as [NewsSourceType, string][];
const statusLabels = { published: "공개", hidden: "숨김", removed: "제거" } as const;
const INPUT_CLASS =
  "min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white px-3 py-2 text-base text-foreground";

function localDateTime(value = new Date().toISOString()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function blankDraft(): Draft {
  return {
    newsKey: "",
    category: "parkGolfNews",
    title: "",
    summary: "",
    body: "",
    region: "전국",
    sourceType: "adminVerified",
    sourceName: "",
    sourceUrl: "",
    publishedAt: localDateTime(),
    featured: false,
  };
}

function articleDraft(article: ManagementNewsArticle): Draft {
  return {
    newsKey: article.newsKey,
    category: article.category,
    title: article.title,
    summary: article.summary,
    body: article.body,
    region: article.region,
    sourceType: article.sourceType,
    sourceName: article.sourceName ?? "",
    sourceUrl: article.sourceUrl ?? "",
    publishedAt: localDateTime(article.publishedAt),
    featured: article.featured,
  };
}

export function NewsManagementPage({ initialPage }: { initialPage: NewsPage<ManagementNewsArticle> }) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = selectedKey
    ? initialPage.items.find((article) => article.newsKey === selectedKey) ?? null
    : null;

  const choose = (article: ManagementNewsArticle) => {
    setSelectedKey(article.newsKey);
    setDraft(articleDraft(article));
    setNotice(null);
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  };

  const startNew = () => {
    setSelectedKey(null);
    setDraft(blankDraft());
    setNotice(null);
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const operation = selected ? "update" : "create";
    setNotice(null);
    startTransition(async () => {
      const result = await mutateNewsArticleAction({
        operation,
        newsKey: draft.newsKey,
        expectedVersion: selected?.version ?? null,
        payload: {
          category: draft.category,
          title: draft.title,
          summary: draft.summary,
          body: draft.body,
          region: draft.region,
          sourceType: draft.sourceType,
          sourceName: draft.sourceName || null,
          sourceUrl: draft.sourceUrl || null,
          publishedAt: new Date(draft.publishedAt).toISOString(),
          featured: draft.featured,
        },
      });
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        setSelectedKey(result.newsKey);
        router.refresh();
      } else if (result.shouldRefresh) {
        router.refresh();
      }
    });
  };

  const runStatusOperation = () => {
    if (!confirm) return;
    const { article, operation } = confirm;
    setNotice(null);
    startTransition(async () => {
      const result = await mutateNewsArticleAction({
        operation,
        newsKey: article.newsKey,
        expectedVersion: article.version,
        payload: null,
      });
      setConfirm(null);
      setNotice({ type: result.ok ? "success" : "error", message: result.message });
      router.refresh();
      requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    });
  };

  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.35fr)]" aria-busy={isPending}>
      <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">기사 목록</h2>
            <p className="mt-1 text-sm text-pul-muted">최근 {initialPage.items.length}건 · 전체 {initialPage.total}건</p>
          </div>
          <button type="button" onClick={startNew} className="min-h-11 shrink-0 rounded-lg bg-pul-point px-4 font-bold text-white">
            새 기사
          </button>
        </div>
        {initialPage.items.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-pul-border p-6 text-center text-sm text-pul-muted">
            등록된 기사가 없습니다. 새 기사 버튼으로 hidden 초안을 등록하세요.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {initialPage.items.map((article) => (
              <li key={article.newsKey}>
                <button
                  type="button"
                  onClick={() => choose(article)}
                  aria-pressed={selectedKey === article.newsKey}
                  className={cn(
                    "min-h-12 w-full rounded-xl border p-3 text-left",
                    selectedKey === article.newsKey
                      ? "border-pul-point bg-pul-light"
                      : "border-pul-border bg-white hover:bg-[#fafbfa]",
                  )}
                >
                  <span className="block break-words font-bold text-foreground">{article.title}</span>
                  <span className="mt-1 block text-xs text-pul-muted">
                    {categoryLabels[article.category]} · {statusLabels[article.publicationStatus]} · v{article.version}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-pul-border bg-white p-4 sm:p-6">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground outline-none">
          {selected ? "기사 수정" : "새 기사 등록"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-pul-muted">
          새 기사는 hidden 상태로 저장됩니다. 공식 출처와 내용을 확인한 뒤 공개하세요.
        </p>

        {notice ? (
          <p
            role={notice.type === "error" ? "alert" : "status"}
            className={cn(
              "mt-4 rounded-lg border p-3 text-sm",
              notice.type === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
            )}
          >
            {notice.message}
          </p>
        ) : null}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="공개 news key" htmlFor="news-key">
            <input id="news-key" value={draft.newsKey} disabled={Boolean(selected)} required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" maxLength={64} onChange={(event) => setDraft({ ...draft, newsKey: event.target.value })} className={INPUT_CLASS} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="카테고리" htmlFor="news-category">
              <select id="news-category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as NewsCategory })} className={INPUT_CLASS}>
                {categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="지역" htmlFor="news-region">
              <input id="news-region" value={draft.region} required maxLength={80} onChange={(event) => setDraft({ ...draft, region: event.target.value })} className={INPUT_CLASS} />
            </Field>
          </div>
          <Field label="제목" htmlFor="news-title">
            <input id="news-title" value={draft.title} required minLength={2} maxLength={180} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={INPUT_CLASS} />
          </Field>
          <Field label="요약" htmlFor="news-summary" description="10~500자로 핵심 내용을 작성하세요.">
            <textarea id="news-summary" value={draft.summary} required minLength={10} maxLength={500} rows={3} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} className={`${INPUT_CLASS} resize-y`} />
          </Field>
          <Field label="본문" htmlFor="news-body" description="20자 이상 plain text로 작성하며 줄바꿈이 그대로 표시됩니다.">
            <textarea id="news-body" value={draft.body} required minLength={20} maxLength={20000} rows={10} onChange={(event) => setDraft({ ...draft, body: event.target.value })} className={`${INPUT_CLASS} resize-y`} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="출처 유형" htmlFor="news-source-type">
              <select id="news-source-type" value={draft.sourceType} onChange={(event) => setDraft({ ...draft, sourceType: event.target.value as NewsSourceType })} className={INPUT_CLASS}>
                {sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="게시 일시" htmlFor="news-published-at">
              <input id="news-published-at" type="datetime-local" value={draft.publishedAt} required onChange={(event) => setDraft({ ...draft, publishedAt: event.target.value })} className={INPUT_CLASS} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="출처 기관·업체명 (선택)" htmlFor="news-source-name">
              <input id="news-source-name" value={draft.sourceName} maxLength={160} onChange={(event) => setDraft({ ...draft, sourceName: event.target.value })} className={INPUT_CLASS} />
            </Field>
            <Field label="공식 출처 URL (선택)" htmlFor="news-source-url" description="https:// 주소만 허용됩니다.">
              <input id="news-source-url" type="url" inputMode="url" value={draft.sourceUrl} maxLength={500} pattern="https://.*" onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} className={INPUT_CLASS} />
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-pul-border px-3 font-bold text-foreground">
            <input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} className="h-5 w-5" />
            주요 소식으로 표시
          </label>
          <button type="submit" disabled={isPending || selected?.publicationStatus === "removed"} className="min-h-12 w-full rounded-lg bg-pul-deep px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {isPending ? "저장 중…" : selected ? "내용 수정" : "hidden 초안 등록"}
          </button>
        </form>

        {selected && selected.publicationStatus !== "removed" ? (
          <div className="mt-5 border-t border-pul-border pt-5">
            <h3 className="font-bold text-foreground">공개 상태 변경</h3>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {selected.publicationStatus !== "published" ? <StatusButton label="공개" operation="publish" article={selected} onOpen={setConfirm} /> : null}
              {selected.publicationStatus !== "hidden" ? <StatusButton label="숨김" operation="hide" article={selected} onOpen={setConfirm} /> : null}
              <StatusButton label="제거" operation="remove" article={selected} onOpen={setConfirm} danger />
            </div>
          </div>
        ) : null}
      </section>

      <span className="sr-only" aria-live="polite">{isPending ? "뉴스 작업을 처리하는 중입니다." : ""}</span>
      {confirm ? (
        <ConfirmDialog
          state={confirm}
          busy={isPending}
          onCancel={() => {
            const trigger = confirm.trigger;
            setConfirm(null);
            requestAnimationFrame(() => trigger.isConnected && trigger.focus({ preventScroll: true }));
          }}
          onConfirm={runStatusOperation}
        />
      ) : null}
    </div>
  );
}

function Field({ label, htmlFor, description, children }: { label: string; htmlFor: string; description?: string; children: React.ReactNode }) {
  const descriptionId = description ? `${htmlFor}-description` : undefined;
  return (
    <div>
      <label htmlFor={htmlFor} className="block font-bold text-foreground">{label}</label>
      {description ? <p id={descriptionId} className="mt-1 text-sm text-pul-muted">{description}</p> : null}
      <div className="mt-2" aria-describedby={descriptionId}>{children}</div>
    </div>
  );
}

function StatusButton({ label, operation, article, onOpen, danger = false }: { label: string; operation: ConfirmState["operation"]; article: ManagementNewsArticle; onOpen: (value: ConfirmState) => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={(event) => onOpen({ article, operation, trigger: event.currentTarget })}
      className={cn("min-h-11 rounded-lg border px-4 font-bold", danger ? "border-red-200 bg-red-50 text-red-800" : "border-pul-border bg-white text-pul-deep")}
    >
      {label}
    </button>
  );
}

function ConfirmDialog({ state, busy, onCancel, onConfirm }: { state: ConfirmState; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const labels = { publish: "공개", hide: "숨김", remove: "제거" } as const;

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!focusable?.length) return;
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
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="news-confirm-title" aria-describedby="news-confirm-description" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <h2 id="news-confirm-title" className="text-xl font-bold text-foreground">뉴스 {labels[state.operation]}</h2>
        <p id="news-confirm-description" className="mt-3 break-words text-base leading-7 text-pul-muted">
          “{state.article.title}” 기사를 {labels[state.operation]}하시겠습니까?
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="min-h-12 rounded-lg border border-pul-border bg-white font-bold text-pul-deep">취소</button>
          <button type="button" disabled={busy} onClick={onConfirm} className={cn("min-h-12 rounded-lg font-bold text-white", state.operation === "remove" ? "bg-red-700" : "bg-pul-deep")}>{busy ? "처리 중…" : `${labels[state.operation]} 확인`}</button>
        </div>
      </div>
    </div>
  );
}
