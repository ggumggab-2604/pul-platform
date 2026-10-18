"use client";
import type { ReactNode } from "react";
import { CourseInterest } from "./CourseInterest";
// The legacy boolean batch cannot supply operational-notice choices.
export function CourseInterestBatchProvider({ children }: { courseKeys: string[]; children: ReactNode }) { return children; }
export function CourseInterestBatchButton({ courseKey, returnTo }: { courseKey: string; returnTo: string }) {
  return <CourseInterest courseKey={courseKey} returnTo={returnTo} />;
}
