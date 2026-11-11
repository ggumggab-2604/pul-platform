import { monthlyGameLabels, scoreMonth, scoreNameOrder, type MonthlyWorkspace, type ScoreSheet } from "./monthlyScores";
import { average, type DatedScore } from "./scoreAverages";

export const awardLabels = { perfect: "연간 개근", since_join: "가입 후 전회 참여", average: "평균 타수", growth: "성장" };
export type Award = keyof typeof awardLabels;
export type AnnualData = {
  members: { id: string; name: string; joined: string }[];
  recruitment: { id: string; title: string; date: string; count: number }[];
  awards: { id: string; userId: string; name: string; category: Award; competition: string; at: string }[];
};

const conditions = (sheet: ScoreSheet) => {
  if (sheet.gameType === "field" && sheet.comparison_basis === "outdoor_18_single") {
    return [monthlyGameLabels.field, sheet.course].join(" · ");
  }
  if (sheet.gameType === "screen" && sheet.annualScreenCondition) {
    return [monthlyGameLabels.screen, sheet.course, sheet.annualScreenCondition].join(" · ");
  }
  return null;
};

export function annualClubActivity(workspace: MonthlyWorkspace, data: AnnualData, today: string) {
  const year = String(workspace.year).padStart(4, "0");
  const confirmed = workspace.sheets.filter(sheet => sheet.date <= today && sheet.medalEligible !== false);
  const sheetByEvent = new Map(confirmed.map(sheet => [sheet.eventId, sheet]));
  const venues = new Map<string, Set<string | null>>();
  for (const sheet of confirmed) {
    const label = conditions(sheet);
    if (!label) continue;
    const keys = venues.get(label) ?? new Set<string | null>();
    keys.add(sheet.courseKey ?? null);
    venues.set(label, keys);
  }
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const sheets = confirmed.filter(sheet => scoreMonth(sheet.date) === month);
    const pending = (workspace.events ?? []).filter(event => scoreMonth(event.date) === month && !sheetByEvent.has(event.id));
    const attendance = new Map<string, { date: string; score: number | null; condition: string | null }[]>();
    for (const sheet of sheets) {
      const label = conditions(sheet);
      const condition = label && venues.get(label)?.size === 1 ? label : null;
      for (const row of sheet.rows) {
        if (row.kind !== "member" || !row.userId || row.anonymized) continue;
        const entries = attendance.get(row.userId) ?? [];
        entries.push({ date: sheet.date, score: row.score, condition });
        attendance.set(row.userId, entries);
      }
    }
    return { sheets, pending, attendance, monthKey: year + "-" + String(month).padStart(2, "0") };
  });
  const records = new Map<string, Map<string, DatedScore[]>>();
  const rows = [...data.members].sort(scoreNameOrder).map(member => {
    let participating = 0;
    let missed = 0;
    let unresolved = 0;
    const scores = new Map<string, DatedScore[]>();
    const cells = months.map(({ sheets, pending, attendance, monthKey }) => {
      const eligibleSheets = sheets.filter(sheet => sheet.date >= member.joined);
      const eligiblePending = pending.filter(event => event.date >= member.joined);
      const played = (attendance.get(member.id) ?? []).filter(item => item.date >= member.joined);
      if (played.length) {
        participating++;
        for (const item of played) {
          if (item.condition && item.score !== null) {
            const values = scores.get(item.condition) ?? [];
            values.push({ date: item.date, score: item.score });
            scores.set(item.condition, values);
          }
        }
        return played.some(item => item.score === null) ? "참여·성적 미입력" : "참여";
      }
      if (eligiblePending.some(event => event.date <= today)) {
        unresolved++;
        return "확정 전";
      }
      if (eligibleSheets.length) {
        missed++;
        return "미참여";
      }
      if (eligiblePending.length) return "확정 전";
      if (monthKey < member.joined.slice(0, 7) || sheets.length || pending.length) return "가입 전";
      return "미개최/취소";
    });
    for (const [condition, values] of scores) {
      const byMember = records.get(condition) ?? new Map<string, DatedScore[]>();
      byMember.set(member.id, values);
      records.set(condition, byMember);
    }
    const attendanceAward: Award | null = participating && !missed && !unresolved
      ? (member.joined <= year + "-01-01" ? "perfect" : "since_join") : null;
    return { ...member, cells, participating, attendanceAward };
  });
  const leagues = [...records].sort(([a], [b]) => a.localeCompare(b, "ko")).map(([condition, byMember]) => {
    const scores = [...byMember].map(([id, values]) => {
      const latest = values.reduce((day, item) => item.date > day ? item.date : day, "");
      const prior = average(values.filter(item => item.date < latest)).average;
      const current = average(values.filter(item => item.date === latest)).average!;
      return { id, count: values.length, average: average(values).average!, improvement: prior === null ? null : prior - current };
    });
    const eligible = scores.filter(row => row.improvement !== null).sort((a, b) => a.average - b.average);
    const bestGrowth = Math.max(0, ...eligible.map(row => row.improvement ?? 0));
    return {
      condition,
      scores: new Map(scores.map(row => [row.id, {
        ...row,
        rank: row.improvement === null || eligible.length < 2 ? null : eligible.findIndex(item => item.average === row.average) + 1,
        growthCandidate: bestGrowth > 0 && row.improvement === bestGrowth,
      }])),
    };
  });
  return { rows, leagues };
}

