// Source pages are independent of the YouTube-only video URL contract.
export function materialSourceUrl(raw: unknown): string | null {
 if (raw == null || raw === "") return null;
 if (typeof raw !== "string") throw Error("출처 링크는 HTTP/HTTPS 웹 주소로 입력해 주세요.");
 const value=raw.trim();if(!value)return null;
 try {
  if(!/^https?:\/\//i.test(value)||/[\s\\\u0000-\u001f\u007f]/u.test(value))throw Error();
  const url=new URL(value),normalized=url.href;
  if(url.username||url.password||normalized.length>2048||!/^https?:\/\/([a-z0-9_-]+(?:\.[a-z0-9_-]+)*|\[[0-9a-f:.]+\])(?::[0-9]{1,5})?(?:[/?#][^\s\\]*)?$/i.test(normalized))throw Error();
  return normalized;
 } catch { throw Error("출처 링크는 HTTP/HTTPS 웹 주소로 입력해 주세요."); }
}
export function materialSource(source: string | null | undefined, sourceUrl?: string | null) {
 const name=source?.trim()||null;
 if(sourceUrl){try{return {name,url:materialSourceUrl(sourceUrl)};}catch{return {name,url:null};}}
 // Interpret existing URL-only values without rewriting stored rows.
 if(name){try{const url=materialSourceUrl(name);if(url)return {name:null,url};}catch{}}
 return {name,url:null};
}
