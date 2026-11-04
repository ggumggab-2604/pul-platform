'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { loadMyApplicationPhones, saveMemberBasics } from '@/app/my/basicsActions';
import { monthlyGenderLabels, type ApplicationPhone, type MemberBasics, type MonthlyGender } from '@/lib/auth/memberBasics';

const empty = { gender: '', phone: '', birthYear: '', birthMonth: '', birthDay: '' };
const field = 'mt-2 min-h-12 w-full min-w-0 rounded-xl border border-pul-border bg-white px-3 text-base';
const button = 'inline-flex min-h-11 items-center rounded-lg border border-pul-border px-3 font-semibold text-pul-deep disabled:opacity-60';
const dateLabel = new Intl.DateTimeFormat('ko-KR',{dateStyle:'medium',timeZone:'Asia/Seoul'});

export function MemberBasicsForm({ viewerId, initial }: { viewerId: string; initial: MemberBasics | null }) {
 const [draft,setDraft] = useState({
  gender: initial?.gender ?? '', phone: initial?.phone ?? '', birthYear: String(initial?.birthYear ?? ''),
  birthMonth: String(initial?.birthMonth ?? ''), birthDay: String(initial?.birthDay ?? ''),
 });
 const [hasSaved,setHasSaved] = useState(Boolean(initial));
 const [message,setMessage] = useState('');
 const [error,setError] = useState('');
 const [choices,setChoices] = useState<ApplicationPhone[] | null>(null);
 const [choice,setChoice] = useState('');
 const [busy,start] = useTransition();
 const change = (key: keyof typeof draft, value: string) => setDraft(old => ({...old,[key]:value}));

 function persist(remove = false) {
  setError('');
  setMessage('');
  const next = remove ? empty : draft;
  if (next.birthYear && !/^\d{4}$/.test(next.birthYear)) {
   setError('출생연도를 네 자리로 입력해 주세요.');
   return;
  }
  start(async () => {
   try {
    const result = await saveMemberBasics(viewerId,{
     gender:(next.gender || null) as MonthlyGender | null, phone:next.phone.trim() || null,
     birthYear:next.birthYear ? Number(next.birthYear) : null,
     birthMonth:next.birthMonth ? Number(next.birthMonth) : null,
     birthDay:next.birthDay ? Number(next.birthDay) : null,
    });
    if (result.error) { setError(result.error); return; }
    setDraft({...next,phone:next.phone.trim()});
    setHasSaved(Object.values(next).some(value => Boolean(value.trim())));
    setChoices(null);
    setChoice('');
    setMessage(remove ? '기본정보를 삭제했습니다.' : '기본정보를 저장했습니다.');
   } catch { setError('연결을 확인한 뒤 다시 시도해 주세요. 입력은 유지됩니다.'); }
  });
 }

 function openChoices() {
  setError('');
  start(async () => {
   try {
    const result = await loadMyApplicationPhones(viewerId);
    if (result.error) setError(result.error);
    else { setChoices(result.choices ?? []); setChoice(''); }
   } catch { setError('가입 신청서 번호를 불러오지 못했습니다.'); }
  });
 }

 function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!busy) persist();
 }

 return <form onSubmit={submit} className="space-y-5">
  <fieldset disabled={busy} className="min-w-0 space-y-5">
   <label className="block font-semibold">남녀 구분
    <select className={field} value={draft.gender} onChange={event=>change('gender',event.target.value)}>
     <option value="">미입력</option>
     {Object.entries(monthlyGenderLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
    <span className="mt-1 block text-sm font-normal text-pul-muted">월례회 분류에 사용합니다. 비워 두어도 참가할 수 있습니다.</span>
   </label>
   <div>
    <label className="block font-semibold">전화번호 (선택)
     <input className={field} type="tel" autoComplete="tel" maxLength={30} value={draft.phone} onChange={event=>change('phone',event.target.value)}/>
    </label>
    <p className="mt-1 text-sm text-pul-muted">본인이 입력한 비공개 연락처입니다.</p>
    <button type="button" className="mt-1 min-h-11 text-left text-sm font-bold text-pul-point underline" onClick={openChoices}>내 가입 신청서의 전화번호 가져오기</button>
    {choices && <div className="mt-2 space-y-2 rounded-lg border border-pul-border p-3">
     {choices.length ? <>
      <label className="block text-sm font-semibold">신청서 선택
       <select className={field} value={choice} onChange={event=>setChoice(event.target.value)}>
        <option value="">동호회와 신청일을 확인해 주세요</option>
        {choices.map(item=><option key={item.id} value={item.id}>{item.club} · {dateLabel.format(new Date(item.submittedAt))} · {item.phone}</option>)}
       </select>
      </label>
      <button type="button" className={button} disabled={!choice} onClick={()=>{
       const selected = choices.find(item=>item.id===choice);
       if (selected) { change('phone',selected.phone); setMessage('편집란에 번호를 넣었습니다. 확인 후 기본정보를 저장해 주세요.'); }
       setChoices(null);
      }}>선택한 번호 사용</button>
     </> : <p className="text-sm text-pul-muted">가져올 가입 신청서 번호가 없습니다.</p>}
     <button type="button" className={`${button} ml-2`} onClick={()=>setChoices(null)}>닫기</button>
    </div>}
   </div>
   <label className="block font-semibold">출생연도 (선택)
    <input className={field} inputMode="numeric" maxLength={4} placeholder="예: 1968" value={draft.birthYear} onChange={event=>change('birthYear',event.target.value)}/>
    <span className="mt-1 block text-sm font-normal text-pul-muted">향후 대회별 시니어 부문 확인에 사용합니다.</span>
   </label>
   <fieldset className="min-w-0">
    <legend className="font-semibold">생월일 (선택)</legend>
    <div className="grid grid-cols-2 gap-3">
     <select className={field} aria-label="태어난 월" value={draft.birthMonth} onChange={event=>change('birthMonth',event.target.value)}>
      <option value="">월 미입력</option>
      {Array.from({length:12},(_,i)=><option key={i} value={i+1}>{i+1}월</option>)}
     </select>
     <select className={field} aria-label="태어난 일" value={draft.birthDay} onChange={event=>change('birthDay',event.target.value)}>
      <option value="">일 미입력</option>
      {Array.from({length:31},(_,i)=><option key={i} value={i+1}>{i+1}일</option>)}
     </select>
    </div>
   </fieldset>
   <div className="flex flex-wrap gap-2">
    <button type="submit" className={`${button} border-pul-point bg-pul-point text-white`}>{busy?'처리 중…':'기본정보 저장'}</button>
    {hasSaved && <button type="button" className={button} onClick={()=>{if (window.confirm('저장한 기본정보를 삭제할까요?')) persist(true);}}>기본정보 삭제</button>}
   </div>
  </fieldset>
  {message && <p role="status" className="text-sm font-semibold text-pul-deep">{message}</p>}
  {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
 </form>;
}
