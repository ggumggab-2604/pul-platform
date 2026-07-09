import { CERT_DISCLAIMER } from "@/data/certificationData";

export function CertificationDisclaimer() {
  return (
    <aside className="rounded-lg border border-pul-border/80 bg-[#fafbfa] px-3 py-2.5 lg:px-4 lg:py-3">
      <p className="text-[11px] leading-relaxed text-pul-muted lg:text-xs lg:leading-relaxed">
        {CERT_DISCLAIMER}
      </p>
    </aside>
  );
}
