const KEY='study-desk-v1', $=s=>document.querySelector(s), app=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=()=>crypto.randomUUID();
const sample={id:'biology-example',title:'Biology · example set',cards:[{q:'What is a coelom?',a:'A fluid-filled body cavity completely lined by mesoderm.'},{q:'What is enterocoely?',a:'Formation of the coelom from pouches of the embryonic gut.'},{q:'What is a synapomorphy?',a:'A shared derived trait that helps define an evolutionary group.'},{q:'What is a planula?',a:'A ciliated larval stage found in many cnidarians.'},{q:'What is a genetic bottleneck?',a:'A sharp reduction in population size that can reduce genetic diversity.'}].map((c,i)=>({...c,id:'sample-'+i,known:false}))};
let sets=[], storageError=false, view='loading', active=null, order=[], index=0, flipped=false, quizScore=0, answered=false, quizMissed=[], quizOptions=[], draft=null, busy=false, db=null, returnTo=null, loadFailed=false;

function imageValue(value){if(value===undefined||value===null||value==='')return '';if(typeof value!=='string'||value.length>4000000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Unsupported image in backup');return value}
function validate(data){
  if(!Array.isArray(data)||data.length>500)throw Error('Invalid backup');
  const ids=new Set();
  return data.map(s=>{
    if(!s||typeof s.title!=='string'||!s.title.trim()||!Array.isArray(s.cards)||s.cards.length>5000)throw Error('Invalid study set');
    let sid=typeof s.id==='string'?s.id:id();if(ids.has(sid))sid=id();ids.add(sid);
    const cardIds=new Set();
    return {id:sid,title:s.title.slice(0,200),cards:s.cards.map(c=>{
      if(!c||typeof c.q!=='string'||typeof c.a!=='string')throw Error('Invalid card');
      const qImage=imageValue(c.qImage),aImage=imageValue(c.aImage);
      if((!c.q.trim()&&!qImage)||(!c.a.trim()&&!aImage))throw Error('Each side needs text or an image');
      let cid=typeof c.id==='string'?c.id:id();if(cardIds.has(cid))cid=id();cardIds.add(cid);
      return {id:cid,q:c.q.slice(0,20000),a:c.a.slice(0,20000),qImage,aImage,known:c.known===true};
    })};
  });
}
function openDatabase(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB){reject(Error('Storage unavailable'));return}const request=indexedDB.open('study-desk',1);request.onupgradeneeded=()=>request.result.createObjectStore('library');request.onsuccess=()=>{const database=request.result;database.onversionchange=()=>database.close();resolve(database)};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other Study Desk windows and try again'))})}
function databaseRead(){return new Promise((resolve,reject)=>{const tx=db.transaction('library','readonly');const request=tx.objectStore('library').get('sets');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function databaseWrite(data){return new Promise((resolve,reject)=>{const tx=db.transaction('library','readwrite');tx.objectStore('library').put(data,'sets');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Save failed'))})}
async function initialize(){
  app.innerHTML='<div class="panel" role="status">Loading your study sets…</div>';
  let data;
  try{
    if(globalThis.indexedDB)db=await openDatabase();
    if(db){data=await databaseRead();if(data!==undefined){sets=validate(data);home();return}}
    const raw=localStorage.getItem(KEY);sets=raw?validate(JSON.parse(raw)):[sample];
    if(db)await databaseWrite(sets);else if(!raw)localStorage.setItem(KEY,JSON.stringify(sets));
    home();
  }catch{
    storageError=true;loadFailed=true;view='error';
    app.innerHTML='<section class="panel"><h1>Your saved sets could not be loaded</h1><p>Close other Study Desk windows and reload. Your saved data has not been replaced.</p><div class="actions">'+button('Reload','reload','primary')+button('Restore backup','restore','ghost')+'</div></section>';
  }
}
async function persist(next=sets){
  if(loadFailed){toast('Reload or restore a backup before making changes.');return false}
  try{const snapshot=structuredClone(next);if(db)await databaseWrite(snapshot);else localStorage.setItem(KEY,JSON.stringify(snapshot));sets=snapshot;storageError=false;return true}catch{storageError=true;toast('Could not save. Your edits are still here. Free some device space and try again.');return false}
}
let toastTimer;function toast(t){$('#toast').textContent=t;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),5000)}
function confirmAction(title,text,fn){$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;$('#confirm').showModal();$('#accept-confirm').onclick=()=>{$('#confirm').close();fn()}}
$('#cancel-confirm').onclick=()=>$('#confirm').close();
$('#confirm').addEventListener('close',()=>$('#accept-confirm').textContent='Continue');
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function button(text,action,cls=''){return `<button type="button" class="${cls}" data-action="${action}">${text}</button>`}
function imageHTML(src,alt,cls='card-image'){return src?`<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}">`:''}
function sideHTML(c,side,cls='card-image'){return `${c[side]?`<span class="side-text">${esc(c[side])}</span>`:''}${imageHTML(c[side+'Image'],side==='q'?'Front of card image':'Back of card image',cls)}`}
function answerKey(c){return JSON.stringify([c.a,c.aImage||''])}

function home(){
  view='home';active=null;returnTo=null;
  const total=sets.reduce((n,s)=>n+s.cards.length,0);
  app.innerHTML=`<div class="row"><div><div class="eyebrow">Your library</div><h1 style="margin-top:8px">Ready for a little practice?</h1><span class="muted">${sets.length} study ${sets.length===1?'set':'sets'} · ${total} cards</span></div>${button('＋ New study set','new','primary')}</div><div class="grid">${sets.map(s=>`<article class="set"><div class="stripe"></div><h2>${esc(s.title)}</h2><div class="muted">${s.cards.length} cards · ${s.cards.filter(c=>c.known).length} marked known</div><div class="actions"><button class="primary" data-study="${esc(s.id)}">Study</button><button data-edit="${esc(s.id)}">Edit cards</button></div></article>`).join('')||'<div class="panel empty"><h2>Your first set starts here</h2><p>Add questions and answers to start studying.</p></div>'}</div><div class="row toolbar"><div class="actions">${button('Export backup','export','ghost')}${button('Restore backup','restore','ghost')}</div>${button('Add to iPad','install','ghost')}</div><p class="note">Your cards, images, and progress are saved on this device. Export a backup regularly, especially before clearing Safari data. ${storageError?'<strong>Saving is unavailable. Keep a backup before leaving.</strong>':''}</p>`;
}
function editor(sid,cardId=null){
  view='edit';active=sid;const s=sets.find(s=>s.id===sid);
  draft=s?structuredClone(s):{id:id(),title:'',cards:[{id:id(),q:'',a:'',known:false},{id:id(),q:'',a:'',known:false}]};
  renderEditor();
  if(cardId){const el=document.getElementById('card-'+cardId);el?.scrollIntoView({behavior:'smooth',block:'center'});el?.querySelector('textarea')?.focus({preventScroll:true})}
}
function imageEditor(c,i,side){const name=side==='q'?'front':'back';return `<div class="image-editor">${imageHTML(c[side+'Image'],`Image on card ${i+1} ${name}`,'image-preview')}<div class="actions"><label class="image-picker" for="image-${side}-${i}">${c[side+'Image']?'Replace':'Add'} ${name} image</label><input class="visually-hidden" id="image-${side}-${i}" type="file" accept="image/*" data-image="${i}" data-side="${side}">${c[side+'Image']?`<button type="button" class="ghost danger" data-remove-image="${i}" data-side="${side}" aria-label="Remove image from card ${i+1} ${name}">Remove image</button>`:''}</div></div>`}
function renderEditor(){
  app.innerHTML=`<div class="row"><div><div class="eyebrow">Build your study set</div><h1 style="margin-top:8px">${active?'Edit cards':'New study set'}</h1></div>${button('Cancel','cancel-edit','ghost')}</div><form id="editor" class="panel"><div class="field"><label for="title">Set title</label><input id="title" maxlength="200" required placeholder="e.g. Invertebrate Biology" value="${esc(draft.title)}"></div><p class="note">Change any card below. Each side can have text, an image, or both.</p><div class="editor-tools row"><span class="muted">${draft.cards.length} cards</span><div class="actions">${button('＋ Add card','add')}${button('Paste cards','paste','ghost')}<button type="submit" class="primary">Save changes</button></div></div><div id="rows">${draft.cards.map((c,i)=>`<section class="editable-card" id="card-${esc(c.id)}"><div class="row"><h2 class="card-number">Card ${i+1}</h2><button type="button" class="ghost danger" data-remove="${i}" aria-label="Remove card ${i+1}">Remove card</button></div><div class="cardrow"><div><label for="q${i}">Front · question</label><textarea id="q${i}" data-q="${i}" maxlength="20000" placeholder="Term or question">${esc(c.q)}</textarea>${imageEditor(c,i,'q')}</div><div><label for="a${i}">Back · answer</label><textarea id="a${i}" data-a="${i}" maxlength="20000" placeholder="Definition or answer">${esc(c.a)}</textarea>${imageEditor(c,i,'a')}</div></div></section>`).join('')||'<p>No cards yet. Tap Add card to create one.</p>'}</div><div class="row toolbar"><div class="actions">${button('＋ Add card','add')}</div><button type="submit" class="primary">Save changes</button></div><div id="paste-area" class="hidden panel"><label for="bulk">One card per line: question [TAB] answer</label><textarea id="bulk" placeholder="Coelom&#9;A fluid-filled body cavity"></textarea><p class="note">You can also separate each question and answer with |.</p>${button('Add pasted cards','bulk')}</div></form>${active?'<div class="toolbar">'+button('Delete this set','delete','ghost danger')+'</div>':''}`;
  $('#editor').onsubmit=saveEditor;
}
function capture(){draft.title=$('#title').value;draft.cards.forEach((c,i)=>{c.q=$(`[data-q="${i}"]`).value;c.a=$(`[data-a="${i}"]`).value})}
function setBusy(value,message='Saving…'){busy=value;app.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=value);app.setAttribute('aria-busy',String(value));if(value)toast(message)}
async function saveEditor(e){
  e.preventDefault();if(busy)return;capture();draft.title=draft.title.trim();
  if(!draft.title||draft.cards.length===0){toast('Add a title and at least one card.');return}
  draft.cards=draft.cards.map(c=>({...c,q:c.q.trim(),a:c.a.trim()}));
  const bad=draft.cards.findIndex(c=>(!c.q&&!c.qImage)||(!c.a&&!c.aImage));
  if(bad>=0){toast(`Card ${bad+1} needs text or an image on each side.`);document.getElementById('card-'+draft.cards[bad].id)?.scrollIntoView({behavior:'smooth',block:'center'});return}
  const original=sets.find(s=>s.id===active);
  draft.cards=draft.cards.map(c=>{const old=original?.cards.find(x=>x.id===c.id);return old&&(old.q!==c.q||old.a!==c.a||(old.qImage||'')!==(c.qImage||'')||(old.aImage||'')!==(c.aImage||''))?{...c,known:false}:c});
  const next=active?sets.map(s=>s.id===active?draft:s):[...sets,draft];
  setBusy(true);const saved=await persist(next);setBusy(false);
  if(saved){const dest=returnTo;returnTo=null;if(dest){start(draft.id,'cards');const position=order.findIndex(c=>c.id===dest);if(position>=0)index=position;flash()}else home();toast('Changes saved.')} 
}
async function prepareImage(file){
  if(file.size>25000000)throw Error('Choose an image smaller than 25 MB.');
  if(file.type&&!file.type.startsWith('image/'))throw Error('Choose an image file.');
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('This image could not be opened. Try a JPEG, PNG, or screenshot.'));img.src=url});
    const scale=Math.min(1,2000/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Images are unavailable in this browser.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
    let data=canvas.toDataURL('image/webp',.88);
    if(data.length>1800000){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/jpeg',.82)}
    if(data.length>4000000)throw Error('This image is too large. Choose a smaller image.');
    return imageValue(data);
  }finally{URL.revokeObjectURL(url)}
}
app.addEventListener('change',async e=>{
  const input=e.target;if(input.dataset.image===undefined||busy)return;const file=input.files?.[0];if(!file)return;
  capture();const card=draft.cards[Number(input.dataset.image)],side=input.dataset.side;setBusy(true,'Preparing image…');
  try{const data=await prepareImage(file);card[side+'Image']=data;setBusy(false);renderEditor();document.getElementById('card-'+card.id)?.scrollIntoView({block:'nearest'});toast('Image added. Tap Save changes to keep it.')}catch(error){setBusy(false);input.value='';toast(error.message)}
});
function cancelEdit(){confirmAction('Discard edits?','Your unsaved changes will be discarded.',()=>{if(returnTo){const cid=returnTo;returnTo=null;start(active);const pos=order.findIndex(c=>c.id===cid);if(pos>=0)index=pos;flash()}else home()})}
function start(sid,mode='cards',onlyUnknown=false){
  active=sid;view=mode;const s=sets.find(s=>s.id===sid);order=shuffle(s.cards.filter(c=>!onlyUnknown||!c.known));index=0;flipped=false;quizScore=0;quizMissed=[];answered=false;
  if(!order.length){toast(s.cards.length?'All cards are marked known. Start a full session to review them.':'Add cards to this set before studying.');home();return}mode==='quiz'?quiz():flash();
}
function studyHeader(){const s=sets.find(s=>s.id===active);return `<div class="row">${button('Back to sets','home','ghost')}<span class="badge">${esc(s.title)}</span></div><div class="row toolbar"><div class="actions">${button('Flashcards','cards',view==='cards'?'primary':'ghost')}${button('Quiz','quiz',view==='quiz'?'primary':'ghost')}</div><span class="muted">${index+1} / ${order.length}</span></div><div class="progress"><div style="width:${index/order.length*100}%"></div></div>`}
function flash(){
  view='cards';const c=order[index];
  app.innerHTML=`<div class="study">${studyHeader()}<button class="flash" data-action="flip" aria-label="${flipped?'Show front':'Show back'}"><span class="eyebrow">${flipped?'Back · answer':'Front · question'}</span><span class="text">${sideHTML(c,flipped?'a':'q')}</span><small>Tap to flip · Space on a keyboard</small></button><div class="row"><button class="ghost" data-action="prev" ${index===0?'disabled':''}>Previous</button><div class="actions">${button('Practice again','again','ghost')}${button('I know this','known','lime')}</div></div><div class="row toolbar">${button('Edit this card','edit-current','ghost')}<div class="actions">${button('Shuffle','shuffle','ghost')}${button('Review unknown cards','unknown','ghost')}</div></div></div>`;
}
async function nextCard(known){const cid=order[index].id,next=sets.map(x=>x.id===active?{...x,cards:x.cards.map(c=>c.id===cid?{...c,known}:c)}:x);setBusy(true);const saved=await persist(next);setBusy(false);if(!saved)return;order[index].known=known;index++;flipped=false;index>=order.length?done(false):flash()}
function quiz(){
  view='quiz';answered=false;const c=order[index],s=sets.find(s=>s.id===active);const unique=new Map(s.cards.map(x=>[answerKey(x),x]));unique.delete(answerKey(c));quizOptions=shuffle([c,...shuffle([...unique.values()]).slice(0,3)]);
  app.innerHTML=`<div class="study">${studyHeader()}<section class="panel"><div class="eyebrow">Choose the answer</div><h2 class="quiz-question">${sideHTML(c,'q')}</h2>${quizOptions.length>1?`<div class="options">${quizOptions.map((a,i)=>`<button class="option" data-choice="${i}">${sideHTML(a,'a','option-image')}</button>`).join('')}</div>`:'<p class="note">This set has only one unique answer. Add more cards for a multiple-choice quiz.</p>'+button('Show answer','reveal','ghost')}<div id="feedback" class="feedback" role="status"></div><div id="quiz-next" class="hidden">${button(index+1===order.length?'See results':'Next question','nextquiz','primary')}</div></section></div>`;
}
function choose(i){if(answered||!quizOptions[i])return;answered=true;const c=order[index],key=answerKey(c),correct=answerKey(quizOptions[i])===key;if(correct)quizScore++;else quizMissed.push(c);document.querySelectorAll('[data-choice]').forEach(b=>{b.disabled=true;if(answerKey(quizOptions[Number(b.dataset.choice)])===key)b.classList.add('correct');else if(Number(b.dataset.choice)===i)b.classList.add('wrong')});$('#feedback').innerHTML=correct?'Correct.':`<p>The answer is:</p>${sideHTML(c,'a')}`;$('#quiz-next').classList.remove('hidden')}
function done(isQuiz){view='results';app.innerHTML=`<div class="study">${button('Back to sets','home','ghost')}<div class="panel center"><div class="eyebrow">Session complete</div><h1 style="margin-top:20px">${isQuiz?'Your quiz results':'Good work. Take a breath.'}</h1>${isQuiz?`<div class="score">${Math.round(quizScore/order.length*100)}%</div><p>${quizScore} of ${order.length} correct</p>`:`<p>You reviewed ${order.length} cards.</p><p class="muted">${sets.find(s=>s.id===active).cards.filter(c=>c.known).length} cards in this set are marked known.</p>`}<div class="actions" style="justify-content:center">${button('Study again','cards','primary')}${isQuiz?button('Try quiz again','quiz','ghost'):button('Take a quiz','quiz','ghost')}${isQuiz&&quizMissed.length?button('Review missed cards','missed','lime'):''}</div></div></div>`}
function backup(){const blob=new Blob([JSON.stringify({app:'Study Desk',version:2,sets},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='study-desk-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Backup includes your images. Save the downloaded file in Files.')}
$('#restore').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>200000000){toast('Backup is too large (maximum 200 MB).');return}
  try{const data=JSON.parse(await file.text()),imported=validate(Array.isArray(data)?data:data.sets);confirmAction('Restore backup?',`Replace your ${sets.length} current sets with ${imported.length} backed-up sets, including their images? Export your current sets first if you want to keep them.`,async()=>{const previousFailure=loadFailed;loadFailed=false;setBusy(true);const saved=await persist(imported);setBusy(false);if(saved){home();toast('Backup restored.')}else loadFailed=previousFailure})}catch{toast('This file is not a valid Study Desk backup.')}
};
app.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.disabled||busy)return;
  if(b.dataset.study){start(b.dataset.study);return}
  if(b.dataset.edit){returnTo=null;editor(b.dataset.edit);return}
  if(b.dataset.remove!==undefined){capture();const i=Number(b.dataset.remove);confirmAction(`Remove card ${i+1}?`,'The card will be removed when you save your changes.',()=>{draft.cards.splice(i,1);renderEditor()});return}
  if(b.dataset.removeImage!==undefined){capture();draft.cards[Number(b.dataset.removeImage)][b.dataset.side+'Image']='';renderEditor();return}
  if(b.dataset.choice!==undefined){choose(Number(b.dataset.choice));return}
  switch(b.dataset.action){
    case'home':view==='edit'?cancelEdit():home();break;
    case'cancel-edit':cancelEdit();break;
    case'new':returnTo=null;editor(null);break;
    case'add':capture();draft.cards.push({id:id(),q:'',a:'',known:false});renderEditor();document.querySelectorAll('[data-q]')[draft.cards.length-1].focus();break;
    case'paste':$('#paste-area').classList.toggle('hidden');break;
    case'bulk':{const lines=$('#bulk').value.trim().split(/\r?\n/),cards=[];for(const line of lines){const pos=line.includes('\t')?line.indexOf('\t'):line.indexOf('|');if(pos<1||!line.slice(pos+1).trim()){toast('Each line needs a question, TAB or |, and an answer.');return}cards.push({id:id(),q:line.slice(0,pos).trim(),a:line.slice(pos+1).trim(),known:false})}capture();draft.cards=draft.cards.filter(c=>c.q.trim()||c.a.trim()||c.qImage||c.aImage).concat(cards);renderEditor();toast(`${cards.length} cards added.`);break}
    case'delete':confirmAction('Delete this study set?','This removes the set, its images, and its progress from this device.',async()=>{setBusy(true);const saved=await persist(sets.filter(s=>s.id!==active));setBusy(false);if(saved)home()});break;
    case'edit-current':returnTo=order[index].id;editor(active,returnTo);break;
    case'flip':flipped=!flipped;flash();break;
    case'prev':index=Math.max(0,index-1);flipped=false;flash();break;
    case'known':await nextCard(true);break;
    case'again':await nextCard(false);break;
    case'cards':start(active,'cards');break;
    case'quiz':start(active,'quiz');break;
    case'unknown':start(active,'cards',true);break;
    case'shuffle':order=shuffle(order);index=0;flipped=false;flash();break;
    case'nextquiz':index++;index>=order.length?done(true):quiz();break;
    case'reveal':answered=true;$('#feedback').innerHTML=sideHTML(order[index],'a');quizMissed.push(order[index]);$('#quiz-next').classList.remove('hidden');b.disabled=true;break;
    case'missed':order=shuffle(quizMissed);index=0;flipped=false;flash();break;
    case'export':backup();break;
    case'restore':$('#restore').click();break;
    case'reload':location.reload();break;
    case'install':confirmAction('Use Study Desk on your iPad','Open this app in Safari. Tap Share, then Add to Home Screen. Back up any sets made in Safari before switching: the Home Screen app may use separate storage.',()=>{});$('#accept-confirm').textContent='Got it';break;
  }
});
document.addEventListener('keydown',e=>{if(view==='cards'&&!busy&&!$('#confirm').open&&!['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)&&e.code==='Space'){e.preventDefault();flipped=!flipped;flash()}});
const ready=initialize();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
