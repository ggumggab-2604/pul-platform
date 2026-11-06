import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument,rgb,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {annualScoreColumns,annualScores,monthlyGameLabels,selectScoreSheet,rankScores,rankLabel,personKind,type MonthlyWorkspace} from './monthlyScores';

export async function monthlyScoresPdf(data:MonthlyWorkspace,month:number,annual:boolean,landscape:boolean) {
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 // Full TTF avoids missing CJK outlines in fontkit subsets; the bundled font uses direct Unicode glyphs for searchable text.
 const font=await doc.embedFont(await readFile(path.join(process.cwd(),'src/assets/fonts/NotoSansKR-Regular.ttf')),{subset:false});
 const [width,height]=landscape?[841.89,595.28]:[595.28,841.89], margin=30, bottom=42, usable=width-2*margin;
 const ink=rgb(.14,.23,.19),green=rgb(.025,.306,.231),pale=rgb(.93,.96,.94),border=rgb(.82,.88,.84);
 const title=`${data.year}년 ${annual?'연간 월례회 성적':`${month}월 월례회 성적`}`;
 doc.setTitle(`${data.clubName} ${title}`);doc.setLanguage('ko-KR');doc.setCreator('PUL');
 let page:PDFPage,y=0,columns:number[]=[],headers:string[]=[],size=annual?8.5:10,section='';
 let gameHeadings:string[]=[];
 const wrap=(text:string,w:number,pt:number)=>{
  const lines:string[]=[];
  for(const paragraph of text.replace(/\r/g,'').split('\n')){let line='';for(const ch of paragraph){if(line&&font.widthOfTextAtSize(line+ch,pt)>w){lines.push(line);line='';}line+=ch;}lines.push(line);}
  return lines;
 };
 const text=(value:string,x:number,top:number,pt:number=size,color=ink)=>page.drawText(value,{x,y:top-pt,size:pt,font,color});
 const padding=(i:number)=>gameHeadings.length&&i>=2?1.5:4;
 const linesFor=(cells:string[])=>cells.map((v,i)=>wrap(v,columns[i]-padding(i)*2,size));
 const rowHeight=(cells:string[])=>Math.max(24,...linesFor(cells).map(x=>x.length*(size+4)+10));
 const row=(cells:string[],heading=false)=>{
  const lines=linesFor(cells),h=rowHeight(cells);let x=margin;
  for(let i=0;i<cells.length;i++){page.drawRectangle({x,y:y-h,width:columns[i],height:h,borderColor:border,borderWidth:.4,...(heading?{color:pale}:{})});lines[i].forEach((v,j)=>text(v,x+padding(i),y-5-j*(size+4),size,heading?green:ink));x+=columns[i];}y-=h;
 };
 const newPage=()=>{page=doc.addPage([width,height]);y=height-margin;text(title,margin,y,17,green);y-=26;
  for(const line of wrap(`${data.clubName} · 18홀 · 남녀 통합`,usable,10)){text(line,margin,y,10);y-=14;}
  text(section,margin,y,9);y-=19;
  if(gameHeadings.length){let x=margin;const widths=[columns[0],columns[1],...gameHeadings.map((_,i)=>columns[2+i*2]+columns[3+i*2])];
   widths.forEach((w,i)=>{page.drawRectangle({x,y:y-35,width:w,height:35,borderColor:border,borderWidth:.4,color:pale});if(i>=2){wrap(gameHeadings[i-2],w-6,size).forEach((label,j)=>text(label,x+(w-font.widthOfTextAtSize(label,size))/2,y-5-j*(size+2),size,green));}x+=w;});y-=35;
  }
  row(headers,true);
 };
 const addRow=(cells:string[])=>{if(y-rowHeight(cells)<bottom)newPage();row(cells);};
 if(annual){
  const people=annualScores(data.sheets),games=annualScoreColumns(data.sheets),pageSize=landscape?12:6;
  if(!data.sheets.length)throw Error('저장된 성적표가 없습니다.');
  for(let start=0;start<games.length;start+=pageSize){
   const shown=games.slice(start,start+pageSize),count=shown.length,pair=(usable-158)/pageSize;
   gameHeadings=shown.map(({label,sheet})=>sheet?.gameType?`${label}\n${monthlyGameLabels[sheet.gameType]}`:label);
   columns=[89,69,...Array.from({length:count},()=>[pair*.6,pair*.4]).flat()];
   headers=['이름','회원 구분',...Array.from({length:count},()=>['타수','순위']).flat()];
   section='동일 순위는 공동 순위입니다. · — 기록 없음 / 미입력: 타수 미기재';
   newPage();for(const p of people)addRow([p.name+(p.kind==='manual'?`\n${p.id.slice(0,8)}`:''),p.kind==='manual'?'동호회\n미가입회원':personKind(p),...p.cells.slice(start,start+count).flatMap(c=>[c?String(c.score??'미입력'):'—',String(c?.rank??'—')])]);
  }
 }else{
  const sheet=selectScoreSheet(data.sheets,month);if(!sheet)throw Error('저장된 성적표가 없습니다.');
  columns=[70,usable-250,110,70];headers=['순위','이름','회원 구분','총타수'];section=`${sheet.date} · ${sheet.gameType?monthlyGameLabels[sheet.gameType]:'종류 미확인'} · ${sheet.rows.length}명 · 미입력 ${sheet.rows.filter(r=>r.score===null).length}명`;
  newPage();for(const p of rankScores(sheet.rows))addRow([rankLabel(p),p.name+(p.kind==='manual'?`\n수동 명단 ${p.id.slice(0,8)}`:''),personKind(p),p.score===null?'미입력':`${p.score}타`]);
 }
 // Continue notes in remaining space; the same headers repeat whenever notes cross a page.
 gameHeadings=[];columns=[usable*.38,usable*.62];headers=['경기 정보','경기 비고'];section='경기별 비고';size=annual?8.5:10;
 const noteGames=annual?annualScoreColumns(data.sheets).filter(({sheet})=>sheet):[{sheet:selectScoreSheet(data.sheets,month),label:''}];
 const notes=noteGames.map(({sheet:s,label})=>[`${label?label+' · ':''}${s!.title} · ${s!.date}\n${s!.gameType?monthlyGameLabels[s!.gameType]:'종류 미확인'} · ${s!.course}`,s!.note||'등록된 비고가 없습니다.']);
 const firstHeight=notes.length?Math.min(rowHeight(notes[0]),120):0;
 if(y-20-rowHeight(headers)-firstHeight<bottom)newPage();else{y-=16;text('경기별 비고',margin,y,10,green);y-=18;row(headers,true);}
 for(const cells of notes){let lines=linesFor(cells);
  while(lines.some(a=>a.length)){
   let available=Math.floor((y-bottom-10)/(size+4));if(available<1){newPage();available=Math.floor((y-bottom-10)/(size+4));}
   const max=Math.max(...lines.map(a=>a.length));
   if(max>available&&max*(size+4)+10<height-150){newPage();continue;}
   const chunk=lines.map(a=>a.slice(0,available).join('\n'));row(chunk);lines=lines.map(a=>a.slice(available));
   if(lines.some(a=>a.length))newPage();
  }
 }
 const pages=doc.getPages();pages.forEach((p,i)=>{page=p;text(`${i+1} / ${pages.length}`,width-margin-45,24,9);});
 return {bytes:await doc.save(),pages:pages.length};
}
