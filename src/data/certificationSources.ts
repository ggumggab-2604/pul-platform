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
  associationNotices: association + "/news-library/announcements",
  refereeNotice: announcement("7c549ea6-6096-408d-bff8-36b70334997e"),
  refereeRegulations: `${association}/association/regulations/9ffc8b93-0e4c-4324-b1f3-bb0018f93300`,
  refereeRegistry: "https://www.pqi.or.kr/inf/qul/infQulBasDetail.do?qulId=60043",
  privateRegistry: "https://www.pqi.or.kr/inf/qul/infQulList.do",
};

export const refereeGrades = [
  {
    grade: "3급 심판",
    eligibility: "협회 1급 지도자 또는 파크골프 국가 체육지도사(생활·노인·유소년) 취득 2년 이상. 협회 1급 지도자 중 보수교육 대상자는 이수 필요.",
    assessment: "2026년 정정 시행지침 평가표 기준 체력·실기·이론·심판 역할 평가에 모두 합격. 이 회차는 합격자 연수 이수 후 자격증 발급.",
    duties: "협회·시도협회 대회 심판, 지도자·스포츠지도사 실기검정 보조.",
  },
  {
    grade: "2급 심판",
    eligibility: "3급 취득 3년 이상과 인정 대회·검정에서 심판 활동 4회 이상.",
    assessment: "규정상 이론과 구술 평가에서 각각 70점 이상.",
    duties: "협회·시도협회 대회 심판, 지도자·스포츠지도사 실기 보조, 심판·강사 실기검정 감독 보조.",
  },
  {
    grade: "1급 심판",
    eligibility: "세부 지원 조건은 협회 확인 필요.",
    assessment: "서류 심사·추천, 구술 80점 이상. 대회 규정·심판 매뉴얼·태도·기여도 평가.",
    duties: "협회·시도협회 대회 심판, 지도자·스포츠지도사와 심판·강사 실기검정 감독.",
  },
  {
    grade: "국제심판",
    eligibility: "세부 지원 조건은 협회 확인 필요.",
    assessment: "서류 심사·추천, 구술 80점 이상. 국내외 대회 규정·심판 방법·태도 평가.",
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

export const examQualifications = {
  life: "생활스포츠지도사",
  disability: "장애인스포츠지도사",
  senior: "노인스포츠지도사",
  youth: "유소년스포츠지도사",
} as const;

export const examYears = ["2026", "2027"] as const;

const requiredSubjects = [
  ["health", "건강교육론"], ["injury", "운동상해"], ["measurement", "체육측정평가론"],
  ["training", "트레이닝론"], ["disability", "장애인스포츠론"], ["adapted", "특수체육론"],
  ["senior", "노인체육론"], ["earlychildhood", "유아체육론"],
] as const;

export const allWrittenSubjects = [...writtenSubjects, ...requiredSubjects];
type SubjectKey = (typeof allWrittenSubjects)[number][0];

const common = writtenSubjects.map(([key]) => key);
const advanced = ["injury", "measurement", "training"] as const;
export const examWritten: Record<string, {
  code: string; required: readonly SubjectKey[]; optional: readonly SubjectKey[]; choose: number;
}> = {
  life2: { code: "LSC2", required: [], optional: common, choose: 5 },
  life1: { code: "LSC1", required: ["health", ...advanced], optional: [], choose: 0 },
  disability2: { code: "DSC2", required: ["adapted"], optional: common, choose: 4 },
  disability1: { code: "DSC1", required: ["disability", ...advanced], optional: [], choose: 0 },
  senior: { code: "OLSC", required: ["senior"], optional: common, choose: 4 },
  youth: { code: "YUSC", required: ["earlychildhood"], optional: common, choose: 4 },
};

export const boryeong = { key: "boryeong", name: "보령장애인파크골프장" } as const;

export const examVenues = {
  hancheon: {
    ...hancheon, courseKey: "course-f7c259f5d6f64380bfe44074abfd4e32", keyword: "한천", locality: "예천", address: "경북 예천군 예천읍 왕신길 84-9",
    names: [hancheon.name, "한천파크골프장", "한천예천파크골프장", "예천한천파크골프장"],
  },
  boryeong: {
    ...boryeong, courseKey: null, keyword: "보령", locality: "보령", address: "충남 보령시 대천방조제로 322",
    names: [boryeong.name, "보령시 장애인파크골프장", "보령 장애인파크골프장"],
  },
};

export const examSchedule = (key: string) => `${kspo}/info/schedPlan.kspo?QF_GRADE_CD=${examWritten[key].code}`;

type PracticalExam = {
  venue: keyof typeof examVenues; courses: readonly string[];
  dates: readonly { date: string; practice: string; extra?: string }[];
  score: string; notice: string; issuer: string; mapNotice?: string;
  oral: { place: string; schedule: string; notice: string };
};
const practicalHancheon: PracticalExam = {
  venue: "hancheon", courses: hancheon.courses, dates: practicalDates,
  score: "18홀 60타 이하", notice: certificationSources.practical,
  issuer: "대한파크골프협회", mapNotice: certificationSources.practice,
  oral: { place: "대전대학교", schedule: "6월 22~26일",
    notice: announcement("a3862bee-fd3b-46f2-861a-0910623d206b") },
};
const disabilityNotice = "https://kdpga.koreanpc.kr/org/kdpga/boards/notice/posts/16387?fromPage=1";
const practicalBoryeong: PracticalExam = {
  venue: "boryeong", courses: [],
  dates: ["2026-06-01", "2026-06-02"].map((date) => ({ date, practice: "5월 6~31일 (마지막 날 12:00까지)" })),
  score: "공고 확인", notice: disabilityNotice, issuer: "대한장애인골프협회",
  oral: { place: boryeong.name, schedule: "6월 1~2일", notice: disabilityNotice },
};
const ageGroup = { ...practicalHancheon, courses: ["C", "D"] };
export const examPractical: Record<string, Record<string, PracticalExam>> = {
  "2026": {
    life2: practicalHancheon, life1: { ...practicalHancheon, score: "18홀 57타 이하" },
    disability1: practicalBoryeong,
    disability2: { ...practicalBoryeong, oral: { ...practicalBoryeong.oral,
      notice: "https://kdpga.koreanpc.kr/org/kdpga/boards/notice/posts/24285?fromPage=1" } },
    senior: ageGroup, youth: ageGroup,
  },
};

type TrainingNotice = { name: string; place: string; registration: string; dates: string; url: string };
const twoStepRegistration = "정기 7월 21~23일 · 추가 7월 27~28일";
export const examTraining: Record<string, Record<string, TrainingNotice>> = {
  "2026": {
    life2: { name: "건국대학교 생활스포츠지도사연수원", place: "글로컬캠퍼스 KU스테이션 101호",
      registration: twoStepRegistration, dates: "일반수업 8월 1~9일, 8월 22~31일 중 주말 · 현장실습 8월 1일~10월 18일",
      url: "https://salti.kku.ac.kr/cms/FR_CON/BoardView.do?BBS_SEQ=35841&BOARD_SEQ=1&MENU_ID=90&SITE_NO=11" },
    life1: { name: "국민체육진흥공단 · 원광대학교", place: "기관별 공고 확인", registration: "7월 27~28일 (공단 공시)",
      dates: "일반수업·현장실습 8월 1일~10월 18일 (공단 공시)", url: examSchedule("life1") },
    disability2: { name: "한국체육대학교 스포츠지도사연수원", place: "필승관 5층 대강당",
      registration: twoStepRegistration, dates: "일반수업 8월 1~2일, 8~9일, 15~17일 · 현장실습은 배정 기관 확인",
      url: "https://graduipsi.knsu.ac.kr/si/board/notice.do?articleNo=56010&mode=view" },
    disability1: { name: "국민체육진흥공단", place: "기관별 공고 확인", registration: "7월 27~28일 (공단 공시)",
      dates: "일반수업·현장실습 8월 1일~12월 5일 (공단 공시)", url: examSchedule("disability1") },
    senior: { name: "국립부경대학교 체육진흥원", place: "대연캠퍼스", registration: twoStepRegistration,
      dates: "주중반 8월 3~12일 · 주말반 8월 중 운영일 · 현장실습 8월 11일~10월 8일",
      url: "https://sports.pknu.ac.kr/kr/index.php?idx=168&mode=view&pCode=MN0000024" },
    youth: { name: "가톨릭관동대학교 체육지도자연수원", place: "기관별 공고 확인",
      registration: "7월 27~28일 (공단 공시)", dates: "일반수업·현장실습 8월 1일~10월 18일 (공단 공시)",
      url: certificationSources.training },
  },
};
