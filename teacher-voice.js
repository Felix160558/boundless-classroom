// Audio playback only. Provider authentication and synthesis stay in the client/gateway.
export function createTeacherVoice({synthesize,synthesizeStream,canStream=()=>false,onSpeech=()=>{},onState=()=>{},isAllowed=()=>true,env=globalThis}){
  let audio=null,context=null,current=null,generation=0,state='idle';
  // Begin after 80 ms of valid PCM instead of waiting for 140 ms; keep a
  // small initial cushion and the existing scheduling horizon for smooth playback.
  const sampleRate=24000,maxPCM=8*1024*1024,initialFrames=1920,chunkFrames=4800;
  const later=env.setTimeout?.bind(env)||setTimeout,clearLater=env.clearTimeout?.bind(env)||clearTimeout;
  const emit=(next,message='')=>{state=next;onState(next,message);};
  const stopMouth=()=>onSpeech('stop');
  function player(){
    if(!audio){audio=new env.Audio();audio.preload='auto';audio.setAttribute('playsinline','');}
    return audio;
  }
  function streamPlayer(){
    if(context?.state==='closed')context=null;
    if(!context){const Constructor=env.AudioContext||env.webkitAudioContext;if(Constructor)try{context=new Constructor();}catch{}}
    return context;
  }
  function release(take){
    if(!take)return;
    take.controller.abort();
    if(take.mode==='stream'){
      clearLater(take.timer);take.timer=null;
      take.context.removeEventListener('statechange',take.contextChange);
      for(const source of take.sources){source.node.onended=null;try{source.node.stop();source.node.disconnect();}catch{}}
      take.sources.clear();take.queue.length=0;take.queuedFrames=0;take.oddByte=null;return;
    }
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
      const ctx=streamPlayer();if(ctx){
        // Prime WebAudio inside the same send/toggle user gesture, before any network wait.
        Promise.resolve(ctx.resume()).catch(()=>{});
        const source=ctx.createBufferSource();source.buffer=ctx.createBuffer(1,1,sampleRate);source.connect(ctx.destination);
        source.onended=()=>source.disconnect();source.start();
      }
    }catch{}
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
  function streamState(next,message=''){if(state!==next)emit(next,message);}
  function pauseStream(take){
    if(take.playing){take.playing=false;onSpeech('pause');}
  }
  function blockStream(take){
    pauseStream(take);take.phase='blocked';streamState('blocked','声音已准备好，点“点击播放”即可收听。');
  }
  function pumpStream(take){
    if(!valid(take))return;if(!isAllowed()){cancel();return;}
    clearLater(take.timer);take.timer=null;
    const ctx=take.context;
    if(ctx.state==='closed'){fail(take,'声音播放已中断，文字回答已保留。');return;}
    if(ctx.state!=='running'){
      if(take.queuedFrames||take.sources.size)blockStream(take);
      return;
    }
    try{
      const now=ctx.currentTime;
      for(const source of take.sources){if(source.end<=now){source.node.onended=null;source.node.disconnect();take.sources.delete(source);}}
      // Keep only a short horizon of scheduled nodes. Remaining decoded PCM has
      // the same 8 MiB input/duration bound as the network client.
      if(take.sources.size||take.queuedFrames>=initialFrames||take.done){
        while(take.queue.length&&take.nextTime<now+1.2){
          const samples=take.queue.shift();take.queuedFrames-=samples.length;
          const buffer=ctx.createBuffer(1,samples.length,sampleRate);buffer.getChannelData(0).set(samples);
          const node=ctx.createBufferSource();node.buffer=buffer;node.connect(ctx.destination);
          const start=Math.max(take.nextTime,now+0.015),source={node,start,end:start+samples.length/sampleRate};
          take.nextTime=source.end;take.sources.add(source);
          node.onended=()=>{
            node.disconnect();take.sources.delete(source);
            if(valid(take))pumpStream(take);
          };
          node.start(start);
        }
      }
      const playing=[...take.sources].some(source=>source.start<=now&&source.end>now);
      if(playing){
        if(!take.playing){onSpeech(take.started?'resume':'start',{text:take.text});take.started=true;take.playing=true;}
        take.phase='speaking';streamState('playing');
      }else{
        pauseStream(take);
        if(take.done&&!take.queue.length&&!take.sources.size){current=null;release(take);stopMouth();emit('idle');return;}
        if(take.started){take.phase='paused';streamState('ready');}
        else if(take.phase==='blocked'){take.phase='ready';streamState('ready');}
      }
      // No polling while awaiting first bytes, suspended, starved or finished.
      if(take.sources.size)take.timer=later(()=>pumpStream(take),25);
    }catch{fail(take,'这段声音暂时无法播放，文字回答已保留。');}
  }
  function queuePCM(take,bytes){
    if(!valid(take))return;if(!isAllowed()){cancel();return;}
    if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error('声音数据不完整，文字回答已保留。');
    take.pcmBytes+=bytes.length;if(take.pcmBytes>maxPCM)throw new Error('这段声音过长，文字回答已保留。');
    const count=Math.floor((bytes.length+(take.oddByte===null?0:1))/2),samples=new Float32Array(count);
    let offset=0,index=0;
    if(take.oddByte!==null&&count){const word=take.oddByte|(bytes[offset++]<<8);samples[index++]=(word>=32768?word-65536:word)/32768;take.oddByte=null;}
    while(offset+1<bytes.length){const word=bytes[offset]|(bytes[offset+1]<<8);samples[index++]=(word>=32768?word-65536:word)/32768;offset+=2;}
    if(offset<bytes.length)take.oddByte=bytes[offset];
    for(let start=0;start<samples.length;start+=chunkFrames){const part=samples.slice(start,start+chunkFrames);take.queue.push(part);take.queuedFrames+=part.length;}
    pumpStream(take);
  }
  function resumeStream(take){
    if(!valid(take))return;if(!isAllowed()){cancel();return;}
    try{
      Promise.resolve(take.context.resume()).then(()=>{if(valid(take))pumpStream(take);}).catch(()=>{if(valid(take))blockStream(take);});
      pumpStream(take);
    }catch{blockStream(take);}
  }
  async function speak(text){
    cancel();if(!isAllowed())return;
    if([...text].length>4000){emit('error','这次回答较长，暂不自动朗读；可以分段追问，文字内容已完整保留。');return;}
    const take={generation,controller:new AbortController(),text,phase:'preparing',listeners:[],url:null};current=take;
    emit('preparing','正在准备猫老师的声音…');
    try{
      // Choose a format before synthesis. Never re-request paid audio after a
      // streaming/network/playback error, including an autoplay refusal.
      const ctx=typeof synthesizeStream==='function'&&canStream()?streamPlayer():null;
      if(ctx){
        Object.assign(take,{mode:'stream',context:ctx,sources:new Set(),queue:[],queuedFrames:0,pcmBytes:0,oddByte:null,nextTime:0,timer:null,done:false,playing:false,started:false});
        take.contextChange=()=>pumpStream(take);ctx.addEventListener('statechange',take.contextChange);
        await synthesizeStream(text,{signal:take.controller.signal,onChunk:bytes=>queuePCM(take,bytes)});
        if(!valid(take))return;
        if(!take.pcmBytes||take.oddByte!==null)throw new Error('没有收到完整的声音，文字回答已保留。');
        take.done=true;pumpStream(take);return;
      }
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
  return {speak,cancel,unlock,resume(){if(current?.phase==='blocked'){if(current.mode==='stream')resumeStream(current);else play(current);}},
    get state(){return state;},get waitingForTap(){return current?.phase==='blocked';},
    snapshot(){return current?{text:current.text,phase:current.phase}:null;}};
}
