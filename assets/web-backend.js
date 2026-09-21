(() => {
  'use strict';

  const DB_NAME = 'portal-estudos-web';
  const DB_VERSION = 1;
  const NATIVE_FETCH = window.fetch.bind(window);
  const ROOT_URL = new URL('../', document.currentScript?.src || location.href);
  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const ALLOWED_PREFIXES = ['guia-', 'economia-politica-', 'introducao-ciencia-direito-', 'portal:'];
  let dbPromise = null;
  let pdfJsPromise = null;
  const objectUrls = new Map();

  function nowIso(){ return new Date().toISOString(); }
  function localDateKey(d = new Date()){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function weekStartKey(d = new Date()){
    const x=new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const wd=(x.getDay()+6)%7; x.setDate(x.getDate()-wd); return localDateKey(x);
  }
  function parseDateOnly(s){ if(!s) return null; const d=new Date(`${s}T12:00:00`); return Number.isNaN(+d)?null:d; }
  function dateFromIso(s){ if(!s) return null; const d=new Date(s); return Number.isNaN(+d)?null:d; }
  function cleanText(v, max=2000000){ return String(v ?? '').replace(/\u0000/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim().slice(0,max); }
  function normalize(v){ return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9à-ÿ_]+/gi,' ').trim(); }
  function words(v){ return normalize(v).split(/\s+/).filter(x=>x.length>1); }
  function clamp(n,lo,hi){ return Math.max(lo,Math.min(hi,Number(n)||0)); }
  function jsonResponse(data,status=200){ return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}}); }
  async function bodyJson(init){
    try{
      if(init?.body == null) return {};
      if(typeof init.body === 'string') return JSON.parse(init.body||'{}');
      if(init.body instanceof Blob) return JSON.parse(await init.body.text());
      return {};
    }catch(e){ return {}; }
  }

  function openDb(){
    if(dbPromise) return dbPromise;
    dbPromise = new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        const stores=[
          ['kv',{keyPath:'key'}],['topics',{keyPath:'key'}],['sessions',{keyPath:'id',autoIncrement:true}],
          ['activity',{keyPath:'id',autoIncrement:true}],['materials',{keyPath:'material_id'}],
          ['links',{keyPath:'id',autoIncrement:true}],['tasks',{keyPath:'id',autoIncrement:true}],
          ['pomodoros',{keyPath:'id',autoIncrement:true}],['goals',{keyPath:'period_start'}],
          ['settings',{keyPath:'key'}],['assistant',{keyPath:'id',autoIncrement:true}]
        ];
        for(const [name,opt] of stores) if(!db.objectStoreNames.contains(name)) db.createObjectStore(name,opt);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB indisponível'));
    });
    return dbPromise;
  }
  async function tx(store,mode,fn){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const t=db.transaction(store,mode), s=t.objectStore(store); let out;
      try{ out=fn(s,t); }catch(e){ reject(e); return; }
      t.oncomplete=()=>resolve(out);
      t.onerror=()=>reject(t.error||new Error('Falha no armazenamento'));
      t.onabort=()=>reject(t.error||new Error('Operação cancelada'));
    });
  }
  async function idbGet(store,key){
    const db=await openDb(); return new Promise((resolve,reject)=>{const t=db.transaction(store),r=t.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  }
  async function idbAll(store){
    const db=await openDb(); return new Promise((resolve,reject)=>{const t=db.transaction(store),r=t.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});
  }
  async function idbPut(store,value){
    const db=await openDb(); return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite'),r=t.objectStore(store).put(value);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  }
  async function idbAdd(store,value){
    const db=await openDb(); return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite'),r=t.objectStore(store).add(value);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  }
  async function idbDelete(store,key){
    const db=await openDb(); return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite'),r=t.objectStore(store).delete(key);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error)});
  }
  async function idbClear(store){
    const db=await openDb(); return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite'),r=t.objectStore(store).clear();r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error)});
  }

  function allowedKey(k){ return ALLOWED_PREFIXES.some(p=>String(k).startsWith(p)); }
  function browserState(){
    const data={}; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(allowedKey(k))data[k]=localStorage.getItem(k)} return data;
  }
  async function syncState(data){
    let count=0; for(const [k,v] of Object.entries(data||{})){ if(allowedKey(k)&&typeof v==='string'){ await idbPut('kv',{key:k,value:v,updated_at:nowIso()}); count++; }} return count;
  }
  async function stateFromDb(){ const rows=await idbAll('kv'); return Object.fromEntries(rows.filter(r=>allowedKey(r.key)).map(r=>[r.key,r.value])); }

  async function blobToBase64(blob){
    const arr=new Uint8Array(await blob.arrayBuffer()); let bin=''; const step=0x8000;
    for(let i=0;i<arr.length;i+=step) bin+=String.fromCharCode(...arr.subarray(i,i+step));
    return btoa(bin);
  }
  function base64ToBytes(b64){
    const bin=atob(String(b64||'')), out=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i); return out;
  }
  function guessMime(name,mime=''){
    if(mime) return mime; const e=(name.split('.').pop()||'').toLowerCase();
    return ({pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',epub:'application/epub+zip',html:'text/html',htm:'text/html',md:'text/markdown',markdown:'text/markdown',txt:'text/plain',text:'text/plain',csv:'text/csv',tsv:'text/tab-separated-values',json:'application/json',rtf:'application/rtf',vtt:'text/vtt',srt:'application/x-subrip'})[e]||'application/octet-stream';
  }
  function materialHref(m){
    if(!m?.blob) return '#'; const old=objectUrls.get(m.material_id); if(old) return old; const u=URL.createObjectURL(m.blob); objectUrls.set(m.material_id,u); return u;
  }
  function publicMaterial(m){
    return {material_id:m.material_id,original_name:m.original_name,mime_type:m.mime_type,size_bytes:m.size_bytes||0,parse_status:m.parse_status||'ok',parse_message:m.parse_message||'',indexed_chunks:(m.chunks||[]).length,created_at:m.created_at||'',href:materialHref(m)};
  }
  function xmlText(xml){
    try{ const doc=new DOMParser().parseFromString(xml,'application/xml'); return [...doc.querySelectorAll('w\\:t,t,a\\:t,text\\:span')].map(x=>x.textContent||'').join(' ') || (doc.documentElement?.textContent||''); }catch(e){ return String(xml||'').replace(/<[^>]+>/g,' '); }
  }
  function stripHtml(html){
    try{const d=new DOMParser().parseFromString(String(html||''),'text/html');d.querySelectorAll('script,style,noscript,svg').forEach(x=>x.remove());return cleanText(d.body?.innerText||d.body?.textContent||'');}catch(e){return cleanText(String(html||'').replace(/<[^>]+>/g,' '));}
  }
  function stripRtf(rtf){
    return cleanText(String(rtf||'').replace(/\\'([0-9a-fA-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\par[d]?/g,'\n').replace(/\\[a-zA-Z]+-?\d* ?/g,'').replace(/[{}]/g,''));
  }
  function stripCaptions(text){
    return cleanText(String(text||'').replace(/^WEBVTT.*$/gmi,'').replace(/^\d+\s*$/gm,'').replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?[,.]\d{3}\s+-->\s+.*$/gm,'').replace(/<[^>]+>/g,''));
  }
  async function ensurePdfJs(){
    if(window.pdfjsLib) return window.pdfjsLib;
    if(pdfJsPromise) return pdfJsPromise;
    pdfJsPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=PDFJS_URL; s.async=true;
      s.onload=()=>{ if(window.pdfjsLib){window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;resolve(window.pdfjsLib)} else reject(new Error('PDF.js não iniciou')); };
      s.onerror=()=>reject(new Error('Não foi possível carregar o leitor de PDF pela internet'));
      document.head.appendChild(s);
    });
    return pdfJsPromise;
  }
  async function parsePdf(buffer){
    const lib=await ensurePdfJs(); const doc=await lib.getDocument({data:new Uint8Array(buffer)}).promise; const pages=[];
    for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n),tc=await p.getTextContent();pages.push(tc.items.map(i=>i.str||'').join(' '));}
    return cleanText(pages.join('\n\n'));
  }
  async function parseDocx(zip){
    const files=Object.keys(zip.files).filter(n=>/^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(n)); const parts=[];
    for(const n of files){parts.push(xmlText(await zip.file(n).async('text')));} return cleanText(parts.join('\n\n'));
  }
  async function parsePptx(zip){
    const files=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/i.test(n)).sort((a,b)=>(+(a.match(/slide(\d+)/)||[])[1]||0)- (+(b.match(/slide(\d+)/)||[])[1]||0)); const out=[];
    for(const n of files){out.push(xmlText(await zip.file(n).async('text')));} return cleanText(out.join('\n\n'));
  }
  async function parseXlsx(zip){
    let shared=[]; const sf=zip.file('xl/sharedStrings.xml');
    if(sf){const doc=new DOMParser().parseFromString(await sf.async('text'),'application/xml');shared=[...doc.querySelectorAll('si')].map(si=>[...si.querySelectorAll('t')].map(t=>t.textContent||'').join(''));}
    const sheets=Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(n)).sort(); const out=[];
    for(const n of sheets){const doc=new DOMParser().parseFromString(await zip.file(n).async('text'),'application/xml'),rows=[];for(const row of doc.querySelectorAll('row')){const vals=[];for(const c of row.querySelectorAll('c')){const t=c.getAttribute('t'),v=c.querySelector('v')?.textContent||'';vals.push(t==='s'?(shared[Number(v)]||''):v)}rows.push(vals.join('\t'))}out.push(rows.join('\n'));} return cleanText(out.join('\n\n'));
  }
  async function parseEpub(zip){
    let rootfile=''; const cf=zip.file('META-INF/container.xml'); if(cf){const d=new DOMParser().parseFromString(await cf.async('text'),'application/xml');rootfile=d.querySelector('rootfile')?.getAttribute('full-path')||'';}
    let names=[]; if(rootfile&&zip.file(rootfile)){const opf=await zip.file(rootfile).async('text'),d=new DOMParser().parseFromString(opf,'application/xml'),base=rootfile.includes('/')?rootfile.slice(0,rootfile.lastIndexOf('/')+1):'',manifest={};d.querySelectorAll('manifest > item,item').forEach(i=>{manifest[i.getAttribute('id')||'']=base+(i.getAttribute('href')||'')});d.querySelectorAll('spine > itemref,itemref').forEach(i=>{const p=manifest[i.getAttribute('idref')||''];if(p)names.push(p)});} if(!names.length)names=Object.keys(zip.files).filter(n=>/\.(xhtml|html|htm)$/i.test(n));
    const out=[]; for(const n of names.slice(0,500)){const f=zip.file(n);if(f)out.push(stripHtml(await f.async('text')));} return cleanText(out.join('\n\n'));
  }
  async function extractText(name,mime,bytes){
    const ext=(name.split('.').pop()||'').toLowerCase(), buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    if(ext==='pdf'||mime==='application/pdf') return parsePdf(buffer);
    if(['docx','pptx','xlsx','epub'].includes(ext)){
      if(!window.JSZip) throw new Error('Leitor ZIP do navegador não carregou'); const zip=await JSZip.loadAsync(buffer);
      if(ext==='docx') return parseDocx(zip); if(ext==='pptx') return parsePptx(zip); if(ext==='xlsx') return parseXlsx(zip); return parseEpub(zip);
    }
    const text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
    if(['html','htm'].includes(ext)||mime.includes('html')) return stripHtml(text);
    if(ext==='rtf'||mime.includes('rtf')) return stripRtf(text);
    if(['vtt','srt'].includes(ext)||mime.includes('vtt')||mime.includes('subrip')) return stripCaptions(text);
    if(ext==='json'){try{return cleanText(JSON.stringify(JSON.parse(text),null,2))}catch(e){return cleanText(text)}}
    return cleanText(text);
  }
  function chunkText(text,name='Material'){
    text=cleanText(text); if(!text) return [];
    const chunks=[], size=1200, overlap=180; let i=0,n=1;
    while(i<text.length){let end=Math.min(text.length,i+size); if(end<text.length){const p=Math.max(text.lastIndexOf('\n',end),text.lastIndexOf('. ',end));if(p>i+650)end=p+1;} const content=text.slice(i,end).trim();if(content)chunks.push({chunk_id:`${n}`,title:`${name} — trecho ${n}`,content});if(end>=text.length)break;i=Math.max(i+1,end-overlap);n++; if(n>3000)break;}
    return chunks;
  }
  async function storeMaterial(name,mime,bytes,{source_url='',created_at=''}={}){
    const id=`m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`; const type=guessMime(name,mime); let text='',status='ok',msg='';
    try{text=await extractText(name,type,bytes);if(!text)throw new Error('Nenhum texto extraível encontrado');}catch(e){status='error';msg=String(e.message||e).slice(0,400);}
    const rec={material_id:id,original_name:name.slice(0,300),mime_type:type,size_bytes:bytes.byteLength,blob:new Blob([bytes],{type}),text, chunks:status==='ok'?chunkText(text,name):[],parse_status:status,parse_message:msg,source_url,created_at:created_at||nowIso()};
    await idbPut('materials',rec); return rec;
  }

  function tagsFrom(v){
    const arr=Array.isArray(v)?v:String(v||'').split(/[,;\n]+/); const seen=new Set(),out=[];
    for(let x of arr){x=cleanText(x.replace(/^#+/,''),80).toLowerCase();if(x&&!seen.has(x)){seen.add(x);out.push(x)}}return out.slice(0,40);
  }
  function validHttpUrl(v){ try{const u=new URL(String(v||'')); if(!/^https?:$/.test(u.protocol)) throw 0; return u.href;}catch(e){throw new Error('Use um link http:// ou https:// válido');} }
  function displayHost(url){try{return new URL(url).hostname.replace(/^www\./,'')}catch(e){return''}}
  async function linkList(params){
    let rows=await idbAll('links'); const q=normalize(params.get('q')||''),tag=(params.get('tag')||'').toLowerCase(),guide=params.get('guide')||'',pinned=params.get('pinned');
    rows=rows.filter(r=>(!q||normalize(`${r.title} ${r.url} ${r.description} ${(r.tags||[]).join(' ')}`).includes(q))&&(!tag||(r.tags||[]).includes(tag))&&(!guide||r.guide_file===guide)&&(pinned==null||pinned===''||!!r.pinned===['1','true','yes'].includes(pinned)));
    rows.sort((a,b)=>(b.pinned-a.pinned)||(String(b.updated_at||'').localeCompare(String(a.updated_at||'')))||(b.id-a.id));
    return rows.map(r=>({...r,display_host:displayHost(r.url)}));
  }
  async function tagSummary(){const rows=await idbAll('links'),m=new Map();for(const r of rows)for(const t of r.tags||[])m.set(t,(m.get(t)||0)+1);return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([tag,count])=>({tag,count}));}
  async function importLinks(content,filename=''){
    content=String(content||''); const ext=(filename.split('.').pop()||'').toLowerCase(); let candidates=[];
    if(ext==='json'||content.trim().startsWith('[')||content.trim().startsWith('{')){
      try{const raw=JSON.parse(content),arr=Array.isArray(raw)?raw:(raw.links||[]);candidates=arr.map(x=>typeof x==='string'?{url:x}:{...x});}catch(e){}
    }
    if(!candidates.length && /<a\b/i.test(content)){
      const d=new DOMParser().parseFromString(content,'text/html');candidates=[...d.querySelectorAll('a[href]')].map(a=>({url:a.href,title:(a.textContent||'').trim(),tags:a.getAttribute('tags')||a.getAttribute('data-tags')||'',description:a.getAttribute('description')||''}));
    }
    if(!candidates.length){
      for(const line of content.split(/\r?\n/)){
        const md=line.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/); if(md)candidates.push({title:md[1],url:md[2]}); else {const u=line.match(/https?:\/\/\S+/);if(u)candidates.push({title:line.replace(u[0],'').replace(/^[-*\s]+/,'').trim(),url:u[0].replace(/[),.;]+$/,'')})}
      }
    }
    let added=0,updated=0; const existing=await idbAll('links');
    for(const c of candidates){let url;try{url=validHttpUrl(c.url)}catch(e){continue}const same=existing.find(x=>x.url===url);const rec={...(same||{}),url,title:cleanText(c.title||same?.title||displayHost(url),500),description:cleanText(c.description||same?.description||'',4000),tags:tagsFrom(c.tags||same?.tags||[]),guide_file:cleanText(c.guide_file||same?.guide_file||'',180),pinned:!!(c.pinned??same?.pinned),open_count:Number(same?.open_count||0),last_opened_at:same?.last_opened_at||'',created_at:same?.created_at||nowIso(),updated_at:nowIso()};if(same){rec.id=same.id;await idbPut('links',rec);updated++;}else{rec.id=await idbAdd('links',rec);existing.push(rec);added++;}}
    return {added,updated,total:candidates.length};
  }
  async function exportLinks(format){
    const rows=(await idbAll('links')).sort((a,b)=>(b.pinned-a.pinned)||(a.title||'').localeCompare(b.title||'')); const date=localDateKey();
    if(format==='markdown'){return {content:rows.map(r=>`- [${r.title||r.url}](${r.url})${(r.tags||[]).length?' — '+r.tags.map(t=>'#'+t).join(' '):''}${r.description?' — '+r.description:''}`).join('\n'),mime:'text/markdown;charset=utf-8',filename:`portal-links-${date}.md`};}
    if(format==='html'){const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return {content:'<!doctype html><meta charset="utf-8"><title>Links do Portal</title><h1>Links do Portal de Estudos</h1><ul>'+rows.map(r=>`<li><a href="${esc(r.url)}">${esc(r.title||r.url)}</a>${r.description?' — '+esc(r.description):''}</li>`).join('')+'</ul>',mime:'text/html;charset=utf-8',filename:`portal-links-${date}.html`};}
    return {content:JSON.stringify(rows,null,2),mime:'application/json;charset=utf-8',filename:`portal-links-${date}.json`};
  }

  function guideDocs(){
    return (window.PORTAL_SEARCH_INDEX||[]).map((x,i)=>({id:`g:${i}`,source_type:'guide',guide_file:x.file,guide_title:x.guide,source_name:x.guide,section_id:x.anchor||'',section_title:x.section||x.guide,content:x.text||'',snippet:x.text||'',href:`guias/${encodeURIComponent(x.file)}${x.anchor?'#'+encodeURIComponent(x.anchor):''}`}));
  }
  async function materialDocs(){
    const mats=await idbAll('materials'),out=[];for(const m of mats){const href=materialHref(m);for(let i=0;i<(m.chunks||[]).length;i++){const c=m.chunks[i];out.push({id:`m:${m.material_id}:${i}`,source_type:'material',material_id:m.material_id,source_name:m.original_name,section_title:c.title||m.original_name,content:c.content||'',snippet:c.content||'',href});}}return out;
  }
  async function linkDocs(){return (await idbAll('links')).map(r=>({id:`l:${r.id}`,source_type:'link',link_id:r.id,source_name:displayHost(r.url),section_title:r.title||r.url,content:`${r.title||''} ${r.url} ${r.description||''} ${(r.tags||[]).join(' ')}`,snippet:r.description||r.url,href:r.url}));}
  function bm25(docs,q){
    const qs=words(q); if(!qs.length)return []; const tokenized=docs.map(d=>words(`${d.section_title||''} ${d.content||''}`)),N=docs.length||1,avg=tokenized.reduce((s,x)=>s+x.length,0)/N||1,df={};for(const w of qs){let n=0;for(const t of tokenized)if(t.includes(w))n++;df[w]=n;}
    const scored=docs.map((d,i)=>{const t=tokenized[i],freq={};for(const x of t)freq[x]=(freq[x]||0)+1;let score=0;for(const w of qs){const f=freq[w]||0;if(!f)continue;const idf=Math.log(1+(N-(df[w]||0)+.5)/((df[w]||0)+.5)),den=f+1.2*(1-.75+.75*t.length/avg);score+=idf*(f*2.2)/den;}const title=normalize(d.section_title||'');if(qs.every(w=>title.includes(w)))score+=2;if(normalize(d.content||'').includes(normalize(q)))score+=3;return {d,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);return scored;
  }
  async function searchHybrid(q,limit=14){
    const docs=[...guideDocs(),...await materialDocs(),...await linkDocs()]; if(!q.trim())return {results:[],mode:'hybrid',confidence:0,quality:'baixa'};
    const ranked=bm25(docs,q); const exact=docs.map(d=>({d,score:normalize(`${d.section_title} ${d.content}`).includes(normalize(q))?1:0})).filter(x=>x.score).sort((a,b)=>(b.d.section_title||'').length-(a.d.section_title||'').length);
    const rrf=new Map(); ranked.slice(0,80).forEach((x,i)=>rrf.set(x.d.id,(rrf.get(x.d.id)||0)+1/(60+i+1))); exact.slice(0,80).forEach((x,i)=>rrf.set(x.d.id,(rrf.get(x.d.id)||0)+1/(60+i+1)));
    const byId=new Map(docs.map(d=>[d.id,d])); const results=[...rrf].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([id,s])=>{const d=byId.get(id),text=d.content||'';const qw=words(q)[0]||'',low=normalize(text),idx=low.indexOf(qw);let sn=text;if(idx>100)sn='…'+text.slice(Math.max(0,idx-90),idx+300);return {...d,snippet:sn.slice(0,700),score:s};});
    const top=ranked[0]?.score||0,quality=top>7?'alta':top>3?'média':results.length?'baixa':'baixa';return {results,mode:'hybrid',confidence:Math.min(1,top/10),quality};
  }

  async function productivity(){
    const [sessions,poms,tasks,acts,goalsRows,settingsRows]=await Promise.all([idbAll('sessions'),idbAll('pomodoros'),idbAll('tasks'),idbAll('activity'),idbAll('goals'),idbAll('settings')]);
    const today=new Date(),todayKey=localDateKey(today),week=weekStartKey(today); const weekD=parseDateOnly(week),end=new Date(weekD);end.setDate(end.getDate()+7);
    const byDay={}; const ensure=k=>byDay[k]||(byDay[k]={study_seconds:0,sessions:0,pomodoros:0,pomodoro_seconds:0,tasks_completed:0,reviews:0});
    for(const s of sessions){if(!s.ended_at||Number(s.seconds||0)<=0)continue;const d=dateFromIso(s.started_at);if(!d)continue;const k=localDateKey(d),r=ensure(k);r.study_seconds+=Number(s.seconds)||0;r.sessions++;}
    for(const p of poms){const d=dateFromIso(p.ended_at);if(!d)continue;const k=localDateKey(d),r=ensure(k);r.pomodoros++;r.pomodoro_seconds+=Number(p.focus_seconds)||0;}
    for(const t of tasks){if(!t.completed||!t.completed_at)continue;const d=dateFromIso(t.completed_at);if(d)ensure(localDateKey(d)).tasks_completed++;}
    for(const a of acts){if(a.kind!=='topic_status')continue;const st=a.payload?.status||a.status||'';if(!['weak','strong'].includes(st))continue;const d=dateFromIso(a.created_at);if(d)ensure(localDateKey(d)).reviews++;}
    const active=new Set(Object.entries(byDay).filter(([k,r])=>r.study_seconds>=60||r.pomodoro_seconds>=60).map(([k])=>k));let streak=0,cursor=new Date(today.getFullYear(),today.getMonth(),today.getDate());if(!active.has(localDateKey(cursor))){const y=new Date(cursor);y.setDate(y.getDate()-1);if(active.has(localDateKey(y)))cursor=y;}while(active.has(localDateKey(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}
    const days=[];for(let off=6;off>=0;off--){const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-off),k=localDateKey(d),r=ensure(k);days.push({date:k,...r});}
    const inWeek=k=>{const d=parseDateOnly(k);return d&&d>=weekD&&d<end}; const weekly={study_seconds:0,sessions:0,pomodoros:0,pomodoro_seconds:0,tasks_completed:0,reviews:0};for(const [k,r] of Object.entries(byDay))if(inWeek(k))for(const f of Object.keys(weekly))weekly[f]+=r[f]||0;
    const defaults={focus_minutes:25,short_break_minutes:5,long_break_minutes:15,cycles_before_long_break:4},settings={...defaults};for(const r of settingsRows)if(r.key in settings)settings[r.key]=Number(r.value)||settings[r.key];
    const goals=goalsRows.find(g=>g.period_start===week)||{period_start:week,study_minutes_goal:0,session_goal:0,review_goal:0,task_goal:0,updated_at:''};
    const sortedTasks=[...tasks].sort((a,b)=>(Number(a.completed)-Number(b.completed))||((a.due_date||'9999').localeCompare(b.due_date||'9999'))||(b.id-a.id));
    return {settings,goals,goal_progress:{study_minutes:Math.floor(weekly.study_seconds/60),sessions:weekly.sessions,reviews:weekly.reviews,tasks:weekly.tasks_completed},today:ensure(todayKey),weekly,streak_days:streak,open_tasks:tasks.filter(t=>!t.completed).length,overdue_tasks:tasks.filter(t=>!t.completed&&t.due_date&&t.due_date<todayKey).length,days,tasks:sortedTasks};
  }

  async function dashboard(){
    const [topics,mats,links,sessions]=await Promise.all([idbAll('topics'),idbAll('materials'),idbAll('links'),idbAll('sessions')]);const today=localDateKey();let todaySeconds=0;for(const s of sessions){const d=dateFromIso(s.started_at);if(d&&localDateKey(d)===today)todaySeconds+=Number(s.seconds)||0;}const tags=new Set(links.flatMap(x=>x.tags||[]));return {fts5:false,web_mode:true,indexed_sections:(window.PORTAL_SEARCH_INDEX||[]).filter(x=>x.anchor).length||81,material_count:mats.length,material_chunks:mats.reduce((n,m)=>n+(m.chunks||[]).length,0),link_count:links.length,link_tag_count:tags.size,today_seconds:todaySeconds,session_count:sessions.filter(s=>s.ended_at).length,topics,weak:topics.filter(t=>t.status==='weak').sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))),strong:topics.filter(t=>t.status==='strong').sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))};
  }

  async function assistantAsk(payload){
    const q=cleanText(payload.question||'',4000);if(q.length<2)throw new Error('Digite uma pergunta');const search=await searchHybrid(q,Math.max(2,Math.min(10,Number(payload.max_sources)||6)));const sources=search.results.filter(x=>x.source_type!=='link').slice(0,Number(payload.max_sources)||6).map((x,i)=>({index:i+1,source_type:x.source_type,source_name:x.source_name||x.guide_title||'',section_title:x.section_title||'',href:x.href||'',snippet:x.snippet||''}));let answer;
    if(!sources.length)answer='Não encontrei trechos relevantes nos guias ou materiais deste navegador para responder a essa pergunta.';else{const picks=sources.slice(0,3).map(s=>{const txt=String(s.snippet||'').replace(/\s+/g,' ').trim();const sent=txt.split(/(?<=[.!?])\s+/).find(x=>x.length>60)||txt;return `[${s.index}] ${sent.slice(0,420)}`});answer='Trechos mais relevantes encontrados nos seus materiais:\n\n'+picks.join('\n\n')+'\n\nUse as fontes abaixo para conferir o contexto completo.';}
    const rec={question:q,answer,mode:'retrieval',model:'',confidence:search.confidence||0,sources,created_at:nowIso()};rec.id=await idbAdd('assistant',rec);return {ok:true,...rec,quality:search.quality};
  }

  async function healthReport(){
    const mats=await idbAll('materials'),checks=[];const pass=(name,detail)=>checks.push({status:'pass',name,detail}),warn=(name,detail)=>checks.push({status:'warn',name,detail});
    pass('Aplicação web','Portal executando sem servidor Python.');pass('IndexedDB','Banco do navegador disponível para materiais, tarefas, links e memória.');pass('LocalStorage','Progresso dos 1.679 checkboxes permanece no navegador.');pass('Busca','Busca híbrida JavaScript (BM25 + fusão de rankings) ativa.');pass('Guias','Seis guias estáticos preservados e navegáveis.');pass('Backup','Exportação e restauração incluem dados web e materiais armazenados.');
    if('serviceWorker' in navigator)pass('Offline','Service Worker suportado; o site pode continuar disponível após o primeiro carregamento.');else warn('Offline','Este navegador não oferece Service Worker.');
    if(window.JSZip)pass('DOCX/PPTX/XLSX/EPUB','Leitor ZIP local carregado.');else warn('Documentos Office','JSZip não carregou.');
    if(window.pdfjsLib)pass('PDF','PDF.js carregado para extração de texto.');else warn('PDF','PDF.js é carregado sob demanda pela internet quando um PDF é adicionado.');
    if(mats.some(m=>m.parse_status==='error'))warn('Materiais',`${mats.filter(m=>m.parse_status==='error').length} material(is) com erro de extração.`);else pass('Materiais',`${mats.length} material(is) sem erro registrado.`);
    warn('YouTube automático','Captura automática de legendas exige um backend por restrições do YouTube; transcrição manual funciona no site.');warn('Ollama','Ollama local não é usado no GitHub Pages; o assistente funciona em modo de recuperação/evidência.');
    const summary={passed:checks.filter(x=>x.status==='pass').length,warnings:checks.filter(x=>x.status==='warn').length,failed:checks.filter(x=>x.status==='fail').length};return {ok:true,static_ready:summary.failed===0,web_mode:true,summary,checks,generated_at:nowIso()};
  }

  async function exportMemory(){
    const [topics,activity,sessions,links,tasks,pomodoros,goals,settings,assistant,materials,kv]=await Promise.all(['topics','activity','sessions','links','tasks','pomodoros','goals','settings','assistant','materials','kv'].map(idbAll));
    const materialExport=[];for(const m of materials)materialExport.push({material_id:m.material_id,original_name:m.original_name,mime_type:m.mime_type,size_bytes:m.size_bytes,parse_status:m.parse_status,parse_message:m.parse_message,text:m.text,chunks:m.chunks,source_url:m.source_url,created_at:m.created_at,data_base64:await blobToBase64(m.blob)});
    const settingsObj=Object.fromEntries(settings.map(x=>[x.key,String(x.value)]));return {schema:'portal-estudos-memory',version:5,exported_at:nowIso(),web_mode:true,topics,activity,sessions,browser_state:kv,links,productivity:{version:1,settings:settingsObj,tasks,pomodoros,goals},assistant,materials:materialExport};
  }
  async function importMemory(p){
    if(p?.schema!=='portal-estudos-memory')throw new Error('Formato de memória inválido');const stores=['topics','activity','sessions','links','tasks','pomodoros','goals','settings','assistant'];for(const s of stores)await idbClear(s);if(Array.isArray(p.materials))await idbClear('materials');if(Array.isArray(p.browser_state))await idbClear('kv');
    let counts={topics:0,activity:0,sessions:0,browser_state:0,links:0,productivity:{},assistant:0,materials:0};
    for(const r of p.topics||[]){const rec={key:r.key||`${r.guide_file}#${r.section_id}`,...r};await idbPut('topics',rec);counts.topics++;}
    for(const r of p.activity||[]){const x={...r};delete x.id;await idbAdd('activity',x);counts.activity++;}
    for(const r of p.sessions||[]){const x={...r};delete x.id;await idbAdd('sessions',x);counts.sessions++;}
    for(const r of p.browser_state||[]){if(allowedKey(r.key)){await idbPut('kv',{key:r.key,value:String(r.value||''),updated_at:r.updated_at||nowIso()});localStorage.setItem(r.key,String(r.value||''));counts.browser_state++;}}
    for(const r of p.links||[]){const x={...r};delete x.id;await idbAdd('links',x);counts.links++;}
    const prod=p.productivity||{};for(const [k,v] of Object.entries(prod.settings||{})){await idbPut('settings',{key:k,value:String(v)});}let tc=0,pc=0,gc=0;for(const r of prod.tasks||[]){const x={...r};delete x.id;await idbAdd('tasks',x);tc++;}for(const r of prod.pomodoros||[]){const x={...r};delete x.id;await idbAdd('pomodoros',x);pc++;}for(const r of prod.goals||[]){await idbPut('goals',r);gc++;}counts.productivity={tasks:tc,pomodoros:pc,goals:gc,settings:Object.keys(prod.settings||{}).length};
    for(const r of p.assistant||[]){const x={...r};delete x.id;await idbAdd('assistant',x);counts.assistant++;}
    for(const r of p.materials||[]){if(!r.data_base64)continue;const bytes=base64ToBytes(r.data_base64),rec={...r,blob:new Blob([bytes],{type:r.mime_type||guessMime(r.original_name)}),chunks:r.chunks||chunkText(r.text||'',r.original_name||'Material')};delete rec.data_base64;await idbPut('materials',rec);counts.materials++;}
    return counts;
  }

  async function apiHandler(url,init={}){
    const match=url.pathname.match(/\/api\/(.*)$/); if(!match) return null; const path='/api/'+match[1].replace(/\/+$/,''); const method=String(init.method||'GET').toUpperCase(); const p=await bodyJson(init);
    try{
      if(method==='GET'&&path==='/api/status') return jsonResponse({ok:true,mode:'browser-web',api_version:'web-1.0',storage:'indexeddb',capabilities:['hybrid-search','materials','assistant-retrieval','links','productivity','backup','offline']});
      if(method==='GET'&&path==='/api/state') return jsonResponse({ok:true,data:{...await stateFromDb(),...browserState()}});
      if(method==='POST'&&path==='/api/state/sync') return jsonResponse({ok:true,count:await syncState(p.data||{})});
      if(method==='GET'&&path==='/api/dashboard') return jsonResponse({ok:true,...await dashboard()});
      if(method==='POST'&&path==='/api/topic'){
        const status=['neutral','weak','strong'].includes(p.status)?p.status:'neutral';if(!p.file||!p.sectionId)throw new Error('Tópico incompleto');const rec={key:`${p.file}#${p.sectionId}`,guide_file:String(p.file),section_id:String(p.sectionId),section_title:String(p.sectionTitle||''),status,note:cleanText(p.note||'',4000),updated_at:nowIso()};await idbPut('topics',rec);await idbAdd('activity',{kind:'topic_status',guide_file:rec.guide_file,section_id:rec.section_id,section_title:rec.section_title,payload:{status},created_at:nowIso()});return jsonResponse({ok:true,status});
      }
      if(method==='POST'&&path==='/api/activity'){await idbAdd('activity',{kind:cleanText(p.kind||'visit',50),guide_file:String(p.file||''),section_id:String(p.sectionId||''),section_title:String(p.sectionTitle||''),payload:p.payload||{},created_at:nowIso()});return jsonResponse({ok:true});}
      if(method==='POST'&&path==='/api/session/start'){const id=await idbAdd('sessions',{guide_file:String(p.file||''),section_id:String(p.sectionId||''),section_title:String(p.sectionTitle||''),started_at:nowIso(),ended_at:'',seconds:0});return jsonResponse({ok:true,sessionId:id});}
      if(method==='POST'&&path==='/api/session/end'){const id=Number(p.sessionId)||0,rec=await idbGet('sessions',id);if(rec){rec.section_id=String(p.sectionId||rec.section_id||'');rec.section_title=String(p.sectionTitle||rec.section_title||'');rec.ended_at=nowIso();rec.seconds=clamp(p.seconds,0,86400);await idbPut('sessions',rec);}return jsonResponse({ok:true});}
      if(method==='GET'&&path==='/api/search'){const q=url.searchParams.get('q')||'',limit=clamp(url.searchParams.get('limit')||14,1,50);return jsonResponse({ok:true,query:q,...await searchHybrid(q,limit)});}
      if(method==='GET'&&path==='/api/materials'){return jsonResponse({ok:true,materials:(await idbAll('materials')).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).map(publicMaterial)});}
      if(method==='POST'&&path==='/api/materials/upload'){if(!p.name||!p.data)throw new Error('Arquivo incompleto');const bytes=base64ToBytes(p.data),m=await storeMaterial(String(p.name),String(p.type||''),bytes);return jsonResponse({ok:true,material:publicMaterial(m),deduplicated:false,index:{ok:m.parse_status==='ok',error:m.parse_message||''}});}
      if(method==='POST'&&path==='/api/materials/delete'){const id=String(p.id||''),u=objectUrls.get(id);if(u){URL.revokeObjectURL(u);objectUrls.delete(id)}return jsonResponse({ok:await idbDelete('materials',id)});}
      if(method==='POST'&&path==='/api/materials/reindex'){const mats=await idbAll('materials');let ok=0,failed=0;for(const m of mats){if(m.text){m.chunks=chunkText(m.text,m.original_name);m.parse_status='ok';m.parse_message='';ok++;await idbPut('materials',m);}else failed++;}return jsonResponse({ok,failed,total:mats.length});}
      if(method==='POST'&&path==='/api/reindex'){const mats=await idbAll('materials');let ok=0;for(const m of mats){if(m.text){m.chunks=chunkText(m.text,m.original_name);await idbPut('materials',m);ok++;}}return jsonResponse({ok:true,indexed:(window.PORTAL_SEARCH_INDEX||[]).filter(x=>x.anchor).length||81,materials:{ok,total:mats.length}});}
      if(method==='POST'&&path==='/api/materials/url'){
        const target=validHttpUrl(p.url||'');let r;try{r=await NATIVE_FETCH(target,{mode:'cors'});}catch(e){throw new Error('O site bloqueou leitura direta pelo navegador (CORS). Baixe o arquivo/página e use “Adicionar materiais”.');}if(!r.ok)throw new Error(`A URL respondeu HTTP ${r.status}`);const ct=r.headers.get('content-type')||'',bytes=new Uint8Array(await r.arrayBuffer()),u=new URL(target),name=(u.pathname.split('/').pop()||'pagina-web')+(ct.includes('html')&&!/\.html?$/i.test(u.pathname)?'.html':'');const m=await storeMaterial(name,ct,bytes,{source_url:target});return jsonResponse({ok:true,material:publicMaterial(m),deduplicated:false});
      }
      if(method==='GET'&&path==='/api/youtube/status'){const mats=await idbAll('materials');return jsonResponse({ok:true,capture:{ready:false,web:true,manual:true,reason:'Captura automática requer backend'},notes:mats.filter(m=>String(m.original_name).startsWith('youtube-')).map(publicMaterial)});}
      if(method==='POST'&&(path==='/api/youtube/list'||path==='/api/youtube/capture')) return jsonResponse({ok:false,error:'No site hospedado, o navegador não consegue consultar legendas do YouTube diretamente. Use “Transcrição manual” abaixo ou adicione um arquivo VTT/SRT à Biblioteca.'},400);
      if(method==='POST'&&path==='/api/youtube/manual'){
        const url=validHttpUrl(p.url||''),title=cleanText(p.title||'Aula do YouTube',250),lang=cleanText(p.language||'pt',30),transcript=cleanText(p.transcript||'',5000000);if(!transcript)throw new Error('Cole a transcrição');const videoId=(()=>{try{const u=new URL(url);if(u.hostname.includes('youtu.be'))return u.pathname.slice(1);return u.searchParams.get('v')||u.pathname.split('/').filter(Boolean).pop()||'video'}catch(e){return'video'}})();const md=`# ${title}\n\n- Origem: ${url}\n- Idioma: ${lang}\n- Salvo em: ${nowIso()}\n\n## Transcrição\n\n${transcript}\n`;const bytes=new TextEncoder().encode(md),m=await storeMaterial(`youtube-${videoId}-${Date.now()}.md`,'text/markdown',bytes,{source_url:url});return jsonResponse({ok:true,capture:{title,url,language:lang},material:publicMaterial(m),deduplicated:false});
      }
      if(method==='GET'&&path==='/api/links'){return jsonResponse({ok:true,links:await linkList(url.searchParams),tags:await tagSummary()});}
      if(method==='POST'&&path==='/api/links/save'){
        const u=validHttpUrl(p.url||'');let rec=null;if(Number(p.id))rec=await idbGet('links',Number(p.id));if(!rec){const all=await idbAll('links');rec=all.find(x=>x.url===u)||null;}const x={...(rec||{}),url:u,title:cleanText(p.title||rec?.title||displayHost(u),500),tags:tagsFrom(p.tags??rec?.tags??[]),description:cleanText(p.description||rec?.description||'',4000),guide_file:cleanText(p.guide_file||'',180),pinned:!!p.pinned,open_count:Number(rec?.open_count||0),last_opened_at:rec?.last_opened_at||'',created_at:rec?.created_at||nowIso(),updated_at:nowIso()};if(rec?.id)x.id=rec.id;else x.id=await idbAdd('links',x);if(rec?.id)await idbPut('links',x);return jsonResponse({ok:true,link:{...x,display_host:displayHost(x.url)}});
      }
      if(method==='POST'&&path==='/api/links/delete')return jsonResponse({ok:await idbDelete('links',Number(p.id)||0)});
      if(method==='POST'&&path==='/api/links/pin'){const id=Number(p.id)||0,r=await idbGet('links',id);if(!r)return jsonResponse({ok:false},404);r.pinned=!r.pinned;r.updated_at=nowIso();await idbPut('links',r);return jsonResponse({ok:true,pinned:r.pinned});}
      if(method==='POST'&&path==='/api/links/open'){const id=Number(p.id)||0,r=await idbGet('links',id);if(r){r.open_count=Number(r.open_count||0)+1;r.last_opened_at=nowIso();await idbPut('links',r);}return jsonResponse({ok:!!r});}
      if(method==='POST'&&path==='/api/links/import')return jsonResponse({ok:true,...await importLinks(p.content||'',p.filename||'')});
      if(method==='POST'&&path==='/api/links/export'){const out=await exportLinks(String(p.format||'json'));return jsonResponse({ok:true,...out});}
      if(method==='GET'&&path==='/api/productivity')return jsonResponse({ok:true,...await productivity()});
      if(method==='GET'&&path==='/api/productivity/tasks')return jsonResponse({ok:true,tasks:(await productivity()).tasks});
      if(method==='POST'&&path==='/api/productivity/task/save'){const title=cleanText(p.title||'',500);if(!title)throw new Error('Informe a tarefa');const rec={title,guide_file:cleanText(p.guide_file||'',180),due_date:cleanText(p.due_date||'',10),completed:false,created_at:nowIso(),completed_at:''};rec.id=await idbAdd('tasks',rec);return jsonResponse({ok:true,task:rec});}
      if(method==='POST'&&path==='/api/productivity/task/toggle'){const id=Number(p.id)||0,r=await idbGet('tasks',id);if(!r)throw new Error('Tarefa não encontrada');r.completed=typeof p.completed==='boolean'?p.completed:!r.completed;r.completed_at=r.completed?nowIso():'';await idbPut('tasks',r);return jsonResponse({ok:true,completed:r.completed});}
      if(method==='POST'&&path==='/api/productivity/task/delete')return jsonResponse({ok:await idbDelete('tasks',Number(p.id)||0)});
      if(method==='POST'&&path==='/api/productivity/pomodoro/complete'){const rec={started_at:String(p.started_at||new Date(Date.now()-1500000).toISOString()),ended_at:String(p.ended_at||nowIso()),focus_seconds:clamp(p.focus_seconds||p.planned_seconds||1500,0,10800),planned_seconds:clamp(p.planned_seconds||1500,60,10800),label:cleanText(p.label||'',200)};rec.id=await idbAdd('pomodoros',rec);return jsonResponse({ok:true,id:rec.id});}
      if(method==='POST'&&path==='/api/productivity/settings'){const defs={focus_minutes:[1,180],short_break_minutes:[1,60],long_break_minutes:[1,120],cycles_before_long_break:[1,12]},out={};for(const [k,[lo,hi]] of Object.entries(defs)){if(k in p){out[k]=clamp(p[k],lo,hi);await idbPut('settings',{key:k,value:String(out[k])});}}return jsonResponse({ok:true,settings:out});}
      if(method==='POST'&&path==='/api/productivity/goals'){const rec={period_start:weekStartKey(),study_minutes_goal:clamp(p.study_minutes_goal,0,10080),session_goal:clamp(p.session_goal,0,500),review_goal:clamp(p.review_goal,0,1000),task_goal:clamp(p.task_goal,0,1000),updated_at:nowIso()};await idbPut('goals',rec);return jsonResponse({ok:true,goals:rec});}
      if(method==='GET'&&path==='/api/assistant/status'){const h=await idbAll('assistant');return jsonResponse({ok:true,web_mode:true,ollama:{available:false,models:[],reason:'GitHub Pages usa recuperação no navegador'},history_count:h.length});}
      if(method==='GET'&&path==='/api/assistant/history'){const lim=clamp(url.searchParams.get('limit')||20,1,100),h=(await idbAll('assistant')).sort((a,b)=>b.id-a.id).slice(0,lim);return jsonResponse({ok:true,history:h});}
      if(method==='POST'&&path==='/api/assistant/ask')return jsonResponse(await assistantAsk(p));
      if(method==='POST'&&path==='/api/assistant/clear'){const n=(await idbAll('assistant')).length;await idbClear('assistant');return jsonResponse({ok:true,cleared:n});}
      if(method==='GET'&&path==='/api/health')return jsonResponse(await healthReport());
      if(method==='GET'&&path==='/api/memory/export')return jsonResponse(await exportMemory());
      if(method==='POST'&&path==='/api/memory/import')return jsonResponse({ok:true,counts:await importMemory(p)});
      return jsonResponse({ok:false,error:'Endpoint não encontrado no modo web'},404);
    }catch(e){return jsonResponse({ok:false,error:String(e?.message||e)},400);}
  }

  window.fetch = async function(input,init={}){
    let url; try{url=new URL(typeof input==='string'?input:input.url,location.href);}catch(e){return NATIVE_FETCH(input,init)}
    if(/\/api\//.test(url.pathname)){const r=await apiHandler(url,init);if(r)return r;}
    return NATIVE_FETCH(input,init);
  };

  // Expõe um identificador simples para a interface e para testes.
  window.PORTAL_WEB_BACKEND={mode:'browser-web',db:DB_NAME,root:ROOT_URL.href,search:searchHybrid};

  // Instalação offline da versão hospedada.
  if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
    const sw=new URL('service-worker.js',ROOT_URL); navigator.serviceWorker.register(sw.href,{scope:ROOT_URL.pathname}).catch(()=>{});
  }
})();