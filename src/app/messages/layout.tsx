import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "쪽지", robots: { index: false, follow: false } };
export default function MessagingLayout({ children }: { children: ReactNode }) { return children; }
