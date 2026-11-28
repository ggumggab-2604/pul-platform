import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = { title: "분실물 확인 | PUL 장터" };

export default function LostItemsLayout({ children }: { children: ReactNode }) {
  return <Container className="max-w-4xl space-y-5 py-6 sm:py-8">{children}</Container>;
}
