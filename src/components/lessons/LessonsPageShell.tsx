"use client";

import { LessonsPageContent } from "@/components/lessons/LessonsPageContent";
import { LessonsPageHero } from "@/components/lessons/LessonsPageHero";
import { Container } from "@/components/ui/Container";
import { useState } from "react";

export function LessonsPageShell() {
  const [registerSignal, setRegisterSignal] = useState(0);

  return (
    <div className="bg-pul-page">
      <Container className="px-2 sm:px-3">
        <LessonsPageHero onRegister={() => setRegisterSignal((n) => n + 1)} />
      </Container>
      <Container className="px-3 py-3 sm:py-4 lg:py-5">
        <LessonsPageContent registerSignal={registerSignal} />
      </Container>
    </div>
  );
}
