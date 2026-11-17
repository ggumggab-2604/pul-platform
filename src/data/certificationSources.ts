const kspo = "https://sqms.kspo.or.kr";
const association = "https://www.kpga7330.com";
const announcement = (id: string) => `${association}/news-library/announcements/${id}`;

export const certificationSources = {
  national: `${kspo}/info/licenseInfoLsc2.kspo`,
  firstLevel: `${kspo}/info/licenseInfoLsc1.kspo`,
  disabled: `${kspo}/info/licenseInfoDsc2.kspo`,
  schedule: `${kspo}/info/schedPlan.kspo?QF_GRADE_CD=LSC2`,
  notices: `${kspo}/info/noticeList.kspo`,
  writtenProblem: `${kspo}/exam/wrQnaView.kspo?BRD_CON_SN=7963`,
  writtenAnswer: `${kspo}/exam/wrQnaView.kspo?BRD_CON_SN=8049`,
  writtenNotice: `${kspo}/info/noticeView.kspo?BRD_CON_SN=7944`,
  practical: announcement("3e393619-78d4-4315-a4d4-8a0c57266492"),
  practice: announcement("eff6d966-5099-4c01-a57c-b25126e1937a"),
  extraPractice: announcement("ce492f5b-dafe-4b99-a41c-16f14f0c751f"),
  oralDisclosure: announcement("d9982a64-e47c-4c2e-9a22-cdc2d2e5cbbf"),
  training: `${kspo}/info/saOrgInfoList.kspo`,
  trainingProviders: `${kspo}/info/gradeOrgInfo.kspo`,
  association: `${association}/park-golf/certification`,
  refereeNotice: announcement("7c549ea6-6096-408d-bff8-36b70334997e"),
  refereeRegulations: `${association}/association/regulations/9ffc8b93-0e4c-4324-b1f3-bb0018f93300`,
  refereeRegistry: "https://www.pqi.or.kr/inf/qul/infQulBasDetail.do?qulId=60043",
  privateRegistry: "https://www.pqi.or.kr/inf/qul/infQulList.do",
};

export const refereeGrades = [
  {
    grade: "3급 심판",
    eligibility: "협회 1급 지도자나 파크골프 국가 체육지도자(생활·노인·유소년) 취득 2년 이상. 협회 지도자 중 보수교육 대상자는 이수 필요.",
    assessment: "2026년 공고는 체력·실기·이론·심판 역할 평가를 모두 통과하고 합격자 연수를 이수하는 절차를 안내합니다.",
    duties: "협회·시도협회 대회 심판, 지도자·스포츠지도사 실기검정 보조.",
    notice: certificationSources.refereeNotice,
  },
  {
    grade: "2급 심판",
    eligibility: "3급 취득 3년 이상과 인정 대회·검정에서 심판 활동 4회 이상.",
    assessment: "규정상 이론과 구술 평가에서 각각 70점 이상.",
    duties: "협회·시도협회 대회 심판, 지도자·스포츠지도사 실기 보조, 심판·강사 실기검정 감독 보조.",
  },
  {
    grade: "1급 심판",
    eligibility: "협회 규정에 이 등급의 별도 응시 요건은 기재돼 있지 않습니다.",
    assessment: "규정상 심의위원회 서류 심사·추천과 구술 평가 80점 이상.",
    duties: "협회·시도협회 대회 심판, 지도자·스포츠지도사와 심판·강사 실기검정 감독.",
  },
  {
    grade: "국제심판",
    eligibility: "협회 규정에 이 등급의 별도 응시 요건은 기재돼 있지 않습니다.",
    assessment: "규정상 심의위원회 서류 심사·추천과 구술 평가 80점 이상. 구술은 국내·국제대회 규정, 심판 방법과 태도를 평가합니다.",
    duties: "국내외 국제대회 심판과 심판 연수·보수교육 강의.",
  },
];

export const writtenSubjects = [
  ["education", "스포츠교육학"], ["society", "스포츠사회학"], ["psychology", "스포츠심리학"],
  ["ethics", "스포츠윤리"], ["physiology", "운동생리학"], ["mechanics", "운동역학"],
  ["history", "한국체육사"],
] as const;

export const studyStages = [
  ["written", "필기"], ["practical", "실기"], ["oral", "구술"], ["training", "연수"],
] as const;

export const trainingInstitutions = [
  { key: "hanyang", name: "한양대학교(서울)", notice: "2026.07.30 OT 공지", location: "서울캠퍼스 올림픽체육관(OT)", url: `${kspo}/info/saOrgInfoView.kspo?BRD_CON_SN=8188` },
  { key: "kyonggi", name: "경기대학교", notice: "2026.07.08 연수시행공고", location: "연수 일정과 시설은 공고 첨부에서 확인", url: `${kspo}/info/saOrgInfoView.kspo?BRD_CON_SN=8162` },
] as const;

export const hancheon = { key: "hancheon", name: "예천 한천파크골프장", courses: ["A", "B"] } as const;

export const practicalDates = [
  { date: "2026-06-08", practice: "5월 22~23일", extra: "6월 5일" },
  { date: "2026-06-09", practice: "5월 24~25일", extra: "6월 5일" },
  { date: "2026-06-10", practice: "5월 26~27일", extra: "6월 5일" },
  { date: "2026-06-11", practice: "5월 28~29일", extra: "6월 5일" },
  { date: "2026-06-12", practice: "5월 30~31일", extra: "6월 6일" },
  { date: "2026-06-13", practice: "6월 1~2일", extra: "6월 6일" },
  { date: "2026-06-14", practice: "6월 3~4일", extra: "6월 6일" },
];

export const oralPractice = [
  { key: "safety", question: "앞 팀이 아직 타구 범위에 있을 때 어떻게 진행하시겠습니까?",
    answer: "타구를 멈추고 앞 팀이 안전한 거리로 이동할 때까지 기다립니다. 동반자의 위치를 확인한 뒤 타구합니다." },
  { key: "local-rules", question: "라운드 전에 구장의 로컬룰을 어떻게 확인하겠습니까?",
    answer: "구장 안내판과 대회 공고를 읽고 적용 범위를 확인합니다. 해석이 불분명하면 경기 시작 전에 운영자나 심판에게 묻습니다." },
] as const;
