import "server-only";

import { cache } from "react";

import { getPublicNewsArticle } from "@/lib/news/newsDirectory";
import { createClient } from "@/lib/supabase/server";

export const getServerNewsArticle = cache(async (newsKey: string) => {
  const client = await createClient();
  return getPublicNewsArticle(client, newsKey);
});
