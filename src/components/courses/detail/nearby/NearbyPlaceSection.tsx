"use client";

import { NearbyPlaceCard } from "@/components/courses/detail/nearby/NearbyPlaceCard";
import { NearbyPlaceTabs } from "@/components/courses/detail/nearby/NearbyPlaceTabs";
import { Card } from "@/components/ui/Card";
import type { CourseNearbyPlacesData, NearbyPlaceTabId } from "@/data/courseDetailPageData";
import type { CourseWeather } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

type NearbyPlaceSectionProps = {
  data: CourseNearbyPlacesData;
  weather: CourseWeather;
  onReport: () => void;
};

const PREVIEW_LIMIT = 3;

function getDefaultTab(weather: CourseWeather): NearbyPlaceTabId {
  const rainChance = parseInt(weather.today.rainChance.replace("%", ""), 10);
  const badWeather =
    rainChance >= 30 ||
    weather.today.icon === "rain" ||
    weather.today.icon === "storm" ||
    weather.today.icon === "wind" ||
    weather.today.wind === "강함";
  return badWeather ? "screen" : "restaurant";
}

function gridClassForCount(count: number): string {
  // Mobile: always 1-col. PC: 1 → max-width card, 2 → 2 cols, 3+ → 3 cols
  if (count <= 1) return "mt-4 grid gap-3 lg:max-w-md lg:grid-cols-1";
  if (count === 2) return "mt-4 grid gap-3 lg:grid-cols-2";
  return "mt-4 grid gap-3 lg:grid-cols-3";
}

export function NearbyPlaceSection({ data, weather, onReport }: NearbyPlaceSectionProps) {
  const [activeTab, setActiveTab] = useState<NearbyPlaceTabId>(() => getDefaultTab(weather));
  const [showAll, setShowAll] = useState(false);

  const places = useMemo(() => {
    switch (activeTab) {
      case "screen":
        return data.screenGolf;
      case "restaurant":
        return data.restaurants;
      case "meeting":
        return data.meetingPlaces;
      case "cafe":
        return data.cafes;
      case "repair":
        return data.repairShops;
      default:
        return [];
    }
  }, [activeTab, data]);

  const visiblePlaces =
    showAll || places.length <= PREVIEW_LIMIT ? places : places.slice(0, PREVIEW_LIMIT);

  return (
    <Card dense title="이 구장 주변 이용정보">
      <div id="nearby-places" className="scroll-mt-24">
        <p className="text-sm text-pul-muted max-md:text-[15px] lg:text-base">
          협찬 여부와 관계없이 거리·이용 편의 기준으로 주변 업체를 확인할 수 있습니다.
          제휴·광고 업체는 우측 사이드바에서도 별도로 안내됩니다.
        </p>

        <div className="mt-4">
          <NearbyPlaceTabs
            active={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setShowAll(false);
            }}
          />
        </div>

        {places.length > 0 ? (
          <>
            <ul className={cn(gridClassForCount(places.length))}>
              {visiblePlaces.map((place) => (
                <li key={place.id} className={places.length === 1 ? "lg:max-w-md" : undefined}>
                  <NearbyPlaceCard place={place} onReport={onReport} />
                </li>
              ))}
            </ul>
            {places.length > PREVIEW_LIMIT ? (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[15px] font-bold text-pul-point hover:text-pul-deep lg:text-base"
                >
                  {showAll ? "접기" : "전체보기"}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-pul-border bg-pul-light/40 px-4 py-8 text-center">
            <p className="text-base text-pul-muted">
              아직 등록된 주변 이용정보가 없습니다.
            </p>
            <button
              type="button"
              onClick={onReport}
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-[15px] font-bold text-pul-deep hover:bg-pul-light lg:text-base"
            >
              주변 업체 또는 편의정보 제보하기
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
