export function safeMaterialReturn(raw:unknown,key:string){
 const fallback="/courses/"+encodeURIComponent(key)+"/resources";
 if(typeof raw!=="string"||!raw.startsWith("/")||raw.startsWith("//")||/[\\\x00-\x1f]/.test(raw))return fallback;
 try{const url=new URL(raw,"https://pul.invalid");if(url.origin!=="https://pul.invalid"||url.pathname!==fallback)return fallback;const q=new URLSearchParams();for(const k of ["q","kind","saved","page","returnTo"]){const v=url.searchParams.get(k);if(v!==null)q.set(k,v);}return fallback+(q.size?"?"+q.toString():"");}catch{return fallback;}
}
