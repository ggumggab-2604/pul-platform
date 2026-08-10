"use server";

import {
  createHallOfFameEvidenceReplacementIntent,
  createHallOfFameEvidenceSignedRead,
  createHallOfFameEvidenceUploadIntent,
  finalizeHallOfFameEvidence,
  withdrawHallOfFameEvidence,
  type CreateEvidenceReplacementIntentInput,
  type CreateEvidenceUploadIntentInput,
  type FinalizeEvidenceInput,
  type WithdrawEvidenceInput,
} from "@/lib/hall-of-fame/hallOfFameEvidenceStorage";

export async function createEvidenceUploadIntentAction(
  input: CreateEvidenceUploadIntentInput,
) {
  return createHallOfFameEvidenceUploadIntent(input);
}

export async function createEvidenceReplacementIntentAction(
  input: CreateEvidenceReplacementIntentInput,
) {
  return createHallOfFameEvidenceReplacementIntent(input);
}

export async function finalizeEvidenceAction(input: FinalizeEvidenceInput) {
  return finalizeHallOfFameEvidence(input);
}

export async function withdrawEvidenceAction(input: WithdrawEvidenceInput) {
  return withdrawHallOfFameEvidence(input);
}

export async function createEvidenceSignedReadAction(evidenceId: string) {
  return createHallOfFameEvidenceSignedRead(evidenceId);
}
