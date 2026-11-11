"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { changeClubParticipation } from "@/app/club-participation/actions";
import {
  audienceLabels, fieldLabels, roomHref, voteLabels,
  type Audience, type EntryField, type EntryPreview, type NoticePreview, type Room, type RoomKind,
  type RoomList, type RoomOperation, type RoomResult, type Vote,
} from "@/lib/clubs/clubParticipation";

const panel = "space-y-3 rounded-xl border border-pul-border bg-white p-4 sm:p-6";
const input = "block w-full rounded-lg border border-pul-border px-3 py-2";
const button = "min-h-11 rounded-lg border border-pul-border px-4 py-2 font-semibold text-pul-deep disabled:opacity-50";
const primary = button + " bg-pul-light";

function useRoomOperation(viewerId: string, room: string | null, club: string) {
  const router = useRouter();
  const requests = useRef(new Map<string, string>());
  const busy = useRef(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RoomResult>({});
  function run(operation: RoomOperation, payload: Record<string, unknown> = {}, onSuccess?: (result: RoomResult) => void) {
    if (busy.current) return;
    busy.current = true;
    setResult({});
    const key = JSON.stringify([operation, payload]);
    const id = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, id);
    start(async () => {
      try {
        const next = await changeClubParticipation(viewerId, room, club, operation, id, payload);
        setResult(next);
        if (next.error) return;
        requests.current.delete(key);
        if (next.roomId) router.push(roomHref(next.roomId));
        if (!operation.startsWith("preview_")) router.refresh();
        onSuccess?.(next);
      } catch {
        setResult({ error: "처리 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요." });
      } finally {
        busy.current = false;
      }
    });
  }
  return { run, pending, result };
}

function Feedback({ pending, result }: { pending: boolean; result: RoomResult }) {
  return <>
    {pending && <p role="status">처리 중…</p>}
    {result.error && <p role="alert" className="font-semibold text-red-700">{result.error}</p>}
    {result.sent != null && <p role="status">{result.sent}명에게 발송했습니다.</p>}
    {result.done && <p role="status">{result.submitted ? `${result.submitted}명 단체 접수 제출 완료` : "저장했습니다."}</p>}
  </>;
}

export function ParticipationList({ data, clubKey, viewerId }: { data: RoomList; clubKey: string; viewerId: string }) {
  const [kind, setKind] = useState<RoomKind>(data.tournaments.length ? "tournament" : "monthly");
  const action = useRoomOperation(viewerId, null, clubKey);
  const options = kind === "tournament" ? data.tournaments : data.monthly;
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    action.run("create", { kind, target: form.get("target"), phoneAllowed: form.has("phone") });
  }
  return <>
    <p>{data.clubName}</p>
    <form className={panel} onSubmit={create}>
      <h2 className="text-lg font-bold">참여방 만들기</h2>
      <fieldset disabled={action.pending} className="space-y-3">
        <label className="block">모집 종류
          <select className={input} value={kind} onChange={event => setKind(event.target.value as RoomKind)}>
            <option value="tournament">대회 참가 모집</option><option value="monthly">월례회 참가 모집</option>
          </select>
        </label>
        <label className="block">연결할 {kind === "tournament" ? "대회" : "월례회 일정 또는 기록"}
          <select key={kind} className={input} name="target" required defaultValue="">
            <option value="" disabled>{options.length ? "행사 선택" : "연결할 행사가 없습니다"}</option>
            {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        {kind === "tournament" && <label className="flex items-start gap-2">
          <input className="mt-1" type="checkbox" name="phone" /> 회원 동의를 받아 전화번호를 제출 항목에 포함할 수 있도록 설정
        </label>}
        <button className={primary} disabled={!options.length}>참여방 만들기</button>
      </fieldset>
      <Feedback {...action} />
    </form>
    {[false, true].map(archived => {
      const rooms = data.rooms.filter(room => room.archived === archived);
      return <section className={panel} key={String(archived)}>
        <h2 className="text-lg font-bold">{archived ? "지난 참여방" : "진행 중인 참여방"}</h2>
        {rooms.length ? <ul className="divide-y divide-pul-border">{rooms.map(room => <li key={room.id}>
          <Link className="flex flex-wrap items-center justify-between gap-2 py-3 font-semibold text-pul-point" href={roomHref(room.id)}>
            {room.title}<span className="text-sm text-pul-muted">{room.kind === "monthly" ? "월례회" : "대회"} · {room.open ? "모집 중" : archived ? "종료" : "응답 마감"}</span>
          </Link>
        </li>)}</ul> : <p>참여방이 없습니다.</p>}
      </section>;
    })}
  </>;
}

function Respond({ data, viewerId }: { data: Room; viewerId: string }) {
  const action = useRoomOperation(viewerId, data.id, data.clubKey);
  const [response, setResponse] = useState<Vote | "">(data.own?.response ?? "");
  const [phoneAllowed, setPhoneAllowed] = useState(data.own?.phoneAllowed ?? false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    action.run("respond", {
      response, division: form.get("division"), consent: form.has("consent"),
      seenName: data.contact?.name, seenPhone: phoneAllowed ? data.contact?.phone : undefined,
      phoneAllowed: response === "yes" && phoneAllowed,
    });
  }
  return <section className={panel}>
    <h2 className="text-lg font-bold">내 참가 응답</h2>
    <p>현재 응답 · {voteLabels[data.own?.response ?? "unanswered"]}{data.own?.division ? " · " + data.own.division : ""}</p>
    {data.kind === "tournament" && <p className="text-sm text-pul-muted">응답은 동호회 회장에게 전달됩니다. 개최자 접수는 회장이 명단을 제출하면 이루어집니다.</p>}
    {data.open && <form onSubmit={submit}>
      <fieldset disabled={action.pending} className="space-y-3">
        <label className="block">응답
          <select className={input} value={response} onChange={event => setResponse(event.target.value as Vote)} required>
            <option value="" disabled>응답 선택</option>
            {(["yes", "no", "maybe"] as const).map(value => <option value={value} key={value}>{voteLabels[value]}</option>)}
          </select>
        </label>
        {data.kind === "tournament" && response === "yes" && <>
          <label className="block">참가 부문<select className={input} name="division" required defaultValue={data.own?.division ?? (data.divisions?.length === 1 ? data.divisions[0] : "")}>
            <option value="" disabled>부문 선택</option>{data.divisions?.map(division => <option key={division}>{division}</option>)}
          </select></label>
          <p className="text-sm">내 정보 · 이름 {data.contact?.name ?? "미등록"} · {data.clubName} · 선택한 참가 부문</p>
          <p className="text-sm">개최자 필수 제출 항목 · {data.requiredFields?.map(field => fieldLabels[field]).join(" · ")}. 회장이 선택하면 동호회와 참가 부문도 전달될 수 있습니다.</p>
          <label className="flex items-start gap-2"><input className="mt-1" required type="checkbox" name="consent" />
            회장이 선택한 항목을 대회 개최자에게 제공하는 데 동의합니다.
          </label>
          {data.allowPhone && <label className="flex items-start gap-2">
            <input className="mt-1" type="checkbox" checked={phoneAllowed && !!data.contact?.phone} disabled={!data.contact?.phone} onChange={event => setPhoneAllowed(event.target.checked)} />
            전화번호 공유도 허용 · {data.contact?.phone ?? "미등록"}
          </label>}
        </>}
        <button className={primary}>응답 저장</button>
      </fieldset>
    </form>}
    <Feedback {...action} />
  </section>;
}

function Notices({ data, viewerId }: { data: Room; viewerId: string }) {
  const action = useRoomOperation(viewerId, data.id, data.clubKey);
  const [audience, setAudience] = useState<Audience>(data.open ? "all" : "yes");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<NoticePreview>();
  const effectiveAudience = data.open ? audience : "yes";
  return <section className={panel}>
    <h2 className="text-lg font-bold">쪽지 안내</h2>
    {!data.archived && <fieldset className="space-y-3" disabled={action.pending}>
      <label className="block">보낼 대상<select className={input} value={effectiveAudience} onChange={event => { setAudience(event.target.value as Audience); setPreview(undefined); }}>
        {Object.entries(audienceLabels).filter(([key]) => data.open || key === "yes").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="block">안내 내용<textarea className={input} rows={3} maxLength={1900} value={body} onChange={event => { setBody(event.target.value); setPreview(undefined); }} /></label>
      <p className="text-sm text-pul-muted">쪽지에 참여방 링크가 자동으로 붙습니다.</p>
      {preview ? <div className="space-y-2">
        <p role="status">발송 대상 · {audienceLabels[effectiveAudience]} {preview.count}명</p>
        <details><summary>수신 회원 보기</summary><ul className="mt-1 max-h-40 overflow-auto pl-4">{preview.recipients.map((name, index) => <li key={index}>{name}</li>)}</ul></details>
        <button className={button} onClick={() => setPreview(undefined)}>대상 다시 확인</button>
        <button className={primary} disabled={!preview.count} onClick={() => action.run("notice", { audience: effectiveAudience, body, token: preview.token }, () => { setBody(""); setPreview(undefined); })}>쪽지 발송 확정</button>
      </div> : <button className={button} disabled={!body.trim()} onClick={() => action.run("preview_notice", { audience: effectiveAudience }, result => setPreview(result as NoticePreview))}>발송 대상과 인원 확인</button>}
    </fieldset>}
    <Feedback {...action} />
    <h3 className="font-bold">발송 내역</h3>
    {data.notices?.length ? <ul className="space-y-2">{data.notices.map(notice => <li className="rounded-lg bg-pul-light p-3" key={notice.id}>
      <p className="font-semibold">{audienceLabels[notice.audience]} · {notice.count}명 · <KoreanDate value={notice.at} /></p>
      <p className="whitespace-pre-wrap break-words">{notice.body.split("\n\n/club-participation/")[0]}</p>
    </li>)}</ul> : <p>발송 내역이 없습니다.</p>}
  </section>;
}

function GroupEntry({ data, viewerId }: { data: Room; viewerId: string }) {
  const action = useRoomOperation(viewerId, data.id, data.clubKey);
  const [selected, setSelected] = useState<string[]>([]);
  const requiredFields = data.requiredFields ?? ["name"];
  const [fields, setFields] = useState<EntryField[]>(requiredFields);
  const [preview, setPreview] = useState<EntryPreview>();
  const candidates = data.members?.filter(member => member.response === "yes") ?? [];
  const changeSelection = (id: string) => {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
    setPreview(undefined);
  };
  const payload = { members: selected, fields };
  return <section className={panel}>
    <h2 className="text-lg font-bold">개최자에게 단체 명단 제출</h2>
    {data.submission && <div className="space-y-2">
      <p>제출 완료 · {data.submission.count}명 · {data.submittedAt && <KoreanDate value={data.submittedAt} />}</p>
      <p>제출 항목 · {data.submission.fields.map(field => fieldLabels[field]).join(" · ")}</p>
      <ul>{data.submission.members.map((member, index) => <li key={index}>{member.name} · {member.division}</li>)}</ul>
    </div>}
    {!data.submission && !data.archived && data.entryOpen && <>
      <p className="text-sm">동호회와 참가 부문은 PUL 내부 접수에 사용됩니다. 개최자에게는 아래에서 선택한 항목이 전달됩니다.</p>
      <p className="text-sm">개최자 필수 항목 · {requiredFields.map(field => fieldLabels[field]).join(" · ")}. 전화번호를 선택하면 선택한 회원 모두의 공유 동의가 필요합니다.</p>
      <fieldset disabled={action.pending} className="space-y-2">
        <legend className="font-semibold">제출할 참가 희망자</legend>
        {candidates.length ? candidates.map(member => <label className="flex items-center gap-2 py-1" key={member.id}>
          <input type="checkbox" checked={selected.includes(member.id)} disabled={!member.consented} onChange={() => changeSelection(member.id)} />
          {member.name} · {member.division}{!member.consented ? " · 공유 확인 필요" : member.phoneAllowed ? " · 전화번호 공유 동의" : ""}
        </label>) : <p>참가 응답이 없습니다.</p>}
      </fieldset>
      <fieldset disabled={action.pending} className="flex flex-wrap gap-3">
        <legend className="mb-1 font-semibold">제출 항목</legend>
        {Object.entries(fieldLabels).map(([field, label]) => <label className="inline-flex items-center gap-2" key={field}>
          <input type="checkbox" checked={fields.includes(field as EntryField)}
            disabled={requiredFields.includes(field as EntryField) || field === "phone" && !data.allowPhone}
            onChange={() => { setFields(current => current.includes(field as EntryField) ? current.filter(value => value !== field) : [...current, field as EntryField]); setPreview(undefined); }} />
          {label}{requiredFields.includes(field as EntryField) && " (필수)"}
        </label>)}
      </fieldset>
      <button className={button} disabled={action.pending || !selected.length} onClick={() => {
        setPreview(undefined);
        action.run("preview_submit", payload, result => setPreview(result as EntryPreview));
      }}>제출 명단 미리보기</button>
      {preview && <div className="space-y-2 rounded-lg border border-pul-border p-3">
        <h3 className="font-bold">개최자가 받는 명단 · {preview.members.length}명</h3>
        <div className="overflow-x-auto"><table className="w-full text-left">
          <thead><tr>{preview.fields.map(field => <th className="p-2" key={field} scope="col">{fieldLabels[field]}</th>)}</tr></thead>
          <tbody>{preview.members.map(member => <tr key={member.id} className="border-t border-pul-border">
            {preview.fields.map(field => <td className="p-2" key={field}>{member[field]}</td>)}
          </tr>)}</tbody>
        </table></div>
        <p className="text-sm">최종 제출하면 모집 응답도 마감됩니다.</p>
        <button className={primary} disabled={action.pending} onClick={() => action.run("submit", { ...payload, token: preview.token }, () => setPreview(undefined))}>개최자에게 최종 제출</button>
      </div>}
    </>}
    {!data.submission && !data.entryOpen && <p>개최자 접수 기간이 종료되었거나 접수가 닫혀 있습니다.</p>}
    <Feedback {...action} />
  </section>;
}

function KoreanDate({ value }: { value: string }) {
  return <time dateTime={value}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))}</time>;
}

export function ParticipationRoom({ data, viewerId }: { data: Room; viewerId: string }) {
  const action = useRoomOperation(viewerId, data.id, data.clubKey);
  return <>
    <header>
      <p className="font-semibold text-pul-muted">{data.clubName} · {data.kind === "monthly" ? "월례회 참가 모집" : "대회 참가 모집"}</p>
      <h1 className="text-2xl font-bold">{data.title}</h1>
      <p>{data.date && data.date + " · "}{data.archived ? "지난 참여방" : data.open ? "모집 중" : "응답 마감"}</p>
      {data.eventKey && <Link className="font-bold text-pul-point" href={"/events/" + encodeURIComponent(data.eventKey)}>대회 상세</Link>}
    </header>
    <Respond data={data} viewerId={viewerId} />
    {data.chair && <>
      <section className={panel}>
        <h2 className="text-lg font-bold">회원별 모집 응답</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(voteLabels).map(([state, label]) => {
            const rows = data.members?.filter(member => (member.response ?? "unanswered") === state) ?? [];
            return <div className="rounded-lg border border-pul-border p-3" key={state}>
              <h3 className="font-bold">{label} · {rows.length}명</h3>
              {rows.length ? <ol className="mt-1 space-y-1">{rows.map((member, index) => <li className={state === "unanswered" ? "text-pul-muted opacity-75" : ""} key={member.id}>
                {state === "yes" && (index + 1) + ". "}{member.name}{member.division && " · " + member.division}{state === "unanswered" && " · 미응답"}
              </li>)}</ol> : <p className="text-pul-muted">해당 회원 없음</p>}
            </div>;
          })}
        </div>
        {!data.archived && <div className="flex flex-wrap gap-2">
          {!data.closed && <button className={button} disabled={action.pending} onClick={() => {
            if (window.confirm("참가 모집을 마감할까요?")) action.run("close");
          }}>모집 마감</button>}
          {data.ended && <button className={button} disabled={action.pending} onClick={() => {
            if (window.confirm("지난 참여방으로 이동할까요?")) action.run("archive");
          }}>지난 참여방으로 이동</button>}
        </div>}
        <Feedback {...action} />
      </section>
      <Notices data={data} viewerId={viewerId} />
      {data.kind === "tournament" && <GroupEntry data={data} viewerId={viewerId} />}
    </>}
  </>;
}

