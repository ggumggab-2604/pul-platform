"use client";

import { finalizeAuth } from "@/app/auth/actions";
import { Container } from "@/components/ui/Container";
import type { AuthMode } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useReducer } from "react";

type AuthStep =
  | "idle"
  | "requesting"
  | "codeSent"
  | "resendRequesting"
  | "verifying"
  | "verified"
  | "sessionRestoring";

type AuthErrorKind =
  | "invalidOrExpired"
  | "rateLimited"
  | "deliveryError"
  | "networkError"
  | "unknown";

type AuthState = {
  step: AuthStep;
  email: string;
  token: string;
  cooldownRemaining: number;
  errorKind: AuthErrorKind | null;
  errorMessage: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
};

type AuthAction =
  | { type: "setEmail"; email: string }
  | { type: "setToken"; token: string }
  | { type: "setConsent"; field: "termsAccepted" | "privacyAccepted"; value: boolean }
  | { type: "setAllConsents"; value: boolean }
  | { type: "requestStart"; resend: boolean }
  | { type: "requestSuccess" }
  | { type: "tickCooldown" }
  | {
      type: "operationError";
      step: "idle" | "codeSent";
      errorKind: AuthErrorKind;
      message: string;
      clearToken?: boolean;
    }
  | { type: "verifyStart" }
  | { type: "verified" }
  | { type: "sessionRestoring" }
  | { type: "resetEmailStep" };

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errorMessages: Record<AuthErrorKind, string> = {
  invalidOrExpired:
    "인증번호가 올바르지 않거나 만료되었습니다. 번호를 다시 확인하거나 인증번호를 재전송해 주세요.",
  rateLimited:
    "인증번호 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
  deliveryError:
    "인증번호를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  networkError: "인터넷 연결을 확인한 후 다시 시도해 주세요.",
  unknown: "인증 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

function createInitialState(): AuthState {
  return {
    step: "idle",
    email: "",
    token: "",
    cooldownRemaining: 0,
    errorKind: null,
    errorMessage: "",
    termsAccepted: false,
    privacyAccepted: false,
  };
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "setEmail":
      return { ...state, email: action.email, errorKind: null, errorMessage: "" };
    case "setToken":
      return { ...state, token: action.token, errorKind: null, errorMessage: "" };
    case "setConsent":
      return {
        ...state,
        [action.field]: action.value,
        errorKind: null,
        errorMessage: "",
      };
    case "setAllConsents":
      return {
        ...state,
        termsAccepted: action.value,
        privacyAccepted: action.value,
        errorKind: null,
        errorMessage: "",
      };
    case "requestStart":
      return {
        ...state,
        step: action.resend ? "resendRequesting" : "requesting",
        errorKind: null,
        errorMessage: "",
      };
    case "requestSuccess":
      return {
        ...state,
        step: "codeSent",
        token: "",
        cooldownRemaining: RESEND_COOLDOWN_SECONDS,
        errorKind: null,
        errorMessage: "",
      };
    case "tickCooldown":
      return {
        ...state,
        cooldownRemaining: Math.max(0, state.cooldownRemaining - 1),
      };
    case "operationError":
      return {
        ...state,
        step: action.step,
        token: action.clearToken ? "" : state.token,
        errorKind: action.errorKind,
        errorMessage: action.message,
      };
    case "verifyStart":
      return { ...state, step: "verifying", errorKind: null, errorMessage: "" };
    case "verified":
      return { ...state, step: "verified" };
    case "sessionRestoring":
      return { ...state, step: "sessionRestoring" };
    case "resetEmailStep":
      return {
        ...state,
        step: "idle",
        token: "",
        cooldownRemaining: 0,
        errorKind: null,
        errorMessage: "",
      };
  }
}

function getAuthErrorDetails(
  error: unknown,
  operation: "request" | "verify",
): { kind: AuthErrorKind; message: string } {
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    name?: unknown;
  } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const status = typeof candidate?.status === "number" ? candidate.status : 0;
  const name = typeof candidate?.name === "string" ? candidate.name : "";

  if (
    status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  ) {
    return { kind: "rateLimited", message: errorMessages.rateLimited };
  }

  if (name === "AuthRetryableFetchError" || error instanceof TypeError) {
    return { kind: "networkError", message: errorMessages.networkError };
  }

  if (operation === "verify" && (code === "otp_expired" || status === 400 || status === 403)) {
    return {
      kind: "invalidOrExpired",
      message: errorMessages.invalidOrExpired,
    };
  }

  if (operation === "request") {
    return { kind: "deliveryError", message: errorMessages.deliveryError };
  }

  return { kind: "unknown", message: errorMessages.unknown };
}

function maskEmail(email: string) {
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) return "입력한 이메일";

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

type EmailOtpAuthProps = {
  mode: AuthMode;
  nextPath?: string;
};

export function EmailOtpAuth({ mode, nextPath }: EmailOtpAuthProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(authReducer, undefined, createInitialState);
  const isSignup = mode === "signup";
  const isCodeStep = [
    "codeSent",
    "resendRequesting",
    "verifying",
    "verified",
    "sessionRestoring",
  ].includes(state.step);
  const isBusy = [
    "requesting",
    "resendRequesting",
    "verifying",
    "verified",
    "sessionRestoring",
  ].includes(state.step);
  const normalizedEmail = state.email.trim();
  const emailIsValid = EMAIL_PATTERN.test(normalizedEmail);
  const consentsComplete = state.termsAccepted && state.privacyAccepted;
  const remainingSeconds = state.cooldownRemaining;
  const alternativeHref = useMemo(() => {
    const base = isSignup ? "/login" : "/signup";
    return nextPath ? `${base}?next=${encodeURIComponent(nextPath)}` : base;
  }, [isSignup, nextPath]);

  useEffect(() => {
    if (state.step !== "codeSent" || state.cooldownRemaining === 0) return;

    const timer = window.setInterval(() => {
      dispatch({ type: "tickCooldown" });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [state.step, state.cooldownRemaining]);

  async function requestOtp(resend: boolean) {
    if (isBusy || !emailIsValid) return;
    if (isSignup && !consentsComplete) {
      dispatch({
        type: "operationError",
        step: "idle",
        errorKind: "unknown",
        message: "필수 동의 항목을 모두 확인해 주세요.",
      });
      return;
    }
    if (resend && remainingSeconds > 0) return;

    dispatch({ type: "requestStart", resend });

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: isSignup },
      });

      if (error) {
        const details = getAuthErrorDetails(error, "request");
        dispatch({
          type: "operationError",
          step: resend ? "codeSent" : "idle",
          errorKind: details.kind,
          message:
            !isSignup && details.kind === "deliveryError"
              ? "인증번호를 발송하지 못했습니다. 이메일 주소를 확인하거나 회원가입을 이용해 주세요."
              : details.message,
        });
        return;
      }

      dispatch({ type: "requestSuccess" });
    } catch (error) {
      const details = getAuthErrorDetails(error, "request");
      dispatch({
        type: "operationError",
        step: resend ? "codeSent" : "idle",
        errorKind: details.kind,
        message: details.message,
      });
    }
  }

  async function verifyOtp() {
    if (isBusy || state.token.length !== OTP_LENGTH) return;

    dispatch({ type: "verifyStart" });

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: state.token,
        type: "email",
      });

      if (error) {
        const details = getAuthErrorDetails(error, "verify");
        dispatch({
          type: "operationError",
          step: "codeSent",
          errorKind: details.kind,
          message: details.message,
        });
        return;
      }

      dispatch({ type: "verified" });
      dispatch({ type: "sessionRestoring" });

      const completion = await finalizeAuth({
        mode,
        termsAccepted: state.termsAccepted,
        privacyAccepted: state.privacyAccepted,
        nextPath,
      });

      if (!completion.ok) {
        await supabase.auth.signOut({ scope: "local" });
        dispatch({
          type: "operationError",
          step: "idle",
          errorKind: "unknown",
          message: completion.message,
          clearToken: true,
        });
        router.refresh();
        return;
      }

      router.replace(completion.redirectTo);
      return;
    } catch (error) {
      const details = getAuthErrorDetails(error, "verify");
      dispatch({
        type: "operationError",
        step: "codeSent",
        errorKind: details.kind,
        message: details.message,
      });
    }
  }

  const heading = isSignup ? "이메일로 회원가입" : "이메일로 로그인";
  const description = isSignup
    ? "필수 동의를 확인하고 이메일로 받은 인증번호를 입력해 주세요."
    : "가입할 때 사용한 이메일로 인증번호를 받아 로그인합니다.";

  return (
    <div className="bg-pul-page">
      <Container className="flex min-h-[calc(100dvh-16rem)] items-start justify-center px-3 py-8 sm:py-12 lg:py-16">
        <main className="w-full max-w-xl" aria-labelledby="auth-title">
          <section className="overflow-hidden rounded-2xl border border-pul-border bg-white shadow-[0_10px_35px_rgba(6,78,59,0.10)]">
            <div className="bg-gradient-to-r from-pul-deep to-pul-point px-5 py-6 text-white sm:px-8 sm:py-8">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                  <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-white/80">PUL 안전한 이메일 인증</p>
                  <h1 id="auth-title" className="mt-1 text-2xl font-bold sm:text-3xl">
                    {heading}
                  </h1>
                </div>
              </div>
              <p className="mt-4 text-base leading-7 text-white/90">{description}</p>
            </div>

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              {!isCodeStep ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void requestOtp(false);
                  }}
                  noValidate
                >
                  <label htmlFor={`${mode}-email`} className="text-base font-bold text-foreground">
                    이메일 주소
                  </label>
                  <div className="relative mt-2">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-pul-point" aria-hidden="true" />
                    <input
                      id={`${mode}-email`}
                      type="email"
                      autoComplete="email"
                      value={state.email}
                      onChange={(event) =>
                        dispatch({ type: "setEmail", email: event.target.value })
                      }
                      disabled={isBusy}
                      placeholder="example@email.com"
                      className="h-14 w-full rounded-xl border border-pul-border bg-white pl-12 pr-4 text-lg outline-none transition focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-gray-100"
                      aria-describedby={`${mode}-email-help`}
                    />
                  </div>
                  <p id={`${mode}-email-help`} className="mt-2 text-sm leading-6 text-pul-muted">
                    이메일 주소는 인증번호 발송에만 사용하며 화면 저장소에 보관하지 않습니다.
                  </p>

                  {isSignup ? (
                    <fieldset className="mt-6 rounded-xl border border-pul-border bg-pul-light/20 p-4">
                      <legend className="px-1 text-base font-bold text-pul-deep">필수 동의</legend>
                      <label className="mt-1 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg bg-white px-3 py-2.5 font-bold text-foreground">
                        <input
                          type="checkbox"
                          checked={consentsComplete}
                          onChange={(event) =>
                            dispatch({ type: "setAllConsents", value: event.target.checked })
                          }
                          className="h-5 w-5 shrink-0 accent-pul-point"
                        />
                        필수 항목 전체 동의
                      </label>
                      <div className="mt-3 space-y-2 border-t border-pul-border/70 pt-3">
                        <label className="flex min-h-11 cursor-pointer items-start gap-3 px-2 py-2 text-[15px] leading-6">
                          <input
                            type="checkbox"
                            checked={state.termsAccepted}
                            onChange={(event) =>
                              dispatch({
                                type: "setConsent",
                                field: "termsAccepted",
                                value: event.target.checked,
                              })
                            }
                            className="mt-0.5 h-5 w-5 shrink-0 accent-pul-point"
                          />
                          <span><strong className="text-pul-deep">[필수]</strong> 서비스 이용약관 동의</span>
                        </label>
                        <label className="flex min-h-11 cursor-pointer items-start gap-3 px-2 py-2 text-[15px] leading-6">
                          <input
                            type="checkbox"
                            checked={state.privacyAccepted}
                            onChange={(event) =>
                              dispatch({
                                type: "setConsent",
                                field: "privacyAccepted",
                                value: event.target.checked,
                              })
                            }
                            className="mt-0.5 h-5 w-5 shrink-0 accent-pul-point"
                          />
                          <span><strong className="text-pul-deep">[필수]</strong> 개인정보 처리방침 동의</span>
                        </label>
                      </div>
                      <p className="mt-3 rounded-lg bg-white px-3 py-2.5 text-sm leading-6 text-pul-muted">
                        현재는 개발용 동의 버전을 사용합니다. 정식 약관과 개인정보 처리방침은 서비스 오픈 전에 별도로 확정됩니다.
                      </p>
                    </fieldset>
                  ) : null}

                  {state.errorMessage ? (
                    <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[15px] font-semibold leading-6 text-red-800" role="alert" aria-live="assertive">
                      {state.errorMessage}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={
                      isBusy || !emailIsValid || (isSignup && !consentsComplete)
                    }
                    className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-pul-point px-5 text-lg font-bold text-white shadow-sm transition hover:bg-pul-deep disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {state.step === "requesting" ? "인증번호 요청 중…" : "인증번호 받기"}
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void verifyOtp();
                  }}
                  noValidate
                >
                  <div className="rounded-xl border border-pul-border bg-pul-light/25 p-4 text-center">
                    <CheckCircle2 className="mx-auto h-7 w-7 text-pul-point" aria-hidden="true" />
                    <p className="mt-2 font-bold text-pul-deep">인증번호를 보냈습니다.</p>
                    <p className="mt-1 break-all text-[15px] text-pul-muted">{maskEmail(normalizedEmail)}</p>
                  </div>

                  <label htmlFor={`${mode}-otp`} className="mt-6 block text-base font-bold text-foreground">
                    이메일 인증번호 6자리
                  </label>
                  <div className="relative mt-2">
                    <KeyRound className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-pul-point" aria-hidden="true" />
                    <input
                      id={`${mode}-otp`}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={state.token}
                      onChange={(event) =>
                        dispatch({
                          type: "setToken",
                          token: event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH),
                        })
                      }
                      maxLength={OTP_LENGTH}
                      disabled={isBusy}
                      className="h-16 w-full rounded-xl border border-pul-border bg-white pl-14 pr-4 text-center text-2xl font-bold tracking-[0.35em] outline-none transition focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-gray-100"
                      aria-describedby={`${mode}-otp-help`}
                    />
                  </div>
                  <p id={`${mode}-otp-help`} className="mt-2 text-sm leading-6 text-pul-muted">
                    이메일에 표시된 숫자 6자리를 입력해 주세요.
                  </p>

                  {state.errorMessage ? (
                    <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[15px] font-semibold leading-6 text-red-800" role="alert" aria-live="assertive">
                      {state.errorMessage}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isBusy || state.token.length !== OTP_LENGTH}
                    className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-pul-point px-5 text-lg font-bold text-white shadow-sm transition hover:bg-pul-deep disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {state.step === "verifying"
                      ? "인증번호 확인 중…"
                      : state.step === "verified" || state.step === "sessionRestoring"
                        ? "계정 확인 중…"
                        : "인증하고 계속하기"}
                  </button>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "resetEmailStep" })}
                      disabled={isBusy}
                      className="min-h-12 rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light disabled:opacity-50"
                    >
                      이메일 변경
                    </button>
                    <button
                      type="button"
                      onClick={() => void requestOtp(true)}
                      disabled={isBusy || remainingSeconds > 0}
                      className="min-h-12 rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-pul-muted"
                    >
                      {state.step === "resendRequesting"
                        ? "재전송 중…"
                        : remainingSeconds > 0
                          ? `${remainingSeconds}초 후 재전송`
                          : "인증번호 재전송"}
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-7 border-t border-pul-border pt-5 text-center">
                <p className="text-[15px] text-pul-muted">
                  {isSignup ? "이미 PUL 회원인가요?" : "아직 PUL 회원이 아닌가요?"}
                </p>
                <Link href={alternativeHref} className="mt-2 inline-flex min-h-11 items-center font-bold text-pul-point hover:text-pul-deep">
                  {isSignup ? "로그인하기" : "회원가입하기"}
                </Link>
              </div>
            </div>
          </section>
        </main>
      </Container>
    </div>
  );
}
