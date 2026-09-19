# PUL API · Authorization · IDOR Security Standard v1.0

상태: **OFFICIAL — PUL Security Standard v1.0**

검토일: 2026-09-19 (Asia/Seoul)

제품: PUL — Park Golf Use & Lounge

기준 branch/HEAD: `experiment/main-tuning` / `6bb12f42a21f97f3a50bd0e839f80286088c7f02`
DB 기준: `pul-platform-dev` (`ivlxvqqaiweysmfodajb`), local/remote migration 90, latest `20261005000100`, pending 0.

이 문서는 현재 검증된 구조와 앞으로 지킬 개발 규칙을 구분한다. 보안 전체 재감사, 모든 endpoint의 무결점 인증, 새로운 기능 구현을 뜻하지 않는다. SEC-01/SEC-02는 공식 완료 상태를 유지한다. 이 candidate 자체는 아직 stage·commit·push되지 않았다.

## A. Purpose & Scope

PUL은 파크골프 정보·커뮤니티 플랫폼이다. 회원 계정, 개인정보, 콘텐츠, 운영 권한, Storage, 장터 연락 정보, moderation 및 향후 공통 쪽지를 보호한다. 규모에 맞는 기본 web application security를 적용하고, 모든 기능에 동일한 enterprise 승인·권한·동시성 framework를 강제하지 않는다.

새 기능은 신뢰할 수 있는 actor 확인, 객체별 권한, 최소 데이터 반환, 필요한 상태·동시성 검증을 갖춰야 한다. 검증하지 못한 live 동작은 명시하고, 미검증 사실만으로 취약점으로 판정하지 않는다.

## B. Threat Model

현실적인 위협은 로그인 회원의 다른 회원 UUID 대입, 타인 edit/delete, 다른 club ID 사용, 관리자 API 직접 호출, private Storage path guessing, 철회 전 권한 표시 재사용, 요청 replay·동시 실행, spam/flood, 연락처·증빙 노출이다. 향후 쪽지에서도 message ID를 바꾸어 다른 사람의 대화를 읽거나 발송자를 위조하는 공격을 고려한다.

## C. Trust Boundaries

기본 흐름은 Browser → Server Action/Route Handler → Domain Library → Supabase RPC → PostgreSQL → Storage다. 기능에 따라 브라우저가 RPC를 직접 호출할 수 있으므로 Server Action만 보호해서는 충분하지 않다.

다음 입력은 권한 증명으로 신뢰하지 않는다: client `user_id`/`owner_id`, 임의 object ID, browser role 표시, 숨겨진 버튼, declared MIME/size, 임의 Storage path. 각 신뢰 경계를 넘을 때 필요한 값과 관계를 다시 확인한다.

## D. Identity

일반 RPC actor는 `auth.uid()`에서 결정한다. 서버는 검증된 auth context를 사용하며 현재 공통 구현은 `getAuthenticatedSupabaseContext()`의 `getClaims()` 결과에서 subject를 얻는다.

service-role 전용 RPC의 `p_actor_user_id`는 서버가 이 검증된 context에서 채운다. 브라우저 actor 입력을 그대로 전달하지 않는다. HOF의 `sessionUserId` 비교는 탭/계정 교체 감지용이며 실제 actor의 출처가 아니다. `user_metadata`, 사용자가 수정할 수 있는 프로필, role badge를 권한 근거로 삼지 않는다.

## E. Authentication

로그인 여부와 활동 가능한 계정 상태를 구분한다. 민감 write와 private read는 해당 도메인의 현재 `active`/`suspended`/`withdrawn` 계약을 DB에서 확인한다. 기존 차단 정책을 새 wrapper가 우회해서는 안 된다.

현재 PUL UI는 email OTP 발송·검증을 사용한다. 검토한 runtime에는 password 로그인·비밀번호 재설정/변경 호출이 없다. 원격 Auth 전체 설정과 실제 rate-limit 수치는 이번에 확인하지 못했다. UI가 OTP라는 이유만으로 원격 password API 자체가 비활성이라고 단정하지 않는다.

오래된 탭의 로그인·권한 표시는 authorization이 아니다. 다음 요청은 현재 DB 권한을 다시 평가해야 한다. JWT 검증은 모든 세션의 즉시 철회를 보증하지 않는다. 로그아웃 후 두 탭 갱신 및 이미 발급된 token의 동작은 별도 live 검증 범위로 둔다.

## F. Authorization / IDOR

**ID is an identifier, not authorization.**

`post_id`, `comment_id`, `listing_id`, `club_id`, `profile_id`, `media_id`, `report_id`, `message_id`, `evidence_id`는 객체를 가리킬 뿐이다. read/update/delete마다 owner, 현재 membership, role/permission, publication, parent-child relation 중 필요한 조건을 trusted boundary에서 확인한다.

대표 현재 계약:

| 대상 | 현재 enforcement |
| --- | --- |
| 계정·profile·private contact | own-row RLS; profile 변경은 자기 계정이며 active여야 함. 허용된 profile 컬럼만 갱신 |
| Club 관리 상세 | 현재 club permission 및 `membership.club_id = p_club_id` 확인 |
| HOF 신청 | own workspace projection; 타인 draft 수정·철회 불가 |
| HOF 증빙 | active actor, 실제 batch/record 관계, 당사자 또는 현재 evidence-read 권한과 심사 상태 확인 |
| 장터 owner mutation | 실제 작성자·현재 상태·version 검증. 관리용 private context도 owner 검사 |
| 장터 연락처 | 명시적 게시물별 동의와 게시 상태, active viewer 계약 적용. 다른 active 회원에게 허용된 상세 연락처는 정상 공개 계약 |
| Moderation | 현재 `community.reports.manage`와 active actor 확인. 작성자라는 이유로 운영 조치 권한을 갖지 않음 |

Anon은 private object를 읽지 못해야 한다. 공개 projection은 별도로 허용할 수 있다. 일반 admin이라는 명칭만으로 모든 private 객체를 읽게 하지 않는다. 새로운 경로의 negative test는 다른 사용자의 실제 유효 ID를 넣어 검사한다.

## G. UI Security Rule

**버튼 숨김은 보안이 아니다.** 메뉴 미노출, 관리자 badge, disabled 버튼은 UX다. 공격자가 직접 Server Action/RPC를 호출해도 서버·RPC·PostgreSQL/RLS가 동일한 권한을 강제해야 한다.

UI는 stale/version conflict나 permission 오류를 안전하게 표시하고, 실패를 성공으로 표시하거나 임의의 최신 version으로 자동 재시도하지 않는다.

## H. RLS / ACL

민감 table은 RLS, 필요한 direct table revoke, 좁은 RPC로 보호한다. 필요한 곳에는 FORCE RLS를 적용하되 모든 table에 기계적으로 요구하지 않는다. 현재 profile은 own-row RLS 및 column ACL을 사용하고, HOF 증빙·장터 media·SEC-02 콘텐츠는 direct DML을 막는 RPC 경계를 사용한다.

Table ACL과 row policy는 모두 확인한다. RLS가 켜졌다는 사실만으로 안전을 단정하거나, policy가 없다는 이유만으로 취약점으로 분류하지 않는다. 정책 없는 RLS가 의도된 default deny이고 RPC가 권한을 검증하는 구조인지 확인한다. UPDATE는 기존 행 조건과 새 행 조건을 함께 보호해야 한다.

## I. SECURITY DEFINER

- 필요한 이유와 owner를 명시하고 `search_path=''` 및 명시적 schema를 사용한다.
- 기본 PUBLIC EXECUTE를 제거하고 필요한 role에만 explicit GRANT한다.
- 사용자용 entry는 caller와 객체 관계를 재검증한다. helper와 service-only entry는 브라우저 role에 노출하지 않는다.
- DEFINER의 owner가 RLS를 우회할 수 있음을 전제로 함수 내부 authorization을 작성한다. RLS가 대신 보호한다고 가정하지 않는다.
- 공개 조회용 anon entry는 최소 public projection만 반환해야 한다. 단순히 DEFINER가 anon/authenticated에 열려 있다는 자동 경고만으로 취약점을 확정하지 않는다.

## J. Service Role

service-role 키는 서버 전용 모듈에만 둔다. `server-only` 경계를 유지하고 `NEXT_PUBLIC_` 변수, client bundle, 응답, 로그에 넣지 않는다. 현재 Storage 서버 모듈 여섯 곳은 이 경계를 선언한다.

높은 권한 호출 전에 검증된 auth subject, owner/permission, DB가 반환한 canonical path와 lifecycle을 확인한다. regex로 path 형식이 맞는다는 이유만으로 삭제·sign을 허용하지 않는다. Server Action은 사용자가 제공한 path 배열을 privileged deletion helper에 넘겨서는 안 된다.

서버 내부 cleanup/reconciliation은 DB가 선택한 종료 상태 후보만 다룬다. helper export 자체를 사용자에게 호출 가능한 Server Action으로 노출하지 않는다.

## K. Public DTO / Data Minimization

공개 목록과 preview는 화면에 필요한 값만 반환한다. private contact, email/phone, 신고자 식별 정보, audit metadata, 비공개 증빙·저장경로, secret/internal payload는 기본적으로 제외한다. 새 DTO에 private path나 bearer URL을 추가하지 않는다.

장터의 동의된 연락처는 허용된 상세·viewer·상태 조건에서만 반환한다. 목록에는 넣지 않는다. UUID 또는 공개 가능한 이미지 식별자가 보인다는 사실 자체를 취약점으로 보지 않으며, 그 값만으로 private 내용에 접근할 수 없어야 한다. 홈·검색·이벤트 후기·회원 activity 등 재사용 projection도 같은 publication/moderation 조건을 유지한다.

## L. Mutation Integrity

위험에 맞춰 expected version, row lock, advisory transaction lock, request ID와 replay/idempotency를 선택한다. actor·operation·target·payload가 다른 요청을 같은 요청으로 취급하지 않는다. stale 요청은 새 상태를 덮어쓰지 않아야 하고, 재전송은 중복 결과를 만들지 않아야 한다.

예: HOF draft 요청은 actor와 request에 결합되어 replay하고, 장터 mutation은 request fingerprint·owner·version을 검증한다. 권한 철회 후 기존 성공 결과를 조회하는 replay와 새로운 privileged write는 구분한다. 이미 진행 중인 transaction과 다음 요청의 권한 시점을 명확히 한다.

## M. Storage

| Bucket | 현재 목적과 접근 계약 |
| --- | --- |
| `hall-of-fame-evidence` | private, 10 MiB, JPEG/PNG/WebP/PDF. 일반 public projection 대상 아님 |
| `market-startup-media` | private, 8 MiB, JPEG/PNG/WebP. `published` + `open` + `screenResale` + `available`이며 post/media 관계가 일치할 때 앱의 공개 이미지 경로에서 제공 |

두 bucket 모두 원격 `public=false`다. 현재 `storage.objects`에는 브라우저 직접 접근을 허용하는 policy가 없고 RLS가 켜져 있다. path를 아는 것만으로 private 파일에 접근할 수 없어야 한다.

업로드는 DB의 owner-scoped intent → canonical path의 signed upload(`upsert:false`) → 서버의 실제 bytes/MIME/size 검증 → service-only finalize 순서다. declared MIME/파일명만 신뢰하지 않는다. 종료 상태 정리와 늦게 도착한 업로드 처리도 설계한다. 정상 available 객체를 오류 보상 과정에서 지우지 않는다.

현재 signed read 수명은 두 경로 모두 60초다. HOF는 권한 검사 후 URL을 당사자에게 반환한다. Startup은 sign 후 상태를 다시 확인하고, Route Handler가 `private, no-store`로 이미지를 전달하여 Storage bearer URL을 직접 반환하지 않는다. sign 이후 권한 변경, 진행 중 응답, 이미 받은 bytes까지 즉시 회수한다고 보증하지 않는다.

HOF DB upload intent는 15분 만료를 검사한다. Storage signed upload token은 별도 수명이며 공식 SDK 문서 기준 2시간이다. DB intent의 만료/실패/삭제가 기존 upload token을 즉시 폐기하는 것은 아니다. 필요 시 token 수명 이후 cleanup을 재확인한다. 이 구분을 유지하며 이번에는 실제 업로드나 만료 대기 시험을 하지 않았다.

## N. Privacy / Logging / Audit

OTP, password, access/refresh token, service key, 불필요한 연락처 원문, 전체 민감 request payload를 로그에 기록하지 않는다. 운영 로그 수집 자체도 최소 범위로 한다. 자유 입력 reason에 개인정보나 secret을 복사하지 않는다.

Audit은 actor, target, action, result/time, 필요한 최소 상태 변화만 기록한다. SEC-02는 restricted/moderation version과 optional report ID를 남기며 콘텐츠 원문이나 신고자 정보를 복제하지 않는다. 장터는 연락처 값을 audit summary에서 제외하고 request 비교에는 fingerprint를 사용한다. fingerprint도 외부 공개 데이터로 취급하지 않는다.

## O. Error Handling

사용자 오류에는 안전한 도메인 메시지를 사용하고 raw SQL, stack, key, path, 내부 payload를 노출하지 않는다. private 객체의 존재 여부를 불필요하게 알려 주지 않는다. 모든 endpoint 오류를 동일 코드로 통일할 필요는 없지만 enumeration 위험을 평가한다. 성공 여부와 재시도 가능성을 구분하고, 검증 실패 후 side effect가 남는지 확인한다.

## P. Anti-Abuse / Spam — SEC-01

공개 write의 제한은 UI가 아닌 서버/DB에서 적용하며 직접 RPC 호출에도 유효해야 한다. 회원 × 기능 scope, 짧은 cooldown, rolling window, 동일 내용 반복 억제, 동시 요청 직렬화를 사용한다.

| 현재 기능 | Cooldown | Rolling window | 최대 작성 수 |
| --- | --- | --- | --- |
| Community post | 20초 | 10분 | 5 |
| Community comment | 3초 | 10분 | 30 |
| Course discussion | 20초 | 10분 | 5 |
| Certification study | 20초 | 10분 | 5 |

현재 구현은 `auth.uid()` actor와 advisory transaction lock을 사용하고, 숨김·삭제로 quota를 지우지 않는다. 모든 미래 기능에 같은 수치를 강제하지 않는다. 계정별 제한이 분산 계정 abuse까지 해결한다고 주장하지 않는다.

## Q. Moderation — SEC-02

운영자는 실제 내용을 확인하고 이유를 선택한다. restrict, restore, report resolve only, restrict only, restrict + report resolve를 구분한다. 신고 없이 직접 moderation도 가능하다. 신고 횟수만으로 자동 hide/delete/계정정지를 하지 않는다.

현재 permission은 `community.reports.manage`이며 active actor와 현재 DB mapping을 검사한다. 작성자는 owner edit로 moderation marker를 해제하지 못한다. 공개 read/count는 제한 콘텐츠를 제외하고 `moderation_version`으로 stale 조치를 막는다. 결합된 restrict+resolve는 원자적으로 처리한다.

Restore는 운영자가 제한한 객체에만 허용한다. 기존 hidden/removed 상태를 임의 공개하지 않는다. 댓글 부모는 published이며 moderation marker가 없어야 하고, course는 active여야 한다. 복원 시 locked parent row에서 확인한다.

동시성 계약: parent wins이면 restore DENY. Restore가 먼저 정상 parent lock을 획득하면 PASS이며, commit 후 부모가 비공개로 바뀌는 것은 허용한다. 이때 public read는 자식을 차단한다. 이후 부모가 다시 공개되면 정상 복원된 자식이 보이는 것도 허용한다.

## R. Account Abuse Operations

반복 spam은 운영자가 내용·반복성을 확인한 뒤 대응한다. SEC-01의 계정별 작성 제한과 SEC-02의 콘텐츠 제한은 현재 사용할 수 있다. Club membership suspend는 특정 club의 소속 상태 조치이며 PUL 계정 전체 suspension과 다르다.

이번 범위에서 일반 운영자를 위한 전역 account suspend/restore UI·RPC는 확인되지 않았다. `user_accounts.account_status`의 DB guard는 존재하지만 그 자체가 운영 절차는 아니다. **REVIEW: 계정 전체 제한·복구 담당자, 승인/기록 절차를 확정할 작은 운영 항목**으로 남긴다. 새 제재 시스템이나 자동 ban을 요구하지 않는다.

현재 가능한 기술 경로는 권한 있는 Supabase 유지보수 담당자의 제한된 DB 운영 접근이다. 일반 회원·앱 운영 role에 direct account UPDATE를 열지 않는다. 실제 사건에서 이 경로를 채택한다면 사전에 다음 절차를 승인·확인한다. 아래는 이번에 실행된 조치가 아니라 운영 절차 candidate다.

1. 대상 UUID와 사건 근거를 확인하고 처리 권한이 있는 담당자를 지정한다.
2. 한 계정의 현재 상태를 확인한 뒤 명시적 transaction과 상태 조건으로만 제한/복구한다. blind bulk UPDATE를 하지 않는다.
3. 이유·담당자·대상·이전/이후 상태·시간을 최소 기록하고 확인한다. 원문 콘텐츠/연락처를 로그에 복사하지 않는다.
4. 잘못된 대상 또는 영향이 확인되면 승인된 복구 절차를 사용한다. Auth ban과 PUL account status를 같은 것으로 간주하지 않는다.
5. 승인된 controlled 계정으로 민감 mutation 차단 및 복구를 확인한다. 기존 token의 즉시 소멸이나 이미 받은 자료 회수를 가정하지 않는다.

담당자·절차의 실제 운영 사용 여부는 미확인이다. 이번 검토에서는 실회원 상태를 변경하지 않았다.

## S. Future Messaging Security — 구현 전 계약

다음 기준은 향후 공통 쪽지 개발 요구이며 이미 구현되었다는 뜻이 아니다.

### 개인 쪽지

Sender는 trusted auth actor로 결정하고 client sender ID를 신뢰하지 않는다. Recipient 존재·상태와 차단 관계를 확인한다. 받은/보낸 쪽지는 실제 당사자만 읽으며 message ID만으로 조회·답장·삭제를 허용하지 않는다. 답장은 원래 대화 참여 관계와 현재 발송 가능 상태를 다시 확인한다. 관리자라는 이유만으로 개인 쪽지 전체 열람 권한을 만들지 않는다.

### 장터 연결 쪽지

Listing 존재·현재 상태·실제 seller relation을 서버/DB에서 확인한다. Client가 고른 seller ID를 그대로 수신자로 믿지 않는다. 쪽지로 장터 연락을 대체/보완하여 향후 전화번호 노출을 선택적으로 줄일 수 있다. 기존 장터 동의·상태 계약도 유지한다.

### PUL 전체 공지

일반 admin 표시와 별도로 좁은 broadcast permission을 고려한다. 발송 시 현재 권한을 확인하고 sender spoofing 및 일반 회원의 대량 발송을 막는다. Recipient 집합 생성 과정도 권한 경계 안에서 처리하며 최소 audit을 남긴다.

### 그룹/게시판 공지

동호회·대학 게시판·구단·모임 운영자는 임의 회원 전체에 발송할 수 없다. 서버/DB가 sender의 현재 그룹 운영자 관계, 필요한 group permission, 각 recipient의 실제 해당 그룹 membership을 확인한다. 다른 그룹 ID/recipient 대입을 거부한다.

### 구조와 abuse

공지 원본과 recipient/read 상태를 분리하는 단순 구조를 고려할 수 있다. 수백 개의 독립 개인 대화방을 만드는 것은 필수가 아니다. 이는 설계 원칙이며 schema를 미리 확정하지 않는다.

Sender cooldown, 시간창 발송량, 동일 내용 반복, recipient별 반복, broadcast permission, block, report를 고려한다. 개인 쪽지와 공지에 같은 제한 수치를 기계적으로 적용하지 않는다. AI classifier부터 만들지 않는다. 대량 작업의 retry가 중복 발송이나 다른 그룹 발송을 만들지 않게 한다.

## T. Secure Development Checklist

- [ ] Actor는 trusted auth에서 얻는가?
- [ ] Object ID 외에 owner/permission 및 필요한 parent relation을 확인하는가?
- [ ] Client role 표시를 신뢰하지 않고 현재 권한을 조회하는가?
- [ ] Direct table/column ACL과 RLS를 확인했는가?
- [ ] SECURITY DEFINER owner, grant, search_path가 안전한가?
- [ ] Public DTO에 불필요한 PII·private path·secret이 섞이지 않는가?
- [ ] Storage path/owner/state와 실제 bytes를 확인하는가?
- [ ] 의미 있는 replay/race에 필요한 보호가 있는가?
- [ ] 공개 write 또는 메시지 발송에 spam 방어가 필요한가?
- [ ] Audit/log에 secret·PII·민감 payload를 과다 저장하지 않는가?
- [ ] 다른 사용자 ID·철회된 권한·비활성 계정의 negative test가 필요한가?

## U. Complementary Review Evidence & Limits

분류: PASS는 명시된 정적/DB/로컬 증거 범위의 충족이다. REVIEW는 운영 확인 항목이다. NOT LIVE-VERIFIED는 실제 원격 계정·시간·브라우저 시험을 수행하지 못한 상태이며 그 자체가 취약점은 아니다. 실제 우회/노출이 확인된 경우만 CHANGES REQUIRED로 분류한다.

| Area | Static/DB | Local Test | Live Remote | Result |
| --- | --- | --- | --- | --- |
| Cross-user IDOR | Profile RLS, club scope, HOF owner/reviewer, market owner, moderation guard | 합성 A/B profile·HOF·startup read/write/delete 경계 | 카탈로그만 확인; 실제 사용자 시험 없음 | PASS |
| Account state | Active DB guard와 profile policy | Suspended/withdrawn profile·startup 차단 | 실제 계정 상태 변경 없음 | PASS |
| Permission revoke | 현재 account/role/mapping/assignment 조회 | 같은 auth subject에서 role·permission mapping 철회 반영 | 열린 실제 탭의 철회 시험 없음 | PASS |
| Replay/concurrency | HOF request lock, market request/owner/version 경계 | HOF 생성 replay, startup remove replay·stale·타인 요청 거부 | 실회원 replay 없음 | PASS |
| Private Storage | 실제 private bucket, service-only ACL, canonical relation/state | Startup owner/타인 context, publication gate; HOF service entry 접근 차단 및 Storage 계약 시험 | Bucket/catalog 확인; 파일 접근·업로드 없음 | PASS |
| Signed URL/token | Read 60초, HOF intent 15분, SDK token 별도 수명 | HOF sign/bytes/cleanup 계약 확인 | 실제 만료 대기 없음 | NOT LIVE-VERIFIED |
| Auth configuration | 앱 email OTP; advisor의 leaked-password 경고 확인 | OTP·동의·세션 계약 확인 | Dashboard 로그인 필요; 실제 rate-limit 및 전체 설정 미확인 | NOT LIVE-VERIFIED |
| Service role | 여섯 Storage 모듈 server-only; trusted actor·DB path; remote ACL | HOF Storage 경계 계약 및 service-only entry 차단 | 실제 signing/write 없음 | PASS |
| Logs/PII | 대표 Auth/Storage 로깅 및 market/SEC-02 audit 최소화 | HOF no-secret logging 계약 | 운영 로그 원문 수집 없음 | PASS |
| Account abuse operations | DB 상태 guard, SEC-01/02, club/global 상태 구분 | Account guard만 검증 | 전역 제한·복구 절차 실제 실행 없음 | REVIEW |

이번에 실행한 증거:

- 기존 OTP/signup/session/HOF Storage 단위·계약 테스트 47 PASS. HOF Storage 일부 검사는 정적 source assertion이며 실제 Storage 전송 시험이 아니다.
- 새 합성 격리 DB 보완 시나리오 10 PASS. 현재 공식 90개 migration의 유효 schema를 fresh bootstrap으로 구성했다. 개발 DB/실회원 데이터를 복제하지 않았다. 실제 파일을 업로드하지 않고 일부 media 상태는 로컬 service-role SQL로만 검증했다.
- 임시 시험의 초기 미지원 `reopen` 입력 오류는 실제 지원되는 `remove`로 교정 후 재실행했다. 제품·migration 수정은 없다.
- SEC-01/02의 직전 공식 완료 증거는 Unit/UI/contract 68, SEC-02 DB 32, SEC-01 DB 20, lint/type/diff PASS다. 이번에 이 전체 suite를 다시 실행하거나 완료 판정을 재개방하지 않았다.
- 이번 replay 보완은 순차 replay/stale 요청 중심이다. 모든 도메인의 실제 동시 transaction race를 새로 시험한 것으로 주장하지 않는다.

대표 근거 경로(저장소 상대 경로):

- `src/lib/supabase/auth.ts`, `src/components/auth/EmailOtpAuth.tsx`, `src/app/auth/actions.ts`
- `supabase/migrations/20260714000100_pul_auth_user_foundation.sql`, `20260715000100_pul_active_profile_update_policy.sql`
- `supabase/migrations/20260801000100_pul_club_member_detail_read_contract.sql`, `20260806000100_pul_platform_permission_foundation.sql`
- `src/lib/hall-of-fame/hallOfFameEvidenceStorage.ts`, `src/app/hall-of-fame/apply/actions.ts`, `supabase/migrations/20261001000100_pul_hall_of_fame_applicant_workspace_read.sql`
- `src/lib/market/marketStartupStorage.ts`, `src/app/market/phaseOneActions.ts`, `src/app/market/startup-media/[postKey]/[mediaId]/route.ts`
- `supabase/migrations/20260928000100_pul_market_listing_contact_report_foundation.sql`, `20261003000100_pul_market_beta_phase_one.sql`
- `supabase/migrations/20261004000100_pul_sec01_public_create_limits.sql`, `20261005000100_pul_sec02_content_moderation.sql`

Live 미검증: 실제 A/B authenticated browser/API 요청, 실제 권한 철회된 열린 탭, native two-tab logout/focus(V01), signed token 실제 만료, 실제 private Storage 전송, 원격 Auth 전체 설정/rate-limit, 계정 전역 제한 운영 실행. 공개 Beta browser 확인도 도구 timeout으로 완료하지 못했고 GitHub의 해당 commit Vercel success만 확인했다. 새 runtime bundle build는 수행하지 않았다.

Supabase advisor의 RLS-no-policy 및 executable-DEFINER 경고는 현재 RPC 설계와 실제 ACL/함수 guard를 함께 해석한다. Leaked password protection 비활성 경고는 앱의 OTP 경로만으로 자동 취약점으로 승격하지 않는다. Password API 사용을 도입하거나 실제 사용이 확인되면 설정·보호·rate-limit을 다시 검토한다. 이번 결론은 원격 password API 비활성 확인을 뜻하지 않는다.

새 확인된 finding: BLOCKER/HIGH 0, MEDIUM 0, LOW 0. 운영 REVIEW와 live 미검증을 이 수치와 구분한다. 과거 tooling-glob/P01 deviation 기록은 유지하며 삭제·무효화하지 않는다. 이번 검토의 backups 내부 접근·root recursive discovery는 0이다.

## V. External References

- [Supabase signed upload URL — SDK token 수명](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl)
- [Supabase signed read URL — seconds 단위 expiry](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl)
- [Supabase Auth rate limits — 프로젝트 설정과 기본값을 구분](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase password security — leaked password protection 적용 범위](https://supabase.com/docs/guides/auth/password-security)
- [Supabase RLS-no-policy advisor 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Supabase anon DEFINER advisor 설명](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Supabase authenticated DEFINER advisor 설명](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
