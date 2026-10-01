# AK. PUL 장터 최종 정책 및 적용 준비

작성일: 2026-10-01 (Asia/Seoul). 실제 정책 시행일을 뜻하지 않는다.
판정: **READY FOR SCOPED APPROVAL — 정책 확정·로컬 준비 완료, 실제 실행은 아래 범위의 최종 승인과 시험 계정/중단 구간 지정 후.**

Transport NOT_CONFIGURED / 전체 REMOTE APPLY NOT APPROVED. 운영자의 수동 이메일 안내는 확정된 운영 절차이며 앱 자동 발송 설정과 별개다. 이번에 실제 발송·원격 쓰기·배포·stage/commit/push를 실행하지 않았다.

## 1. 확정 범위와 이번 변경

사용자 승인대로 최초 공개 market-policy-v1의 전문을 확정했다. 시행일 원칙은 “이 정책은 PUL 베타 장터에 게시되어 적용된 날부터 시행합니다.”이며 실제 적용일은 배포 완료 기록에 Asia/Seoul로 남긴다. 동적 날짜나 현재 작업일을 시행일로 넣지 않았다.

파크골프 물품 범위와 PUL 자체 등록 제한, 설명·수정 요청 우선, 근거 확인 후 위반 글 삭제, 피해 확산 우려 시 우선 조치 후 사유·이의신청, 연락 가능한 이메일로 운영자의 수동 결과 안내를 반영했다. 확정 처리 기한·자동 통지·계정 정지 기준을 추가하지 않았다. 계정 제한은 별도 후속 과제이며 이번 배포의 미정 정책 조건이 아니다.

실제 제품 변경은 아래 두 파일뿐이다.

- src/lib/market/marketPolicy.ts: 시행 원칙, D의 거래 판단에 필요한 미제공 서비스 안내, E/F 신고·조치·이의신청 문구 확정. 초안·미확정·관리 기능 목록 제거.
- src/components/market/MarketPolicyContent.tsx: 새 시행 안내 연결, 사용자에게 보이던 내부 정책 버전 줄 제거. 내부 data 속성은 유지.

페이지와 팝업은 동일 원본/표시 컴포넌트를 계속 사용한다. 체크박스 “장터 이용안내 및 운영정책을 읽고 동의합니다.”, “내용 보기”, 정책 버전·기존 확인 재사용/옛 market-trade-v1 불인정 조건, 디자인·입력 순서·쪽지 기본값·전국·가격 쉼표·사진 동작은 불변이다. 정책 페이지 파일 자체도 불변이다. SQL 변경·신규 migration 없음.

## 2. 기준·검증·보존

- 브랜치 experiment/main-tuning, HEAD 7e8393064155a8241a62b539f457978647076f19. 현재 미커밋을 시작 기준으로 삼았다.
- AJ 보호 111개와 AJ 신규 4개를 중복 없이 합친 115개를 정확한 경로로 기록했다. 기존 113개 불변, 위 2개만 변경. 이 AK 보고서는 시작 시 부재였고 신규 1개다. A–AJ와 F/P 실수·T 거절·AD 첫 호출 위반 기록을 보존했다.
- 이번 원격 읽기: migration 이력 98개, latest 20261013000100_pul_course_operational_broadcast, AH 미적용. 실제 글·회원·사진·예약·동의 행 조회 없음. 이력상 AJ 정책 배포·수집이 새로 확인되지 않았다. 실제 적용 직전에 배포/이력을 다시 대조하며 이미 같은 버전이 수집됐다는 증거가 생기면 중단한다.
- Vercel 배포 버전·연결은 AI, Preview 브랜치 변수 이름 존재는 AJ 근거를 재사용했다. 이번에 현재 배포를 다시 검증하거나 키 인증 성공을 주장하지 않는다.
- 이번 추가 확인: 변경 2개 파일 lint 통과; 기존 policy popup 집중 DOM 1개 통과; 아래 분리 미리보기의 데스크톱 1440×1100/모바일 390×844 확인 통과.
- 페이지/팝업 전문 동일, 초안·개발 설명·내부 버전 비표시, 가로 넘침 없음, 팝업 스크롤로 E/F와 문의처 접근, 읽기만으로 체크되지 않음, 입력과 합성 선택 사진 4장/순서 보존. 브라우저 오류 0. 기존 Noto Sans KR/CSS 사용, 대체 글꼴 아님. 캡처도 직접 확인했다.
- 이번 화면은 제품 컴포넌트를 사용하는 소유 Next 분리 미리보기다. 전체 사이트 레이아웃의 새 production 검증이나 실제 Auth/DB/Storage/등록 시험이 아니다. 원격 접속/사진 전송/제출 없음. 캡처의 Next 개발 표시기는 미리보기 요소다.
- AJ 단위·DOM 17개, 소유 DB 4개, 기준 package/lock으로 제품 13개를 반영한 production build와 선택 dry-run을 재사용한다. 그 build는 **AJ 초안 문구** 대상이다. AK 최종 문구의 production build 완료로 표현하지 않는다. 변경이 문구/공통 표시뿐이므로 전체 build·DB·보안·dry-run을 반복하지 않았다.
- 소유 AK 3389 서버/브라우저 종료 완료. 서버 PID·부모 명령 확인 후 해당 두 프로세스만 종료, listener 제거 확인. 사용자 3000 서버·탭·환경파일 불변. 복구 글/사진 4장/잔여 예약은 조회·수정·정리하지 않았다. 새 DB/원격 자원 없음. 증거와 분리 소스는 보존.

증거 폴더: C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-ak-458bfe00

- desktop-policy-page.png / mobile-policy-page.png
- desktop-policy-popup.png / desktop-policy-popup-bottom.png
- mobile-policy-popup.png / mobile-policy-popup-bottom.png
- before.json / after.json / verification-summary.json / browser-result.json / browser.cjs
- product-manifest.json / commit-scope.json / policy-final.md / rendered-policy.txt

기존 AJ 증거 폴더와 policy-draft.md, AJ 보고서는 불변이다. AJ candidate의 아래 제품 13개 중 이번 정책 2개만 갱신하고 13개 모두 작업트리의 최종 hash와 대조했다. AK 미리보기는 별도 소유 폴더에 직접 필요한 파일만 배치했다. Next 설치 문서를 읽고 수정했으며 backups 접근·루트 재귀·전체 untracked 열거·비밀 출력·전체 작업트리/환경파일 복사·reset/restore/clean/stash 없음.

## 3. 최종 제품 manifest와 SQL

기준 commit + 아래 제품 **13개만**. 기타 마케팅·탈퇴·관리·인증·package 변경은 반영하지 않는다. 분리 후보: C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-aj-ffd5e8fd/candidate

| 제품 파일 | SHA-256 |
| --- | --- |
| `src/components/market/MarketListingEntryDialog.tsx` | `8d76729979a1de0433bacdd4a7ee9bd1309a936ccdc7786424c697ee5db0d799` |
| `src/components/market/MarketEntryDialog.tsx` | `3c2be9eceb9174cd17d4d0ff007d2091c6949276717a9f74c7793b8065ccc3c7` |
| `src/components/market/MarketContact.tsx` | `b65e0f451185f331a121ee5b82f6258845094aa51d10ccf4aa5a9ae5535db2eb` |
| `src/components/market/MarketPhotos.tsx` | `95dc7becd44c87e524315205291ac3824176b6a469508a37f785899e6f87bf97` |
| `src/components/market/MarketListSearch.tsx` | `3bb16fd3730e7b6e69a9495b642fd3f0254619b0a8a22790b6a2f805048828e3` |
| `src/data/marketData.ts` | `60e458e1fb2b35e443ddeb2e00e8688d9aa358c5f2897a17573f38e4edeadb12` |
| `src/lib/market/market.ts` | `abdaf6657074a5084a75030ddf04a3f2e2839c0ae8856ce4d6f17510e8ea2fe6` |
| `src/lib/market/marketNavigation.ts` | `383f9b92e02ac2935ed9b56fe099dffc9e0e460b6a7d83df03a969f3eac01e5b` |
| `src/types/index.ts` | `16c7b07150f9844398b011c145cedd36eeb5b53a2aff9d0a24415dead48432f7` |
| `src/app/market/page.tsx` | `a8b34e2410f64b11f593d670f55510e3ea5bdf68cd37648e1169cfd6a867624e` |
| `src/app/market/policy/page.tsx` | `8d2782157766029bd66bc72ce19141fa64852b4a9a7ab3835b65476636577419` |
| `src/components/market/MarketPolicyContent.tsx` | `48db108bd6e1376139a846a6792a2d5c6a90b62a64a6f20ccea320bccf8e8ff0` |
| `src/lib/market/marketPolicy.ts` | `7d6f8b7e865c7ff6d89f96bfc28591594af9d0b298c46d99c1f654916de7e987` |

유일한 원격 SQL 승인 대상은 **supabase/migrations/20261018000100_pul_market_listing_contact_region_notice.sql** (version 20261018000100).
SHA-256: **38d1b7562a1bb65b9669199e90c5987958d4cf5a6bb5c3407575536603084c63** — AJ와 동일.

현재 필요한 선행 migration은 기존 원격 98개에 포함됨을 AI의 직접 SQL/메타데이터 검토와 AJ 로컬 DB 4개/선택 dry-run이 입증했다. 이번에도 이력은 같은 98개다. 새 적용 순서는 AH 1개뿐이며 AD·20261014~17·마케팅·탈퇴 후보는 제외한다. pending 전체 push, --include-all, repair, 직접 DDL/DML 금지.

SQL은 장터 지역/확인 열·제약과 저장/상세 계약 및 신규 v2 진입점에 한정된다. 기존 글을 동의 처리하는 backfill이나 상품/사진 삭제는 없다. 기존 글의 다음 내용 수정은 새 정책 동의를 요구하고 현재 유효 확인은 재사용한다. 예약중·판매완료·삭제 분기는 기존 검사를 유지한다. 구버전 베타 코드는 새 상세 필드/전국을 해석하지 못하고 확인 값을 보내지 못하므로 **DB만 먼저 적용할 수 없다**. 실제 영향과 ACL/소유권 근거는 AI·AJ 보고서를 유지한다.

최종 전문 policy-final.md SHA-256: **e83810d092fbde0585005e0b86a00e52d3b31673e75cc40d48128b2b0ed82448**.
규격: 아래 부록의 제목부터 문의처까지 UTF-8 BOM 없음, LF, 끝 LF 1개. 정책 내부 식별자는 market-policy-v1이며 전문 사용자 본문에는 노출하지 않는다. 렌더링 텍스트의 공백은 별도 rendered-policy.txt로 구분한다.

## 4. 다음 실행에서 승인받을 정확한 범위

### 소스 반영과 선택 commit/push

제품 13개 + AH SQL 1개 + 아래 시험 2개 + 증거 문서 2개 = **명시적 18경로**만 제안한다. 파일 목록과 hash는 commit-scope.json에 고정한다. 제품/SQL 외 항목은 배포 기능을 늘리지 않는다.

시험:
- src/lib/market/marketListingContactRegionNotice.test.mjs
- src/lib/market/marketPhaseOneDom.test.mjs

증거 문서:
- docs/messaging/PUL_MARKET_POLICY_RELEASE_CANDIDATE.md
- docs/messaging/PUL_MARKET_POLICY_FINAL_APPLY_PREPARATION.md

DB 시험 4개와 실행 도구는 기존 로컬 증거로 보존하며 이 commit에는 포함하지 않는다. DOM 시험은 기존 소유 외부 runtime의 jsdom을 PUL_MARKET_TEST_RUNTIME으로 사용한다. package/lock에 의존성을 추가하지 않는다. 다른 혼합 시험 파일까지 stage하거나 전체 시험 통과로 주장하지 않는다.

승인 후 안전한 실행 방법:

1. 원본 checkout/index를 그대로 두고 기준 commit에서 별도 **detached Git worktree**를 만든다. 새 후보 소스는 Git 기준 + 위 18개 명시적 경로만 복사한다. .env/.next/node_modules/혼합 작업트리 전체 복사 금지. 최종 13개/SQL/문서 hash를 대조한다.
2. 분리 worktree 안에서만 정확한 18경로를 인자로 git add -- <명시적 경로 목록> 실행. git add . / -A 금지. staged 파일명/내용을 manifest와 대조하고 그 checkout에서 commit한다. 원본 index/미커밋은 보존한다.
3. 승인 시 현재 origin의 experiment/main-tuning tip이 기준 HEAD인지 읽기 확인한다. 다르면 새 변경을 임의 덮거나 force push하지 않고 중단한다. 일치하면 분리 commit의 HEAD를 origin experiment/main-tuning에 **일반 fast-forward push**한다. 해당 브랜치 자동 Preview build가 있으므로 push도 배포 승인 범위에 포함한다.
4. Vercel pul-platform-beta / Preview / experiment/main-tuning의 실제 승인 환경에서 그 commit을 새로 빌드한다. 기존 Preview 변수 세 이름(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY)은 AJ에서 존재를 확인했다. 값/유효성은 연결 시험에서 확인하며 키 공개·다른 프로젝트 재사용 금지. AJ loopback .next를 업로드/재사용하지 않는다.
5. 새 deployment ID/commit/Ready를 확인하고 beta.pul.co.kr가 해당 Preview를 가리키도록 전환한다. production promote는 범위 밖이다. 자동 도메인 전환이면 그 시점을 기록하고 불필요한 재배포를 하지 않는다. 이 전환까지 포함해 장터 이용 중단을 먼저 확보한다.

현재 worktree 생성·stage·commit·push·Vercel 전환 모두 미실행이다. 원본 HEAD를 억지로 움직이거나 사용자 환경을 정리하지 않는다.

### 중단 구간 → 새 코드 → AH → 최소 연결 확인

1. 베타/localhost 장터 사용 중단을 사용자와 맞추고 작성 내용·사진 원본 보전을 확인한다. 기존 탭을 임의 종료/새로고침하지 않는다. 공개 베타의 중단을 확보할 수 없으면 진행하지 않는다. 새 maintenance 기능을 이번에 만들지 않는다.
2. 위 방식으로 **새 코드 전환**. 이전 DB에서는 v2 부재로 저장이 차단되는 예상 구간임을 명확히 한다. 실제 정책 게시/적용일은 전환·DB·연결 확인의 완료 기록에 Asia/Seoul로 남긴다.
3. 프로젝트 ref, 새 코드 commit, 현재 이력, SQL hash를 최종 대조. AJ의 격리 migration 디렉터리(기존 공식 98개 + AH 하나, seed disabled)에서 승인 범위가 AH 하나인지 확인한다. 실행 시 상태가 달라졌다면 진행하지 않는다. 기존 CLI 인증의 안전한 경로를 사용한다.
4. 승인된 실제 명령 범위는 그 격리 디렉터리에서 **supabase db push --skip-vault --project-ref ivlxvqqaiweysmfodajb --workdir .** 한 번이다. 바로 전 목록 검사는 동일 명령의 --dry-run으로 AH 1개/seeds []/roles []를 확인하는 실행 직전 가드다. 이번 턴에서 재실행하지 않았다. --include-all/seed/repair/Vault/정책 변경은 제외한다. CLI 내부 인증 단계는 AJ 기록대로 구분한다.
5. 승인된 기존 소유 시험 계정 2개(판매자, 별도 조회자)와 **새 시험 글 1개만** 사용. 쪽지 전용·전국·market-policy-v1 동의 등록 → 같은 글 제목/가격 수정 → 다시 열기/새로고침 → 유효 정책 재사용, 전국 필터/조회 확인. 이전 확인만 있는 기존 글의 동의 요구는 AJ DB 근거를 재사용하며 복구 글에 시험하지 않는다.
6. 같은 시험 글에서 판매자가 소유한 테스트 연락처로 추가/변경/해제와 동의 조건을 확인한다. 쪽지 전용일 때 번호 비노출, 익명 비노출, 동의한 추가 연락은 기존 허용된 조회자 범위에서만 공개됨을 확인한다. 타인에게 동의 증빙/소유자 권한이 노출되지 않는지도 확인한다. 구매자에게 공개 동의된 번호까지 무조건 숨겨야 한다고 잘못 판정하지 않는다. 전화번호/쿠키/키는 보고서에 남기지 않는다.
7. 생성 요청의 같은 request ID 재시도 결과가 동일 글 ID인지 확인하며 중복 글을 새로 만들지 않는다. 별도 부하시험·쪽지/이메일/전화 발송·Storage 업로드 없음. 시험 글만 기존 소유자 삭제 경로로 정리하고 audit/receipt를 직접 SQL로 삭제하지 않는다. 복구 글/사진/예약은 계속 제외한다.
8. 실제 연결 확인 완료 후 보전된 기존 탭의 새 버전 재진입을 사용자에게 안내하고 이용 재개. 계정 탈퇴·회원 삭제 없음.

### 단계별 중단·복구

| 조건/단계 | 대응 |
| --- | --- |
| 원격 tip/프로젝트/파일 hash/SQL 목록 불일치, 시험 계정·중단 미확보 | 적용 전 중단. 임의 재기반·force push·추가 migration 금지 |
| 새 Preview build/정책 페이지 실패, DB 아직 미적용 | AH 적용 안 함. 기존 Ready 배포 유지 또는 기존 Preview로 도메인 복귀. 원본 미커밋은 그대로 |
| 새 코드 전환 후 AH 실패/잠금/예상 밖 부분 적용 | 이용 중단 유지. 이력/관련 schema 메타데이터만 확인. 이력 repair나 무작정 재실행 금지. DB 미변경이 입증될 때만 기존 배포 복귀 가능 |
| AH 성공 후 인증/저장/개인정보/정책/중복 검증 실패 | 이용 재개 중단. 새 코드와 기록을 보존하고 직접 원인의 최소 forward fix를 별도 제안. 구버전 코드 단독 rollback은 새 DB 계약과 호환되지 않음 |
| 시험 글 정리 실패 | 정확한 시험 ID와 실패 단계만 기록 후 중단. 다른 글 검색·일괄 삭제·회원 삭제로 우회하지 않음 |

동의 검사 제거, 자동 동의/backfill, 기록 삭제, DB 복원, 강제 repair를 복구 수단으로 쓰지 않는다. 무중단 전환이나 자동 무손실 rollback을 보장하지 않는다.

## 5. 정책 외 남은 실행 조건

정책 내용·시행일 원칙·수동 결과 안내·초기 게시물 단위 조치는 확정됐다. 다시 정책 결정을 요청하지 않는다.

- 베타/localhost 장터 중단 가능 구간과 작성 내용/원본 사진 보전.
- 기존 소유 시험 계정 판매자/조회자 지정. AE의 두 계정은 정리 완료된 소유 로컬 Auth 자원이므로 원격 계정으로 재사용할 수 없다. AG는 복구 글의 소유 관계 근거이며 별도 시험 계정 2개의 지정 기록은 아니다. 복구 글 조회나 전체 회원 검색으로 계정을 추정하지 않았다. **기존 계정의 비밀이 아닌 식별명만 사용자에게 확인**하고 로그인은 기존 안전한 절차로 한다. 비밀번호·OTP·키를 채팅으로 받지 않는다. 새 가입은 승인 범위에 넣지 않는다.
- 위 계정의 별도 글 1개 생성·변경·동일 요청 재조회·삭제 및 소유 테스트 연락처 사용 범위.
- 위 18경로 선택 stage/commit/fast-forward push, 해당 Preview 새 빌드/베타 전환, 정확한 AH SQL 1개와 최소 시험에 대한 최종 실행 승인.

이 조건을 한 번의 실행 지시에서 지정하면 정책 재검토 없이 위 순서로 진행할 수 있다. 이번 작업은 정책·적용 준비까지이며 실제 사용자 환경의 새 저장 기능 적용 완료가 아니다.

## 부록 — 확정된 최초 공개 정책 전문

# 장터 이용안내 및 운영정책

이 정책은 PUL 베타 장터에 게시되어 적용된 날부터 시행합니다.

## A. 이용 범위와 거래 가능한 물품

PUL 판매 장터는 파크골프 관련 물품을 거래하는 공간입니다.

- 파크골프채·공·가방·의류·신발·연습용품과 파크골프 활동에 관련된 기타 물품을 등록할 수 있습니다. 창업·매매와 시설·조성 정보는 해당 별도 메뉴를 이용해 주세요.
- 본인이 소유하거나 판매할 권한이 있는 물품만 등록해 주세요. 상품의 상태·하자·구성품·가격과 거래 조건을 정확하게 알려 주세요.

## B. 거래 금지·등록 제한

다음은 PUL 장터의 운영정책에 따른 등록 제한입니다. 품목별 법적 판매 금지를 판정한 목록은 아닙니다.

- 위조품·도난품·판매 권한이 없는 물품과 다른 사람의 권리를 침해하는 물품은 등록할 수 없습니다.
- 개인정보·계정·비밀번호·인증정보의 거래 또는 이를 요구하는 글은 등록할 수 없습니다.
- 실제 물품 거래와 무관한 광고, 사기성 게시물, 허위 매물, 금지된 거래를 우회하도록 유도하는 글은 제한합니다.
- 파크골프 관련 물품 범위를 벗어나는 주류·담배·의약품·무기류·현금화 목적의 상품권 등은 이 장터에 등록하지 마세요. 이는 PUL의 등록 범위 제한이며 각 품목의 법적 지위를 단정하는 설명이 아닙니다.

## C. 판매글 작성 기준

구매자가 실제 상품과 거래 조건을 판단할 수 있도록 작성해 주세요.

- 직접 촬영했거나 사용할 권한이 있는 실제 상품 사진을 사용하고, 사용 기간·상태·하자·수리 여부·구성품·가격을 설명해 주세요.
- 허위 설명, 같은 물품의 반복·중복 게시, 타인의 사진 무단 사용과 과도한 홍보를 제한합니다.
- 설명이나 사진에 전화번호·주소·계좌정보 등 개인정보를 불필요하게 노출하지 마세요. 전화·문자 문의를 추가하려면 별도의 연락처 공개 안내를 확인하고 선택해 주세요.

## D. 거래 시 주의사항

거래 전에 상대방과 상품·결제·배송 조건을 충분히 확인해 주세요.

- 상품 상태와 구성품, 최종 가격, 결제 방법, 전달·배송 일정과 비용을 서로 확인하고 필요한 거래 내용을 보관해 주세요.
- 비밀번호·인증번호를 공유하지 말고 거래에 불필요한 개인정보 제공이나 의심스러운 외부 링크·선입금 요구에 주의해 주세요.
- PUL은 안전결제·대금 보관·보상·상품 진위 보증을 제공하지 않습니다.
- 운영자의 신고 확인은 접수 내용과 제출 자료를 바탕으로 합니다. 모든 상품이나 거래를 사전에 검사했다는 의미는 아닙니다.

## E. 신고와 처리 절차

판매글 상세의 ‘신고하기’를 이용하거나 PUL 운영자에게 이메일로 문의해 주세요.

- 신고에는 대상 글을 찾을 수 있는 정보, 문제 내용과 확인 가능한 근거를 적어 주세요. 이메일에 비밀번호·인증번호 등 불필요한 개인정보를 보내지 마세요.
- 운영자는 신고 내용과 자료를 확인하고 필요하면 관련 설명이나 수정을 요청할 수 있습니다. 신고 횟수만으로 위반을 확정하지 않습니다.
- 조치 사유와 결과는 운영자가 연락 가능한 이메일로 안내합니다.
- 문의·결과 확인·이의신청은 pulpark.help@gmail.com으로 보내 주세요.

## F. 위반 게시글 조치와 이의신청

문제의 심각성·반복 여부·피해 우려와 제출 자료를 살펴 조치를 검토합니다.

- 설명 누락 등 수정 가능한 잘못은 설명·수정 요청을 우선합니다.
- 금지 물품, 허위 게시물, 반복 위반 등은 운영자가 접수 내용과 근거를 확인한 뒤 해당 판매글을 삭제할 수 있습니다.
- 피해 확산 우려가 큰 경우 해당 판매글 삭제 등 필요한 우선 조치를 한 뒤 사유를 안내하고 설명이나 이의신청을 받습니다.
- 조치에 이의가 있으면 대상 글 정보와 이의 내용·근거를 pulpark.help@gmail.com으로 보내 주세요. 운영자는 제출된 설명과 자료를 다시 확인하고 연락 가능한 이메일로 결과를 안내합니다.

운영 주체: PUL 운영자

문의·결과 확인·이의신청: pulpark.help@gmail.com
