import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { fieldLabels, validRoomId, type SharedRoster } from "@/lib/clubs/clubParticipation";
import { csvCell } from "@/lib/events/tournamentRosterCsv";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; submission: string }> }) {
  const { id, submission } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!validRoomId(submission) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) {
    return new Response(null, { status: 404, headers });
  }
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return new Response(null, { status: 401, headers });
  const { data, error } = await context.supabase.rpc("get_tournament_shared_roster", { p_event_key: id, p_submission: submission });
  if (error) return new Response(null, { status: error.code === "42501" ? 403 : 500, headers });
  if (!data) return new Response(null, { status: 404, headers });
  const roster = data as SharedRoster;
  const rows = [
    roster.fields.map(field => csvCell(fieldLabels[field])),
    ...roster.members.map(member => roster.fields.map(field => csvCell(member[field] ?? ""))),
  ];
  const csv = "\uFEFF" + rows.map(row => row.join(",")).join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="PUL-roster-${submission}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

