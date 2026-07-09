import { CommunityPageContent } from "@/components/community/CommunityPageContent";
import { Container } from "@/components/ui/Container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "커뮤니티",
  description:
    "파크골프 회원들이 자유롭게 이야기하고, 질문하고, 후기와 정보를 나누는 PUL 커뮤니티입니다.",
};

export default function CommunityPage() {
  return (
    <div className="bg-pul-page">
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <CommunityPageContent />
      </Container>
    </div>
  );
}
