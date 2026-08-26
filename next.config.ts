import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const clubMediaPattern = supabaseUrl
  ? new URL("/storage/v1/object/public/club-media/**", supabaseUrl)
  : undefined;
const marketMediaPattern = supabaseUrl
  ? new URL("/storage/v1/object/public/market-media/**", supabaseUrl)
  : undefined;
const courseMediaPattern = supabaseUrl
  ? new URL("/storage/v1/object/public/course-media/**", supabaseUrl)
  : undefined;
const promotionMediaPattern = supabaseUrl
  ? new URL("/storage/v1/object/public/promotion-media/**", supabaseUrl)
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(clubMediaPattern ? [clubMediaPattern] : []),
      ...(marketMediaPattern ? [marketMediaPattern] : []),
      ...(courseMediaPattern ? [courseMediaPattern] : []),
      ...(promotionMediaPattern ? [promotionMediaPattern] : []),
    ],
  },
};

export default nextConfig;
