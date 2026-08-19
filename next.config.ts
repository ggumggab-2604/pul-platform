import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const clubMediaPattern = supabaseUrl
  ? new URL("/storage/v1/object/public/club-media/**", supabaseUrl)
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(clubMediaPattern ? [clubMediaPattern] : []),
    ],
  },
};

export default nextConfig;
