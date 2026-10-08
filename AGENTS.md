<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## PUL 사진 업로드 공통 규칙

PUL의 신규·수정 사진 업로드는 공통 이미지 전처리/업로드 도우미를 사용한다. 원본 파일을 바로 전송하는 독자 경로를 만들지 않는다. 전처리 후 크기를 확인하고 서버 검증·공개 범위·소유권 검사를 유지한다.

- 공통 함수: `src/lib/images/preparePhoto.ts`의 `preparePhoto`, `photoUploadForm`. 선택 검사는 `src/lib/images/photoPolicy.ts`의 `validatePhotoInput`.
- 파일의 MIME·이름·크기를 upload intent에 기록하기 **전에** 전처리한다. 실패 시 원본을 대신 전송하지 않고 작성 내용과 선택 파일을 유지한다.
- 야디지북·안내문은 `purpose: "document"`. PNG 투명도, 방향, 비율을 유지한다. PDF·동영상 변환은 대상이 아니다.
- 현재 진입점과 예제: `docs/photos/COMMON_UPLOAD.md`. 새 기능 개발 시 이 목록에 경로를 추가하고 실제 전송 연결을 확인한다. 문서 규칙이며 미래 코드를 자동 강제하는 도구는 아니다.

## 사용자 확정 이미지 상한 (2026-10-08)
- 앞으로 올리는 모든 이미지: 일반 사진 긴 변 최대 800px, 안내문·포스터·요금표·야디지북·스코어카드 등 자료 최대 2560px. 사용자 변경 요청 전 상향·해제 금지.
- 숫자는 src/lib/images/photoPolicy.ts에서 관리한다. 작은 이미지는 확대하지 않고, 상한을 넘는 원본 반환·변환 실패 원본 전송 금지. PDF·영상 및 기존 저장 이미지 일괄 처리는 제외.
- preparePhoto/photoUploadForm의 onProcessing과 PhotoUploadStatus를 사용해 실제 압축·전송 단계를 안내한다. 재시도 ID·완료 파일·입력을 보존한다.
- 서버는 validatePhotoBytes로 실제 수신/Storage 파일의 픽셀·바이트·형식을 검사한다. 직접 Storage 업로드는 서버 검증 후 finalize하며, 브라우저 width/height를 신뢰하지 않는다.
