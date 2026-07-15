const DEFAULT_AUTH_REDIRECT = "/my";
const AUTH_ENTRY_PATHS = new Set(["/login", "/signup"]);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function hasUnsafeEncoding(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    return (
      decoded.includes("\\") ||
      decoded.startsWith("//") ||
      CONTROL_CHARACTER_PATTERN.test(decoded)
    );
  } catch {
    return true;
  }
}

export function getSafeRedirectPath(value: unknown) {
  if (typeof value !== "string") return DEFAULT_AUTH_REDIRECT;

  const candidate = value.trim();
  if (
    candidate.length === 0 ||
    candidate.length > 2048 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    candidate.includes("://") ||
    CONTROL_CHARACTER_PATTERN.test(candidate) ||
    hasUnsafeEncoding(candidate)
  ) {
    return DEFAULT_AUTH_REDIRECT;
  }

  try {
    const base = new URL("https://pul.local");
    const parsed = new URL(candidate, base);

    if (parsed.origin !== base.origin || AUTH_ENTRY_PATHS.has(parsed.pathname)) {
      return DEFAULT_AUTH_REDIRECT;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}
