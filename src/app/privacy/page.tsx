import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = { title: "개인정보처리방침 및 가입 동의 안내", robots: { index: false, follow: true } };

export default function PrivacyPage() {
  return (
    <main className="bg-pul-page">
      <Container className="py-8 sm:py-12">
        <article className="mx-auto max-w-3xl space-y-7 rounded-2xl border border-pul-border bg-white p-5 text-base leading-8 sm:p-8">
          <header>
            <h1 className="text-2xl font-bold text-pul-deep">개인정보처리방침 및 가입 동의 안내</h1>
            <p className="mt-2 text-pul-muted">PUL Beta의 계정·프로필 처리와 회원가입 때 필요한 개인정보 수집·이용을 구분해 설명합니다.</p>
            <p className="mt-2 text-pul-muted">운영 주체: PUL 운영자</p>
          </header>
          <section id="signup-consent" className="scroll-mt-6">
            <h2 className="text-lg font-bold">1. 회원가입 개인정보 수집·이용 동의 안내</h2>
            <dl className="mt-3 space-y-4">
              <div><dt className="font-bold">필수 입력 항목</dt><dd>이메일 주소와 이메일로 받은 일회용 인증번호(OTP)입니다. 비밀번호·이름·닉네임·지역·전화번호는 회원가입 때 요구하지 않습니다.</dd></div>
              <div><dt className="font-bold">이용 목적</dt><dd>인증번호 발송·확인, 계정 식별과 로그인, 회원 기능 제공과 서비스 운영 및 필수 동의 확인에 사용합니다. 인증은 Supabase Auth를 통해 처리합니다.</dd></div>
              <div><dt className="font-bold">가입·인증 과정의 기록</dt><dd>계정 식별자, 계정 상태, 생성·변경 시각과 필수 동의 종류·버전·결정·기록 시각을 저장합니다. 인증번호는 인증에 사용하며 PUL의 동의 기록이나 프로필에 저장하지 않습니다.</dd></div>
              <div>
                <dt className="font-bold">보유 및 이용 기간</dt>
                <dd className="space-y-2">
                  <p>계정 이메일과 계정 정보는 회원 이용 기간 동안 보유합니다. 계정 삭제 또는 탈퇴 처리 후 더 이상 필요하지 않고 별도 법적 보존 의무가 없으면 삭제합니다.</p>
                  <p>가입 동의 기록은 가입 및 동의 사실 확인을 위해 이용 기간 동안 보유합니다. 계정 삭제 이후 보유할 필요성과 법적 보존 의무가 없으면 삭제합니다.</p>
                  <p>선택 프로필은 이용 기간 동안 보유하며, 사용자가 수정·삭제하거나 계정을 삭제할 때 삭제 대상이 됩니다.</p>
                  <p>다른 법령에 따른 보존 의무가 실제로 발생하는 경우 해당 기간 동안 필요한 정보를 별도 보관할 수 있습니다.</p>
                </dd>
              </div>
              <div><dt className="font-bold">동의 거부</dt><dd>동의를 거부할 수 있습니다. 필수 동의에 동의하지 않으면 회원가입을 진행할 수 없습니다. 로그인 없이 공개 정보를 읽는 것은 가능합니다.</dd></div>
            </dl>
          </section>
          <section>
            <h2 className="text-lg font-bold">2. 가입 후 선택 입력과 공개 활동</h2>
            <p>내 정보에서 표시 이름과 닉네임을 선택적으로 입력·수정할 수 있습니다. 프로필 정보는 계정 관리 목적으로 저장하며, 프로필 전체가 일반에 공개되는 것은 아닙니다.</p>
            <p className="mt-2">프로필 공개 범위를 ‘전체 공개’로 설정하면 공개 커뮤니티 게시물이나 중고장터 게시물 등 공개 활동에서 닉네임 또는 표시 이름이 다른 사용자와 비회원에게 표시될 수 있습니다. 로그인 이메일과 인증번호는 이 작성자 이름 표시에 포함되지 않습니다.</p>
            <p className="mt-2">공개 게시판에 직접 올린 글과 화면에서 공개한다고 안내한 정보는 비회원에게도 보일 수 있습니다. 동호회 가입 신청·문의 등 별도 기능의 입력 정보는 해당 화면의 안내를 확인해 주세요.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold">3. 인증 정보와 접근 보호</h2>
            <p>이메일과 인증 세션은 Supabase Auth로 처리하고, 로그인 상태 유지를 위해 인증 쿠키를 사용합니다. 계정·프로필·동의 기록에는 사용자별 접근 제한을 적용합니다. 이메일과 인증번호를 공개 게시물에 적지 마세요.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold">4. 열람·수정·탈퇴와 문의</h2>
            <p>로그인한 회원은 내 정보에서 자신의 프로필을 확인하고 수정할 수 있습니다. 현재 앱에는 직접 실행하는 탈퇴·계정 삭제 기능이 없고, 로그아웃만으로 저장 정보가 삭제되지는 않습니다. 개인정보 열람·정정·삭제, 회원탈퇴와 계정 관련 요청은 PUL 운영자에게 이메일로 보내 주세요. 계정 삭제 이후에는 위 보유·삭제 기준에 따라 처리합니다.</p>
            <p className="mt-2">개인정보 문의 및 권리행사 연락처: <a href="mailto:pulpark.help@gmail.com" className="break-all font-semibold text-pul-point underline underline-offset-4">pulpark.help@gmail.com</a></p>
          </section>
          <nav aria-label="관련 문서" className="flex flex-wrap gap-x-6 gap-y-2 border-t border-pul-border pt-4">
            <Link href="/terms" className="inline-flex min-h-11 items-center font-bold text-pul-point underline">서비스 이용약관</Link>
            <Link href="/signup" className="inline-flex min-h-11 items-center font-bold text-pul-point underline">회원가입 화면</Link>
          </nav>
        </article>
      </Container>
    </main>
  );
}
