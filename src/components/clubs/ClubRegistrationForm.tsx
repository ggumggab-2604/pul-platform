"use client";

import { registerClubAction } from "@/app/clubs/actions";
import {
  clubRegions,
  type ClubRegistrationInput,
} from "@/lib/clubs/clubDirectory";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState, useTransition } from "react";

const fieldClass =
  "mt-1.5 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base text-foreground outline-none transition focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

const initialInput: ClubRegistrationInput = {
  name: "",
  region: "서울",
  district: "",
  summary: "",
  recruitmentStatus: "recruiting",
};

export function ClubRegistrationForm() {
  const router = useRouter();
  const [input, setInput] = useState(initialInput);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requestIdRef = useRef<string | null>(null);

  const update = <Key extends keyof ClubRegistrationInput>(
    key: Key,
    value: ClubRegistrationInput[Key],
  ) => {
    requestIdRef.current = null;
    setError(null);
    setInput((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    setError(null);
    startTransition(async () => {
      const result = await registerClubAction({ requestId, payload: input });
      if (!result.ok) {
        setError(result.error);
        if (result.authenticationRequired) {
          router.push(`/login?next=${encodeURIComponent("/clubs/register")}`);
        }
        return;
      }
      router.push(`/clubs/${encodeURIComponent(result.data.publicKey)}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="club-name" className="text-sm font-bold text-pul-deep">
          동호회명
        </label>
        <input
          id="club-name"
          value={input.name}
          onChange={(event) => update("name", event.target.value)}
          minLength={2}
          maxLength={80}
          required
          autoComplete="organization"
          className={fieldClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="club-region" className="text-sm font-bold text-pul-deep">
            시·도
          </label>
          <select
            id="club-region"
            value={input.region}
            onChange={(event) =>
              update("region", event.target.value as ClubRegistrationInput["region"])
            }
            className={fieldClass}
          >
            {clubRegions.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="club-district" className="text-sm font-bold text-pul-deep">
            시·군·구 또는 활동 지역
          </label>
          <input
            id="club-district"
            value={input.district}
            onChange={(event) => update("district", event.target.value)}
            maxLength={80}
            required
            placeholder="예: 송파구, 한강시민공원 일대"
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="club-summary" className="text-sm font-bold text-pul-deep">
          짧은 소개
        </label>
        <textarea
          id="club-summary"
          value={input.summary}
          onChange={(event) => update("summary", event.target.value)}
          minLength={10}
          maxLength={500}
          required
          rows={5}
          aria-describedby="club-summary-guide"
          className={`${fieldClass} py-3`}
        />
        <p id="club-summary-guide" className="mt-1.5 text-xs text-pul-muted">
          활동 성격과 정기 모임 안내를 10~500자로 적어 주세요. 연락처나 회원 개인정보는 적지 마세요.
        </p>
      </div>

      <div>
        <label htmlFor="club-recruitment" className="text-sm font-bold text-pul-deep">
          회원 모집 상태
        </label>
        <select
          id="club-recruitment"
          value={input.recruitmentStatus}
          onChange={(event) =>
            update(
              "recruitmentStatus",
              event.target.value as ClubRegistrationInput["recruitmentStatus"],
            )
          }
          className={fieldClass}
        >
          <option value="recruiting">모집 중</option>
          <option value="waiting">대기 접수</option>
          <option value="closed">모집 마감</option>
        </select>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-pul-point px-5 text-base font-bold text-white hover:bg-pul-deep disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "등록 중…" : "동호회 등록하기"}
      </button>
      <p className="text-xs leading-relaxed text-pul-muted">
        등록이 완료되면 생성자는 해당 동호회의 회원이자 최초 회장으로 연결됩니다.
      </p>
    </form>
  );
}
