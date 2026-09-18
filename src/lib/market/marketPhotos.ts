export type PhotoFile = Pick<File, "name" | "size" | "type" | "lastModified">;
export const photoKey = (file: PhotoFile) =>
  `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
export function appendMarketPhotos<T extends PhotoFile>(
  current: T[],
  added: T[],
  storedCount: number,
) {
  const files = [...current],
    errors: string[] = [];
  for (const file of added) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !/\.(jpe?g|png|webp)$/i.test(file.name)
    ) {
      errors.push("JPG·PNG·WebP 사진만 추가할 수 있습니다.");
      continue;
    }
    if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
      errors.push("사진은 파일당 8MB 이하여야 합니다.");
      continue;
    }
    if (files.some((item) => photoKey(item) === photoKey(file))) {
      errors.push("이미 선택한 사진입니다.");
      continue;
    }
    if (storedCount + files.length >= 5) {
      errors.push("기존 사진과 새 사진을 합해 최대 5장입니다.");
      continue;
    }
    files.push(file);
  }
  return { files, errors: [...new Set(errors)] };
}
/** Retained across retries: a saved post is never created again, successful files never re-upload. */
export class MarketPhotoSaveProgress {
  saved: { id: string; version: number } | null = null;
  requestId: string | null = null;
  readonly completed = new Set<string>();
  async run<T extends PhotoFile>(
    files: T[],
    save: () => Promise<{ id: string; version: number }>,
    upload: (id: string, file: T) => Promise<void>,
  ) {
    if (!this.saved) this.saved = await save();
    for (const file of files) {
      const key = photoKey(file);
      if (this.completed.has(key)) continue;
      await upload(this.saved.id, file);
      this.completed.add(key);
    }
    return this.saved;
  }
}
