# AP — 삽니다·교환 로컬 구현 및 검증

- 작성: 2026-10-01. 판정: **LOCAL IMPLEMENTATION / FOCUSED LOCAL VERIFICATION COMPLETE**. 베타 반영 완료가 아니다.
- 전용 작업트리: `C:/Users/halSUdiDa/.codex/worktrees/market-buy-exchange/pul-platform`. AO 배포 기준 `1e76abd124fc8e16a6f3b3d119c61ba6101d0473`의 detached HEAD에서 작업했다.
- 원본 `C:/Users/halSUdiDa/Desktop/pul-platform`의 `experiment/main-tuning` / `7e8393064155a8241a62b539f457978647076f19`, 기존 dirty 상태·index와 이전 장터 작업트리를 보존했다. 첫 호출은 AGENTS.md 단독 읽기였다.
- **Transport NOT_CONFIGURED / AP REMOTE APPLY NOT APPROVED.** 원격 제품 자료 조회·로그인·DB/Storage 쓰기·발송·stage/commit/push/배포 없음. AO의 원격 이력 100개/latest 20261019000100은 과거 기록이며 이번 현재 조회가 아니다.

## 실제 구현

기존 삽니다는 정적 화면만은 아니었다. market_buy_requests 및 v2 목록/단건/변경 RPC, 소유권·버전·요청 중복 방지 기반이 있었으나 고정 예산의 구매요청 계약이었다. 이번에는 기존 ID/작성자/본문/상태/연락처를 같은 행에 유지하면서 유형·협의 예산·거래 방식·정책 기록을 추가했다. 기존 직접 링크를 유지하고 새 원문 링크는 /market?view=buy&request=<UUID>로 일치시켰다.

- 기존 초록색 CSS/폰트/팝니다 폼 규칙 재사용. 삽니다·교환 메뉴, 전체/삽니다/교환 유형 필터, 카테고리→제목 순서, 빈 제목과 연한 입력 안내.
- 삽니다: 숫자/쉼표 예산 또는 명시적 예산 협의. 협의는 NULL+flag로 저장하며 0원으로 대체하지 않는다. 사진 입력/빈 사진 상자 없음.
- 교환: 보유 물품과 원하는 조건, 선택 사진 최대 5장. 신규 유형 전환은 입력·선택 파일을 유지하고 제출 유형 자료만 보낸다. 저장 후 유형 변경은 서버에서도 거부한다.
- 쪽지 기본, 전화·문자 선택. 같은 정규화 번호와 같은 방법의 유효 동의만 재사용한다. 해제하면 해당 글의 연락처/방법/동의 기록만 비운다. 기존 전화·문자 폼 복원, 변경 시 재동의, 서버의 활동 상태/소유권/공개 상태 검사 유지.
- market-policy-v1 UI/본문/시행일은 그대로. 기존 행에 동의 기록을 생성하지 않고 다음 내용 수정에 확인을 요구한다. 유효한 기존 확인 시각 유지. 완료/삭제에는 새로운 확인을 요구하지 않는다.
- 상세 본문 기본 펼침. 교환 사진이 있을 때만 갤러리/확대. 본인은 수정·상태 변경과 더보기 삭제, 타인은 쪽지·관심글과 더보기 신고. 선택 연락처 오류를 연락처 없음으로 바꾸지 않는다.
- 사진은 판매글 FK를 우회하지 않는 market_exchange_media와 비공개 market-exchange-media bucket. JPG/PNG/WebP·8MiB·5장 제한, 실제 바이트 확인 후 확정, 저장 순서와 첫 사진 대표 유지. 기존 사진 삭제는 수정 저장과 함께 확정하고 취소 시 삭제하지 않는다.
- 기존 MarketPhotoSaveProgress/recovery 흐름을 재사용. 글 저장 성공 뒤 실패한 사진만 이어가며, intent 응답 유실은 같은 request ID로 조회/재사용한다. 취소가 확정된 예약만 새 요청으로 바꾸도록 구조화된 retry 결과를 사용한다.
- 공통 관심 버튼에 명시적인 buy_request 대상만 추가. 서버가 존재/공개/본인/활동 상태를 검사한다. 기존 내 정보에서 팝니다·삽니다·교환·레슨을 조회하고 접근 불가 자료의 제목·사진·가격·URL 등을 비운 채 해제할 수 있다.
- 쪽지는 request ID로 서버가 작성자를 결정한다. 유형/제목/원문 문맥·로그인 복귀·참여자 검사·자기 글/종료/숨김 제한 유지. 기존 팝니다 endpoint는 유지한다. 신고도 해당 글·작성자 FK로 저장하며 자동 제재나 계정 전체 신고를 추가하지 않았다.

## 변경 파일 및 현재 시작/종료 SHA-256

경로는 AP 작업트리 기준이다. 신규 SQL은 CLI가 만든 빈 후보만 이번에 이름을 조정했다. 시작 manifest의 빈 파일 SHA는 CLI 생성 직후 값이며 기존 파일 수정이 아니다. 아래 신규 표기가 논리적 시작 상태다. 환경파일이나 비밀값의 hash는 없다.

| 파일 | 변경 이유 | 시작 SHA-256 | 종료 SHA-256 |
|---|---|---|---|
| `supabase/migrations/20261020000100_pul_market_buy_exchange.sql` | 기존 삽니다 확장, 전용 사진·관심·쪽지·신고 계약 | 신규 | b7880665792cdaa19ddd13de7c220193509e38472a4caa16fc9298b70e75bcfe |
| `src/types/index.ts` | 삽니다·교환 유형과 선택 예산/사진 타입 | 16c7b07150f9844398b011c145cedd36eeb5b53a2aff9d0a24415dead48432f7 | 4d71a7dffc3ea3a8bb65a2886b579c97ddf0c9a602bc2b24f4cc0ef68f74c528 |
| `src/lib/market/marketBuyExchange.ts` | 신규 DTO 검증·v3 RPC·정확한 원문 링크 | 신규 | 7483078f4aef21f2b47e8bfb7e429dea9fc92530ac08d59a4af8ce3d0d47d2e4 |
| `src/lib/market/marketPhaseOne.ts` | 기존 삽니다 호출 이름을 새 계약에 연결; 창업 유지 | c7c9732afc073a520ee901e481ba9ea6e485874bda1bd3a92f158e1b26d15495 | e1a1b7e4e2278f558ef3d42a70acb681f590e828295d7b26ec873088ad31ddb7 |
| `src/lib/market/market.ts` | 기존 연락처 동의 판정의 입력 타입만 공통화 | abdaf6657074a5084a75030ddf04a3f2e2839c0ae8856ce4d6f17510e8ea2fe6 | 3fbd1af6b2b707d0a517eab0bd97beb0fde3850acda34f7e38d190e6f162325a |
| `src/lib/market/marketNavigation.ts` | 유형/전국 필터와 URL | 383f9b92e02ac2935ed9b56fe099dffc9e0e460b6a7d83df03a969f3eac01e5b | c82602fa01474ef530c75ec77236beb55be12d9837fc75a61978ea4fd753ecd2 |
| `src/components/market/MarketBuyExchangeEntryDialog.tsx` | 유형별 작성·수정, 입력/파일/동의 보존 | 신규 | 78f2dc7608b862aaddc54052918a80c5191ac89e5ccb200057b6e0c426391d92 |
| `src/components/market/MarketEntryDialog.tsx` | 팝니다 유지, 삽니다를 새 폼으로 연결 | 3c2be9eceb9174cd17d4d0ff007d2091c6949276717a9f74c7793b8065ccc3c7 | 6af5b34842cd0987ff72336db9fb9fa9eb1266f894b18e14a4911b844e3b40bc |
| `src/components/market/MarketListSearch.tsx` | 전체/삽니다/교환 필터·전국 | 3bb16fd3730e7b6e69a9495b642fd3f0254619b0a8a22790b6a2f805048828e3 | 0dc27ad7a49706a252eb9d0cece57f8edf428cd7989381660274b5c0e16c5427 |
| `src/lib/market/marketExchangeStorage.ts` | 전용 FK/비공개 bucket의 서명 업로드·확정·읽기·정리 | 신규 | b2198c409c07a56098895df908bab6309313624b0ff540b715d1790640f91cbd |
| `src/app/market/exchange-media/[buyRequestId]/[mediaId]/route.ts` | 공개 상태 재검사 후 사진 스트리밍 | 신규 | 5694b445f378e91384c0ec4122f1a621cfb02ab4e0d2bcb7dc37be2fea4de51d |
| `src/app/market/exchangeActions.ts` | 인증된 사진 작업과 명시적 재시도 결과 | 신규 | 0e3468be2ff8048575c697b4d6203b6ddcafdc282f496b18a076744e57f31ee7 |
| `src/app/market/phaseOneActions.ts` | 새 저장 계약과 확정된 삭제 사진 정리 | 5cf9fbd5d46cd097a8476323b9d6b1d8ccccfe22c1c51f43f96502b31deec012 | 48599bac8df2827f8aa78e3d4957d27a0d89567400fbacb4f13f5a2178b12869 |
| `src/components/market/MarketPageContent.tsx` | 목록·직접 링크·유형별 저장·사진 부분 재시도 | bc7ae5b7da95ce02d2f09187ef908986b5466fe7e0e5b3131bf3871a2326ddc9 | 391061931467492edb3601178a72c99f0c9c166135d399a925250895563654b7 |
| `src/lib/my/myActivity.ts` | 새 내 활동 RPC 및 교환/협의 예산 | 22a16407b36261895bae12bd2ee5d6eb9c341467bd6a073b8f6269355fbc4131 | 2855e903b53c37566542c968d31a4985d27f033a72cf3f618990b4be16378778 |
| `src/components/account/MyActivityHub.tsx` | 내 장터 유형·완료 문구·원문 링크 | b2bfe2634cd0b5617ea6e3f5688946724f86c703c808413b7e8bc4f2f43eb923 | 768d4ab5d845873829dc3c90bd15a065b02578e704e2e055f067b24e3b573b4d |
| `src/app/market/buyRequestReportActions.ts` | 글에 한정된 인증 신고 RPC | 신규 | c9efa4054ba63bf76b233f1bc77bae6998c4aa490f3896cbd0e47ae0b93d5d0f |
| `src/components/market/BuyRequestReportDialog.tsx` | 기존 신고 형식으로 삽니다·교환 대상 연결 | 신규 | 64dbd41ccc24387affd369812eeb562ed3a8c53008b09d90adc522971738c24b |
| `src/lib/interests/interests.ts` | 명시적 buy_request 허용 목록·v2 조회·숨김 DTO | ade743363699f04099f3c615dc68d8e47b4d88c0c4f1f15b5f85554f4f4f43db | 5c17473ac9984eb8de6b395ae0ea513c5ad1ca7086ed65bf3e5b0a925b054f67 |
| `src/app/my/interestActions.ts` | 대상별 저장·해제·상태 RPC 분기 | ee809cc70982b39efbe553b5f7698ea58999deee05ef8fde0217710a81a5ee6f | 61828fb662c7cabeca65645ed56990db52876bec7112a806b6ed46baa6e0083a |
| `src/components/interests/MarketInterest.tsx` | 공통 관심 버튼에 글 종류 전달 | 63ef1b86cde105687f9774ba656cb18c8ca99903c5d30f7dde8ddad7dd3c1709 | d17d8cf368b3388cd3928cd72abbae9145f15fe7d7c474234c3669454475cbf6 |
| `src/components/interests/InterestList.tsx` | 장터 필터·유형/협의/숨김 표시 | 55d45f845ca0200f04c9f16d91405a64f30123bd88ac120bd6de69456faf9203 | 224c1d5a2a94763e914237165d4f01f9cfe61e4c72c2475c27b9d070bb26b199 |
| `src/components/market/BuyRequestDetailModal.tsx` | 유형별 본문·사진·소유자/타인 행동 | 3867b5eefc2aa9ed23e4f1279b22f7e5153ed4af5df2e55854e666d5647cee20 | f16889e6ac60d091494095985b6d07995cd0324d512b05e3f3d1807cc3cf228e |
| `src/lib/messaging/messaging.ts` | 서버가 정하는 삽니다·교환 작성 문맥 | 9886615480b06c1e3fc35ecb3982c8e6555f2e3575367ca54675fc4dd59b9dad | 60c436c4e296c73b2e2dd4508d9fce3e129c68f33b7f433527fbc8b0339b1746 |
| `src/app/messages/actions.ts` | 새 글 문의 전송 RPC 연결 | 84733172ea7653639dc4de43a8b439daa1380945f5d1fa017d370ce819aec51d | 585c54b01ae2bbd044b81ac269e8293c3e94e5640baa4ba6427b542a05a640d4 |
| `src/components/messaging/MessagingForms.tsx` | 글 문맥에 맞는 전송 선택 | 9aac7f1171b1271637e03a717442efa3db6878d459cca58ec904e9f8d6a35dba | 332d42ea5540059d1207a7eca73dadbd543b8ec465cef66b92ee0fde260f361c |
| `src/components/messaging/MessagingPages.tsx` | 작성/조회 문맥 연결 | 852c94bb434bf64dc7425b0a9c70d6ae20b93472b1e6c302fe28df3d39b9662e | 1e855df61e40839b7f0396226de774208eb45110f879d98881196237d91741f8 |
| `src/app/messages/new/page.tsx` | request 쿼리와 로그인 복귀 유지 | 8669bb473049d706160c9a39b1eee73020570aca3618751e2bfb26b2775ffe89 | 3a980b5bed4df8b263b966117cdde6c384080f08a3e16b902390d7662471bb7f |
| `src/components/messaging/MarketMessageContext.tsx` | 유형·원문 링크 표시 | 023f40e673bc11d114ccdfe023c6564158eb6aa61428de490a2339b56d883ad4 | 507e0a1e7bed56372a4b5287b214018af9fd1f52ed506105ca0a01f4d65b4b33 |
| `src/lib/market/marketBuyExchange.test.mjs` | 이번 경계의 7개 단위·DOM·모의 시험 | 신규 | dd22043db41423923d2749e018380fbce4cef6ad189dd036c5b4dd9659f2bbf2 |

이 보고서는 신규 파일이다. 자기 참조 hash 대신 종료 manifest에 최종 hash를 기록한다.

## SQL 후보 및 호환 적용 순서

| 후보 | SHA-256 | 선행 조건 | 현재 실행 |
|---|---|---|---|
| supabase/migrations/20261020000100_pul_market_buy_exchange.sql | b7880665792cdaa19ddd13de7c220193509e38472a4caa16fc9298b70e75bcfe | AO 20261019000100까지의 승인된 기반: 기존 market_buy_requests/market private actor·request·audit 함수, 메시지/관심/내 활동, AH 정책·연락처 계약 | 소유 로컬 DB에만 적용 |

설치된 CLI 2.117.0 help와 migration new를 사용했다. CLI 생성명 20261001135505_pul_market_buy_exchange.sql은 기존 AO 순서보다 앞이므로 **이번 새 미적용 빈 후보만** 20261020000100으로 변경했다. 기존 migration은 수정/재번호화하지 않았다. 별도 미적용 마케팅·탈퇴 후보는 선행 조건이 아니다.

로컬에서는 기존 소유 도구의 98개 기준 migration + AH 20261018000100 기반 뒤, AO 20261019000100과 AP 20261020000100을 번호 순서로 각각 transaction 적용했다. 새 후보를 임의로 앞뒤에 끼워 의존 문제를 가리지 않았다.

| 코드/DB 조합 | 동작과 제한 |
|---|---|
| AO 기존 코드 + 변경 전 DB | 기존 상태 유지 |
| AP 코드 + 변경 전 DB | 신규 RPC/열이 없어 새 목록·저장·관심/내 활동 호출 실패. 먼저 코드만 공개하면 안 됨 |
| AO 기존 코드 + AP DB | 기존 고정 예산 삽니다 읽기 유지. 교환/협의 예산은 legacy read DTO에서 제외하여 오표시 방지. 기존 저장 함수도 정책 검증을 공유하므로 구 코드의 삽니다 신규/수정 제출은 차단됨. 완료/삭제는 유지 |
| AP 코드 + AP DB | 이번 로컬 검증 조합. 팝니다/레슨 기존 데이터와 endpoint 유지 |

**다음 제한적 베타 후보**는 위 30개 파일 중 제품 코드 28개 + SQL 1개이며, 신규 테스트 1개와 이 보고서는 검증 기록이다. 신규 SQL 하나만 지정 적용하고 pending 전체 적용은 하지 않는다. 적용 전에 당시 배포 HEAD/원격 이력/해시/프로젝트 일치와 기존 행의 새 constraint 적합성을 읽기 전용으로 재확인해야 한다. 이번에 원격 자료를 조회한 것으로 간주하지 않는다.

권장 순서: 후보 코드 빌드/검토 완료 → 삽니다 쓰기 중단 시간과 방법을 별도 승인 → 정확한 AP SQL을 한 transaction으로 적용 → 대응 AP 코드 반영 → 승인된 합성 계정/새 글만으로 아래 최소 연결 확인 → 쓰기 재개. 현재 코드에 미승인 운영 차단 장치를 추가하지 않았다. DB 먼저 단독 적용 후 장시간 구 코드를 유지하는 방식은 권장하지 않는다.

적용 후 최소 확인: 삽니다 협의 예산/교환 글 신규·수정·재조회, 사진 1장 실제 업로드, 문의 작성 문맥(실제 회원 발송 없음), 관심 저장/해제/새 조회, 기존 팝니다·레슨 관심 한 건의 표시, 소유 시험 글 삭제/정리. 대상과 생성/변경/정리 범위는 후속 승인에 포함한다. 기존 복구 글과 AL/AO removed 기록은 사용하지 않는다.

중단 조건: 기준/해시/선행 이력 불일치, constraint/권한 실패, 공개 범위 누출, 배포 실패, 중복 글·사진 발생. SQL transaction 실패는 rollback하고 코드 공개를 중단한다. SQL 성공 후 코드 실패 시 쓰기 중단을 유지하고 원인별 전진 수정/일치 코드 재반영을 승인받는다. 새 자료가 생긴 뒤 무조건 down migration/drop/코드 단독 rollback하지 않는다. 구 코드로만 돌아가면 정책 값 없는 삽니다 저장은 계속 차단된다. 정책·인증 fallback은 없다.

## 검증 근거와 한계

| 구분 | 결과 |
|---|---|
| 단위·DOM·모의 | 신규 marketBuyExchange.test.mjs 7/7 통과. 유형 전환/입력·파일 보존, 쉼표·협의, 연락처 복원/동의/해제, 정책/취소/사진 실패, 소유자 버튼, 0/1/4장 갤러리·확대, 전국/URL, DTO/관심/문의 계약 |
| 실제 소유 로컬 DB | 16개 검사 묶음 + 교환 삭제 보충 2개 묶음 통과. C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/connected-result.json 및 supplement-result.json |
| 실제 로컬 Auth/Storage | 정상 합성 계정 비밀번호 로그인, 일반 인증 RPC로 예약, 실제 서명 HTTP로 PNG 4장 업로드, 제품 바이트 검증·확정, 다운로드 바이트 비교·순서 재조회 통과. 관리자 키는 제품의 서버 signer/검증 역할에만 메모리로 사용 |
| 사진 경계 | 0장 저장, 4장 실제 업로드/대표·순서, intent/finalize 응답 재시도 중복 방지, 5장 한도/타인 조작/직접 finalize 차단, 기존 4장 수정 보존, 1장 삭제 후 3장 보존·정리, 완료 시 사진 유지 |
| 브라우저 | 실제 후보 컴포넌트·기존 CSS·Noto Sans KR 설정을 사용한 **분리 합성 미리보기**. 1440px/390px/320px 작성·수정·상세·관심목록, 본문/하단 버튼/정책·사진 확대·입력 보존 확인. 모달 client/scroll 374/374 및 304/304, 관심목록도 가로 넘침 없음 |
| 정적 확인 | 변경 파일 ESLint 오류/경고 0. tsc --noEmit --incremental false 통과. 최종 next build --webpack exit 0, 빌드 타입 검사 통과 |

DB 검사 상세:
- buy create/requery and idempotent replay/conflict
- budget/type/region/policy/contact/anonymous/IDOR/version validation
- negotiable null budget and zero-photo exchange
- legacy ID/text baseline and consent normalization/reuse/change/off; policy timestamp retained
- anonymous and closed-post contact redaction
- interest isolation/idempotence/ownership; existing sale+lesson union
- real normal Auth + signed HTTP upload of 4 PNGs; byte verification, ordered requery, first cover, lost-intent/finalize replay
- media type/FK/owner/count/direct-write/null-finalize and terminal cleanup boundary
- edit preserves valid photos; deferred own photo removal and cleanup
- actual owned DB message send/replay and participant context; canonical owner, self denied
- post-specific nonowner report stored, no automatic status change
- exchange completion retains gallery; new inquiry blocked
- my activity canonical links and null-budget types
- hidden title/image/contact/context redaction and safe unsave
- buy deletion after legacy and new edits
- no PUBLIC EXECUTE leaks and private exchange bucket
- exchange owner delete and requery; nonowner delete denied
- completed exchange can be deleted without new policy confirmation

실제 DB의 변경은 모두 소유 합성 계정/글/사진/신고/메시지에 한정했다. SQL 권한 시험은 실제 authenticated/anon role + actor claim으로 실행했고, 사진 시험은 실제 로컬 Auth 로그인을 사용했다. 제품 Storage 모듈의 인증 컨텍스트 공급 부분만 소유 정상 사용자 client로 주입했다. 브라우저→OTP→DB→Storage 전체 E2E 통과라는 뜻은 아니다. SMTP는 소유 Inbucket 연결을 확인했으며 실제 회원 메일/쪽지는 발송하지 않았다.

브라우저의 관심 원문 링크 href는 정상 canonical 경로로 확인했으나, 분리 미리보기는 /와 /my만 제공하여 /market 이동은 404였다. 제품 원문 연결은 후보 코드/DTO/DB 원문 링크로 확인했고, 실제 앱 브라우저 왕복은 후속 연결 검증으로 남는다. 비활성 계정 연락처 제한은 기존 active actor/private 함수 재사용을 코드로 확인했으며 별도 신규 비활성 계정 브라우저 시험으로 표시하지 않는다.

폰트는 기존 next/font Noto Sans KR와 CSS를 그대로 사용했고 대체 폰트를 지정하지 않았다. 렌더 화면과 font 오류 없음은 확인했지만 브라우저 FontFaceSet 상세 열거는 도구가 지원하지 않아 모든 glyph의 실제 폰트 검증으로 주장하지 않는다.

기존 전체 G01·로그인·동의·탈퇴·AM/AN/AO 완료 시험은 반복하지 않았다. 기존 부분 실패 복구 알고리즘의 시험 근거는 재사용하고 이번 request/FK/소유 경계만 추가했다. 새 운영 관리자 화면/신고 검토 UI는 추가하지 않았으며 신고는 전용 글 FK 테이블 및 기존 형식의 접수 RPC에 저장된다.

재현 명령(후보 작업트리): 환경변수 PUL_MARKET_TEST_RUNTIME를 C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/dom으로 두고 node --test src/lib/market/marketBuyExchange.test.mjs. 로컬 DB/Storage 스크립트는 C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/db-session.mjs, connected-check.mjs, supplement.mjs에 보존했다. 원격 환경파일은 필요 없고 사용하지 않는다.

## 캡처

모두 합성 UI이며 실제 회원 자료가 아니다. 제품 CSS/글꼴을 쓴 분리 컴포넌트 미리보기다.

- [desktop-buy-form.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/desktop-buy-form.jpg)
- [desktop-exchange-form.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/desktop-exchange-form.jpg)
- [desktop-exchange-edit.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/desktop-exchange-edit.jpg)
- [desktop-exchange-detail.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/desktop-exchange-detail.jpg)
- [desktop-exchange-zero.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/desktop-exchange-zero.jpg)
- [desktop-exchange-one.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/desktop-exchange-one.jpg)
- [desktop-interests.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/desktop-interests.jpg)
- [mobile-390-exchange-form.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-390-exchange-form.jpg)
- [mobile-390-form-actions.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-390-form-actions.jpg)
- [mobile-390-exchange-edit.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-390-exchange-edit.jpg)
- [mobile-390-owner-detail.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-390-owner-detail.jpg)
- [mobile-390-owner-actions.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-390-owner-actions.jpg)
- [mobile-390-interests.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-390-interests.jpg)
- [mobile-320-exchange-form.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-320-exchange-form.jpg)
- [mobile-320-exchange-edit.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-320-exchange-edit.jpg)
- [mobile-320-buy-detail.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-320-buy-detail.jpg)
- [mobile-320-exchange-detail.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-320-exchange-detail.jpg)
- [mobile-320-exchange-zoom.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-320-exchange-zoom.jpg)
- [mobile-320-detail-actions.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-320-detail-actions.jpg)
- [mobile-320-interests.jpg](C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/mobile-320-interests.jpg)

## 보존·정리·이번 실행에서 수정한 시험 오류

- 정확한 기존 보호 목록 135개를 시작/종료 SHA로 비교해 변경 0. 원본 HEAD/branch/tracked 상태/index와 이전 작업트리 HEAD/tracked 상태 동일. 상세 evidence: C:\Users\HALSUD~1\AppData\Local\Temp\pul-market-ap-4yi9R9/protected-before.json, state-before.json, preservation-final.json, changes.json. 개수를 맞추기 위한 저장소 탐색 없음.
- 기존 A–AO 및 F/P/T/AD의 실수·거절 기록 보존. backups 접근, 원본 pull/reset, Vercel/changelog 거절 우회 없음. 기존 복구 사진/예약과 AL/AO 시험 기록 조회/수정/정리 없음.
- 소유 DB/Auth/Storage/Inbucket 컨테이너·volume·network·그 환경 TEMP는 정상/실패 회차 모두 소유 검증 후 제거했다. 추가 삭제 시험도 제거 확인. AP 미리보기 서버 종료, AP 탭 닫기, viewport 복원. 3397/55891/55892/55894 리스너 없음. 사용자 서버/탭/DB 미변경.
- 후보 작업트리, 검증용 정적 TEMP 파일·오프라인 jsdom runtime·캡처는 재검토 근거로 남긴다. 제품 package.json/package-lock.json 변경 및 신규 제품 의존성 없음.
- 첫 미리보기 준비 중 Windows 경로 보간 오류로 원본 아래 이번 소유 임시 preview가 잘못 생성됐다. 정확한 소유 경로를 확인해 그 디렉터리만 삭제했다. 불완전 preview의 Next 자동 TypeScript 설치는 TEMP에만 발생했고 격리/정리했다. 제품 dependency 변경 없음을 보호 hash로 확인했다. 미사용 TEMP 의존성 삭제는 일반 샌드박스 권한으로 처음 실패했으며, 같은 소유 절대 경로만 승격 실행하여 최종 부재를 확인했다.
- 첫 실제 Auth 시험은 합성 auth.users fixture의 토큰 문자열 NULL 때문에 실패했다. 소유 fixture에 정상 빈 문자열을 넣고 새 소유 환경에서 통과했다. 인증 조건을 낮추지 않았다.
- 보충 삭제 시험의 SQL NULL 결과를 JSON.parse하던 시험 파서 오류를 수정해 해당 2개 경계만 재시험했다. 제품 DB 삭제는 최초 회차에도 성공했지만 실패 회차를 통과로 세지 않았다.
- HMR 후 이전 모달 body 잠금이 남은 합성 화면을 관찰했다. 미리보기 새 조회 후 정상 수정 모달 열기/닫기에서 body style 복원과 스크롤을 확인했다. 제품 결함으로 확정하거나 공통 모달을 확대 수정하지 않았다.

다음 단계는 **AP 후보의 SQL/코드 동시 반영 범위와 삽니다 쓰기 중단 순서를 검토·승인하는 것**이다. 이번 보고서는 적용 승인이 아니다.
