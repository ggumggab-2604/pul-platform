export function getSupabaseCookieOptions() {
  // Beta/production runs over HTTPS; local next dev keeps HTTP cookies usable.
  return { secure: process.env.NODE_ENV === "production" };
}
