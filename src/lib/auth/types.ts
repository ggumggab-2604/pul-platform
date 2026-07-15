export type AuthMode = "login" | "signup";

export type AuthCompletionErrorKind =
  | "unauthenticated"
  | "consentRequired"
  | "consentFailed"
  | "accountUnavailable"
  | "foundationMissing"
  | "unknown";

export type AuthCompletionResult =
  | {
      ok: true;
      redirectTo: string;
    }
  | {
      ok: false;
      errorKind: AuthCompletionErrorKind;
      message: string;
    };

export type LogoutResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
};
