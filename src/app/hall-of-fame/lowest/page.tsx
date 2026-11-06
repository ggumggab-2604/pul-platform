import { redirect } from "next/navigation";

import { hallHref } from "@/lib/hall-of-fame/nationalHall";

export default async function NationalLowestPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  redirect(hallHref({ period: "all", page: typeof page === "string" ? page : undefined }));
}
