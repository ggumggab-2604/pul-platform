import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/Container";
import { loadPublicPromotionDetail } from "@/lib/promotions/promotionRuntime.server";
import {
  getPromotionContentKindLabel,
  getPromotionMediaPublicUrl,
  isSafePromotionDestination,
  isSponsoredPromotion,
  shouldBypassPromotionImageOptimization,
} from "@/lib/promotions/promotionRuntime";

type PromotionDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PromotionDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const promotion = await loadPublicPromotionDetail(slug);
  if (!promotion) notFound();

  return {
    title: promotion.title,
    description: promotion.summary,
  };
}

export default async function PromotionDetailPage({ params }: PromotionDetailPageProps) {
  const { slug } = await params;
  const promotion = await loadPublicPromotionDetail(slug);
  if (!promotion) notFound();

  const ctaUrl = promotion.detailCtaUrl && isSafePromotionDestination(promotion.detailCtaUrl)
    ? promotion.detailCtaUrl
    : null;
  const externalCta = ctaUrl?.startsWith("https://") ?? false;
  const ctaClass = "inline-flex min-h-11 items-center justify-center rounded-lg bg-pul-point px-5 text-sm font-bold text-white transition-colors hover:bg-pul-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pul-point focus-visible:ring-offset-2";

  return (
    <main className="bg-pul-page py-5 sm:py-8">
      <Container className="max-w-4xl px-3">
        <article className="overflow-hidden rounded-2xl border border-pul-border bg-white shadow-sm">
          <header className="border-b border-pul-border px-5 py-6 sm:px-8 sm:py-8">
            <span className="inline-flex rounded-full bg-pul-light px-3 py-1 text-xs font-bold text-pul-deep">
              {getPromotionContentKindLabel(promotion.contentKind)}
            </span>
            <h1 className="mt-3 text-2xl font-bold leading-tight text-foreground sm:text-3xl">
              {promotion.title}
            </h1>
            <p className="mt-3 text-base leading-7 text-pul-muted">{promotion.summary}</p>
            <p className="mt-3 text-xs font-semibold text-pul-muted">현재 게시 중인 홍보 콘텐츠입니다.</p>
          </header>

          <div className="space-y-6 px-5 py-6 sm:px-8 sm:py-8">
            <div className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">
              {promotion.body}
            </div>

            {promotion.detailMedia.length > 0 ? (
              <div className="space-y-4" aria-label="홍보 콘텐츠 이미지">
                {promotion.detailMedia.map((media, index) => {
                  const mediaUrl = getPromotionMediaPublicUrl(media);
                  return (
                    <figure
                      key={`${media.path}:${media.sortOrder}`}
                      className="relative aspect-video overflow-hidden rounded-xl bg-pul-light"
                    >
                      <Image
                        src={mediaUrl}
                        alt={media.alt}
                        fill
                        loading={index === 0 ? "eager" : "lazy"}
                        unoptimized={shouldBypassPromotionImageOptimization(mediaUrl)}
                        className="object-cover object-center"
                        sizes="(max-width: 896px) 100vw, 832px"
                      />
                    </figure>
                  );
                })}
              </div>
            ) : null}

            {ctaUrl && promotion.detailCtaLabel ? (
              externalCta ? (
                <a
                  href={ctaUrl}
                  target="_blank"
                  rel={isSponsoredPromotion(promotion.contentKind)
                    ? "noopener noreferrer sponsored"
                    : "noopener noreferrer"}
                  className={ctaClass}
                >
                  {promotion.detailCtaLabel}
                  <span className="sr-only"> (새 창에서 열림)</span>
                </a>
              ) : (
                <Link href={ctaUrl} className={ctaClass}>
                  {promotion.detailCtaLabel}
                </Link>
              )
            ) : null}
          </div>
        </article>
      </Container>
    </main>
  );
}
