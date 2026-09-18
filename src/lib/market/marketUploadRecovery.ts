export type UploadIntent = {
  mediaId: string;
  bucket: string;
  path: string;
  token: string;
  mimeType: string;
  attempted: boolean;
};
type MediaState = "pending_upload" | "available" | "failed" | "removed";

/** Keep the same intent after response loss. Only confirmed terminal + cleaned
 * intents may be replaced. Transport failures are never validation failures. */
export async function recoverMarketUpload(
  intents: Map<string, UploadIntent>,
  key: string,
  actions: {
    state: (id: string) => Promise<MediaState>;
    cleanup: (id: string) => Promise<boolean>;
    create: () => Promise<Omit<UploadIntent, "attempted">>;
    upload: (intent: UploadIntent) => Promise<unknown>;
    finalize: (id: string) => Promise<unknown>;
  },
) {
  let intent = intents.get(key);
  if (intent) {
    const state = await actions.state(intent.mediaId);
    if (state === "available") return;
    if (state === "failed" || state === "removed") {
      if (!(await actions.cleanup(intent.mediaId)))
        throw new Error(
          "이전 사진 정리를 완료하지 못했습니다. 다시 시도해 주세요.",
        );
      intents.delete(key);
      intent = undefined;
    }
  }
  if (!intent) {
    intent = { ...(await actions.create()), attempted: false };
    intents.set(key, intent);
  }
  if (!intent.attempted) {
    intent.attempted = true;
    try {
      await actions.upload(intent);
    } catch {
      // Bytes may already exist. Reconcile this exact object, including on retry.
    }
  }
  try {
    await actions.finalize(intent.mediaId);
  } catch (error) {
    const state = await actions.state(intent.mediaId);
    if (state === "available") return;
    if (state === "failed" || state === "removed")
      await actions.cleanup(intent.mediaId);
    // Preserve file/intent/path until success or confirmed terminal cleanup.
    throw error;
  }
}
