import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument,rgb,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {officialRank,resultLabel,type Tournament} from './tournaments';
export async function tournamentPdf(club:string,t:Tournament,landscape:boolean){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);const font=await doc.embedFont(await readFile(path.join(process.cwd(),'src/assets/fonts/NotoSansKR-Regular.ttf')),{subset:false});
 const [w,h]=landscape?[841.89,595.28]:[595.28,841.89],margin=30,width=w-60,ink=rgb(.1,.16,.12),border=rgb(.72,.76,.73);let page:PDFPage,y=0;
 const widths=[width*.19,width*.2,width*.16,width*.18,width*.27],headers=['이름 · 회원 구분','참가 부문','공식 순위','최종 타수','참가·결과 상태'];
 const wrap=(str:string,max:number,size=10)=>{const out:string[]=[];for(const para of str.split(/\r?\n/)){let line='';for(const c of para){if(line&&font.widthOfTextAtSize(line+c,size)>max){out.push(line);line='';}line+=c;}out.push(line);}return out;};
 const text=(str:string,x:number,top:number,size=10)=>page.drawText(str,{x,y:top-size,size,font,color:ink});
 const row=(cells:string[],heading=false)=>{const lines=cells.map((v,i)=>wrap(v,widths[i]-10)),height=Math.max(28,...lines.map(l=>l.length*14+10));if(y-height<45)newPage();let x=margin;lines.forEach((ls,i)=>{page.drawRectangle({x,y:y-height,width:widths[i],height,borderColor:border,borderWidth:.5,...(heading?{color:rgb(.94,.96,.94)}:{})});ls.forEach((line,j)=>text(line,x+5,y-5-j*14));x+=widths[i];});y-=height;};
 const newPage=()=>{page=doc.addPage([w,h]);y=h-margin;text('대회 성적표',margin,y,18);y-=28;for(const str of [club,`${t.title} · ${t.played_on}`,`${t.course_name}${t.format_note?` · ${t.format_note}`:''}`])for(const line of wrap(str,width,11)){text(line,margin,y,11);y-=16;}text('주최 측 공식 순위 · 확인 전 기록은 공식 집계 대상이 아닙니다.',margin,y,9);y-=23;row(headers,true);};
 newPage();for(const e of t.entries)row([`${e.display_name}\n${e.kind==='manual'?'동호회 미가입회원':'동호회 회원'}${t.entries.filter(x=>x.display_name===e.display_name).length>1?` · ${e.person_id?.slice(-4)}`:''}`,e.division,e.confirmed?officialRank(e):'확인 전',e.confirmed?(e.score===null?'미입력':`${e.score}타`):'확인 전',resultLabel(e)]);
 if(t.note){y-=18;for(const line of wrap(`경기 비고: ${t.note}`,width)){if(y<60)newPage();text(line,margin,y);y-=15;}}
 const pages=doc.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:w/2-12,y:20,size:9,font,color:ink}));doc.setTitle(`${club} ${t.title} 성적표`);doc.setLanguage('ko-KR');return {bytes:await doc.save(),pages:pages.length};
}
