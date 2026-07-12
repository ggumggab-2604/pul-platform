"use client";

import { ClubsPageContent } from "@/components/clubs/ClubsPageContent";
import { ClubsPageHero } from "@/components/clubs/ClubsPageHero";
import { Container } from "@/components/ui/Container";
import { useState } from "react";

export function ClubsPageShell() {
  const [registerSignal, setRegisterSignal] = useState(0);

  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <ClubsPageHero onRegister={() => setRegisterSignal((n) => n + 1)} />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <ClubsPageContent registerSignal={registerSignal} />
      </Container>
    </div>
  );
}
