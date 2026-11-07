import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { specialRpc, type CompanionConfirmation } from "@/lib/hall-of-fame/hallSpecialRecords";
import { ConfirmSpecialCompanion } from "@/components/hall-of-fame/ConfirmSpecialCompanion";

export const metadata = { title: "동반 확인 · 명예의 전당", robots: { index: false, follow: false } };

export default async function SpecialCompanionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) notFound();
  const client = await createClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect(`/login?next=${encodeURIComponent(`/hall-of-fame/special/confirm/${id}`)}`);
  const record = await specialRpc<CompanionConfirmation | null>(client, "hall_special_companion_confirmation", {p_message_id: id});
  if (!record) notFound();
  return <ConfirmSpecialCompanion messageId={id} viewerId={data.user.id} record={record} />;
}
