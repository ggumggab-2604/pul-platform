"use client";
import { useEffect, useRef, useState } from "react";
import { appendMarketPhotos, photoKey } from "@/lib/market/marketPhotos";
import { MarketDialog } from "./MarketDialog";

function SelectedPhoto({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const value = URL.createObjectURL(file);
    if (image.current) image.current.src = value;
    return () => URL.revokeObjectURL(value);
  }, [file]);
  // Local object URL, revoked when removed or the dialog closes.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      alt="저장 전 선택 사진"
      className="aspect-square w-full rounded-lg object-cover"
    />
  );
}
export function MarketPhotoPicker({
  files,
  onChange,
  storedCount,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  storedCount: number;
  disabled?: boolean;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <fieldset
      className="space-y-3 rounded-xl border border-pul-border p-3"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-bold">
        사진 (선택) · 현재 {storedCount + files.length}/5장
      </legend>
      {storedCount > 0 ? (
        <p className="text-xs text-pul-muted">
          기존 저장 사진 {storedCount}장. 아래 취소는 저장 전 선택 사진에만
          적용됩니다.
        </p>
      ) : null}
      <label className="block text-sm font-semibold">
        사진 추가
        <input
          aria-label="사진 추가"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="mt-2 block min-h-11 w-full max-w-full text-sm"
          onChange={(event) => {
            const result = appendMarketPhotos(
              files,
              [...(event.target.files ?? [])],
              storedCount,
            );
            onChange(result.files);
            setErrors(result.errors);
            event.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-pul-muted">
        JPG·PNG·WebP, 파일당 8MB 이하. 파일 내용은 업로드 후 다시 검증합니다.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {files.map((file, index) => (
          <div key={photoKey(file)}>
            <SelectedPhoto file={file} />
            <button
              type="button"
              className="min-h-11 w-full text-sm underline"
              onClick={() => {
                onChange(files.filter((item) => item !== file));
                setErrors([]);
              }}
            >
              {index + 1}번 선택 취소
            </button>
          </div>
        ))}
      </div>
      {errors.map((error) => (
        <p key={error} role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ))}
    </fieldset>
  );
}
export function MarketPhotoGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const close = () => {
    setIndex(null);
    trigger.current?.focus({ preventScroll: true });
  };
  if (!images.length)
    return (
      <p className="rounded-lg bg-pul-page p-4 text-sm text-pul-muted">
        등록된 사진이 없습니다.
      </p>
    );
  return (
    <>
      <div className="grid grid-cols-3 gap-2" aria-label="사진 목록">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={(event) => {
              trigger.current = event.currentTarget;
              event.currentTarget.focus({ preventScroll: true });
              setIndex(i);
            }}
            className={
              i === 0
                ? "col-span-3 rounded-lg focus-visible:ring-2"
                : "rounded-lg focus-visible:ring-2"
            }
            aria-label={`${i + 1}번 사진 확대`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${title} 사진 ${i + 1}`}
              className={`w-full rounded-lg object-contain ${i === 0 ? "max-h-64 bg-pul-page" : "aspect-square"}`}
            />
          </button>
        ))}
      </div>
      {index !== null ? (
        <MarketDialog
          title={`사진 확대 · ${index + 1}/${images.length}`}
          onClose={close}
          wide
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[index]}
            alt={`${title} 확대 사진 ${index + 1}`}
            className="max-h-[65dvh] w-full object-contain"
          />
          <div className="mt-3 flex justify-center gap-3">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              className="min-h-11 rounded-lg border px-4 disabled:opacity-40"
            >
              이전 사진
            </button>
            <button
              type="button"
              disabled={index === images.length - 1}
              onClick={() => setIndex(index + 1)}
              className="min-h-11 rounded-lg border px-4 disabled:opacity-40"
            >
              다음 사진
            </button>
          </div>
        </MarketDialog>
      ) : null}
    </>
  );
}
