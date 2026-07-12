import { Card } from "@/components/ui/Card";
import { Camera, ImageIcon } from "lucide-react";

type ScreenMediaSectionProps = {
  onUpload: () => void;
};

export function ScreenMediaSection({ onUpload }: ScreenMediaSectionProps) {
  return (
    <Card title="매장 사진">
      <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-pul-border bg-pul-light/30 px-4 text-center">
        <ImageIcon className="h-11 w-11 text-pul-muted/45" aria-hidden="true" />
        <p className="mt-3 text-base font-bold text-foreground lg:text-lg">
          등록된 매장 대표사진이 없습니다.
        </p>
        <p className="mt-1 text-[15px] text-pul-muted">
          매장 내부와 타석 사진을 올려주세요.
        </p>
        <button
          type="button"
          onClick={onUpload}
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pul-point px-4 text-[15px] font-bold text-white hover:bg-pul-deep"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          매장사진 올리기
        </button>
      </div>
    </Card>
  );
}
