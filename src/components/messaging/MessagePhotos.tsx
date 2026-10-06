"use client";

import { useEffect, useRef, useState } from "react";
import { listMessagePhotosAction } from "@/app/messages/actions";
import { messageButton } from "@/lib/messaging/messagingUi";

export function MessagePhotoPreview({ file }: { file: File }) {
  const element = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (element.current) element.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // Local File preview must not pass through an image proxy.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={element} alt={file.name} width={96} height={96} className="h-24 w-24 rounded-lg object-cover" />;
}

function ReceivedPhoto({ id, index }: { id: string; index: number }) {
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const src = `/messages/photo-media/${id}?retry=${retry}`;
  return <li className="min-w-0">
    {failed ? <div role="alert" className="space-y-2"><p>사진 {index + 1}을 불러오지 못했습니다.</p><button className={messageButton} onClick={() => { setFailed(false); setRetry(v => v + 1); }}>사진 다시 보기</button></div> :
      <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`첨부 사진 ${index + 1} 크게 보기`}>
        {/* Authenticated route must bypass public image optimization/caching. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`첨부 사진 ${index + 1}`} width={240} height={180} className="max-h-60 max-w-full rounded-lg object-contain" onError={() => setFailed(true)} />
      </a>}
  </li>;
}

export function MessagePhotos({ messageId }: { messageId: string }) {
  const [photos, setPhotos] = useState<{ id: string }[] | null>(null);
  const [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await listMessagePhotosAction(messageId);
        if (!active) return;
        if (result.ok) { setPhotos(result.data); setError(""); }
        else setError("첨부 사진을 확인하지 못했습니다. 본문은 계속 볼 수 있습니다.");
      } catch { if (active) setError("첨부 사진을 확인하지 못했습니다. 본문은 계속 볼 수 있습니다."); }
    })();
    return () => { active = false; };
  }, [messageId, retry]);
  if (error) return <aside role="alert"><p>{error}</p><button className={messageButton} onClick={() => { setError(""); setPhotos(null); setRetry(v => v + 1); }}>첨부 다시 확인</button></aside>;
  if (photos === null) return <p role="status" className="text-sm text-pul-muted">첨부 확인 중…</p>;
  if (!photos.length) return null;
  return <section aria-label="첨부 사진" className="rounded-xl border border-pul-border bg-white p-4"><h3 className="mb-3 font-bold">첨부 사진</h3><ul className="flex flex-wrap gap-3">{photos.map((p, i) => <ReceivedPhoto key={p.id} id={p.id} index={i} />)}</ul></section>;
}

