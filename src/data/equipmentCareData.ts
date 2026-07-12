export const EQUIPMENT_CARE_ANCHOR = "equipment-care";

export const EQUIPMENT_CARE_COPY = {
  title: "장비관리센터",
  description:
    "채 수리, 그립 교체, 헤드 수리, 리폼 업체와 장비 관리 팁을 확인하세요. 수리업체 등록은 문의로 접수합니다.",
  services: ["채 수리", "그립 교체", "헤드 수리", "리폼 업체", "장비 관리 팁"],
  registerLabel: "수리업체 등록 문의",
} as const;

export const equipmentCareTips = [
  {
    id: "tip-1",
    title: "그립 교체 시기",
    summary: "미끄러짐이나 갈라짐이 보이면 교체를 검토하세요.",
  },
  {
    id: "tip-2",
    title: "보관 습도 관리",
    summary: "직사광선과 습기를 피하고 통풍이 되는 곳에 보관하세요.",
  },
  {
    id: "tip-3",
    title: "헤드 점검",
    summary: "잔금이나 균열이 있으면 라운드 전 전문 수리를 권장합니다.",
  },
] as const;
