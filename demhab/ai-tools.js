(function(){
'use strict';
const path=location.pathname.toLowerCase();
const slug=path.includes('/eptc/')?'eptc':'demhab';
const portal=slug==='eptc'?'EPTC — Técnico em Processos Administrativos e Contábeis':'DEMHAB — Assistente Administrativo';
const KEY=`${slug}:central-ia:v1`;
const GEMINI_URL='https://gemini.google.com/app';
const NOTEBOOK_URL='https://notebooklm.google.com/';
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const nowIso=()=>new Date().toISOString();
function state(){try{return JSON.parse(localStorage.getItem(KEY))||{items:[]}}catch(e){return{items:[]}}}
function save(s){localStorage.setItem(KEY,JSON.stringify(s))}
function toast(msg){
  const existing=$('#aiToast'); if(existing){existing.textContent=msg;existing.classList.add('show');setTimeout(()=>existing.classList.remove('show'),2500);return}
  const t=document.createElement('div');t.id='aiToast';t.className='ai-toast';t.textContent=msg;document.body.appendChild(t);requestAnimationFrame(()=>t.classList.add('show'));setTimeout(()=>t.classList.remove('show'),2500)
}
function download(name,text,type='text/markdown;charset=utf-8'){
  const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),800)
}
function safeName(s){return (s||'material').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'material'}
function getForm(){return{
  id:$('#aiItemId')?.value||'',
  title:$('#aiTitle')?.value.trim()||'Material de estudo',
  source:$('#aiSource')?.value||'Gran Cursos',
  task:$('#aiTask')?.value||'resumo',
  content:$('#aiMaterial')?.value.trim()||'',
  result:$('#aiResult')?.value.trim()||''
}}
function buildPrompt(f){
  const taskMap={
    resumo:'Produza um resumo completo e estruturado para revisão de concurso. Destaque conceitos, distinções, listas, prazos, exceções e armadilhas que estejam efetivamente presentes no material.',
    questoes:'Crie 15 questões autorais de múltipla escolha, com 5 alternativas, gabarito e comentário curto. Não invente conteúdo que não esteja na fonte.',
    flashcards:'Crie flashcards objetivos em formato Pergunta | Resposta, cobrindo os pontos centrais, exceções e confusões prováveis.',
    revisao:'Monte uma revisão ativa: síntese curta, 10 perguntas de recuperação, respostas e uma lista de erros/armadilhas para revisar depois.',
    simulado:'Monte um mini-simulado baseado somente no material, com questões variadas e gabarito comentado ao final.'
  };
  return `Você está auxiliando na preparação para ${portal}.\n\nTAREFA\n${taskMap[f.task]||taskMap.resumo}\n\nREGRAS IMPORTANTES\n- Use exclusivamente o material-base abaixo.\n- Preserve a terminologia, organização e nível de detalhe da fonte sempre que isso ajudar o estudo.\n- Não preencha lacunas com conhecimento externo. Se uma informação necessária não estiver no material, diga explicitamente \"não consta no material fornecido\".\n- Não atribua ao material algo que ele não sustenta.\n- Escreva em português do Brasil, com foco em concurso público.\n- Ao final, inclua uma seção \"Pontos para revisar\".\n\nFONTE DECLARADA\n${f.source}\n\nTÍTULO\n${f.title}\n\nMATERIAL-BASE\n---\n${f.content}\n---`;
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true}catch(e){
    const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(_e){}ta.remove();return ok
  }
}
function notebookMarkdown(f){
  const parts=[`# ${f.title}`,``, `**Portal:** ${portal}`,`**Fonte declarada:** ${f.source}`,`**Preparado em:** ${new Date().toLocaleString('pt-BR')}`,``,`## Material-base`,``,f.content||'_Sem material-base preenchido._'];
  if(f.result)parts.push('', '## Resultado colado do Gemini', '', f.result);
  parts.push('', '## Nota de uso', '', 'Este arquivo foi preparado pelo Portal de Estudos para uso como fonte no NotebookLM. O material-base deve ser tratado como a fonte principal; respostas de IA devem ser conferidas contra essa fonte.');
  return parts.join('\n');
}
function storeCurrent(){
  const f=getForm();if(!f.content&&!f.result){toast('Adicione um material ou resultado antes de salvar.');return}
  const s=state();let item=s.items.find(x=>x.id===f.id);if(item){Object.assign(item,f,{updatedAt:nowIso()})}else{item={...f,id:`ai-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,createdAt:nowIso(),updatedAt:nowIso()};s.items.unshift(item);$('#aiItemId').value=item.id}
  save(s);renderLibrary();toast('Material salvo neste navegador.')
}
function loadItem(id){const item=state().items.find(x=>x.id===id);if(!item)return;$('#aiItemId').value=item.id;$('#aiTitle').value=item.title||'';$('#aiSource').value=item.source||'Gran Cursos';$('#aiTask').value=item.task||'resumo';$('#aiMaterial').value=item.content||'';$('#aiResult').value=item.result||'';$('#ia').scrollIntoView({behavior:'smooth',block:'start'});toast('Material carregado.')}
function deleteItem(id){const s=state();s.items=s.items.filter(x=>x.id!==id);save(s);if($('#aiItemId').value===id){$('#aiItemId').value=''}renderLibrary();toast('Material removido.')}
function renderLibrary(){
  const box=$('#aiLibrary');if(!box)return;const items=state().items;if(!items.length){box.innerHTML='<div class="ai-empty">Nenhum material salvo ainda. Cole uma transcrição do Gran, importe um TXT/MD/VTT/SRT ou salve suas próprias notas.</div>';return}
  box.innerHTML=items.map(x=>`<article class="ai-item"><div><strong>${esc(x.title)}</strong><small>${esc(x.source)} • ${new Date(x.updatedAt||x.createdAt).toLocaleString('pt-BR')}</small></div><div class="ai-item-actions"><button data-ai-load="${esc(x.id)}">Abrir</button><button data-ai-export="${esc(x.id)}">.md</button><button data-ai-delete="${esc(x.id)}">Excluir</button></div></article>`).join('');
  box.querySelectorAll('[data-ai-load]').forEach(b=>b.onclick=()=>loadItem(b.dataset.aiLoad));
  box.querySelectorAll('[data-ai-delete]').forEach(b=>b.onclick=()=>{if(confirm('Excluir este material salvo?'))deleteItem(b.dataset.aiDelete)});
  box.querySelectorAll('[data-ai-export]').forEach(b=>b.onclick=()=>{const x=state().items.find(i=>i.id===b.dataset.aiExport);if(x)download(`${safeName(x.title)}-notebooklm.md`,notebookMarkdown(x))});
}
function addStyles(){const s=document.createElement('style');s.textContent=`
.ai-section{margin-top:18px}.ai-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr);gap:16px}.ai-card{background:var(--surface,#202020);border:1px solid var(--line,#343434);border-radius:17px;padding:18px}.ai-card h4{margin:0 0 6px;font-size:15px}.ai-card p{margin:0 0 14px;color:var(--muted,#969696);font-size:12px;line-height:1.55}.ai-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ai-field{display:grid;gap:6px;margin-bottom:10px}.ai-field label{font-size:11px;color:var(--muted,#969696);font-weight:800}.ai-field input,.ai-field select,.ai-field textarea{width:100%;background:#181818;border:1px solid var(--line,#343434);color:var(--text,#f2f2f2);border-radius:10px;padding:10px 11px;outline:none}.ai-field textarea{min-height:190px;resize:vertical}.ai-field textarea.ai-result{min-height:130px}.ai-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.ai-btn{border:1px solid var(--line,#343434);background:#272727;color:#eee;border-radius:10px;padding:9px 11px;font-size:12px;font-weight:800;cursor:pointer}.ai-btn:hover{background:#303030}.ai-btn.primary{background:#eee;color:#171717;border-color:#eee}.ai-note{border:1px solid var(--line,#343434);border-radius:12px;padding:12px;background:#1b1b1b;font-size:11px;color:#aaa;line-height:1.55;margin-top:10px}.ai-status{display:grid;gap:9px}.ai-status>div{border:1px solid var(--line,#343434);border-radius:12px;padding:11px 12px;background:#1d1d1d}.ai-status strong{font-size:12px;display:block}.ai-status small{color:#999;display:block;margin-top:3px;line-height:1.45}.ai-library{display:grid;gap:8px;margin-top:12px}.ai-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 11px;border:1px solid var(--line,#343434);border-radius:11px;background:#1c1c1c}.ai-item strong{display:block;font-size:12px}.ai-item small{display:block;color:#888;font-size:10px;margin-top:3px}.ai-item-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.ai-item-actions button{border:1px solid #3b3b3b;background:#242424;color:#ccc;border-radius:8px;padding:6px 8px;font-size:10px;cursor:pointer}.ai-empty{font-size:11px;color:#888;border:1px dashed #3a3a3a;border-radius:11px;padding:14px}.ai-toast{position:fixed;right:20px;bottom:20px;background:#f2f2f2;color:#171717;border-radius:10px;padding:10px 13px;font-size:12px;font-weight:800;opacity:0;transform:translateY(8px);transition:.2s;z-index:9999;max-width:360px}.ai-toast.show{opacity:1;transform:none}.ai-mini{font-size:10px;color:#888}.ai-file{display:none}@media(max-width:900px){.ai-grid{grid-template-columns:1fr}.ai-row{grid-template-columns:1fr}}
`;document.head.appendChild(s)}
function addNav(){const nav=$('.nav');if(nav&&!nav.querySelector('a[href="#ia"]')){const a=document.createElement('a');a.href='#ia';a.textContent='Central IA';const portalLink=[...nav.querySelectorAll('a')].find(x=>x.getAttribute('href')?.startsWith('../'));if(portalLink)nav.insertBefore(a,portalLink);else nav.appendChild(a)}}
function addSection(){
  if($('#ia'))return;const sec=document.createElement('section');sec.id='ia';sec.className='section ai-section';sec.innerHTML=`
  <div class="section-head"><div><h3>Central IA</h3><p>Conexão direta com a aula aberta no Gran e com a Gemini API por meio do Conector local do navegador.</p></div><span class="pill" id="aiConnectorState">Conector: verificando…</span></div>
  <div class="ai-grid">
    <div class="ai-card">
      <h4>Preparar material</h4><p>Cole a transcrição/anotação do Gran ou importe um arquivo de texto. O material fica apenas neste navegador até você exportar.</p>
      <input id="aiItemId" type="hidden"><input id="aiFile" class="ai-file" type="file" accept=".txt,.md,.html,.htm,.vtt,.srt,.csv,.json,text/plain,text/markdown,text/html,text/vtt,application/json">
      <div class="ai-row"><div class="ai-field"><label>Título</label><input id="aiTitle" placeholder="Ex.: Administração Pública — Princípios"></div><div class="ai-field"><label>Fonte</label><select id="aiSource"><option>Gran Cursos</option><option>Minhas notas</option><option>Edital</option><option>Lei seca</option><option>Outro material</option></select></div></div>
      <div class="ai-field"><label>Material-base</label><textarea id="aiMaterial" placeholder="Cole aqui a transcrição, resumo ou texto-base…"></textarea></div>
      <div class="ai-actions"><button class="ai-btn primary" id="aiGranDirect">Importar aula aberta no Gran</button><button class="ai-btn" id="aiPaste">Colar</button><button class="ai-btn" id="aiImport">Importar arquivo</button><button class="ai-btn" id="aiSave">Salvar no portal</button></div>
      <div class="ai-row"><div class="ai-field"><label>O que pedir ao Gemini</label><select id="aiTask"><option value="resumo">Resumo completo</option><option value="questoes">Questões comentadas</option><option value="flashcards">Flashcards</option><option value="revisao">Revisão ativa</option><option value="simulado">Mini-simulado</option></select></div><div class="ai-field"><label>Ações Gemini</label><div class="ai-actions" style="margin:0"><button class="ai-btn primary" id="aiGeminiDirect">Gerar aqui com Gemini</button><button class="ai-btn" id="aiGemini">Abrir Gemini</button><button class="ai-btn" id="aiConnectorSettings">Configurar</button></div></div></div>
      <div class="ai-field"><label>Resultado do Gemini (opcional)</label><textarea id="aiResult" class="ai-result" placeholder="Depois de usar o Gemini, você pode colar a resposta aqui para guardar junto do material e enviar ao NotebookLM."></textarea></div>
      <div class="ai-actions"><button class="ai-btn" id="aiSaveResult">Salvar material + resultado</button><button class="ai-btn primary" id="aiNotebook">Gerar .md + abrir NotebookLM</button><button class="ai-btn" id="aiExportAll">Exportar todos os materiais (.md)</button></div>
      <div class="ai-note"><b>Conexão direta:</b> instale o Conector Gran + Gemini no Chrome. Ele usa a sessão do Gran já aberta no seu navegador e uma chave da Gemini API guardada localmente na extensão. Nenhuma senha é colocada no GitHub. O NotebookLM continua recebendo um arquivo Markdown preparado pelo portal.</div>
    </div>
    <div class="ai-card">
      <h4>Como cada integração funciona</h4><div class="ai-status"><div><strong>Gran Cursos — direto</strong><small>Com uma aula do Gran aberta e autenticada no mesmo Chrome, o portal pede à extensão a transcrição/seleção visível daquela aula.</small></div><div><strong>Gemini API — direto</strong><small>O portal envia o prompt à extensão, que chama a Gemini API e devolve a resposta para esta página. A chave fica só no Chrome.</small></div><div><strong>NotebookLM</strong><small>O portal gera um .md organizado para você adicionar como fonte. A conta do NotebookLM não é exposta ao portal.</small></div></div>
      <h4 style="margin-top:18px">Biblioteca IA local</h4><p>Materiais salvos especificamente para este concurso.</p><div id="aiLibrary" class="ai-library"></div>
    </div>
  </div>`;
  const main=$('main.content')||$('main');if(!main)return;
  const footer=main.querySelector('footer');const hiddenFile=main.querySelector('#importFile');const anchor=footer||hiddenFile||null;if(anchor)main.insertBefore(sec,anchor);else main.appendChild(sec)
}
let connectorConnected=false;let pendingGeminiRequest='';let pendingGranRequest='';
function connectorPost(type,payload={}){window.postMessage({source:'portal-de-estudos',type,...payload},location.origin)}
function connectorStatus(ok,text){connectorConnected=!!ok;const el=$('#aiConnectorState');if(el){el.textContent=text||(`Conector: ${ok?'conectado':'não instalado'}`);el.style.opacity=ok?'1':'.65'}}
window.addEventListener('message',ev=>{
  if(ev.source!==window||ev.origin!==location.origin||ev.data?.source!=='portal-conector-extension')return;
  const m=ev.data;
  if(m.type==='PORTAL_CONNECTOR_PONG'){connectorStatus(true,`Conector: ativo v${m.version||''}`);return}
  if(m.type==='PORTAL_GRAN_PUSH'&&m.payload){const p=m.payload;$('#aiTitle').value=p.title||'Aula do Gran';$('#aiSource').value='Gran Cursos';$('#aiMaterial').value=p.text||'';$('#ia').scrollIntoView({behavior:'smooth'});connectorPost('PORTAL_GRAN_IMPORTED');toast(`Aula importada do Gran (${p.mode||'captura'}).`);return}
  if(m.type==='PORTAL_GRAN_CAPTURE_RESULT'&&m.requestId===pendingGranRequest){pendingGranRequest='';const r=m.result;if(!r?.ok){toast(r?.error||'Não foi possível capturar a aula do Gran.');return}$('#aiTitle').value=r.title||'Aula do Gran';$('#aiSource').value='Gran Cursos';$('#aiMaterial').value=r.text||'';$('#ia').scrollIntoView({behavior:'smooth'});toast(`Aula importada do Gran (${r.mode||'captura'}).`);return}
  if(m.type==='PORTAL_GEMINI_RESULT'&&m.requestId===pendingGeminiRequest){pendingGeminiRequest='';const btn=$('#aiGeminiDirect');if(btn){btn.disabled=false;btn.textContent='Gerar aqui com Gemini'}const r=m.result;if(!r?.ok){toast(r?.error||'Falha na Gemini API.');if(r?.code==='API_KEY_MISSING')connectorPost('PORTAL_OPEN_CONNECTOR_OPTIONS');return}$('#aiResult').value=r.text||'';storeCurrent();toast(`Resposta recebida da Gemini API (${r.model||'modelo configurado'}).`);return}
});
setTimeout(()=>{connectorPost('PORTAL_CONNECTOR_PING');setTimeout(()=>{if(!connectorConnected)connectorStatus(false,'Conector: instale a extensão')},900)},250);
function bind(){
  $('#aiGranDirect').onclick=()=>{if(!connectorConnected){toast('Instale/ative o Conector Gran + Gemini no Chrome.');return}pendingGranRequest='gran-'+Date.now();connectorPost('PORTAL_GRAN_CAPTURE_REQUEST',{requestId:pendingGranRequest});toast('Lendo a aula aberta no Gran…')};
  $('#aiConnectorSettings').onclick=()=>{if(!connectorConnected){toast('Instale o Conector Gran + Gemini primeiro.');return}connectorPost('PORTAL_OPEN_CONNECTOR_OPTIONS')};
  $('#aiGeminiDirect').onclick=()=>{const f=getForm();if(!f.content){toast('Importe ou cole o material-base primeiro.');return}if(!connectorConnected){toast('Instale/ative o Conector Gran + Gemini no Chrome.');return}pendingGeminiRequest='gemini-'+Date.now();const btn=$('#aiGeminiDirect');btn.disabled=true;btn.textContent='Gerando…';connectorPost('PORTAL_GEMINI_REQUEST',{requestId:pendingGeminiRequest,prompt:buildPrompt(f)});};
  $('#aiPaste').onclick=async()=>{try{$('#aiMaterial').value=await navigator.clipboard.readText();toast('Texto colado.')}catch(e){toast('O navegador não permitiu ler a área de transferência. Use Ctrl+V.')}};
  $('#aiImport').onclick=()=>$('#aiFile').click();
  $('#aiFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const text=await f.text();$('#aiMaterial').value=text;if(!$('#aiTitle').value)$('#aiTitle').value=f.name.replace(/\.[^.]+$/,'');toast('Arquivo importado.')}catch(_e){toast('Não foi possível ler esse arquivo como texto.')}e.target.value=''};
  $('#aiSave').onclick=storeCurrent;$('#aiSaveResult').onclick=storeCurrent;
  $('#aiGemini').onclick=async()=>{const f=getForm();if(!f.content){toast('Cole ou importe o material-base primeiro.');return}const prompt=buildPrompt(f);window.open(GEMINI_URL,'_blank','noopener');const ok=await copyText(prompt);toast(ok?'Prompt copiado. Cole no Gemini com Ctrl+V.':'Gemini aberto. Copie o prompt manualmente.')};
  $('#aiNotebook').onclick=()=>{const f=getForm();if(!f.content&&!f.result){toast('Adicione material antes de preparar o NotebookLM.');return}download(`${safeName(f.title)}-notebooklm.md`,notebookMarkdown(f));window.open(NOTEBOOK_URL,'_blank','noopener');toast('Arquivo Markdown gerado. Adicione-o como fonte no NotebookLM.')};
  $('#aiExportAll').onclick=()=>{const items=state().items;if(!items.length){toast('Nenhum material salvo para exportar.');return}const md=items.map((x,i)=>`${i?'\n\n---\n\n':''}${notebookMarkdown(x)}`).join('');download(`${slug}-materiais-notebooklm.md`,md);toast('Pacote completo exportado.')};
  renderLibrary()
}
function init(){addStyles();addNav();addSection();bind()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
