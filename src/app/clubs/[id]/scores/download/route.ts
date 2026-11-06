import {loadMonthlyScores} from '@/lib/clubs/monthlyScoresServer';
import {scorePeriod,selectScoreSheet} from '@/lib/clubs/monthlyScores';
import {monthlyScoresPdf} from '@/lib/clubs/monthlyScoresPdf';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const query=new URL(request.url).searchParams;let period;
 try{period=scorePeriod(query.get('year'),query.get('month'));if(!['monthly','annual'].includes(query.get('scope')??'monthly')||!['portrait','landscape'].includes(query.get('orientation')??'portrait'))throw Error();}
 catch{return Response.json({error:'출력 기간과 방향을 확인해 주세요.'},{status:400,headers});}
 let data;
 try{data=await loadMonthlyScores((await params).id,period.year);}
 catch{return Response.json({error:'로그인과 현재 동호회 회원 자격을 확인해 주세요.'},{status:403,headers});}
 const annual=query.get('scope')==='annual',game=query.get('game');
 const sheet=selectScoreSheet(data.sheets,period.month,query.get('sheet'));
 const sheets=annual?data.sheets.filter(s=>!game||s.gameType===game):sheet?[sheet]:[];
 if(!sheets.length)return Response.json({error:'저장된 성적표가 없습니다.'},{status:404,headers});
 try{
  const pdf=await monthlyScoresPdf({...data,sheets},period.month,annual,query.get('orientation')==='landscape');
  const filename=annual?`PUL_annual_${period.year}_${period.month}`:`PUL_monthly_${sheet!.date}_${sheet!.id}`;
  return new Response(new Uint8Array(pdf.bytes),{headers:{...headers,'Content-Type':'application/pdf','X-PDF-Pages':String(pdf.pages),'Content-Disposition':`attachment; filename="${filename}.pdf"`}});
 }catch{return Response.json({error:'출력 파일을 만들지 못했습니다. 다시 시도해 주세요.'},{status:500,headers});}
}
