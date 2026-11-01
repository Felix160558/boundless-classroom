import {topics,respond} from './tutor.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let space=null,topic='free',pending=false,voice=false,currentMode='home',xrSupported=false;
let toastTimer=null;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4000);}
function updateMode(){
  const next=location.hash.slice(1);
  currentMode=['classroom','vr'].includes(next)?next:'home';
  document.body.dataset.mode=currentMode;
  $('#home-view').hidden=currentMode!=='home';
  $('#classroom-view').hidden=currentMode!=='classroom';
  $('#vr-view').hidden=currentMode!=='vr';
  $('#back-home').hidden=currentMode==='home';
  $('#enter-vr').hidden=currentMode==='vr';
  $('#immersive-btn').hidden=currentMode!=='vr';
  space?.setMode(currentMode);
  if(currentMode==='vr')space?.setBoard('Stay curious.','The universe is your classroom.');
  else if(currentMode==='classroom')space?.setBoard(topics[topic].title,topics[topic].sub);
  else space?.setBoard('Stay curious.','Every question is a beginning.');
  if(currentMode==='classroom')$('#chat-input').focus({preventScroll:true});
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

function addMessage(who,text,mine=false){
  const item=document.createElement('div');item.className='message'+(mine?' mine':'');
  const label=document.createElement('small');label.textContent=who;
  const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=text;
  item.append(label,bubble);$('#messages').append(item);$('#messages').scrollTop=$('#messages').scrollHeight;return item;
}
$$('.subject-button').forEach(btn=>btn.addEventListener('click',()=>{
  topic=btn.dataset.topic;$$('.subject-button').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-pressed',String(b===btn));});
  $('#chat-input').placeholder=topics[topic].prompt;space?.setBoard(topics[topic].title,topics[topic].sub);
  addMessage('猫老师 · 离线示例','我们来探索'+topics[topic].name+'。\n你可以问：'+topics[topic].prompt);
}));
function speak(text){
  if(!voice||!('speechSynthesis'in window))return;
  try{speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=/[\u4e00-\u9fff]/.test(text)?'zh-CN':'en-US';utterance.rate=.96;speechSynthesis.speak(utterance);}catch{toast('当前浏览器未能朗读。');}
}
$('#voice-btn').addEventListener('click',()=>{
  if(!('speechSynthesis'in window)){toast('当前浏览器不支持文字朗读。');return;}
  voice=!voice;$('#voice-btn').textContent='朗读：'+(voice?'开':'关');$('#voice-btn').setAttribute('aria-pressed',String(voice));
  if(!voice)speechSynthesis.cancel();toast(voice?'下一条示例回复将使用浏览器朗读。':'朗读已关闭。');
});
$('#chat-form').addEventListener('submit',e=>{
  e.preventDefault();const input=$('#chat-input'),question=input.value.trim(),requestTopic=topic;
  if(!question||pending)return;input.value='';pending=true;$('.send').disabled=true;
  addMessage('你',question,true);const typing=addMessage('猫老师 · 准备示例中','⋯');
  setTimeout(()=>{
    typing.remove();const answer=respond(question,requestTopic);addMessage('猫老师 · 离线示例',answer);
    if(currentMode==='classroom')speak(answer);pending=false;$('.send').disabled=false;if(currentMode==='classroom')input.focus({preventScroll:true});
  },650);
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
document.addEventListener('fullscreenchange',()=>{if(!xrSupported)$('#immersive-btn').innerHTML=document.fullscreenElement?'退出全屏 ⤢':'全屏预览 ⤢';});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&'speechSynthesis'in window)speechSynthesis.cancel();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open&&currentMode!=='home'&&!document.fullscreenElement)navigate('home');});

function fallback(message){
  document.body.classList.add('fallback');$('#scene-loading').hidden=true;$('#fallback-note').hidden=false;
  if(message)$('#fallback-note').textContent=message;
}
import('./space-scene.js?v=fluid-cat-6').then(async({createSpace})=>{
  space=createSpace($('#universe'),(state,detail)=>{
    if(state==='ready')$('#scene-loading').hidden=true;
    if(state==='teacher-loading'){
      const indicator=$('#scene-loading');indicator.replaceChildren(document.createElement('span'),document.createTextNode(' 正在载入你的猫老师'));indicator.hidden=false;
    }
    if(state==='teacher-progress')$('#scene-loading').lastChild.textContent=' 正在载入你的猫老师 · '+detail+'%';
    if(state==='teacher-ready')$('#scene-loading').hidden=true;
    if(state==='teacher-error'){
      $('#scene-loading').hidden=true;$('#fallback-note').textContent='猫老师模型暂时未能载入，刷新可重试。离线教学与预约仍可使用。';$('#fallback-note').hidden=false;
    }
    if(state==='lost')fallback('3D 画面暂时中断。请刷新恢复，教学与预约演示仍可使用。');
    if(state==='restored'){document.body.classList.remove('fallback');$('#fallback-note').hidden=true;}
    if(state==='xr-start'){$('#xr-status').textContent='单人头显概念场景 · 非多人课堂';}
    if(state==='xr-end'){$('#xr-status').textContent='桌面 3D 概念预览 · 非多人课堂';}
  });
  updateMode();xrSupported=await space.immersiveSupported();
  if(xrSupported){$('#immersive-btn').textContent='进入头显 ↗';$('#xr-status').textContent='桌面 3D 预览 · 检测到可用 WebXR 设备';}
}).catch(()=>fallback());
