"use client";

import {
  EQUIPMENT_CARE_ANCHOR,
  EQUIPMENT_CARE_COPY,
  equipmentCareTips,
} from "@/data/equipmentCareData";
import { cn } from "@/lib/utils";

type EquipmentCareLinkBoxProps = {
  compact?: boolean;
  onRegisterInquiry?: (trigger: HTMLButtonElement) => void;
};

export function EquipmentCareLinkBox({
  compact = false,
  onRegisterInquiry,
}: EquipmentCareLinkBoxProps) {
  return (
    <section
      id={EQUIPMENT_CARE_ANCHOR}
      className={cn(
        "rounded-xl border border-pul-border bg-pul-page/50",
        compact ? "px-3 py-3" : "px-4 py-4",
      )}
    >
      <h3 className="text-sm font-bold text-foreground lg:text-base">
        {EQUIPMENT_CARE_COPY.title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
        {EQUIPMENT_CARE_COPY.description}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {EQUIPMENT_CARE_COPY.services.map((service) => (
          <span
            key={service}
            className="rounded-full border border-pul-border bg-white px-2 py-0.5 text-[10px] font-semibold text-pul-deep lg:text-[11px]"
          >
            {service}
          </span>
        ))}
      </div>
      {!compact ? (
        <ul className="mt-3 space-y-2">
          {equipmentCareTips.map((tip) => (
            <li
              key={tip.id}
              className="rounded-lg border border-pul-border/80 bg-white px-3 py-2 text-xs text-pul-muted"
            >
              <span className="font-bold text-pul-deep">{tip.title}</span>
              <span className="mx-1">·</span>
              {tip.summary}
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        onClick={(event) => onRegisterInquiry?.(event.currentTarget)}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep hover:bg-pul-light sm:w-auto sm:px-4 lg:text-sm"
      >
        {EQUIPMENT_CARE_COPY.registerLabel}
      </button>
    </section>
  );
}
