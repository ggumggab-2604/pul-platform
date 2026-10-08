"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PHOTO_UPLOADING_MESSAGE, photoProcessingMessage } from "@/lib/images/photoPolicy";

/** Each attempt owns its callbacks; late callbacks cannot replace a newer attempt. */
export function usePhotoUploadProgress() {
  const [message, setMessage] = useState("");
  const mounted = useRef(true), generation = useRef(0);
  useEffect(() => { const attemptGeneration = generation; mounted.current = true; return () => { mounted.current = false; attemptGeneration.current++; }; }, []);
  const begin = useCallback(() => {
    const ticket = ++generation.current;
    const isCurrent = () => mounted.current && generation.current === ticket;
    let phase = 0;
    const show = (text: string) => {
      const step = ++phase;
      // Async transition forms must paint the real phase before image processing.
      // Leave a lifecycle callback first; discard superseded phase callbacks.
      queueMicrotask(() => {
        if (isCurrent() && step === phase) flushSync(() => setMessage(text));
      });
    };
    return {
      isCurrent,
      processing: (index = 1, total = 1) => show(photoProcessingMessage(index, total)),
      uploading: () => show(PHOTO_UPLOADING_MESSAGE),
      clear: () => show(""),
    };
  }, []);
  return { message, begin };
}
export function PhotoUploadStatus({ message }: { message: string }) {
  return <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 min-h-5 text-sm font-semibold text-pul-deep">{message}</p>;
}
