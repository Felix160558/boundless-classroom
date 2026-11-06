import {topics,respond} from './tutor.js';
import {teacher} from './teacher-client.js?v=remember-access-15';
import {renderTeacherReply,lessonNotes} from './teacher-content.js?v=gentle-board-13';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let space=null,topic='free',pending=false,voice=false,currentMode='home',xrSupported=false;
let toastTimer=null;
let activeReply=null;
let dictation=null,dictationFailure='',voiceSubmit=false;
let readAloud=null,readAloudGeneration=0;
const lessonBoards=new Map();
function syncBoard(){
  const notes=lessonBoards.get(topic);
  const accessible=$('#whiteboard-notes');
  accessible.hidden=currentMode==='home'||!notes;
  if(notes){
    const title=document.createElement('h3');title.textContent=notes.title;
    const list=document.createElement('ul');for(const point of notes.points){const item=document.createElement('li');item.textContent=point;list.append(item);}
    accessible.replaceChildren(title,list);
  }else accessible.replaceChildren();
  if(currentMode!=='home'&&notes)space?.setLesson(notes);
  else if(currentMode==='classroom')space?.setBoard(topics[topic].title,topics[topic].sub);
  else space?.setBoard('Stay curious.',currentMode==='vr'?'The universe is your classroom.':'Every question is a beginning.');
}
const defaultSceneDescription=$('#universe').getAttribute('aria-label');
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4000);}
function updateMode(){
  const next=location.hash.slice(1);
  const previousMode=currentMode;
  currentMode=['classroom','vr'].includes(next)?next:'home';
  if(currentMode!==previousMode)cancelReadAloud();
  if(currentMode!=='classroom')dictation?.cancel();
  document.body.dataset.mode=currentMode;
  $('#home-view').hidden=currentMode!=='home';
  $('#classroom-view').hidden=currentMode!=='classroom';
  $('#vr-view').hidden=currentMode!=='vr';
  $('#back-home').hidden=currentMode==='home';
  $('#enter-vr').hidden=currentMode==='vr';
  $('#immersive-btn').hidden=currentMode!=='vr';
  space?.setMode(currentMode);
  $('#universe').setAttribute('aria-label',currentMode==='vr'?'你坐在课桌前，面前是猫老师与白板，左右和头顶是通向星空的玻璃。拖动或使用方向键环视。':defaultSceneDescription);
  $('#back-home').lastChild.textContent=currentMode==='vr'?' 离开教室':' 返回太空';
  syncBoard();
  syncComposer();
  if(currentMode==='classroom')$('#chat-input').focus({preventScroll:true});
  else if(currentMode==='vr')$('#universe').focus({preventScroll:true});
  else if(currentMode==='home'&&next)$('#open-match').focus({preventScroll:true});
}
function navigate(mode){if(currentMode===mode)return;location.hash=mode==='home'?'home':mode;}
$('#teacher-action').addEventListener('click',()=>space?.greetTeacher());
$('#open-match').addEventListener('click',()=>navigate('classroom'));
$('#enter-vr').addEventListener('click',()=>navigate('vr'));
$('#back-home').addEventListener('click',async()=>{
  try{await space?.endImmersive();if(document.fullscreenElement)await document.exitFullscreen();}catch{}
  navigate('home');
});
window.addEventListener('hashchange',updateMode);
updateMode();

const dialog=$('#book-dialog'),dateInput=$('#book-date'),timeInput=$('#book-time');
const notice=$('#book-notice'),defaultNotice=notice.textContent;
const bookingKey='boundless_demo_booking';
function localDate(date){return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);}
function setBookingDefaults(){
  const now=new Date(),later=new Date(now.getTime()+60*60*1000);
  dateInput.min=localDate(now);dateInput.value=localDate(later);
  timeInput.value=String(later.getHours()).padStart(2,'0')+':'+String(later.getMinutes()).padStart(2,'0');
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'本地时间';
  $('#booking-timezone').textContent=zone;return zone;
}
function showSaved(){
  notice.textContent=defaultNotice;$('#clear-booking').hidden=true;
  try{
    const saved=JSON.parse(localStorage.getItem(bookingKey));
    if(saved&&typeof saved.topic==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(saved.date)&&/^\d{2}:\d{2}$/.test(saved.time)){
      notice.textContent='上次本地示意：'+saved.date+' '+saved.time+' · '+saved.topic+'\n非正式预约，尚未通知老师。';
      $('#clear-booking').hidden=false;
    }
  }catch{}
}
$('#open-book').addEventListener('click',()=>{setBookingDefaults();showSaved();dialog.showModal();});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));
dialog.addEventListener('click',e=>{
  const r=dialog.getBoundingClientRect();
  if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dialog.close();
});
$('#book-form').addEventListener('submit',e=>{
  e.preventDefault();const text=$('#book-topic').value.trim();if(!text)return;
  const now=new Date(),value=new Date(dateInput.value+'T'+timeInput.value);
  dateInput.min=localDate(now);
  if(!Number.isFinite(value.getTime())||value.getTime()<=now.getTime()){
    notice.textContent='请选择未来的日期和时间。预约仍然只是本地演示。';return;
  }
  const booking={topic:text,date:dateInput.value,time:timeInput.value,teacher:'cat',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,startsAt:value.toISOString(),demo:true};
  try{localStorage.setItem(bookingKey,JSON.stringify(booking));}
  catch{notice.textContent='浏览器未能保存。请检查是否允许本地存储；没有生成或发送预约。';toast('保存失败，请检查浏览器本地存储设置。');return;}
  notice.textContent='已保存本地预约示意：'+booking.date+' '+booking.time+' · '+text+'\n尚未与任何真人约定，也不会发送通知。';
  $('#clear-booking').hidden=false;toast('预约示意已保存在本浏览器。');
});
$('#clear-booking').addEventListener('click',()=>{
  try{localStorage.removeItem(bookingKey);notice.textContent=defaultNotice;$('#clear-booking').hidden=true;toast('已清除本地预约示意。');}
  catch{toast('未能清除，请检查浏览器存储设置。');}
});

function addMessage(who,text,mine=false,rich=false){
  const item=document.createElement('div');item.className='message'+(mine?' mine':'');
  const label=document.createElement('small');label.textContent=who;
  const bubble=document.createElement('div');bubble.className='bubble';
  if(rich)renderTeacherReply(bubble,text);else bubble.textContent=text;
  item.append(label,bubble);$('#messages').append(item);$('#messages').scrollTop=$('#messages').scrollHeight;return item;
}
function teacherLabel(){return teacher.configured?'猫老师 · AI':'猫老师 · 离线示例';}
function greeting(){
  cancelReadAloud();
  lessonBoards.clear();syncBoard();
  $('#messages').replaceChildren();
  addMessage(teacherLabel(),'你好呀，我是猫小将。🐾\n宇宙很大，我们从一个小问题开始。\n今天想一起弄明白什么？');
}
const connectDialog=$('#teacher-connect-dialog');
function updateConnection(){
  $('.teacher-session-actions').hidden=!teacher.configured;
  $('#chat-mode').textContent=teacher.configured?(teacher.connected?'AI · 已连接':'AI · 待连接'):'离线演示';
  $('#teacher-connect-button').hidden=!teacher.configured;
  $('#teacher-connect-button').textContent=teacher.connected?'退出连接':'连接猫老师';
  $('#chat-reset').hidden=!teacher.configured;
  $('#chat-service-note').textContent=teacher.configured?'受邀试用 · 回复由 AI 生成，请核实重要结论':'预设教学脚本 · 尚未接入大模型';
}
function openTeacherConnection(){
  cancelReadAloud();
  dictation?.cancel();
  $('#teacher-connect-status').textContent='';connectDialog.showModal();$('#teacher-invite').focus();
}
$('#teacher-connect-button').addEventListener('click',()=>{
  dictation?.cancel();dictation?.forget();
  if(teacher.connected){teacher.disconnect();activeReply?.abort();greeting();updateConnection();toast('已退出连接，并清除此浏览器记住的连接。');}
  else openTeacherConnection();
});
window.addEventListener('storage',event=>{
  if(event.key!==teacher.storageKey&&event.key!==null)return;
  const previous=teacher.token;teacher.restore();
  if(previous!==teacher.token){dictation?.cancel();dictation?.forget();activeReply?.abort();greeting();updateConnection();}
});
$('#teacher-connect-close').addEventListener('click',()=>connectDialog.close());
$('#teacher-connect-form').addEventListener('submit',async e=>{
  e.preventDefault();const input=$('#teacher-invite'),button=$('#teacher-connect-submit');
  if(!input.value.trim()||button.disabled)return;button.disabled=true;$('#teacher-connect-status').textContent='正在连接猫老师…';
  try{await teacher.connect(input.value.trim());input.value='';connectDialog.close();updateConnection();toast(teacher.remembered?'已连接，此浏览器会记住连接 30 天。🐾':'已连接；此浏览器未能保存连接，刷新后需要重填邀请码。');}
  catch(error){$('#teacher-connect-status').textContent=error.message;}
  finally{button.disabled=false;}
});
connectDialog.addEventListener('close',()=>{$('#teacher-invite').value='';});
$('#chat-reset').addEventListener('click',()=>{if(pending)return;dictation?.cancel();dictation?.forget();teacher.reset();greeting();toast('已开始新对话。');});
$('#chat-cancel').addEventListener('click',()=>{cancelReadAloud();activeReply?.abort();});
updateConnection();
if(teacher.configured)greeting();
$$('.subject-button').forEach(btn=>btn.addEventListener('click',()=>{
  cancelReadAloud();
  dictation?.cancel();dictation?.forget();
  topic=btn.dataset.topic;$$('.subject-button').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-pressed',String(b===btn));});
  $('#chat-input').placeholder=topics[topic].prompt;syncBoard();
  addMessage(teacher.configured?'学习主题':'猫老师 · 离线示例','我们来探索'+topics[topic].name+'。\n你可以问：'+topics[topic].prompt);
}));
function syncComposer(){
  const input=$('#chat-input');input.style.height='auto';input.style.height=Math.min(132,input.scrollHeight)+'px';
  $('.send').disabled=pending||voiceSubmit||!input.value.trim();
}
function renderDictation({state='idle',message='',supported=true,canRestart=false,seconds=0}){
  const active=['starting','listening','stopping'].includes(state),button=$('#dictation-button');
  $('#chat-form').dataset.dictation=state;button.disabled=state==='stopping';
  button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-disabled',String(!supported));
  button.setAttribute('aria-label',active?'停止语音输入':'语音输入');
  button.title=active?'停止语音输入':'语音输入 · 由浏览器识别，确认文字后再发送';
  if($('#dictation-status').textContent!==message)$('#dictation-status').textContent=message;
  $('#dictation-time').textContent=state==='listening'?Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'';
  $('#dictation-row').hidden=!message;$('#dictation-restart').hidden=!canRestart;
  syncComposer();
}
const dictationWait=setTimeout(()=>{
  dictationFailure='语音输入载入较慢，请稍后再试。';$('#dictation-button').disabled=false;
},12000);
import('./dictation.js?v=voice-input-20').then(({createDictation})=>{
  clearTimeout(dictationWait);dictationFailure='';
  dictation=createDictation({getText:()=>$('#chat-input').value,setText:text=>{$('#chat-input').value=text;syncComposer();},
    getLanguage:()=>topic==='english'?'en-US':'zh-CN',onState:renderDictation});
}).catch(()=>{
  clearTimeout(dictationWait);dictationFailure='语音输入暂未载入，请刷新重试；文字输入仍可使用。';$('#dictation-button').disabled=false;
});
$('#dictation-button').addEventListener('click',()=>{
  if(!dictation){renderDictation({state:'error',message:dictationFailure||'语音输入正在准备，请稍后再试。'});return;}
  if(dictation.active){void dictation.stop();return;}
  cancelReadAloud();
  dictation.start();
});
$('#dictation-restart').addEventListener('click',()=>{
  if(!dictation||dictation.active)return;
  cancelReadAloud();dictation.restart();
});
$('#chat-input').addEventListener('beforeinput',()=>{dictation?.cancel();dictation?.forget();});
$('#chat-input').addEventListener('input',syncComposer);
window.addEventListener('pagehide',()=>{dictation?.cancel();cancelReadAloud();});
function setTeacherSpeech(type,detail={}){space?.setTeacherSpeech?.({type,...detail});}
function cancelReadAloud(){
  // Invalidate first: Safari may deliver a cancelled utterance's end/error late.
  readAloudGeneration++;readAloud=null;setTeacherSpeech('stop');
  try{if('speechSynthesis'in window)speechSynthesis.cancel();}catch{}
}
function speak(text){
  cancelReadAloud();
  if(!voice||currentMode!=='classroom'||document.hidden||dictation?.active||!('speechSynthesis'in window))return;
  try{
    const utterance=new SpeechSynthesisUtterance(text),generation=readAloudGeneration;
    const take={utterance,generation,text,phase:'queued',charIndex:0,charLength:0};
    readAloud=take; // Retain the utterance while the browser owns its playback.
    utterance.lang=/[\u4e00-\u9fff]/.test(text)?'zh-CN':'en-US';utterance.rate=.96;
    const current=()=>readAloud===take&&readAloudGeneration===generation;
    const allowed=()=>voice&&currentMode==='classroom'&&!document.hidden&&!dictation?.active;
    const finish=()=>{if(!current())return;readAloud=null;setTeacherSpeech('stop');};
    utterance.onstart=()=>{
      if(!current())return;if(!allowed()){cancelReadAloud();return;}
      take.phase='speaking';setTeacherSpeech('start',{text:take.text});
    };
    utterance.onboundary=event=>{
      if(!current()||take.phase!=='speaking')return;
      if(!allowed()){cancelReadAloud();return;}
      take.charIndex=Number.isFinite(event.charIndex)?Math.max(0,Math.min(text.length,event.charIndex)):take.charIndex;
      take.charLength=Number.isFinite(event.charLength)?Math.max(0,event.charLength):0;
      setTeacherSpeech('boundary',{charIndex:take.charIndex,charLength:take.charLength,name:event.name});
    };
    utterance.onpause=()=>{if(!current())return;take.phase='paused';setTeacherSpeech('pause');};
    utterance.onresume=()=>{
      if(!current())return;if(!allowed()){cancelReadAloud();return;}
      take.phase='speaking';setTeacherSpeech('resume');
    };
    utterance.onend=finish;
    utterance.onerror=event=>{
      if(!current())return;finish();
      if(!['canceled','interrupted'].includes(event.error))toast('当前浏览器未能朗读，可以继续使用文字。');
    };
    speechSynthesis.speak(utterance);
  }catch{cancelReadAloud();toast('当前浏览器未能朗读。');}
}
$('#voice-btn').addEventListener('click',()=>{
  if(!('speechSynthesis'in window)){toast('当前浏览器不支持文字朗读。');return;}
  voice=!voice;$('#voice-btn').textContent='朗读：'+(voice?'开':'关');$('#voice-btn').setAttribute('aria-pressed',String(voice));
  if(!voice)cancelReadAloud();toast(voice?'下一条回复将使用浏览器朗读。':'朗读已关闭。');
});
async function runTurn(turn,retry=false){
  if(pending)return;
  cancelReadAloud();
  dictation?.cancel();dictation?.forget();
  const input=$('#chat-input');pending=true;$('.send').disabled=true;$('#chat-reset').disabled=true;
  if(retry&&input.value.trim()===turn.message)input.value='';
  $$('.retry-message').forEach(button=>{button.disabled=true;});
  if(!retry)addMessage('你',turn.message,true);
  const typing=addMessage(teacher.configured?'猫老师 · 正在想一想':'猫老师 · 准备示例中','⋯');typing.classList.add('thinking-message');
  $('#messages').setAttribute('aria-busy','true');
  activeReply=new AbortController();$('#chat-cancel').hidden=!teacher.configured;
  const replyConnection=teacher.token;
  try{
    let answer,notes=null;
    if(teacher.configured){
      const result=await teacher.send(turn,{signal:activeReply.signal});answer=result.reply;notes=lessonNotes(answer,result.board);
      if(result.contextTrimmed)toast('较早的对话已移出当前上下文，需要时可以再提醒猫老师。');
      if(result.finishReason==='length')toast('这次回答达到了长度上限，可以接着追问。');
    }else{await new Promise(resolve=>setTimeout(resolve,650));answer=respond(turn.message,turn.topic);notes=lessonNotes(answer);}
    typing.remove();addMessage(teacherLabel(),answer,false,true);
    if(notes)lessonBoards.set(turn.topic,notes);else lessonBoards.delete(turn.topic);syncBoard();
    space?.greetTeacher();
    if(currentMode==='classroom')speak(answer);
  }catch(error){
    if(teacher.configured&&teacher.token!==replyConnection){typing.remove();if(error.code==='unauthorized'){if(!input.value)input.value=turn.message;openTeacherConnection();}return;}
    typing.remove();const item=addMessage('连接提示',error.message);item.classList.add('message-error');
    if(error.code==='unauthorized')openTeacherConnection();
    else if(error.code==='expired'){
      const fresh=document.createElement('button');fresh.type='button';fresh.className='retry-message';fresh.textContent='开始新对话';fresh.addEventListener('click',()=>{if(pending)return;teacher.reset();greeting();input.value=turn.message;});item.append(fresh);
    }else if(!['daily_limit','duplicate','invalid','cancelled'].includes(error.code)){
      const again=document.createElement('button');again.type='button';again.className='retry-message';again.textContent='重试';again.addEventListener('click',()=>{item.remove();runTurn(turn,true);});item.append(again);
    }
    if(!input.value)input.value=turn.message;
  }finally{
    pending=false;activeReply=null;syncComposer();$('#chat-reset').disabled=false;$('#chat-cancel').hidden=true;
    $('#messages').setAttribute('aria-busy','false');updateConnection();if(currentMode==='classroom')input.focus({preventScroll:true});
  }
}
$('#chat-form').addEventListener('submit',async e=>{
  e.preventDefault();if(pending||voiceSubmit)return;
  voiceSubmit=true;syncComposer();
  try{
    await dictation?.stop();
    const input=$('#chat-input'),question=input.value.trim();
    if(!question||currentMode!=='classroom')return;
    if(teacher.configured&&!teacher.connected){openTeacherConnection();return;}
    const turn=teacher.turn(question,topic);input.value='';syncComposer();void runTurn(turn);
  }finally{voiceSubmit=false;syncComposer();}
});
$('#chat-input').addEventListener('keydown',e=>{
  if(e.key==='Escape'&&dictation?.active){e.preventDefault();e.stopPropagation();void dictation.stop();return;}
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#chat-form').requestSubmit();}
});
$('#immersive-btn').addEventListener('click',async()=>{
  if(xrSupported&&space){
    try{await space.enterImmersive();}catch(e){toast('未能进入头显：'+e.message);}return;
  }
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
    else toast('此浏览器不支持全屏，可直接拖动体验空间。');
  }catch{toast('此浏览器暂时无法进入全屏。');}
});
document.addEventListener('fullscreenchange',()=>{if(!xrSupported)$('#immersive-btn').innerHTML=document.fullscreenElement?'退出全屏 ⤢':'全屏 ⤢';});
document.addEventListener('visibilitychange',()=>{if(document.hidden){dictation?.cancel();cancelReadAloud();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('dialog[open]')&&currentMode!=='home'&&!document.fullscreenElement)navigate('home');});

function fallback(message){
  document.body.classList.add('fallback');$('#scene-loading').hidden=true;$('#fallback-note').hidden=false;
  if(message)$('#fallback-note').textContent=message;
}
const sceneStartupTimer=setTimeout(()=>{
  if(!space)fallback('三维教室资源载入较慢，可刷新重试。文字课堂和预约仍可使用。');
},45000);
import('./space-scene.js?v=natural-mouth-25').then(async({createSpace})=>{
  clearTimeout(sceneStartupTimer);
  space=createSpace($('#universe'),(state,detail)=>{
    if(state==='ready'){
      document.body.classList.remove('fallback');$('#fallback-note').hidden=true;$('#scene-loading').hidden=true;
    }
    if(state==='teacher-loading'){
      const indicator=$('#scene-loading');indicator.replaceChildren(document.createElement('span'),document.createTextNode(' 正在载入你的猫老师'));indicator.hidden=false;
    }
    if(state==='teacher-progress')$('#scene-loading').lastChild.textContent=' 正在载入你的猫老师 · '+detail+'%';
    if(state==='teacher-ready')$('#scene-loading').hidden=true;
    if(state==='teacher-detail-error')toast('细毛细节暂未载入，可刷新重试；猫老师和文字课堂仍可使用。');
    if(state==='teacher-tail-motion'){
      // Read-only DOM diagnostics for a reported motion failure; no extra UI.
      $('#universe').dataset.tailMotion=detail.mode;$('#universe').dataset.tailPose=detail.pose.join(',');
    }
    if(state==='teacher-tail-error'){
      $('#fallback-note').textContent='猫老师已载入，尾巴动画资源暂未载入，可刷新重试。';$('#fallback-note').hidden=false;
    }
    if(state==='teacher-tail-ready')$('#fallback-note').hidden=true;
    if(state==='teacher-error'){
      $('#scene-loading').hidden=true;$('#fallback-note').textContent='猫老师模型暂时未能载入，刷新可重试。文字课堂和本地预约仍可使用。';$('#fallback-note').hidden=false;
    }
    if(state==='lost')fallback('3D 画面暂时中断。请刷新恢复，文字课堂和本地预约仍可使用。');
    if(state==='restored'){document.body.classList.remove('fallback');$('#fallback-note').hidden=true;}
    if(state==='xr-start'){$('#xr-status').textContent='单人头显空间，已在课桌座位处定位。';}
    if(state==='xr-end'){$('#xr-status').textContent='课桌座位视角，拖动或方向键环视。';}
  });
  if(readAloud&&readAloud.phase!=='queued'){
    setTeacherSpeech('start',{text:readAloud.text});
    setTeacherSpeech('boundary',{charIndex:readAloud.charIndex,charLength:readAloud.charLength});
    if(readAloud.phase==='paused')setTeacherSpeech('pause');
  }
  updateMode();xrSupported=await space.immersiveSupported();
  if(xrSupported){$('#immersive-btn').textContent='进入头显 ↗';$('#xr-status').textContent='课桌座位视角，设备支持实验性单人头显入口。';}
}).catch(()=>{clearTimeout(sceneStartupTimer);fallback('三维教室暂未载入，请刷新重试。文字课堂和预约仍可使用。');});
