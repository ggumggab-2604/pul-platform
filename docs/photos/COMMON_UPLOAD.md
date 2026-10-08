# PUL 사진 업로드

신규·수정 사진 업로드는 공통 전처리를 반드시 거친다. 원본 직접 전송 경로를 새로 만들지 않는다. 이미 충분히 작은 파일은 검사 후 그대로 반환하며 반복 손실 압축을 하지 않는다. 기존 저장 자료는 변환·이동하지 않는다.

```ts
import { preparePhoto, photoUploadForm } from "@/lib/images/preparePhoto";
// Storage 직접 전송: 반드시 intent 생성보다 먼저 처리
const prepared = await preparePhoto(selectedFile);
const intent = await createIntent({mime: prepared.type, bytes: prepared.size, name: prepared.name});
await uploadToStorage(intent, prepared);
// 서버 경유: 파일당 multipart 1회, 원본 선택 상태는 유지
const form = await photoUploadForm(selectedFile, {requestId}, {purpose: "document"});
await fetch(uploadRoute, {method:"POST", body:form});
```

원본 JPG/PNG/WebP 32MiB 이하, 64MP 이하. HEIC·애니메이션은 미지원. 기존 JPG/PNG 전용 경로는 WebP를 받지 않는다. 일반 사진 긴 변 최대 **800px**, 자료 이미지 긴 변 최대 **2560px**. 사용자 요청 없이 상향하지 않는다.

## 현재 연결 경로
| 업로드 | 호출 컴포넌트 | 전송·검증 |
|---|---|---|
| 장터 판매·창업 게시글·교환 사진 | MarketPageContent | preparePhoto → 변환 메타 intent → signed Storage → finalize 바이트 검증 |
| 매장 사진 | StoreEditor | photoUploadForm → /market/stores/attachments → 소유권/hash/Storage |
| 업체 사진 | VendorWorkspace | photoUploadForm → /market/providers/attachments → 소유권/hash/Storage |
| 장터 관리 안내·정책 이미지 | MarketContentManagement | preparePhoto(document) → /market/manage/content/attachments. PDF는 기존 경로 유지 |
| 골프장 활동사진 | CourseActivityPhotoSection | preparePhoto → signed Storage → finalize |
| 골프장 야디지북 | CourseContentForms | photoUploadForm(document) → /courses/resource-images → 소유권/hash/비공개 Storage |
| 동호회 대표·활동사진 | ClubMediaProvider | preparePhoto → signed Storage → finalize |
| 쪽지 사진 | MessagingForms | photoUploadForm → /messages/attachments → private-message-photos |
| 명예의 전당 증빙 이미지 | HallOfFameApplicationForm | preparePhoto(document) → 메타 intent → signed PUT → finalize. PDF 유지 |
| 배너 | PromotionEditor | preparePhoto(document) → 슬롯 규격 확인 → signed Storage → finalize |

일반 이야기/댓글 게시글과 프로필에는 현재 후보에서 파일 업로드 입력을 찾지 못했다. 이들 기능이 추가될 때도 위 공통 함수를 사용해야 하며, 기존 외부 이미지 URL·표시용 Next Image는 업로드 압축으로 계산하지 않는다.

서버 인증·소유권·파일 바이트/형식/크기·개수 검증과 공개/비공개 경계는 유지한다. DB 한도를 일괄 축소하지 않으며 기존 자료의 조회·수정을 막지 않는다. Server Action은 signed intent용 메타만 받고 이미지 파일은 Storage 직접 또는 별도 multipart route로 전송한다.

[Vercel 함수 제한](https://vercel.com/docs/functions/limitations)은 4.5MB이며 multipart 여유를 둔다. 기존 관리 PDF 5MiB 요청은 이 사진 작업에서 변경하지 않았고, 배포 시 별도 확인이 필요하다. 새 패키지/인프라/계측은 추가하지 않는다.

### 2026-10-08 고정 정책·진행 안내
일반 사진은 purpose: photo (기본값) 최대 800px, 자료는 purpose: document 최대 2560px이다. maxBytes는 더 엄격하게만 적용되며 해상도 옵션은 없다. 작은 파일도 픽셀 상한을 넘으면 반드시 축소한다. 방향·비율·투명도를 유지하고 작은 사진을 확대하지 않는다.

진행 안내 예제:

    const progress = usePhotoUploadProgress();
    const attempt = progress.begin();
    try {
      const form = await photoUploadForm(originalFile, { requestId: stableId }, {
        purpose: "document", onProcessing: () => attempt.processing(index, total),
      });
      if (!attempt.isCurrent()) return;
      attempt.uploading();
      // 기존 인증된 경로로 처리된 form을 전송한다.
    } finally { attempt.clear(); }
    // 제출 버튼 옆: <PhotoUploadStatus message={progress.message}/>

서버 Route Handler와 직접 Storage finalize는 validatePhotoBytes(bytes, mime, purpose)로 실제 파일을 검증한다. 현재 Next의 기존 sharp 의존성을 사용하며 새 패키지는 설치하지 않는다. 회원 호출용 완료 RPC를 쓰지 말고 서버 검증 전용 완료 경계를 사용한다. 안내문 용도는 해당 경로에 고정하며 재시도 중에 바꾸지 않는다.

최종 파일은 최대 4,000,000바이트, 이미지 전용 multipart는 최대 4,200,000바이트이며 경로의 더 엄격한 한도를 따른다. 비율·EXIF 방향·투명도를 유지한다. 상한에 맞는 작은 원본만 재인코딩을 생략한다. 용량이 늘어도 상한을 넘는 원본으로 돌아가지 않는다. PDF 제한은 이번 변경과 별도다.

- 골프장 상단 운영자 이미지: `CourseOperatorImages.tsx` → `/courses/[id]/operator-images`. 파일별 일반 사진 800px / 글자 자료 2560px 선택, 공통 전처리·진행 안내·실제 서버 바이트 검사. 미완료 파일 비공개, 현재 구장 담당/기존 courses.manage 경계.
