// One microphone, automatic bilingual transcription through the invited gateway.
// A short pause (or Stop) ends the take. This is not browser-language guessing
// or word-by-word live recognition. Audio stays in memory and is never saved.
export function joinDictation(left,right){
  if(!left)return right;if(!right)return left;
  const gap=/\s$/.test(left)||/^\s|^[，。！？、；：,.!?;:]/.test(right)||/[\u3400-\u9fff]$/.test(left)&&/^[\u3400-\u9fff]/.test(right)?'':' ';
  return left+gap+right;
}
export function pcm16Base64(chunks,sourceRate,maxSeconds=60){
  if(!Number.isFinite(sourceRate)||sourceRate<16000||sourceRate>192000)throw new Error('Unsupported audio rate');
  const count=chunks.reduce((sum,chunk)=>sum+chunk.length,0),input=new Float32Array(count);
  let offset=0;for(const chunk of chunks){input.set(chunk,offset);offset+=chunk.length;}
  const length=Math.min(16000*maxSeconds,Math.floor(count*16000/sourceRate));
  const bytes=new Uint8Array(length*2),view=new DataView(bytes.buffer),ratio=sourceRate/16000;
  // Average each source interval to reduce aliasing instead of dropping samples.
  for(let i=0;i<length;i++){
    const begin=i*ratio,end=(i+1)*ratio;let sum=0,weight=0;
    for(let j=Math.floor(begin);j<Math.ceil(end)&&j<count;j++){
      const w=Math.min(end,j+1)-Math.max(begin,j);sum+=(Number.isFinite(input[j])?input[j]:0)*w;weight+=w;
    }
    const value=Math.max(-1,Math.min(1,sum/(weight||1)));
    view.setInt16(i*2,Math.round(value*(value<0?32768:32767)),true);
  }
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
export function createDictation({getText,setText,transcribe,onState=()=>{},env=globalThis,maxLength=4000}){
  const Audio=env.AudioContext||env.webkitAudioContext;
  const supported=Boolean(Audio&&env.AudioWorkletNode&&env.navigator?.mediaDevices?.getUserMedia&&env.isSecureContext!==false);
  let current=null,lastTake=null;
  const emit=(state,message='',extra={})=>onState({state,message,supported,canRestart:!current&&Boolean(lastTake),...extra});
  function release(session){
    clearTimeout(session.startTimer);clearTimeout(session.limitTimer);clearInterval(session.clock);
    try{session.node?.disconnect();session.source?.disconnect();session.gain?.disconnect();}catch{}
    for(const track of session.stream?.getTracks()||[])track.stop();
    if(session.audio&&session.audio.state!=='closed')void session.audio.close().catch(()=>{});
  }
  function finish(session,message='',error=false,accepted=!error){
    if(current!==session)return;
    release(session);current=null;session.chunks=[];
    emit(error?'error':'idle',message);session.resolve(accepted);
  }
  function cancel(){
    const session=current;if(!session)return;
    session.controller.abort();finish(session,'',false,false);
  }
  async function stop(){
    const session=current;if(!session)return true;
    if(session.state==='stopping')return session.done;
    if(session.state==='starting'){cancel();return false;}
    session.state='stopping';release(session);
    emit('stopping','正在转为文字…');
    if(!session.heard||session.samples<session.rate*.25){finish(session,'没有听清，点麦克风再说一次。',true);return session.done;}
    try{
      const audio=pcm16Base64(session.chunks,session.rate);session.chunks=[];
      const result=await transcribe(audio,{signal:session.controller.signal});
      if(current!==session||session.controller.signal.aborted)return false;
      if(typeof result?.text!=='string'||!result.text.trim())throw new Error('没有听清，点麦克风再说一次。');
      // Never overwrite a draft edited while the server was responding.
      if(getText()!==session.base){finish(session,'输入已变化，未覆盖当前文字。',true);return session.done;}
      const text=joinDictation(session.base,result.text.trim());setText(text.slice(0,maxLength));
      lastTake={base:session.base,shown:getText()};
      finish(session,text.length>maxLength?'文字较长，已保留输入框能容纳的部分。':'');
    }catch(error){if(current===session)finish(session,error?.message||'语音暂未转为文字，请重试。',true);}
    return session.done;
  }
  function start({replace=false}={}){
    if(current)return;
    if(!supported){emit('error','当前浏览器暂不支持录音，可用系统听写或继续键入。');return;}
    let base=getText();if(replace&&lastTake&&base===lastTake.shown){base=lastTake.base;setText(base);}
    lastTake=null;
    const session={base,state:'starting',chunks:[],samples:0,heard:false,voicedSamples:0,lastVoiceSample:0,controller:new AbortController()};
    session.done=new Promise(resolve=>{session.resolve=resolve;});current=session;
    emit('starting','正在开启麦克风…');
    session.startTimer=setTimeout(()=>{
      if(current===session){session.controller.abort();finish(session,'未能开启麦克风，请检查浏览器录音权限。',true);}
    },15000);
    let streamPromise;
    try{
      // AudioContext.resume and the permission request both begin in the tap.
      session.audio=new Audio();session.resumed=Promise.resolve(session.audio.resume()).then(()=>true,()=>false);
      streamPromise=env.navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
    }catch{finish(session,'未能开启麦克风，请检查浏览器录音权限。',true);return;}
    void (async()=>{
      try{
        const stream=await streamPromise;
        if(current!==session){stream.getTracks().forEach(track=>track.stop());return;}
        session.stream=stream;
        if(!await session.resumed||session.audio.state!=='running')throw new Error('Audio input unavailable');
        if(current!==session)return;
        session.rate=session.audio.sampleRate;
        await session.audio.audioWorklet.addModule(new URL('./dictation-capture.js?v=quiet-input-33',import.meta.url));
        if(current!==session)return;
        session.source=session.audio.createMediaStreamSource(stream);
        session.node=new env.AudioWorkletNode(session.audio,'boundless-dictation-capture');
        session.gain=session.audio.createGain();session.gain.gain.value=0;
        session.node.port.onmessage=event=>{
          if(current!==session||session.state!=='listening')return;
          const chunk=event.data;
          if(!(chunk instanceof Float32Array)||chunk.length>4096)return;
          const remaining=Math.floor(session.rate*60)-session.samples;
          if(remaining<=0){void stop();return;}
          const bounded=chunk.length>remaining?chunk.slice(0,remaining):chunk;
          session.chunks.push(bounded);session.samples+=bounded.length;
          let energy=0;for(const sample of bounded)energy+=sample*sample;
          if(Math.sqrt(energy/bounded.length)>.012){session.voicedSamples+=bounded.length;session.lastVoiceSample=session.samples;}
          session.heard=session.voicedSamples>session.rate*.18;
          // End only after a full spoken phrase plus a comfortable pause.
          if(session.samples>=session.rate*60||session.heard&&session.samples>session.rate*2&&session.samples-session.lastVoiceSample>session.rate*1.65)void stop();
        };
        session.source.connect(session.node);session.node.connect(session.gain);session.gain.connect(session.audio.destination);
        clearTimeout(session.startTimer);session.state='listening';session.startedAt=Date.now();
        const status=()=>{if(current===session&&session.state==='listening')emit('listening','正在听 · 中英自动识别',{seconds:Math.floor((Date.now()-session.startedAt)/1000)});};
        status();session.clock=setInterval(status,1000);session.limitTimer=setTimeout(()=>void stop(),60000);
      }catch(error){
        if(current===session)finish(session,error?.name==='NotAllowedError'?'麦克风未获允许，请在浏览器设置中允许录音。':'录音暂不可用，请继续使用文字输入。',true);
      }
    })();
  }
  emit('idle');
  return {supported,get active(){return Boolean(current);},start,stop,cancel,
    forget(){lastTake=null;if(!current)emit('idle');},restart(){start({replace:true});}};
}
