import { createStartupMediaReadUrl } from "@/lib/market/marketStartupStorage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ postKey: string; mediaId: string }> },
) {
  const { postKey, mediaId } = await params;
  const headers = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (!/^[0-9a-f]{24}$/.test(postKey) || !/^[0-9a-f-]{36}$/.test(mediaId))
    return new Response(null, { status: 404, headers });
  try {
    const url = await createStartupMediaReadUrl(postKey, mediaId);
    if (!url) return new Response(null, { status: 404, headers });
    // Do not expose the bearer URL or let browsers/CDNs cache private media.
    const image = await fetch(url, { cache: "no-store" });
    if (!image.ok) return new Response(null, { status: 404, headers });
    return new Response(image.body, {
      headers: {
        ...headers,
        "Content-Type":
          image.headers.get("Content-Type") ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
