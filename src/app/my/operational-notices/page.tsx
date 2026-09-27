import Link from "next/link";
import { MyCourseNotifications } from "@/components/courses/CourseNotificationSubscription";

export default function Page() {
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
    <Link href="/my" className="inline-flex min-h-11 items-center font-bold text-pul-point">← 내 정보</Link>
    <h1 className="text-2xl font-bold">내 운영알림</h1>
    <p className="text-sm leading-6 text-pul-muted">신청한 장소의 휴장·운영시간 변경 안내를 관리합니다. 할인·광고 수신동의가 아닙니다. 공개가 중단된 장소도 여기에서 알림을 해제할 수 있습니다.</p>
    <MyCourseNotifications />
  </main>;
}
