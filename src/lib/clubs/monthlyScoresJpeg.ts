// Canvas defaults to 96 dpi metadata; retain its pixels and mark the A4 export as 300 dpi.
export function printJpeg(bytes:Uint8Array) {
 if(bytes[0]!==255||bytes[1]!==216)throw Error('JPG 파일 형식을 확인할 수 없습니다.');
 const result=bytes.slice();let offset=2;
 while(offset+18<=result.length && result[offset]===255){
  const marker=result[offset+1],length=(result[offset+2]<<8)|result[offset+3];
  if(marker===218||marker===217||length<2||offset+length+2>result.length)break;
  if(marker===224 && length>=16 && String.fromCharCode(...result.slice(offset+4,offset+9))==='JFIF\0'){
   result[offset+11]=1;result[offset+12]=1;result[offset+13]=44;result[offset+14]=1;result[offset+15]=44;return result;
  }
  offset+=length+2;
 }
 const jfif=new Uint8Array([255,224,0,16,74,70,73,70,0,1,1,1,1,44,1,44,0,0]);
 const output=new Uint8Array(bytes.length+jfif.length);output.set(bytes.slice(0,2));output.set(jfif,2);output.set(bytes.slice(2),20);return output;
}
