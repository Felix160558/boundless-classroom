// Browser-managed speech recognition. No audio files, uploads or provider keys.
const errors={
  'not-allowed':'麦克风或语音识别未获允许，请在浏览器的网站设置中允许后再试。',
  'service-not-allowed':'语音识别服务不可用。Safari 请确认系统已启用 Siri 或听写。',
  'audio-capture':'没有找到可用麦克风，请检查声音输入设备。',
  'network':'语音识别连接中断，已保留文字，可以重新录入。',
  'no-speech':'没有听清，点麦克风再说一次。',
  'language-not-supported':'当前识别语言暂不可用，可以继续使用文字输入。'
};
const englishErrors={
  'not-allowed':'Allow microphone and speech recognition access in your browser settings, then try again.',
  'service-not-allowed':'Speech recognition is unavailable. In Safari, check that Siri or Dictation is enabled.',
  'audio-capture':'No microphone is available. Check your audio input device.',
  'network':'Speech recognition disconnected. Your text is saved; try recording again.',
  'no-speech':'No speech was heard. Tap the microphone to try again.',
  'language-not-supported':'English recognition is unavailable. You can keep typing instead.'
};
const messages={
  'zh-CN':{stopped:'已停止，文字已保留。',converted:'已转为文字，可编辑后发送。',ended:'语音输入已结束。',stopping:'正在整理文字…',unsupported:'当前浏览器暂不支持语音输入，可使用系统听写或继续键入。',unavailable:'语音识别暂不可用，请继续输入文字。',listening:'正在听 · 中文',aborted:'语音输入已结束，文字已保留。',failed:'语音识别暂未完成，已保留文字，请重试。',timeout:'未能开启语音识别。Safari 请检查麦克风权限及系统听写设置。',starting:'正在开启麦克风…',startFailed:'未能开启语音输入，请稍后再试。'},
  'en-US':{stopped:'Stopped. Your text is saved.',converted:'Transcribed. Review or edit before sending.',ended:'Voice input ended.',stopping:'Finishing your text…',unsupported:'Voice input is not supported here. Use system dictation or keep typing.',unavailable:'Speech recognition is unavailable. You can keep typing.',listening:'Listening · English',aborted:'Voice input ended. Your text is saved.',failed:'Speech recognition did not finish. Your text is saved; please try again.',timeout:'Speech recognition did not start. In Safari, check microphone permission and system Dictation.',starting:'Starting microphone…',startFailed:'Voice input did not start. Please try again.'}
};
// Web Speech accepts one language per request. Never infer it from the draft:
// a Chinese prefix must not force an English recording through Chinese ASR.
export function preferredDictationLanguage({storedLanguage='',languages=[]}={}){
  if(storedLanguage==='zh-CN'||storedLanguage==='en-US')return storedLanguage;
  for(const language of Array.isArray(languages)?languages:[]){
    if(typeof language!=='string')continue;
    if(/^zh(?:-|$)/i.test(language.trim()))return 'zh-CN';
    if(/^en(?:-|$)/i.test(language.trim()))return 'en-US';
  }
  return 'en-US';
}
function join(left,right){
  if(!left)return right;if(!right)return left;
  const gap=/\s$/.test(left)||/^\s|^[，。！？、；：,.!?;:]/.test(right)||/[\u3400-\u9fff]$/.test(left)&&/^[\u3400-\u9fff]/.test(right)?'':' ';
  return left+gap+right;
}
export function createDictation({getText,setText,onState=()=>{},getLanguage,env=globalThis,maxLength=4000}){
  const Recognition=env.SpeechRecognition||env.webkitSpeechRecognition;
  const supported=typeof Recognition==='function'&&env.isSecureContext!==false;
  const readLanguage=()=>preferredDictationLanguage({languages:typeof getLanguage==='function'?[getLanguage()]:[...(env.navigator?.languages||[]),env.navigator?.language]});
  let current=null,lastTake=null,lastLanguage=readLanguage();
  const emit=(state,message='',extra={})=>onState({state,message,supported,language:current?.language||lastLanguage,canRestart:!current&&!!lastTake,...extra});
  function finish(session,message='',error=false){
    if(current!==session)return;
    clearTimeout(session.startTimer);clearTimeout(session.endTimer);clearTimeout(session.limitTimer);clearInterval(session.clock);
    current=null;
    lastTake=session.heard?{base:session.base,shown:getText()}:null;
    emit(error?'error':'idle',message|| (session.heard?messages[session.language].converted:messages[session.language].ended));
    session.resolve();
  }
  function cancel(message){
    const session=current;if(!session)return;
    finish(session,message||messages[session.language].stopped);
    try{session.recognition.abort();}catch{}
  }
  function stop(){
    const session=current;if(!session)return Promise.resolve();
    if(session.state==='stopping')return session.done;
    if(session.state==='starting'){cancel();return session.done;}
    session.state='stopping';clearTimeout(session.limitTimer);clearInterval(session.clock);
    emit('stopping',messages[session.language].stopping);
    session.endTimer=setTimeout(()=>cancel(),3500);
    try{session.recognition.stop();}catch{cancel();}
    return session.done;
  }
  function start({replace=false}={}){
    if(current)return;
    const language=readLanguage();lastLanguage=language;const copy=messages[language];
    if(!supported){emit('error',copy.unsupported);return;}
    let base=getText();
    if(replace&&lastTake&&base===lastTake.shown){base=lastTake.base;setText(base);}
    lastTake=null;
    let recognition;
    try{recognition=new Recognition();}catch{emit('error',copy.unavailable);return;}
    const session={recognition,language,base,state:'starting',heard:false,startedAt:Date.now()};
    session.done=new Promise(resolve=>{session.resolve=resolve;});current=session;
    recognition.lang=language;recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
    recognition.onstart=()=>{
      if(current!==session){try{recognition.abort();}catch{}return;}
      clearTimeout(session.startTimer);session.state='listening';session.startedAt=Date.now();
      const status=()=>{if(current===session&&session.state==='listening')emit('listening',copy.listening,{seconds:Math.max(0,Math.floor((Date.now()-session.startedAt)/1000))});};
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
      const message=event.error==='aborted'?copy.aborted:(language==='en-US'?englishErrors:errors)[event.error]||copy.failed;
      finish(session,message,event.error!=='aborted'&&event.error!=='no-speech');
      try{recognition.abort();}catch{}
    };
    recognition.onend=()=>finish(session);
    session.startTimer=setTimeout(()=>cancel(copy.timeout),15000);
    emit('starting',copy.starting);
    // Keep start synchronous with the user's button click, including in Safari.
    try{recognition.start();}catch{finish(session,copy.startFailed,true);try{recognition.abort();}catch{}}
  }
  emit('idle');
  return {supported,get active(){return !!current;},start,stop,cancel,
    forget(){lastTake=null;if(!current){lastLanguage=readLanguage();emit('idle');}},
    restart(){start({replace:true});}
  };
}
