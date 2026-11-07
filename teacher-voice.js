// Audio playback only. Provider authentication and synthesis stay in the client/gateway.
export function createTeacherVoice({synthesize,onSpeech=()=>{},onState=()=>{},isAllowed=()=>true,env=globalThis}){
  let audio=null,current=null,generation=0,state='idle';
  const emit=(next,message='')=>{state=next;onState(next,message);};
  const stopMouth=()=>onSpeech('stop');
  function player(){
    if(!audio){audio=new env.Audio();audio.preload='auto';audio.setAttribute('playsinline','');}
    return audio;
  }
  function release(take){
    if(!take)return;
    take.controller.abort();
    for(const [event,handler] of take.listeners)audio?.removeEventListener(event,handler);
    try{audio?.pause();audio?.removeAttribute('src');audio?.load();}catch{}
    if(take.url)env.URL.revokeObjectURL(take.url);
  }
  function cancel(){
    generation++;const take=current;current=null;release(take);stopMouth();emit('idle');
  }
  function unlock(){
    // A short silent WAV primes the SAME audio element during a user gesture.
    // Autoplay may still be refused later; retain that reply for manual play.
    if(current)return;
    try{
      const el=player(),bytes=new Uint8Array(1004),view=new DataView(bytes.buffer);
      const text=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
      text(0,'RIFF');view.setUint32(4,996,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);
      view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,24000,true);view.setUint32(28,48000,true);
      view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,960,true);
      const id=++generation,url=env.URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
      el.src=url;
      Promise.resolve(el.play()).catch(()=>{}).finally(()=>{
        if(id===generation&&!current){el.pause();el.removeAttribute('src');el.load();}
        env.URL.revokeObjectURL(url);
      });
    }catch{} // No provider call and no microphone access during activation.
  }
  function valid(take){return current===take&&take.generation===generation;}
  function fail(take,message){
    if(!valid(take))return;current=null;release(take);stopMouth();emit('error',message);
  }
  function play(take){
    if(!valid(take))return;if(!isAllowed()){cancel();return;}
    emit('ready');
    try{
      Promise.resolve(player().play()).catch(error=>{
        if(!valid(take))return;
        if(error?.name==='NotAllowedError'){
          take.phase='blocked';stopMouth();emit('blocked','声音已准备好，点“点击播放”即可收听。');
        }else fail(take,'这段声音暂时无法播放，文字回答已保留。');
      });
    }catch{fail(take,'此浏览器未能播放声音，文字回答已保留。');}
  }
  async function speak(text){
    cancel();if(!isAllowed())return;
    if([...text].length>4000){emit('error','这次回答较长，暂不自动朗读；可以分段追问，文字内容已完整保留。');return;}
    const take={generation,controller:new AbortController(),text,phase:'preparing',listeners:[],url:null};current=take;
    emit('preparing','正在准备猫老师的声音…');
    try{
      const blob=await synthesize(text,{signal:take.controller.signal});
      if(!valid(take))return;if(!isAllowed()){cancel();return;}
      const el=player();take.url=env.URL.createObjectURL(blob);
      const listen=(event,handler)=>{el.addEventListener(event,handler);take.listeners.push([event,handler]);};
      const sourceIsCurrent=()=>valid(take)&&el.currentSrc===take.url;
      listen('playing',()=>{
        if(!sourceIsCurrent()||el.paused||el.readyState<2)return;
        if(!isAllowed()){cancel();return;}
        onSpeech(take.phase==='paused'?'resume':'start',{text});take.phase='speaking';emit('playing');
      });
      const pause=()=>{
        if(!sourceIsCurrent()||take.phase!=='speaking')return;
        take.phase='paused';onSpeech('pause');
      };
      listen('pause',pause);listen('waiting',pause);
      listen('ended',()=>{
        if(!sourceIsCurrent()||!el.ended)return;
        current=null;release(take);stopMouth();emit('idle');
      });
      listen('error',()=>{if(valid(take)&&el.error)fail(take,'这段声音暂时无法播放，文字回答已保留。');});
      el.src=take.url;take.phase='ready';play(take);
    }catch(error){
      if(!valid(take))return;
      if(error?.code==='cancelled'||error?.name==='AbortError'){cancel();return;}
      fail(take,error?.message||'专属语音暂时未能生成，文字回答已保留。');
    }
  }
  return {speak,cancel,unlock,resume(){if(current?.phase==='blocked')play(current);},
    get state(){return state;},get waitingForTap(){return current?.phase==='blocked';},
    snapshot(){return current?{text:current.text,phase:current.phase}:null;}};
}
