# AM — 장터 상세·공통 관심 저장·내 정보 통합 관심목록

- 날짜: 2026-10-01
- 판정: **LOCAL IMPLEMENTATION VERIFIED / RELEASE CANDIDATE ONLY**
- 이번 작업은 로컬 구현·검증까지만 실행했다. commit/stage/push, 베타 배포, 원격 DB/RPC/Storage 쓰기, 원격 회원 로그인은 실행하지 않았다.
- **Transport NOT_CONFIGURED / AM REMOTE APPLY NOT APPROVED**. 완료된 AL 원격 적용을 다시 실행하지 않았다.

## 1. 기준과 보존

| 구분 | 기준 / 최종 확인 |
|---|---|
| 원본 저장소 | C:/Users/halSUdiDa/Desktop/pul-platform |
| 원본 브랜치·HEAD | experiment/main-tuning / 7e8393064155a8241a62b539f457978647076f19 |
| AM 소유 분리 작업트리 | C:/Users/halSUdiDa/.codex/worktrees/market-detail-interests/pul-platform |
| 후보 기준·최종 HEAD | d6bde01c77b0e31cf4cd39594da7646b10740f6a (AL 배포 commit) |
| 원본 보호 | 기존 AL 보호 116개 + AL 보고서 = 117개; 시작/종료 SHA-256 전부 일치 |
| 원본 tracked 상태 | git status --short --untracked-files=no 시작/종료 동일 |
| 누적 기록 | AM 경로 미존재 확인 후 신규 작성. A–AL 보고서·실수·거절 기록 보존 |

원본의 다른 미커밋 기능을 후보에 가져오지 않았다. 기존 복구 글과 사진 4장·예약, AL removed 시험 글은 조회/변경/재사용하지 않았다. 환경파일, 사용자 localhost 서버·작성 탭, backups에 접근하거나 변경하지 않았다.

보호 근거: [시작 117개](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/original-before.json>), [종료 비교](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/preservation-result.json>), [후보 15개 시작/최종 해시](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/candidate-manifest.json>). 후보 시작 해시는 깨끗한 d6bde01 기준 Git blob이며 새 파일은 null(없음)이다. 비밀값 및 그 파생 해시는 포함하지 않는다.

## 2. 구현과 정확한 변경 파일

기존 8개 수정 + 신규 제품 5개 + SQL 1개 + 시험 1개 + 이 보고서 1개, 총 16개가 AM 후보 범위다. node_modules 연결, .next 산출물 및 소유 합성 미리보기는 배포 파일이 아니다.

| 파일 | 변경 이유 |
|---|---|
| src/components/market/MarketDetailModal.tsx | 제목/더보기/사진/가격·상태/설명/판매자·날짜/역할별 버튼 정리. 본문 기본 펼침 |
| src/components/market/MarketDialog.tsx | 상단 actions 슬롯, 긴 제목 줄바꿈, summary를 기존 포커스 순환에 포함 |
| src/components/market/MarketPhotos.tsx | 판매글 전용 대표사진·썸네일·이전/다음·번호·확대. 기존 다른 메뉴/편집용 갤러리 유지 |
| src/components/market/MarketContact.tsx | 판매글 구매자의 유효 연락처만 간결한 보조 영역 표시. 기본 경로 유지 |
| src/components/market/MarketMessageLink.tsx | 상세 배치용 compact 옵션. 320px에서 문구 중간 줄바꿈 없이 버튼 행 이동 |
| src/components/account/MyActivityHub.tsx | 기존 실제 활동 4개 유지. 레슨 관심 카드만 독립 관심목록으로 이전 |
| src/app/my/page.tsx | 기존 계정/프로필 및 활동 아래 통합 관심목록 연결; 관심 조회 실패 별도 표시 |
| src/app/messages/new/page.tsx | 빌드에서 확인한 기존 선택적 ComposePage props와 Next PageProps 불일치만 페이지 wrapper로 교정 |
| src/lib/interests/interests.ts (신규) | 허용 종류/ID 검증, 등록·해제, 상태, 목록 변환, 숨김 정보 제거, 상세 경로 |
| src/app/my/interestActions.ts (신규) | 기존 세션 클라이언트 사용; 저장 성공 후 /my 캐시 갱신 |
| src/components/interests/InterestButton.tsx (신규) | 최종 원하는 상태 전달, 중복 클릭 방지, 실패 시 기존 표시 보존 및 동일 상태 재시도 |
| src/components/interests/MarketInterest.tsx (신규) | 상품 현재 상태 조회 및 재시도; 비로그인 기존 로그인 후 해당 상품 복귀 |
| src/components/interests/InterestList.tsx (신규) | 전체/상품/레슨·영상, 12개 페이지, 상세 이동·해제·숨김 항목·빈/오류 상태 |
| supabase/migrations/20261019000100_pul_market_interests.sql (신규) | 장터 관심 관계와 본인 전용 RPC, 기존 레슨 저장소를 읽는 통합 조회 |
| src/lib/market/marketDetailInterests.test.mjs (신규) | 직접 관련 DOM/모의/어댑터 회귀 6개 |
| docs/messaging/PUL_MARKET_DETAIL_INTERESTS_IMPLEMENTATION.md (신규) | AM 결과 및 적용 후보 기록 |

### 상세 동작 보존

- 소유자는 내용 수정·판매 상태 변경, 더보기 삭제. 기존 reserve/sell 전환 및 삭제 확인·소유권 경로를 재사용한다. 연락처는 기존 내용 수정 폼에서 변경한다.
- 구매자는 쪽지·관심상품, 더보기 신고. 신고 callback에 기존 상세 item을 전달하며 서버 신고 대상 계약은 수정하지 않았다.
- 쪽지 전용 글의 빈 연락처 영역은 생략한다. 연락처 조회는 기존 상세 RPC에 포함되며 실제 실패는 변경하지 않은 MarketPageContent의 getMarketListingAction catch → 오류 표시 경로로 전파된다. compact 영역을 위해 오류를 null로 바꾸는 fallback을 추가하지 않았다.
- 기존 판매자 공개 필드만 사용한다. 설명/사진/가격을 하드코딩하지 않았다. 캡처의 LOCAL 문구와 사진은 소유 미리보기 fixture다.
- 사진 저장 순서·대표사진 결정·Storage·업로드 로직은 변경하지 않았다. 0/1/4장, object-contain, 키보드 좌우, 확대 Escape와 트리거 포커스 복귀를 확인했다.
- 전역 CSS·폰트·작성 폼·정책 market-policy-v1·인증·쪽지 계약은 유지했다.

## 3. 공통 관심 기반과 기존 레슨 보존

기존 관심 레슨 영상은 lesson_video_bookmarks / set_lesson_video_bookmark를 사용하는 실제 기능이다. 이를 삭제·일괄 이관하지 않았다. 공통 액션의 lesson_video 저장/해제는 기존 함수를 호출하며 통합 목록은 기존 테이블을 union 조회한다. 기존 레슨 화면·저장 API는 그대로다.

공통부는 InterestButton/InterestList, 명시적 saved boolean, 상태·오류·페이지 처리, 종류 검증이다. 장터 전용부는 FK 관계, 본인 상품 저장 거부, canonical get_market_listing을 통한 공개 여부, 판매 상태와 가격/대표사진/상품 링크다. 레슨 전용부는 기존 대상 key/공개 함수/YouTube 진입이다.

실제 허용 종류는 market와 lesson_video 두 개뿐이다. 글·동호회·대회 등 미구현 문자열은 API/SQL에서 거부한다. 관심 저장은 참가/가입/알림/마케팅 동의와 무관하다.

향후 연결할 때는 (1) 실제 대상·공개 정책 및 FK/삭제 규칙 (2) 종류 allowlist와 서버 adapter (3) 목록의 안전한 표시 필드·원문 경로 (4) 권한/비공개/중복/해제 회귀를 함께 추가한다. 범용 플러그인 시스템이나 빈 메뉴 탭은 만들지 않았다.

## 4. 신규 DB 후보

- 파일/버전: 20261019000100_pul_market_interests.sql
- SHA-256: **278304c7e23ac9196d1392c5a0745215998fbbe387a557af45b4e03087149dbe**
- 기존 설치 CLI 2.117.0의 migration new --help와 기존 offline 실행 방식을 확인했다. CLI 생성 시 현재 날짜 번호가 AH보다 앞서므로, 이번에 새로 생성한 빈 파일만 확인된 미사용 20261019000100으로 정리한 뒤 작성했다. 기존 migration 수정/재번호화 없음.
- AL의 기존 99개(최신 AH 20261018000100)를 선행 기준으로 한다. 원격 이력은 이번에 재조회하지 않았으며 “현재도 99개”라고 새 확인으로 주장하지 않는다.
- market_listing_bookmarks: user_accounts/market_listings FK, user_id+listing_id PK, 사용자·저장일 인덱스. 삭제 cascade.
- RLS ENABLE/FORCE. 테이블에 anon/authenticated/service_role 직접 grant 없음. 사용자 ID 인자를 받지 않는 checked RPC만 authenticated에 실행 허용.
- public invoker → private definer(empty search_path) 경로. 기존 active actor/reader 검증, auth.uid 기반 본인 조건, 목록 limit 1~24 / offset 0~10000, advisory lock+PK로 중복 방지.
- set_market_interest, market_interest_state, list_my_interests 추가. 기존 저장 함수/정책/migration/RPC 실행 계약을 바꾸지 않는다.
- 삭제·접근 불가 상품은 canonical 조회 결과 null을 바탕으로 제목/사진/가격/지역/연락처를 반환하지 않는다. 해제는 유지한다. 판매완료 상태는 표시한다.
- 조회 결과에 연락처·동의 기록·판매자 비공개 프로필을 포함하지 않는다.
- [Supabase 공식 RLS 지침](https://supabase.com/docs/guides/database/postgres/row-level-security)과 적용 skill을 확인했다. 과거 거절된 changelog/비밀값 설정 접근은 재시도하지 않았다.

### 이후 별도 승인 시 적용 후보

1. 연결 프로젝트와 실제 최신 migration 이력 및 이 파일 해시 확인.
2. 위 신규 SQL **하나만** 적용. AL/AH 및 다른 pending 후보를 재적용/일괄 적용하지 않는다.
3. d6bde01 기준 위 제품 코드 13개를 포함한 후보를 반영. SQL이 먼저 있어야 새 관심 기능을 사용할 수 있다.
4. 별도 승인된 합성 사용자/상품 범위에서 저장·해제·새로고침·통합 목록·타인 차단 최소 연결 확인.

추가형 SQL이므로 기존 배포 코드는 기존 레슨/장터 경로를 계속 사용할 수 있다. 기존 관심 레슨 자료의 마이그레이션이나 기존 상품 변경은 필요 없다. 새 코드를 DB보다 먼저 배포하면 신규 RPC 미존재 오류로 관심 기능이 준비중 상태가 된다. 실패 시 후속 배포를 중단하고 이전 코드로 복귀할 수 있으며 새 관계를 자동 삭제하거나 기존 데이터를 되돌리지 않는다. 원격 실행·시험 자료 생성 범위는 이번에 승인받지 않았다.

## 5. 검증 결과 — 시험 층 구분

| 층 | 실제 수행 결과 |
|---|---|
| DOM·모의/어댑터 | 신규 6개 PASS. 기존 marketPhaseOneDom 12개 + contactRegionNotice 5개 PASS, 합계 서로 다른 23개 |
| 소유 실제 로컬 DB | 기존 AJ 환경 도구 재사용, 기존 99개 + AM SQL. 실제 PostgreSQL/RPC 6개 묶음 PASS |
| 브라우저 화면/HTTP action | 실제 후보 컴포넌트·제품 CSS·Noto Sans KR 사용, 127.0.0.1:3395 합성 서버 adapter. 상세↔내 정보 관심 상태 연결·필터·해제 확인 |
| 타입·lint | tsc --noEmit --incremental false 통과. 변경 제품 파일 lint 통과. 마지막 action/wrapper/모바일 보완 파일도 재확인 |
| 빌드 | next build --webpack 통과. 처음 발견한 messages/new 페이지 props 빌드 차단만 최소 교정 후 통과 |
| 원격/실제 회원 | 미실행. 원격 로그인·글/사진/관심/쪽지/신고 생성 없음 |

실제 로컬 DB 확인:
- 쪽지 전용 v2 등록과 같은 request ID 재호출이 같은 글 ID를 반환.
- 저장/재조회(별도 SQL 세션), 중복 저장 1행, 다른 사용자 목록 격리, 본인 상품 거부.
- anon, 직접 테이블 읽기, 미지원 종류, null/초과 limit 차단.
- reserve → sell 상태와 판매완료 표시.
- removed 후 숨김 필드 전부 null, 신규 저장 차단, 반복 해제 허용.
- 기존 레슨 저장·통합/종류별 조회·비공개 시 제목 제거·기존 해제 경로.
- suspended 사용자 조회/변경 차단.

DB 시험 첫 두 실행은 시험 스크립트의 반환 키(id/listing_id) 및 JSON/boolean 판독 오류로 중단했다. 제품 결함으로 기록하지 않는다. 판독만 교정한 최종 실행에서 모두 통과했고 세 실행의 소유 컨테이너·네트워크·볼륨·임시 DB는 정리했다.
[DB 결과](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/db-result.json>) / [기존 환경 도구를 호출한 실행 스크립트](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/db-check.mjs>).

실제 Auth HTTP OTP 로그인·재로그인 및 실제 브라우저→로컬 DB 종단 연결은 이번에 수행하지 않았다. 브라우저의 합성 adapter 저장은 실제 DB 시험과 구분한다. 실제 DB의 사용자별 영속 저장과 별도 세션 재조회는 수행했다. 사진은 로컬 합성 SVG이며 Storage 업로드 시험이 아니다.

## 6. 화면 확인과 캡처

데스크톱 1440×1000, 모바일 320×740·390×844. 실제 제품 CSS와 기존 Noto Sans KR 로드 완료를 확인했다. 대체 글꼴은 사용하지 않았다. 앱 전역 header/footer·로그인 데이터만 분리 미리보기이므로 캡처를 실제 서비스 화면이라고 표현하지 않는다.

가로 넘침 없음(320px 상세 client/scroll 304px, 390px 374px). 하단 버튼은 모달 자연 스크롤과 키보드로 접근하며 고정 영역이 마지막 내용을 가리지 않는다. 320px 쪽지 문구는 한 줄을 유지하고 필요 시 버튼이 다음 행으로 이동한다. 확대창만 Escape로 닫히고 기존 상세와 포커스는 남는다.

- [구매자 상세](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/desktop-buyer.png>)
- [내 판매글 상세](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/desktop-owner.png>)
- [기존 내 정보 통합 관심목록](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/desktop-my-interests.png>)
- [레슨·영상 필터](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/desktop-my-video-filter.png>)
- [320px 구매자](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/mobile-320-buyer.png>) / [320px 하단 버튼](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/mobile-320-actions.png>)
- [390px 구매자](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/mobile-390-buyer.png>) / [390px 판매자](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/mobile-390-owner.png>)
- [320px 내 정보](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/mobile-320-my.png>) / [390px 내 정보](<C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-am-detail-interests/mobile-390-my.png>)

## 7. 종료 상태와 남은 범위

소유 검증 브라우저 탭·viewport override·3395 미리보기 서버를 정리했다. 3395 LISTEN 없음도 확인했다. 코드 후보 작업트리, 캡처 및 최소 실행 증거는 검토용으로 보존한다. 사용자 기존 서버·탭·원격 자원에는 변경 없음.

현재 로컬 후보 구현과 직접 검증은 완료했다. 베타에서 새 관심 기능을 사용하려면 위 SQL/코드 범위의 별도 원격 적용 승인이 필요하다. 실제 원격 연결 시험은 그 승인 후의 별도 단계다. 다른 메뉴의 관심 기능이나 다음 개발을 자동으로 이어가지 않는다.
