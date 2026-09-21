(() => {
  const file = decodeURIComponent(location.pathname.split('/').pop() || '');
  const title = (document.querySelector('header h1')?.textContent || document.title.replace(/^Guia de Estudos\s*[—-]\s*/,'')).trim();
  const LAST_KEY='portal:lastAccess:v1', RECENT_KEY='portal:recent:v1', FAV_KEY='portal:favorites:v1';
  const topbar=document.querySelector('.portal-topbar');
  const sections=[...document.querySelectorAll('main section[id]')];
  const navItems=sections.map(sec=>({id:sec.id,title:(sec.querySelector('h2,h3')?.textContent||sec.id.replace(/-/g,' ')).trim()})).filter(x=>x.title);
  let activeSection = location.hash ? location.hash.slice(1) : (navItems[0]?.id || '');
  const resumeRequested=new URLSearchParams(location.search).get('resume')==='1';
  const resumeState=resumeRequested?safeParse(LAST_KEY,null):null;
  let saveTimer=null, syncTimer=null, backendOnline=false, sessionId=null, sessionStarted=Date.now();
  const topicMap=new Map();
  function safeParse(key, fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch(e){return fallback}}
  function favoriteFiles(){const x=safeParse(FAV_KEY,[]);return Array.isArray(x)?x:[]}
  function allowedKey(k){return k.startsWith('guia-')||k.startsWith('economia-politica-')||k.startsWith('introducao-ciencia-direito-')||k.startsWith('portal:')}
  function collectState(){const data={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(allowedKey(k))data[k]=localStorage.getItem(k)}return data}
  function setFavorite(on){let arr=favoriteFiles().filter(x=>x!==file);if(on)arr.unshift(file);localStorage.setItem(FAV_KEY,JSON.stringify(arr));syncFavorite();toast(on?'Adicionado aos favoritos':'Removido dos favoritos');scheduleStateSync()}
  function isFavorite(){return favoriteFiles().includes(file)}
  function syncFavorite(){if(!favBtn)return;const on=isFavorite();favBtn.classList.toggle('active',on);favBtn.textContent=on?'★ Favorito':'☆ Favoritar';favBtn.setAttribute('aria-pressed',String(on))}
  function currentSectionTitle(){return navItems.find(x=>x.id===activeSection)?.title || ''}
  function state(){return {file,title,ts:Date.now(),scrollY:Math.round(scrollY),sectionId:activeSection,sectionTitle:currentSectionTitle()}}
  function saveAccess(){const s=state();localStorage.setItem(LAST_KEY,JSON.stringify(s));let recent=safeParse(RECENT_KEY,[]);if(!Array.isArray(recent))recent=[];recent=[s,...recent.filter(x=>x&&x.file!==file)].slice(0,8);localStorage.setItem(RECENT_KEY,JSON.stringify(recent));scheduleStateSync()}
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveAccess,180)}
  function toast(msg){let t=document.querySelector('.portal-toast');if(!t){t=document.createElement('div');t.className='portal-toast';document.body.appendChild(t)}t.textContent=msg;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),1600)}
  async function api(path, options={}){if(!backendOnline&&path!=='status')throw new Error('backend offline');const r=await fetch('../api/'+path,{cache:'no-store',...options});if(!r.ok)throw new Error('api');return r.json()}
  function scheduleStateSync(){if(!backendOnline)return;clearTimeout(syncTimer);syncTimer=setTimeout(async()=>{try{await api('state/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:collectState()})})}catch(e){}},700)}
  let favBtn=null,indexBtn=null,weakBtn=null,strongBtn=null,noteBtn=null,statusPill=null;
  if(topbar){
    let actions=topbar.querySelector('.right-actions');const back=topbar.querySelector('.back-link');
    if(!actions){actions=document.createElement('div');actions.className='right-actions';if(back){topbar.appendChild(actions);actions.appendChild(back)}}
    indexBtn=document.createElement('button');indexBtn.type='button';indexBtn.className='portal-index-toggle';indexBtn.textContent='☰ Índice';actions.insertBefore(indexBtn,actions.firstChild);
    favBtn=document.createElement('button');favBtn.type='button';favBtn.className='portal-favorite-toggle';favBtn.addEventListener('click',()=>setFavorite(!isFavorite()));actions.insertBefore(favBtn,back||null);syncFavorite();
    weakBtn=document.createElement('button');weakBtn.type='button';weakBtn.className='portal-memory-btn portal-memory-weak';weakBtn.textContent='⚑ Revisar';weakBtn.hidden=true;actions.insertBefore(weakBtn,back||null);
    strongBtn=document.createElement('button');strongBtn.type='button';strongBtn.className='portal-memory-btn portal-memory-strong';strongBtn.textContent='✓ Dominado';strongBtn.hidden=true;actions.insertBefore(strongBtn,back||null);
    noteBtn=document.createElement('button');noteBtn.type='button';noteBtn.className='portal-memory-btn';noteBtn.textContent='✎ Nota';noteBtn.hidden=true;actions.insertBefore(noteBtn,back||null);
    statusPill=document.createElement('span');statusPill.className='portal-memory-status';statusPill.textContent='Memória local';statusPill.hidden=true;topbar.querySelector('.left')?.appendChild(statusPill);
  }
  function navHTML(){return navItems.map(x=>`<a href="#${x.id}" data-id="${x.id}">${x.title}</a>`).join('')}
  let rail=null;
  if(navItems.length){
    rail=document.createElement('aside');rail.className='portal-guide-rail';rail.innerHTML=`<h2>Índice da disciplina</h2><div class="rail-progress"><span>Progresso do guia</span><div class="rail-bar"><i></i></div></div><div class="rail-memory" hidden><strong>Memória local</strong><span>Marque cada seção como revisar ou dominada.</span></div>${navHTML()}`;document.body.appendChild(rail);
    const backdrop=document.createElement('div');backdrop.className='portal-guide-drawer-backdrop';document.body.appendChild(backdrop);
    const drawer=document.createElement('aside');drawer.className='portal-guide-drawer';drawer.innerHTML=`<div class="drawer-head"><strong>Índice da disciplina</strong><button type="button">Fechar</button></div>${navHTML()}`;document.body.appendChild(drawer);
    const close=()=>{drawer.classList.remove('open');backdrop.classList.remove('open')};
    indexBtn?.addEventListener('click',()=>{drawer.classList.add('open');backdrop.classList.add('open')});drawer.querySelector('button')?.addEventListener('click',close);backdrop.addEventListener('click',close);drawer.addEventListener('click',e=>{if(e.target.closest('a'))close()});
    function setActive(id){activeSection=id;document.querySelectorAll('.portal-guide-rail a,.portal-guide-drawer a').forEach(a=>a.classList.toggle('active',a.dataset.id===id));syncMemoryButtons();scheduleSave()}
    const obs=new IntersectionObserver(es=>{const vis=es.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(vis[0])setActive(vis[0].target.id)},{rootMargin:'-15% 0px -70% 0px',threshold:[0,.1]});sections.forEach(s=>obs.observe(s));
    function updateRailProgress(){const boxes=[...document.querySelectorAll('input[type="checkbox"]')];const done=boxes.filter(b=>b.checked).length;const pct=boxes.length?Math.round(done/boxes.length*100):0;rail.querySelector('.rail-progress span').textContent=`Progresso do guia: ${pct}%`;rail.querySelector('.rail-bar i').style.width=pct+'%'}
    updateRailProgress();document.addEventListener('change',e=>{if(e.target.matches('input[type="checkbox"]')){updateRailProgress();scheduleSave();scheduleStateSync()}},true);
  }
  function memoryKey(){return file+'#'+activeSection}
  function syncMemoryButtons(){if(!backendOnline||!activeSection)return;const rec=topicMap.get(memoryKey())||{status:'neutral',note:''};weakBtn?.classList.toggle('active',rec.status==='weak');strongBtn?.classList.toggle('active',rec.status==='strong');if(noteBtn)noteBtn.classList.toggle('active',Boolean(rec.note));}
  async function setTopicStatus(next){if(!backendOnline||!activeSection)return;const key=memoryKey(),cur=topicMap.get(key)||{status:'neutral',note:''};const status=cur.status===next?'neutral':next;const body={file,sectionId:activeSection,sectionTitle:currentSectionTitle(),status,note:cur.note||''};try{await api('topic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});topicMap.set(key,{...cur,...body});syncMemoryButtons();toast(status==='weak'?'Marcado para revisar':status==='strong'?'Marcado como dominado':'Marcação removida')}catch(e){toast('Não foi possível salvar na memória local')}}
  async function editNote(){if(!backendOnline||!activeSection)return;const key=memoryKey(),cur=topicMap.get(key)||{status:'neutral',note:''};const value=prompt('Nota curta sobre este tópico:',cur.note||'');if(value===null)return;const body={file,sectionId:activeSection,sectionTitle:currentSectionTitle(),status:cur.status||'neutral',note:value.trim().slice(0,4000)};try{await api('topic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});topicMap.set(key,{...cur,...body});syncMemoryButtons();toast(body.note?'Nota salva':'Nota removida')}catch(e){toast('Não foi possível salvar a nota')}}
  weakBtn?.addEventListener('click',()=>setTopicStatus('weak'));strongBtn?.addEventListener('click',()=>setTopicStatus('strong'));noteBtn?.addEventListener('click',editNote);
  async function initBackend(){try{const r=await fetch('../api/status',{cache:'no-store'});if(!r.ok)throw new Error();backendOnline=true;[weakBtn,strongBtn,noteBtn,statusPill].forEach(x=>{if(x)x.hidden=false});rail?.querySelector('.rail-memory')?.removeAttribute('hidden');const d=await api('dashboard');(d.topics||[]).forEach(t=>topicMap.set(t.guide_file+'#'+t.section_id,t));syncMemoryButtons();const started=await api('session/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file,sectionId:activeSection,sectionTitle:currentSectionTitle()})});sessionId=started.sessionId;api('activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'guide_open',file,sectionId:activeSection,sectionTitle:currentSectionTitle()})}).catch(()=>{});scheduleStateSync()}catch(e){backendOnline=false}}
  function closeSession(){if(!backendOnline||!sessionId)return;const body=JSON.stringify({sessionId,seconds:Math.round((Date.now()-sessionStarted)/1000),sectionId:activeSection,sectionTitle:currentSectionTitle()});fetch('../api/session/end',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{})}
  window.addEventListener('scroll',scheduleSave,{passive:true});window.addEventListener('pagehide',()=>{saveAccess();closeSession()});document.addEventListener('visibilitychange',()=>{if(document.hidden){saveAccess();closeSession()}});setInterval(()=>{if(backendOnline&&sessionId)closeSession()},30000);saveAccess();initBackend();
  if(resumeRequested){const last=resumeState;if(last&&last.file===file){setTimeout(()=>{if(last.sectionId&&document.getElementById(last.sectionId)){document.getElementById(last.sectionId).scrollIntoView({block:'start'});setTimeout(()=>scrollTo({top:last.scrollY||scrollY,behavior:'auto'}),30)}else scrollTo({top:last.scrollY||0,behavior:'auto'})},120)}}
})();