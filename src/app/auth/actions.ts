"use server";

import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";
import type {
  AuthCompletionResult,
  AuthMode,
  LogoutResult,
} from "@/lib/auth/types";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

const REQUIRED_CONSENTS = [
  {
    consent_type: "terms_required",
    consent_version: "terms-dev-v1",
    decision: "granted",
  },
  {
    consent_type: "privacy_required",
    consent_version: "privacy-dev-v1",
    decision: "granted",
  },
] as const;

type FinalizeAuthInput = {
  mode: AuthMode;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  nextPath?: string | null;
};

async function signOutCurrentSession(
  context: NonNullable<
    Awaited<ReturnType<typeof getAuthenticatedSupabaseContext>>
  >,
) {
  await context.supabase.auth.signOut({ scope: "local" });
}

export async function finalizeAuth(
  input: FinalizeAuthInput,
): Promise<AuthCompletionResult> {
  const mode: AuthMode = input.mode === "signup" ? "signup" : "login";

  if (mode === "signup" && (!input.termsAccepted || !input.privacyAccepted)) {
    return {
      ok: false,
      errorKind: "consentRequired",
      message: "필수 동의 항목을 확인해 주세요.",
    };
  }

  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return {
      ok: false,
      errorKind: "unauthenticated",
      message: "로그인 상태를 확인하지 못했습니다. 인증을 다시 진행해 주세요.",
    };
  }

  const { supabase, userId } = context;
  const { data: account, error: accountError } = await supabase
    .from("user_accounts")
    .select("account_status, platform_role")
    .eq("id", userId)
    .maybeSingle();

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (accountError || profileError || !account || !profile) {
    await signOutCurrentSession(context);
    return {
      ok: false,
      errorKind: "foundationMissing",
      message:
        "계정 정보를 준비하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (account.account_status !== "active") {
    await signOutCurrentSession(context);
    return {
      ok: false,
      errorKind: "accountUnavailable",
      message:
        "현재 계정은 이용할 수 없는 상태입니다. 자세한 내용은 운영자에게 문의해 주세요.",
    };
  }

  if (mode === "signup") {
    const { data: existingConsents, error: consentReadError } = await supabase
      .from("consent_records")
      .select("consent_type, consent_version, decision")
      .eq("decision", "granted")
      .in(
        "consent_type",
        REQUIRED_CONSENTS.map((consent) => consent.consent_type),
      );

    if (consentReadError) {
      await signOutCurrentSession(context);
      return {
        ok: false,
        errorKind: "consentFailed",
        message:
          "필수 동의 내용을 저장하지 못했습니다. 인증을 다시 진행해 주세요.",
      };
    }

    const missingConsents = REQUIRED_CONSENTS.filter(
      (required) =>
        !(existingConsents ?? []).some(
          (existing) =>
            existing.consent_type === required.consent_type &&
            existing.consent_version === required.consent_version &&
            existing.decision === required.decision,
        ),
    );

    if (missingConsents.length > 0) {
      const { error: consentInsertError } = await supabase
        .from("consent_records")
        .insert(
          missingConsents.map((consent) => ({
            consent_type: consent.consent_type,
            consent_version: consent.consent_version,
            decision: consent.decision,
          })),
        );

      if (consentInsertError) {
        await signOutCurrentSession(context);
        return {
          ok: false,
          errorKind: "consentFailed",
          message:
            "필수 동의 내용을 저장하지 못했습니다. 인증을 다시 진행해 주세요.",
        };
      }
    }
  }

  return {
    ok: true,
    redirectTo: getSafeRedirectPath(input.nextPath),
  };
}

export async function logout(): Promise<LogoutResult> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: true };

  const { error } = await context.supabase.auth.signOut({ scope: "local" });
  if (error) {
    return {
      ok: false,
      message: "로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  return { ok: true };
}
