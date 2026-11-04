// Browser-managed speech recognition. No audio files, uploads or provider keys.
const errors={
  'not-allowed':'麦克风或语音识别未获允许，请在浏览器的网站设置中允许后再试。',
  'service-not-allowed':'语音识别服务不可用。Safari 请确认系统已启用 Siri 或听写。',
  'audio-capture':'没有找到可用麦克风，请检查声音输入设备。',
  'network':'语音识别连接中断，已保留文字，可以重新录入。',
  'no-speech':'没有听清，点麦克风再说一次。',
  'language-not-supported':'当前识别语言暂不可用，可以继续使用文字输入。'
};
function join(left,right){
  if(!left)return right;if(!right)return left;
  const gap=/\s$/.test(left)||/^\s|^[，。！？、；：,.!?;:]/.test(right)||/[\u3400-\u9fff]$/.test(left)&&/^[\u3400-\u9fff]/.test(right)?'':' ';
  return left+gap+right;
}
export function createDictation({getText,setText,onState=()=>{},getLanguage=()=> 'zh-CN',env=globalThis,maxLength=4000}){
  const Recognition=env.SpeechRecognition||env.webkitSpeechRecognition;
  const supported=typeof Recognition==='function'&&env.isSecureContext!==false;
  let current=null,lastTake=null;
  const emit=(state,message='',extra={})=>onState({state,message,supported,canRestart:!current&&!!lastTake,...extra});
  function finish(session,message='',error=false){
    if(current!==session)return;
    clearTimeout(session.startTimer);clearTimeout(session.endTimer);clearTimeout(session.limitTimer);clearInterval(session.clock);
    current=null;
    lastTake=session.heard?{base:session.base,shown:getText()}:null;
    emit(error?'error':'idle',message|| (session.heard?'已转为文字，可编辑后发送。':'语音输入已结束。'));
    session.resolve();
  }
  function cancel(message='已停止，文字已保留。'){
    const session=current;if(!session)return;
    finish(session,message);
    try{session.recognition.abort();}catch{}
  }
  function stop(){
    const session=current;if(!session)return Promise.resolve();
    if(session.state==='stopping')return session.done;
    if(session.state==='starting'){cancel();return session.done;}
    session.state='stopping';clearTimeout(session.limitTimer);clearInterval(session.clock);
    emit('stopping','正在整理文字…');
    session.endTimer=setTimeout(()=>{cancel('已停止，文字已保留。');},3500);
    try{session.recognition.stop();}catch{cancel();}
    return session.done;
  }
  function start({replace=false}={}){
    if(current)return;
    if(!supported){emit('error','当前浏览器暂不支持语音输入，可使用系统听写或继续键入。');return;}
    let base=getText();
    if(replace&&lastTake&&base===lastTake.shown){base=lastTake.base;setText(base);}
    lastTake=null;
    let recognition;
    try{recognition=new Recognition();}catch{emit('error','语音识别暂不可用，请继续输入文字。');return;}
    const session={recognition,base,state:'starting',heard:false,startedAt:Date.now()};
    session.done=new Promise(resolve=>{session.resolve=resolve;});current=session;
    recognition.lang=getLanguage();recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
    recognition.onstart=()=>{
      if(current!==session){try{recognition.abort();}catch{}return;}
      clearTimeout(session.startTimer);session.state='listening';session.startedAt=Date.now();
      const status=()=>{if(current===session&&session.state==='listening')emit('listening','正在听 · '+(recognition.lang.startsWith('en')?'English':'中文'),{seconds:Math.max(0,Math.floor((Date.now()-session.startedAt)/1000))});};
      status();session.clock=setInterval(status,1000);session.limitTimer=setTimeout(()=>stop(),120000);
    };
    recognition.onresult=event=>{
      if(current!==session)return;
      let speech='';
      // Results include corrected interim text: rebuild rather than append duplicates.
      for(let i=0;i<event.results.length;i++)speech=join(speech,(event.results[i][0]?.transcript||'').trim());
      session.heard=session.heard||!!speech;
      const text=join(session.base,speech);setText(text.slice(0,maxLength));
      if(text.length>=maxLength){void stop();}
    };
    recognition.onerror=event=>{
      if(current!==session)return;
      const message=event.error==='aborted'?'语音输入已结束，文字已保留。':errors[event.error]||'语音识别暂未完成，已保留文字，请重试。';
      finish(session,message,event.error!=='aborted'&&event.error!=='no-speech');
      try{recognition.abort();}catch{}
    };
    recognition.onend=()=>finish(session);
    session.startTimer=setTimeout(()=>cancel('未能开启语音识别。Safari 请检查麦克风权限及系统听写设置。'),15000);
    emit('starting','正在开启麦克风…');
    // Keep start synchronous with the user's button click, including in Safari.
    try{recognition.start();}catch{finish(session,'未能开启语音输入，请稍后再试。',true);try{recognition.abort();}catch{}}
  }
  emit('idle');
  return {supported,get active(){return !!current;},start,stop,cancel,
    forget(){lastTake=null;if(!current)emit('idle');},
    restart(){start({replace:true});}
  };
}
