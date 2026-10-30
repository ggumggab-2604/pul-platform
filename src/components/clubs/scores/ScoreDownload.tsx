'use client';
import {useState} from 'react';
import s from './MonthlyScores.module.css';
import {printJpeg} from '@/lib/clubs/monthlyScoresJpeg';
export function ScoreDownload({clubKey,year,month,annual}:{clubKey:string;year:number;month:number;annual:boolean}){
 const [format,setFormat]=useState('pdf'),[direction,setDirection]=useState(annual?'landscape':'portrait'),[pages,setPages]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const url=`/clubs/${encodeURIComponent(clubKey)}/scores/download?year=${year}&month=${month}&scope=${annual?'annual':'monthly'}&orientation=${direction}`;
 const filename=`PUL_${annual?'연간월례회성적':'월례회성적'}_${year}${annual?'':`-${String(month).padStart(2,'0')}`}`;
 const save=(blob:Blob,name:string)=>{const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);};
 async function download(pageNumber?:number){setBusy(true);setError('');try{
  // Each download rechecks current membership and reloads saved data on the server.
  const response=await fetch(url,{cache:'no-store'});if(!response.ok){const x=await response.json();throw Error(x.error);}
  const bytes=await response.arrayBuffer();setPages(Number(response.headers.get('X-PDF-Pages')));
  if(format==='pdf'){save(new Blob([bytes],{type:'application/pdf'}),filename+'.pdf');return;}
  if(!pageNumber)return;
  const rendererUrl='/vendor/pdfjs/5.4.296/pdf.mjs';
  const pdfjs=await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ rendererUrl) as typeof import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/5.4.296/pdf.worker.mjs';
  const pdf=await pdfjs.getDocument({data:bytes,isEvalSupported:false}).promise;
  try{if(pageNumber>pdf.numPages)throw Error('성적표가 변경되었습니다. 페이지 목록을 다시 확인해 주세요.');const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale:300/72}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvas,viewport}).promise;const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('JPG 변환에 실패했습니다.')),'image/jpeg',.95));save(new Blob([printJpeg(new Uint8Array(await blob.arrayBuffer()))],{type:'image/jpeg'}),`${filename}_${String(pageNumber).padStart(2,'0')}.jpg`);canvas.width=canvas.height=0;
  }finally{await pdf.destroy();}
 }catch(e){setError(e instanceof Error?e.message:'다운로드하지 못했습니다. 다시 시도해 주세요.');}finally{setBusy(false);}}
 return <details className={s.download}><summary>성적표 다운로드</summary><div className={s.filters}><label>파일 형식<select aria-label="파일 형식" value={format} disabled={busy} onChange={e=>{setFormat(e.target.value);setPages(0);}}><option value="pdf">PDF</option><option value="jpg">JPG</option></select></label><label>A4 방향<select aria-label="A4 방향" value={direction} disabled={busy} onChange={e=>{setDirection(e.target.value);setPages(0);}}><option value="portrait">세로</option><option value="landscape">가로</option></select></label><button className={`${s.button} ${s.primary}`} disabled={busy} onClick={()=>download()}>{busy?'준비 중…':format==='pdf'?'PDF 다운로드':'JPG 페이지 목록'}</button></div><p className={s.hint}>저장된 전체 명단을 출력합니다. {format==='jpg'?'PDF와 같은 페이지를 300dpi 크기로 변환합니다.':''}</p>{pages>0&&<p className={s.hint}>총 {pages}페이지</p>}{format==='jpg'&&pages>0&&<div className={s.actions}>{Array.from({length:pages},(_,i)=><button className={s.button} key={i} disabled={busy} onClick={()=>download(i+1)}>{i+1}페이지 JPG 저장</button>)}</div>}{error&&<p role="alert" className={s.error}>{error}</p>}</details>;
}
