# PUL 장터 정책·동의·분리 배포 후보 — AJ

2026-10-01 (Asia/Seoul). **로컬 구현·집중 검증·분리 production build·선택 migration dry-run 완료. 정책 운영 기준 확정 전이므로 실제 배포 READY 판정은 보류한다.** AI-1을 교정했으며 정책 내용은 운영자 검토용 초안으로 명시했다. 원격 적용이나 실제 서비스 등록·수정 완료라는 뜻이 아니다.

**Transport NOT_CONFIGURED / 전체 REMOTE APPLY NOT APPROVED.** 일반 쪽지 전체가 미구현이라는 의미는 아니다. 제품 원격 자료·앱 설정·Storage·migration 적용·배포 변경은 0건이다. CLI 인증 단계에 관한 별도 관측은 §6에 명시했다.

## 1. 구현

- `/market/policy`: 로그인 없는 정책 페이지. 기존 Container/MainLayout/CSS/Noto Sans KR 사용. 장터 하단에 같은 페이지 링크 추가.
- 정책 전문 원본 `src/lib/market/marketPolicy.ts`와 공통 표시 `MarketPolicyContent.tsx`를 페이지·작성 팝업이 함께 사용한다. 두 문구 사본을 따로 관리하지 않는다.
- 사진 아래·제출 버튼 위에서 기존 유의사항 3개 목록을 정책으로 통합. 독립 체크박스 **‘장터 이용안내 및 운영정책을 읽고 동의합니다.’**, **‘내용 보기’** 버튼으로 연결했다. 연락처 공개 동의와 분리한다.
- 기존 MarketDialog의 최상단 Escape·Tab 순환·포커스 복귀·내부 스크롤을 재사용했다. 작성 폼을 이동/재마운트하지 않는다. 팝업 열기/스크롤로 자동 체크하지 않는다.
- AI-1: `mapError`에 기존 정확한 문장 `거래 유의사항을 확인해 주세요.`와 새 정확한 문장 `장터 이용안내 및 운영정책을 확인하고 동의해 주세요.`를 validation으로 분류하는 분기 추가. 모든 SQLSTATE 22023을 동일 오류로 취급하지 않는다. 미등록 DB 오류는 기존 일반 오류로 처리한다.
- 새 동의 버전은 **`market-policy-v1`**. 제품의 버전 상수와 실제 서버 저장/응답을 시험으로 대조한다. write payload에도 버전을 명시하여 이전 짧은 안내를 확인한 구버전 요청을 새 정책 동의로 저장하지 않는다.
- 기존 `trade_notice_version` / `trade_notice_confirmed_at` 재사용. `market-trade-v1` 자료는 보존 가능하지만 현재 정책 동의로 인정하지 않는다. 내용 수정 때 새 확인 필요. 같은 현재 정책의 유효한 확인은 재사용하며 최초 시각을 보존한다. 상태 전환/삭제에는 새 확인을 요구하지 않는다.
- 상세는 소유자에게 저장된 버전을 전달하고, 폼/파서는 현재 버전과 true가 모두 맞아야 재사용한다. 이전 서버의 boolean만 true인 응답도 자동 동의가 되지 않는다.

이번 실제 수정: `MarketListingEntryDialog.tsx`, `market.ts`, `src/types/index.ts`, `src/app/market/page.tsx`, 미적용 AH SQL, 직접 시험 3개. 새 제품 파일은 `src/app/market/policy/page.tsx`, `src/components/market/MarketPolicyContent.tsx`, `src/lib/market/marketPolicy.ts`. 기타 승인 화면·가격 쉼표·연락처·사진 업로드 구현을 다시 디자인하지 않았다.

## 2. 정책 근거와 미확정 사항

현재 판매 카테고리(`marketData.ts`), 상세 신고 버튼(`MarketDetailModal.tsx`), 신고 조회/처리 및 운영자 판매글 삭제 함수(20260928 contact/report SQL), 기존 이용약관·개인정보 안내의 운영 주체/이메일을 확인했다. 다른 메뉴용 SEC-02의 제한 기능을 장터 기능으로 오인하지 않았다.

- 현재 가능: 판매글 신고 접수/관리 조회/처리 결과 기록, 권한 있는 운영자의 판매글 삭제. 연락은 쪽지와 선택한 연락 방법. 문의·이의신청 이메일 `pulpark.help@gmail.com`, 운영 주체 PUL 운영자.
- 현재 제공한다고 쓰지 않은 기능: 장터의 일시 숨김·자동 경고·자동 통지·자동 정지/영구정지·안전결제·대금 보관·보상·진위 보증·자동 분쟁 조정.
- 등록 제한 품목은 **PUL 자체 범위 제한**으로 명시했다. 특정 품목의 법적 판매 금지를 단정하지 않았으므로 확인하지 않은 법률 주장이나 다른 서비스 정책 복사를 넣지 않았다. 포괄적 면책·법적 효력 보장도 없다.
- 운영자 결정 필요: 초안의 등록 제한 범위 승인, 정책 시행일, 경고·결과 안내의 실제 수동 절차, 계정 제한의 기준/기간/수행 가능 범위. 임의의 처리 기한이나 자동 제재 규칙을 확정하지 않았다.
- 확정 전 초안 표시를 유지한다. 실제 배포 전에 정책 전문을 확정해야 한다. 확정 과정에서 의무·제재 등 내용이 바뀌면 문구/hash·필요한 버전 검증을 다시 고정한다. 사소한 오탈자마다 재동의를 요구하는 시스템은 만들지 않았다.

## 3. 검증 결과

| 검사 | 실제 결과 / 한계 |
| --- | --- |
| 기존 직접 관련 단위/DOM | 16개 통과. 쪽지 전용, 연락처 재사용/변경, 전국, 가격 쉼표, 사진 실패/재시도 보존 등. 새 popup DOM 1개 추가 통과. 총 고유 17개. 이후 payload/parser 보강 2개만 재실행 통과 |
| 새 popup DOM | 같은 form 인스턴스·File 객체 순서 유지, 이전 버전 미체크, 읽기와 체크 독립, Escape는 상단만 닫음, 포커스 복귀 |
| 실제 소유 로컬 PostgreSQL | 4/4 통과. 제품 mutateMarketListing→실제 DB→mapError의 정확한 안내, 이전 버전 재동의/현재 버전 시각 보존, 미확인 거부, 상태 전환/삭제 영향 없음. 쪽지 전용·전화/SMS·전국 관련 기존 집중 3개는 이번 SQL 변경에 직접 관련되어 재사용 |
| 분리 후보 production build | 기준 commit package/lock으로 `npm ci --ignore-scripts --no-audit --no-fund`, `npm run build` 통과. Next 16.3.5 Turbopack compile/TypeScript 및 static 51개 완료, `/market/policy` static 포함 |
| 실제 브라우저 정책 페이지 | 분리 production 서버에서 비로그인 HTTP 200, 로그인 redirect 없음. 기존 MainLayout/CSS/Noto Sans KR 로드 확인. 1440×1100 / 390×844 가로 넘침 없음 |
| 실제 브라우저 작성 팝업 | 제품 컴포넌트와 CSS/Noto를 직접 사용하는 소유 Next 분리 미리보기. 페이지/팝업 전문·버전 일치. 입력·선택 사진 4장/순서·동의 보존, 닫기/Escape/Tab/Shift+Tab/포커스 복귀, 모바일 내부 스크롤 통과. 스크롤 자동 체크 없음. pageerror 0 |
| 오류·재시도 | 미확인 제출 안내, 합성 저장 실패 후 작성값·동의·사진 유지. 실제 Storage 업로드/원격 등록 시험 아님 |
| lint | 변경/신규 TS·TSX 및 직접 시험 ESLint 통과 |
| 선택 원격 dry-run | CLI 종료 0, AH 후보 한 개만, seeds/roles 빈 배열. 실제 migration 적용 없음 |

이번 DB는 공식 98개 + **수정된 AH 한 개**만 적용한 새 소유 환경이다. AD·20261014~17은 포함하지 않았다. 실제 OTP/메일/브라우저 DB HTTP 시험이 아닌 합성 계정·claims와 PostgreSQL 직접 RPC 시험이다. 실제 사진 복구 글·사진 4장·남은 예약을 조회/변경하지 않았다.

## 4. 분리 후보와 재현

기준 SHA: `7e8393064155a8241a62b539f457978647076f19`.

소유 후보: `C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-aj-ffd5e8fd/candidate`.

Git 객체의 `src`, `public`, `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.gitignore`만 `git archive <기준 SHA> -- <명시 경로>`로 추출한 소유 checkout이다. Git index/stage/commit 없이 구성했다. 여기에 아래 최종 제품 **13개** 파일만 overlay했다. 현재 혼합 작업트리 전체·환경파일·backups·다른 미커밋 package/Auth/마케팅/탈퇴/관리 변경은 가져오지 않았다.

재현 자료는 증거 폴더 `product-manifest.json`의 기준 SHA·정확한 파일·hash다. 명시 Git 객체를 새 디렉터리에 추출하고 manifest의 제품 파일 bytes만 덮은 뒤 기준 package-lock으로 npm ci/build하면 된다. 검사 중 생성된 `.next`, `next-env.d.ts`, agent 안내 등의 산출물은 제품 overlay가 아니다. 전체 untracked 열거는 하지 않았다.

빌드에는 원격 연결이 아닌 합성 loopback 공개 URL/placeholder를 프로세스에만 제공했다. 이 `.next`를 그대로 원격 배포하지 않는다. 최종 배포는 승인된 실제 Vercel 환경에서 동일 소스를 빌드해야 한다. 새 의존성이나 package 변경은 없다. 제출 시험용 preview 페이지·시험/보고서·로컬 helper는 제품 13개 범위에 포함하지 않는다.

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
| `src/components/market/MarketPolicyContent.tsx` | `ba5dfcfa57755c54dd6307c74171f6856135336b3f58841f5d7ba8503e4912e8` |
| `src/lib/market/marketPolicy.ts` | `3e3477632aecb98a2f1191b67fe72f95d424f176e17304587d2ac180a592af0d` |

## 5. SQL 후보와 hash

원격 migration 이력을 이번에 다시 읽어 **98개 / latest 20261013000100**, AH 미적용을 확인한 후 후보를 수정했다. 기존 적용된 SQL에는 손대지 않았다.

유일한 승인 제안 대상:
`supabase/migrations/20261018000100_pul_market_listing_contact_region_notice.sql`

- AI 검토 당시 SHA-256: `fd93bc84ea2546ed5dd8df9f9b0cb4a54f3bcbb718778472ea04ad86a1176d2a`
- **AJ 최종 SHA-256: `38d1b7562a1bb65b9669199e90c5987958d4cf5a6bb5c3407575536603084c63`**
- 변경: 현재 정책 버전/정확한 오류 문장, payload 버전 검사, 이전 버전 보존 가능한 열 제약, 소유자 상세의 버전 근거. 새 테이블·후속 migration·RLS·Storage 정책 변경 없음.
- 기존 hash는 더 이상 최종 승인 hash가 아니다. 최종 SQL과 dry-run 디렉터리 SQL bytes가 같음을 대조한다.
- 새 원격 적용 순서는 **AH 한 개**. 이미 적용된 직접 선행 관계는 AI 보고서와 동일. AD·20261014~17 제외. AD를 AH 뒤에 자동 실행하면 기존 검증을 덮어쓸 수 있으므로 향후에도 pending 전체 실행 금지.

## 6. 서버 변수와 dry-run

제품 직접 호출 관계 `market/actions.ts`→`marketStorage.ts` 및 Supabase env/server에서 확인한 변수는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`다. 정책 페이지 자체에는 키가 필요하지 않다. 기존 사진 흐름의 서버 키는 그대로 필요하다.

이번 Vercel `pul-platform-beta` Environment Variables에서 **세 이름 모두 Preview / experiment/main-tuning 존재**를 읽기 확인했다. Reveal/Copy·값 확인·설정 변경을 하지 않았다. 이름 존재는 키의 실제 인증 성공이나 사진 업로드 성공의 근거가 아니다. 기존 AI 배포 확인 근거는 보존했다.

소유 migration 디렉터리: 증거 폴더의 `migration/`. 공식 Git의 적용된 98개 파일 + 최종 AH 한 개만 있다. config에는 로컬 식별자와 seed disabled만 있으며 환경파일·기존 자격증명을 복사하지 않았다.

설치된 CLI 2.117.0의 `db push --help`를 먼저 읽었다. 기존 CLI 인증 경로를 도구가 자체 사용하도록 아래 **dry-run만** 실행했다.

```text
supabase db push --dry-run --skip-vault --project-ref ivlxvqqaiweysmfodajb --workdir .
```

결과: `dryRun:true`, migration 배열에 `20261018000100_pul_market_listing_contact_region_notice.sql`만 존재. seeds `[]`, roles `[]`, exit 0. `--skip-vault`로 Vault 설정 갱신도 제외했다. `--include-all`/repair/seed/실제 push/apply는 실행하지 않았다. 명령에 키·DB 비밀번호·연결 문자열을 넣지 않았다.

CLI는 `Initialising login role...` 인증 단계 메시지를 출력했다. 제품 schema/data/Storage와 앱 설정 쓰기는 실행하지 않았지만, 이 내부 인증 단계의 일시적인 서버 측 메타데이터 동작까지 전부 없었다고 단정하지 않는다. 해당 역할을 임의 조회/삭제/repair하지 않았다. 로그에는 비밀값이 없고 저장 전 redaction을 거쳤다.

첫 실행은 Windows cp949 출력 해석 오류로 결과를 저장하지 못했다. 같은 dry-run을 UTF-8 처리로 다시 실행했고 CLI는 정상 종료했다. 그 뒤 터미널 표시의 cp949 오류가 있었으나 저장된 UTF-8 JSON을 읽어 결과를 확인했다. 원격 쓰기 명령으로 바꾸어 우회한 적은 없다.

## 7. 실제 적용 전 결정·승인 범위

지금 사용자에게 필요한 행동 하나는 **아래 정책 전문을 검토하고 시행일·계정 제한/결과 안내의 운영 기준을 확정하는 것**이다. 미정이면 초안 그대로 보류한다. 이번 완료를 실제 배포 승인으로 간주하지 않는다.

정책 확정 후 최종 hash를 고정하여 승인받을 실행 범위:

1. 장터 제품 13개 파일만의 소스 반영과 Vercel `pul-platform-beta` Preview / 해당 브랜치 배포. 현재 다른 미커밋 변경·다른 migration은 포함하지 않는다. stage/commit/push 방법은 별도 실행 승인에 명시한다.
2. 작성 내용·원본 사진 보전 및 베타/localhost 장터 이용 중단 구간 확보. 기존 탭을 임의 종료하지 않는다.
3. 새 코드 전환 → hash 일치한 **AH SQL 한 개만** 적용 → 새 코드/새 DB 최소 연결 확인 → 기존 탭의 새 버전 재진입 → 이용 재개. DB 단독 적용 금지. 새 코드/이전 DB는 저장 차단 상태다.
4. 기존 복구 글 대신 사전에 지정된 소유 합성 계정 2개와 새 시험 글 1개만 사용. 쪽지 전용/전국/정책 동의 등록→같은 글 가격·제목 수정→새로 열어 조회, 현재 정책 재사용, 번호 추가·변경·해제의 동의 조건, 타인/익명 번호 비노출, 동일 요청 중복 없음 확인. 실제 전화·쪽지·메일 발송/Storage 업로드 없음. 해당 시험 글만 기존 삭제 경로로 정리, receipt/audit 직접 SQL 정리 없음. 계정이 없으면 자동 가입하지 않고 시험 대상을 먼저 지정한다.

적용 직전 프로젝트 ref·현재 배포·remote 이력·후보 hash·dry-run 한 개를 다시 대조한다. 정책 내용 확정, 중단 구간, 소유 시험 계정/글 생성·삭제 범위, 서버 변수 실제 사용 가능 여부가 최종 승인 조건이다.

**중단·복구:** 범위/해시 불일치, 추가 migration, 권한/정책 검증 실패, 구버전 상세 parser 실패, 원격 인증 실패, DB 잠금/SQL 실패 시 이용 재개를 중단한다. DB 적용 전에는 적용하지 않고 기존 배포 유지. DB 성공 후에는 기존 데이터/동의 기록을 보존하며 최소 forward fix를 준비한다. 예전 코드만 되돌리면 상세 계약이 깨질 수 있다. 확인 검사 제거·동의 backfill·기록 삭제·DB 복원·repair를 자동 복구로 하지 않는다. 무중단 전환 또는 자동 무손실 rollback을 보장하지 않는다.

## 8. 화면·증거·보호

증거 폴더: `C:/Users/HALSUD~1/AppData/Local/Temp/pul-market-aj-ffd5e8fd`.

- `desktop-policy-page.png`, `mobile-policy-page.png`: 분리 production 정책 페이지, 기존 제품 전체 레이아웃.
- `desktop-policy-popup.png`, `mobile-policy-popup.png`, `mobile-policy-popup-bottom.png`, `mobile-composer-policy.png`: 제품 작성 폼의 소유 합성 미리보기. 실제 Noto/CSS 사용, 합성 제출·사진 선택이며 업로드 아님.
- `policy-draft.md`: 공통 정책 원본에서 추출한 검토용 전문. 아래 부록과 동일.
- `product-manifest.json`, `verification-summary.json`, `before.json`, `after.json`, `dry-run-result.json`, `browser-result.json`, `browser.cjs`, `environment.mjs`: 범위·검증·보호 근거.

AH/AI에서 이어진 110개 + 기존 장터 페이지 1개를 합친 111개 시작 hash를 기록했다. 새 파일 시작 상태는 부재였다. 시작 대상 중 이번 승인 수정 8개, 불변 103개이며 새 제품 3개와 이 보고서 1개를 추가했다. 변경은 이번 제품/SQL/시험 범위에 한정하고 기존 A–AI 보고서·미커밋 구현을 보존했다. 분리 후보의 기준 파일 758개를 확인했다. Git archive 출력의 CRLF/LF 차이만 있는 709개는 줄바꿈을 정규화해 대조했고, manifest 밖 내용 변경은 0개다. 단순 bytes 대조에서는 이 줄바꿈 차이로 assertion이 실패했으며 이를 내용 변경 없음과 구분했다. 초기 대조에서 Git의 한글 경로 인용을 그대로 파일명으로 해석한 오류가 있어 `-z` 경로 처리로 교정했다.

소유 DB `pul-consent-test-1790828047994-7f9a574e` container/volume/network/runtime TEMP 정리 완료. 소유 3389/3390 preview/production 서버는 listener와 부모 Next 명령을 대조한 뒤 종료했다. 포트 조회가 sandbox에서 거부되어 허용된 환경에서 소유 프로세스만 확인했으며 사용자 3000 서버는 건드리지 않았다. 증거·분리 소스/빌드 후보는 검토용으로 보존했다. 브라우저 시험 종료 및 이번 Vercel 확인 탭 정리 완료.

**AJ. 이번 Market Policy Local Candidate:** 지정 첫 AGENTS 읽기 준수. 설치된 Next client/page 지침과 직접 관련 [Supabase 함수 문서](https://supabase.com/docs/guides/database/functions)를 확인했다. 과거 거절된 changelog 동작 재시도 없음. backups 내부 접근·루트 재귀·전체 untracked·환경파일/전체 작업트리 복사·비밀 출력·reset/restore/clean/stash·실제 발송·stage/commit/push/배포 없음. A–AI, F/P 실수, T 거절, AD 첫 호출 위반 기록을 보존했다. 승인 화면과 기존 복구 글/사진/예약 불변. Transport NOT_CONFIGURED / 전체 REMOTE APPLY NOT APPROVED 유지.

## 부록 — 검토용 정책 전문

# 장터 이용안내 및 운영정책

운영자 검토용 초안입니다. 정책 시행일과 운영 절차는 확정 전이며, 실제 서비스에는 아직 적용되지 않았습니다.

정책 버전: market-policy-v1

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
- PUL은 판매글·사진·쪽지 문의와 선택한 연락 방법, 판매 상태 표시 및 신고 기능을 제공합니다. 안전결제·대금 보관·보상·상품 진위 보증이나 자동 분쟁 조정 기능은 제공하지 않습니다.
- 운영자의 신고 확인은 접수 내용과 제출 자료를 바탕으로 합니다. 모든 상품이나 거래를 사전에 검사했다는 의미는 아닙니다.

## E. 신고와 처리 절차

판매글 상세의 ‘신고하기’를 이용하거나 PUL 운영자에게 이메일로 문의해 주세요.

- 신고에는 대상 글을 찾을 수 있는 정보, 문제 내용과 확인 가능한 근거를 적어 주세요. 이메일에 비밀번호·인증번호 등 불필요한 개인정보를 보내지 마세요.
- 운영자는 접수 내용을 확인하고 필요하면 관련 설명이나 자료를 요청할 수 있습니다. 신고 횟수만으로 위반을 확정하지 않습니다.
- 위반이 확인되면 설명·수정 요청 또는 해당 판매글 삭제 등 필요한 조치를 검토합니다. 현재 장터 관리 기능은 신고 확인·처리 결과 기록과 판매글 삭제를 지원합니다. 별도의 일시 숨김·자동 경고·자동 통지 기능은 제공하지 않습니다.
- 처리 기간이나 자동 통지를 약속하지 않습니다. 진행 상황과 결과는 아래 문의 창구로 확인할 수 있습니다.

## F. 이용 제한과 이의신청

문제의 심각성·반복 여부·피해 우려와 제출 자료를 살펴 조치를 검토합니다.

- 수정 가능한 잘못은 설명·수정 요청을 우선 검토하고, 반복적인 허위 게시나 사기·권리 침해 등 피해 우려가 큰 글은 우선 게시 중단을 위한 삭제 조치를 검토할 수 있습니다.
- 계정 이용 제한의 구체적인 기준·기간과 경고·결과 안내 절차는 운영자 확정이 필요합니다. 현재 장터에 자동 정지·자동 영구정지나 전용 이의신청 처리 화면이 있는 것은 아닙니다.
- 조치 이유·결과 확인이나 이의신청은 PUL 운영자 이메일로 대상 글 정보, 이의 내용과 근거를 보내 주세요. 운영자는 설명과 자료를 다시 확인할 수 있습니다.

운영 주체: PUL 운영자

문의·결과 확인·이의신청: pulpark.help@gmail.com

