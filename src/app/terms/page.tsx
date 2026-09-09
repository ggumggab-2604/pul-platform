import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = { title: "서비스 이용약관", robots: { index: false, follow: true } };

export default function TermsPage() {
  return (
    <main className="bg-pul-page">
      <Container className="py-8 sm:py-12">
        <article className="mx-auto max-w-3xl space-y-7 rounded-2xl border border-pul-border bg-white p-5 text-base leading-8 sm:p-8">
          <header>
            <h1 className="text-2xl font-bold text-pul-deep">PUL 서비스 이용약관</h1>
            <p className="mt-2 text-pul-muted">파크골프 정보를 찾고 함께 활동하는 PUL Beta의 이용 안내입니다.</p>
            <p className="mt-2 text-pul-muted">운영 주체: PUL 운영자</p>
          </header>
          <section>
            <h2 className="text-lg font-bold">1. 서비스 목적과 범위</h2>
            <p>PUL은 파크골프장·동호회·대회·교육·뉴스 등 공개 정보를 안내하고 회원의 커뮤니티 활동과 장터 게시를 돕습니다. 외부 시설의 예약·운영 조건과 게시자가 안내한 거래 조건은 해당 시설 또는 게시자에게 확인해 주세요.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold">2. 회원가입과 계정</h2>
            <p>본인이 사용할 수 있는 이메일로 인증번호를 받아 가입합니다. 이용약관과 회원가입 개인정보 수집·이용 안내를 읽고 필수 동의를 완료해야 합니다. 타인의 이메일이나 인증번호로 계정을 이용하지 말고, 인증번호를 다른 사람에게 알려 주지 마세요.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold">3. 게시물과 기본 책임</h2>
            <p>본인이 작성하거나 게시할 권한이 있는 내용만 올려 주세요. 게시물의 사실관계를 확인하고 타인의 개인정보·사진·저작물을 허락 없이 공개하지 마세요. 공개 게시물은 비회원도 읽을 수 있으므로 공개할 필요가 없는 연락처나 개인 정보를 본문에 넣지 마세요.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold">4. 금지 행위와 관리</h2>
            <p>사칭, 사기, 괴롭힘, 불법 정보 게시, 권리 침해, 반복적인 도배와 서비스 이용을 방해하는 행위를 금지합니다. 운영자는 신고나 위반 사실을 확인해 해당 콘텐츠를 숨기거나 이용을 제한할 수 있습니다. 신고·수정 요청은 해당 기능에 표시된 창구를 이용해 주세요.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold">5. 서비스 변경과 중단</h2>
            <p>Beta 운영 중에는 기능이 변경되거나 점검·장애로 이용이 중단될 수 있습니다. 운영상 변경 사항은 서비스 내 안내로 알립니다. PUL에 게시된 정보만으로 외부 시설의 이용 가능 여부나 거래의 이행이 보장되지는 않습니다.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold">6. 탈퇴와 문의</h2>
            <p>현재 앱에는 회원이 직접 실행하는 탈퇴·계정 삭제 기능이 없습니다. 회원탈퇴·삭제 요청은 PUL 운영자에게 이메일로 보내 주세요. 로그아웃은 계정 삭제가 아니며, 개인정보의 보유·삭제 기준은 개인정보처리방침에서 확인할 수 있습니다.</p>
            <p className="mt-2">일반 서비스·계정·신고·운영·오류 문의와 회원탈퇴·삭제 요청: <a href="mailto:pulpark.help@gmail.com" className="break-all font-semibold text-pul-point underline underline-offset-4">pulpark.help@gmail.com</a></p>
          </section>
          <nav aria-label="관련 문서" className="flex flex-wrap gap-x-6 gap-y-2 border-t border-pul-border pt-4">
            <Link href="/privacy" className="inline-flex min-h-11 items-center font-bold text-pul-point underline">개인정보처리방침</Link>
            <Link href="/signup" className="inline-flex min-h-11 items-center font-bold text-pul-point underline">회원가입 화면</Link>
          </nav>
        </article>
      </Container>
    </main>
  );
}
