import type { MonthlyGameType, MonthlyWorkspace, ScorePerson } from "@/lib/clubs/monthlyScores";
import type { ComparisonBasis } from "@/lib/clubs/personalBests";

export type UniversityTournamentLink = {
  eventKey: string; title: string; userId: string; name: string; division: string;
};
export type UniversityTournamentResult = UniversityTournamentLink & {
  date: string; game: MonthlyGameType; score: number; place: number; tied: boolean;
};
export type UniversityTournamentCandidate = Pick<UniversityTournamentLink, "title" | "userId" | "name" | "division"> & {
  score: number; place: number;
};
export type UniversityBest = {
  userId: string; game: MonthlyGameType; name: string; score: number; date: string; title: string;
  meeting: string | null; eventKey: string | null;
};
export type UniversityScoreWorkspace = Pick<MonthlyWorkspace, "sheets" | "pendingMedalEvents"> & {
  department: string; manager: boolean; tournaments: UniversityTournamentResult[];
  best: UniversityBest[]; links: UniversityTournamentLink[];
};
export type UniversityMonthlyScore = {
  id: string; department: string; title: string; date: string; time: string; place: string; body: string;
  eventVersion: number; version: number; manager: boolean; recorded: boolean; started: boolean;
  game: MonthlyGameType | null; basis: ComparisonBasis; public: boolean; courseKey: string | null; courseName: string | null;
  rows: ScorePerson[]; roster: { id: string; name: string; score: number | null; attended: boolean }[];
};

