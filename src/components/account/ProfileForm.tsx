"use client";

import { hidePublishedNames, updateProfile } from "@/app/my/actions";
import type { ProfileActionState } from "@/lib/auth/types";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";

export type PostingNameSettings = {
  nickname: string;
  real_name: string | null;
  use_real_name: boolean;
  profile_visibility: "public" | "members" | "private";
  name_generation: string;
};

const field = "mt-2 min-h-12 w-full rounded-lg border border-pul-border bg-white px-3 text-base";
const initialState: ProfileActionState = { status: "idle", message: "" };

export function ProfileForm({ settings }: { settings: PostingNameSettings }) {
  const [realName, setRealName] = useState(settings.real_name ?? "");
  const [useRealName, setUseRealName] = useState(settings.use_real_name);
  const [visibility, setVisibility] = useState(settings.profile_visibility);
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [hideState, hideAction, hiding] = useActionState(hidePublishedNames, initialState);
  const hideDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (hideState.status === "success" || hideState.status === "already_applied") hideDialog.current?.close();
  }, [hideState]);
  const changed = realName.trim() !== (settings.real_name ?? "") ||
    useRealName !== settings.use_real_name || visibility !== settings.profile_visibility;

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    // Dispatch without React's automatic form reset, which can restore the old radio selection.
    startTransition(() => formAction(formData));
  }

  return <>
    <form onSubmit={handleProfileSubmit} className="space-y-5">
      <fieldset disabled={pending} className="space-y-4">
        <legend className="mb-3 text-lg font-bold">동호회 밖에서 사용할 이름</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-12 items-center gap-2 rounded-lg border border-pul-border px-3 font-semibold">
            <input type="radio" name="name_mode" value="nickname" checked={!useRealName} onChange={() => setUseRealName(false)} />
            자동 닉네임
          </label>
          <label className="flex min-h-12 items-center gap-2 rounded-lg border border-pul-border px-3 font-semibold">
            <input type="radio" name="name_mode" value="real" checked={useRealName} onChange={() => setUseRealName(true)} />
            본명
          </label>
        </div>
        <label className="block font-semibold">
          등록할 본명
          <input name="real_name" autoComplete="name" maxLength={100} required={useRealName}
            value={realName} onChange={(event) => setRealName(event.target.value)} className={field} />
        </label>
        <div className="space-y-1 rounded-lg bg-pul-light/55 p-4 text-sm leading-6" aria-live="polite">
          <p>새 글과 댓글에 표시될 이름 <strong>{useRealName ? realName.trim() || "본명을 입력해 주세요" : settings.nickname}</strong></p>
          <p>쪽지 상대에게 현재 선택한 이름이 보입니다. 커뮤니티·장터·구장·자격증 스터디·대회 후기와 동호회 전체 공개 글에는 게시 당시 선택한 이름이 보입니다.</p>
          <p>이미 쓴 글과 댓글에는 당시 이름이 유지됩니다. 동호회 등록 이름은 해당 동호회 운영진에게 정정을 요청할 수 있습니다.</p>
        </div>
      </fieldset>
      <label className="block font-semibold">
        프로필 공개 범위
        <select name="profile_visibility" value={visibility} disabled={pending}
          onChange={(event) => setVisibility(event.target.value as PostingNameSettings["profile_visibility"])} className={field}>
          <option value="private">비공개</option>
          <option value="members">PUL 회원에게 공개</option>
          <option value="public">전체 공개</option>
        </select>
        <span className="mt-2 block text-sm font-normal text-pul-muted">이 설정은 프로필에 적용됩니다. 새 공개 게시물에 표시될 이름은 위에서 선택합니다.</span>
      </label>
      {state.message && <p role={state.status === "error" ? "alert" : "status"} className="text-sm font-semibold">{state.message}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending || !changed || (useRealName && !realName.trim())}
          className="min-h-11 rounded-lg bg-pul-deep px-4 font-bold text-white disabled:opacity-45">
          {pending ? "저장 중…" : "프로필 저장"}
        </button>
        <Link href="/my" prefetch={false} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 font-bold">취소</Link>
      </div>
    </form>
    <div className="mt-6 border-t border-pul-border pt-4">
      <button type="button" onClick={() => hideDialog.current?.showModal()}
        className="min-h-11 rounded-lg border border-pul-deep px-4 font-bold text-pul-deep">
        기존 글의 본명 숨기기
      </button>
      {(hideState.status === "success" || hideState.status === "already_applied") &&
        <p role="status" className="mt-3 text-sm font-semibold">{hideState.message}</p>}
    </div>
    <dialog ref={hideDialog} aria-labelledby="hide-name-title" aria-describedby="hide-name-scope"
      onCancel={(event) => { if (hiding) event.preventDefault(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-pul-border bg-white p-5 backdrop:bg-black/50">
      <h2 id="hide-name-title" className="mb-3 text-xl font-bold">기존 글의 본명을 숨길까요?</h2>
      <form action={hideAction} className="space-y-4 text-sm leading-6 text-pul-muted">
        <input type="hidden" name="name_generation" value={settings.name_generation} />
        <div id="hide-name-scope" className="space-y-2">
          <p>이미 게시한 공개 글과 댓글에서 본명과 종류를 확인할 수 없는 이전 이름을 ‘PUL 회원’으로 바꿉니다. 과거 닉네임도 종류가 기록되지 않았다면 가려질 수 있습니다.</p>
          <p className="font-semibold text-pul-deep">가린 이름은 되돌릴 수 없습니다.</p>
          <p>새 글과 쪽지에는 현재 선택을 적용합니다. 동호회 회원 전용 등록 이름과 공식 명단은 각 공간의 이름 규칙을 따릅니다.</p>
        </div>
        {hideState.status === "error" && <p role="alert" className="font-semibold">{hideState.message}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={hiding} onClick={() => hideDialog.current?.close()}
            className="min-h-11 rounded-lg border border-pul-border px-4 font-bold">취소</button>
          <button type="submit" name="confirm_hide" value="yes" disabled={hiding}
            className="min-h-11 rounded-lg bg-pul-deep px-4 font-bold text-white disabled:opacity-45">
            {hiding ? "숨기는 중…" : "이름 숨기기"}
          </button>
        </div>
      </form>
    </dialog>
  </>;
}
