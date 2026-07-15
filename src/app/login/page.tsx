import { EmailOtpAuth } from "@/components/auth/EmailOtpAuth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "로그인",
  description: "이메일 인증번호로 PUL에 로그인합니다.",
};

type LoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = typeof params.next === "string" ? params.next : undefined;

  return <EmailOtpAuth mode="login" nextPath={nextPath} />;
}
