import { courseSearchAddress, hasCourseCoordinates, type CourseDestination } from "./courseDirections";

type AddressResult = {
  address_name: string; address_type: string; x: string; y: string;
  address?: { address_name: string } | null;
  road_address?: { address_name: string } | null;
};
export type AddressGeocoder = {
  addressSearch(query: string, callback: (results: AddressResult[], status: string) => void,
    options: { analyze_type: "exact" }): void;
};
// Accept ordinary administrative abbreviations, without weakening the street/lot match.
function normalizedAddress(value: string) {
  const aliases: Record<string, string> = {
    서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
    광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
    경기: "경기도", 강원: "강원특별자치도", 강원도: "강원특별자치도",
    충북: "충청북도", 충남: "충청남도", 전북: "전북특별자치도", 전라북도: "전북특별자치도",
    전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도", 제주도: "제주특별자치도",
  };
  return value.trim().replace(/^\S+/, first => aliases[first] ?? first).replace(/\s+/g, "");
}

// Address results stay local to the opened course. They never overwrite stored coordinates
// or promote a facility location to an entrance/parking point.
export function geocodeCourseDestination(course: CourseDestination, geocoder: AddressGeocoder, ok: string): Promise<CourseDestination> {
  return new Promise((resolve, reject) => {
    if (!course.address.trim()) { reject(new Error("주소 정보가 없어 목적지 좌표를 확인할 수 없습니다.")); return; }
    const query = courseSearchAddress(course);
    let finished = false;
    const finish = (value: CourseDestination | Error) => {
      if (finished) return;
      finished = true; clearTimeout(timeout);
      if (value instanceof Error) reject(value); else resolve(value);
    };
    const temporary = "주소 위치를 일시적으로 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    const timeout = setTimeout(() => finish(new Error(temporary)), 10_000);
    try {
      geocoder.addressSearch(query, (results, status) => {
        if (finished) return;
        if (status !== ok && status !== "ZERO_RESULT") { finish(new Error(temporary)); return; }
        if (status === "ZERO_RESULT" || !results.length) { finish(new Error("주소에 해당하는 위치를 찾지 못했습니다. 주소를 확인해 주세요.")); return; }
        const detailed = results.filter(result => ["ROAD_ADDR", "REGION_ADDR"].includes(result.address_type));
        if (!detailed.length) {
          finish(new Error(results.every(result => ["REGION", "ROAD"].includes(result.address_type))
            ? "주소가 동·도로 수준이라 구장 위치를 특정할 수 없습니다. 상세 주소를 확인해 주세요." : temporary)); return;
        }
        const valid = detailed.map(result => ({ result, point: { ...course,
          latitude: result.y.trim() ? Number(result.y) : null,
          longitude: result.x.trim() ? Number(result.x) : null, destinationKind: "facility" as const } }))
          .filter(({ point }) => hasCourseCoordinates(point));
        if (!valid.length) { finish(new Error(temporary)); return; }
        const unique = (rows: typeof valid) => new Map(rows.map(({ point }) => [point.latitude + "," + point.longitude, point]));
        let points = unique(valid);
        // Exact address search may normalize/expand the address. Trust a single detailed
        // destination; text matching is only a tie-breaker for different coordinates.
        if (points.size > 1) points = unique(valid.filter(({ result }) =>
          [result.address_name, result.address?.address_name, result.road_address?.address_name]
            .some(address => address && normalizedAddress(address) === normalizedAddress(query))));
        if (points.size !== 1) { finish(new Error("주소의 목적지가 여러 곳입니다. 상세 주소를 확인해 주세요.")); return; }
        finish(points.values().next().value!);
      }, { analyze_type: "exact" });
    } catch { finish(new Error(temporary)); }
  });
}
