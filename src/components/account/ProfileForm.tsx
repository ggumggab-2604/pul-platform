"use client";

import { updateProfile } from "@/app/my/actions";
import type { ProfileActionState } from "@/lib/auth/types";
import { Save } from "lucide-react";
import { useActionState } from "react";

const initialActionState: ProfileActionState = {
  status: "idle",
  message: "",
};

type ProfileFormProps = {
  displayName: string | null;
  nickname: string | null;
  profileVisibility: "public" | "members" | "private";
};

export function ProfileForm({
  displayName,
  nickname,
  profileVisibility,
}: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialActionState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="profile-display-name" className="text-base font-bold text-foreground">
          표시 이름
        </label>
        <input
          id="profile-display-name"
          name="display_name"
          defaultValue={displayName ?? ""}
          maxLength={100}
          autoComplete="name"
          disabled={pending}
          className="mt-2 h-13 w-full rounded-xl border border-pul-border bg-white px-4 text-base outline-none transition focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-gray-100"
          aria-describedby="profile-display-name-help"
        />
        <p id="profile-display-name-help" className="mt-1.5 text-sm leading-6 text-pul-muted">
          PUL 화면에서 본인을 알아보기 쉽게 표시할 이름입니다.
        </p>
      </div>

      <div>
        <label htmlFor="profile-nickname" className="text-base font-bold text-foreground">
          닉네임
        </label>
        <input
          id="profile-nickname"
          name="nickname"
          defaultValue={nickname ?? ""}
          maxLength={50}
          autoComplete="nickname"
          disabled={pending}
          className="mt-2 h-13 w-full rounded-xl border border-pul-border bg-white px-4 text-base outline-none transition focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-gray-100"
          aria-describedby="profile-nickname-help"
        />
        <p id="profile-nickname-help" className="mt-1.5 text-sm leading-6 text-pul-muted">
          50자 이내로 입력할 수 있습니다.
        </p>
      </div>

      <div>
        <label htmlFor="profile-visibility" className="text-base font-bold text-foreground">
          프로필 공개 범위
        </label>
        <select
          id="profile-visibility"
          name="profile_visibility"
          defaultValue={profileVisibility}
          disabled={pending}
          className="mt-2 h-13 w-full rounded-xl border border-pul-border bg-white px-4 text-base font-medium outline-none transition focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-gray-100"
        >
          <option value="private">비공개</option>
          <option value="members">PUL 회원에게 공개</option>
          <option value="public">전체 공개</option>
        </select>
        <p className="mt-1.5 text-sm leading-6 text-pul-muted">
          현재 단계에서는 본인만 프로필을 조회하며, 공개 범위는 향후 기능 확장에 사용됩니다.
        </p>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "success"
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[15px] font-semibold text-emerald-800"
              : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[15px] font-semibold text-red-800"
          }
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-pul-point px-5 text-lg font-bold text-white shadow-sm transition hover:bg-pul-deep disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 sm:w-auto sm:min-w-48"
      >
        <Save className="h-5 w-5" aria-hidden="true" />
        {pending ? "저장 중…" : "프로필 저장"}
      </button>
    </form>
  );
}
