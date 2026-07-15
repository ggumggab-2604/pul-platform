const SUPABASE_URL_ENV_NAME = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY_ENV_NAME =
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url) {
    throw new Error(`${SUPABASE_URL_ENV_NAME} is not configured.`);
  }

  if (!publishableKey) {
    throw new Error(
      `${SUPABASE_PUBLISHABLE_KEY_ENV_NAME} is not configured.`,
    );
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new Error();
    }
  } catch {
    throw new Error(`${SUPABASE_URL_ENV_NAME} has an invalid format.`);
  }

  return { url, publishableKey };
}
