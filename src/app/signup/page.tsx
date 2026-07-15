import { EmailOtpAuth } from "@/components/auth/EmailOtpAuth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "회원가입",
  description: "이메일 인증번호로 PUL 회원가입을 진행합니다.",
};

type SignupPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const nextPath = typeof params.next === "string" ? params.next : undefined;

  return <EmailOtpAuth mode="signup" nextPath={nextPath} />;
}
