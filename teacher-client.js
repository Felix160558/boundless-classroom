import {teacherConfig} from './teacher-config.js?v=cloudflare-teacher-12';

export class TeacherError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
export class TeacherClient {
  constructor(origin='',options={}){
    this.origin='';this.token='';this.expiresAt=0;this.conversationId=null;this.remembered=false;
    this.voiceCapability=null;this.voiceCapabilityAt=0;
    this.storageKey='boundless_teacher_access_v2';this.now=options.now||Date.now;
    this.fetchRequest=options.fetch||((...args)=>fetch(...args));
    try{this.storage=Object.hasOwn(options,'storage')?options.storage:globalThis.localStorage;}catch{this.storage=null;}
    if(origin){
      const url=new URL(origin);
      if(url.origin!==origin||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw new Error('Teacher endpoint must be an HTTPS origin.');
      this.origin=origin;
    }
    this.restore();
  }
  get configured(){return Boolean(this.origin);}
  get connected(){if(this.token&&this.expiresAt<=this.now())this.disconnect();return Boolean(this.token);}
  restore(){
    let saved;try{saved=JSON.parse(this.storage?.getItem(this.storageKey)||'null');}catch{}
    if(this.origin&&saved?.origin===this.origin&&typeof saved.token==='string'&&saved.token.length>=20&&saved.token.length<=1024&&Number.isSafeInteger(saved.expiresAt)&&saved.expiresAt>this.now()){
      if(this.token!==saved.token)this.reset();
      this.token=saved.token;this.expiresAt=saved.expiresAt;this.remembered=true;
    }else{
      this.token='';this.expiresAt=0;this.remembered=false;this.reset();
      if(saved?.origin===this.origin)try{this.storage?.removeItem(this.storageKey);}catch{}
    }
  }
  disconnect(){
    this.token='';this.expiresAt=0;this.remembered=false;this.reset();
    try{this.storage?.removeItem(this.storageKey);}catch{}
  }
  reset(){this.conversationId=null;}
  turn(message,topic){return {message,topic,conversationId:this.conversationId,requestId:crypto.randomUUID()};}
  async request(path,data,signal){
    if(!this.configured)throw new TeacherError('unconfigured','AI 猫老师尚未开放。');
    const controller=new AbortController(),abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
    const timer=setTimeout(abort,65000);
    const requestToken=this.token;
    try{
      const response=await this.fetchRequest(this.origin+path,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'Content-Type':'application/json',...(requestToken?{Authorization:'Bearer '+requestToken}:{})},body:JSON.stringify(data)});
      let result;try{result=await response.json();}catch{throw new TeacherError('network','猫老师的连接暂时中断，请稍后重试。');}
      if(!response.ok){if(response.status===401&&path!=='/api/session'&&this.token===requestToken)this.disconnect();throw new TeacherError(result.code||'service',result.message||'猫老师暂时未能完成回复。');}
      return result;
    }catch(error){
      if(controller.signal.aborted)throw new TeacherError(signal?.aborted?'cancelled':'timeout',signal?.aborted?'已停止这次回答。':'等待时间较长，已停止等待。你可以稍后重试。');
      if(error instanceof TeacherError)throw error;
      throw new TeacherError('network','暂时无法连接猫老师，请检查网络后重试。');
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async voiceStatus({signal,refresh=false}={}){
    if(!this.configured)return false;
    if(!refresh&&this.voiceCapability!==null&&this.now()-this.voiceCapabilityAt<60000)return this.voiceCapability;
    const controller=new AbortController(),abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const timer=setTimeout(abort,8000);
    try{
      const response=await this.fetchRequest(this.origin+'/healthz',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal});
      if(!response.ok)throw new Error('unavailable');
      const result=await response.json();
      // Older gateways have no voice flag. A network error never means fallback.
      if(typeof result!=='object'||result===null)throw new Error('invalid');
      this.voiceCapability=result.voiceConfigured===true;this.voiceCapabilityAt=this.now();return this.voiceCapability;
    }catch{
      throw new TeacherError(signal?.aborted?'cancelled':'voice_status',signal?.aborted?'已停止这次朗读。':'暂时无法确认语音连接，文字回答仍可使用。');
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async speech(text,{signal,requestId=crypto.randomUUID()}={}){
    if(!this.connected)throw new TeacherError('unauthorized','请先连接猫老师，再使用专属语音。');
    if(typeof text!=='string'||!text.trim()||[...text].length>4000)throw new TeacherError('invalid','这段文字过长，暂时无法朗读。');
    const controller=new AbortController(),abort=()=>controller.abort(),requestToken=this.token;
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const timer=setTimeout(abort,65000);
    try{
      const response=await this.fetchRequest(this.origin+'/v1/speech',{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+requestToken},body:JSON.stringify({text,requestId})});
      if(!response.ok){
        let result={};try{result=await response.json();}catch{}
        if(response.status===401&&this.token===requestToken)this.disconnect();
        throw new TeacherError(result.code||'voice_error',result.message||'专属语音暂时无法生成，文字回答已保留。');
      }
      if(!(response.headers.get('content-type')||'').toLowerCase().startsWith('audio/'))throw new TeacherError('voice_error','语音服务没有返回可播放的音频。');
      const max=8*1024*1024;
      if(Number(response.headers.get('content-length'))>max){controller.abort();throw new TeacherError('voice_error','这段声音过长，文字回答已保留。');}
      const reader=response.body?.getReader();let blob;
      if(reader){
        const chunks=[];let size=0;
        for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
          if(size>max){await reader.cancel();throw new TeacherError('voice_error','这段声音过长，文字回答已保留。');}chunks.push(value);}
        blob=new Blob(chunks,{type:'audio/mpeg'});
      }else blob=await response.blob();
      if(!blob.size||blob.size>max)throw new TeacherError('voice_error','语音服务没有返回可播放的音频。');
      if(this.token!==requestToken||signal?.aborted)throw new TeacherError('cancelled','连接已退出，已停止这次朗读。');
      return blob;
    }catch(error){
      if(signal?.aborted)throw new TeacherError('cancelled','已停止这次朗读。');
      if(error instanceof TeacherError)throw error;
      if(controller.signal.aborted)throw new TeacherError('timeout','声音准备时间较长，文字回答已保留，请稍后再试。');
      throw new TeacherError('network','暂时无法连接语音服务，文字回答已保留。');
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async connect(invite){
    const result=await this.request('/api/session',{invite});
    if(typeof result.token!=='string'||!Number.isSafeInteger(result.expiresAt))throw new TeacherError('network','连接未能完成，请稍后再试。');
    this.token=result.token;this.expiresAt=result.expiresAt;this.reset();this.remembered=false;
    try{if(this.storage){this.storage.setItem(this.storageKey,JSON.stringify({origin:this.origin,token:this.token,expiresAt:this.expiresAt}));this.remembered=true;}}catch{}
  }
  async send(turn,{signal}={}){
    if(!this.connected)throw new TeacherError('unauthorized','请先输入试用邀请码连接猫老师。');
    const requestToken=this.token;
    const result=await this.request('/api/chat',turn,signal);
    if(this.token!==requestToken)throw new TeacherError('cancelled','连接已退出，已停止显示这次回复。');
    if(typeof result.reply!=='string'||typeof result.conversationId!=='string')throw new TeacherError('network','这次没有收到完整回复，请稍后重试。');
    this.conversationId=result.conversationId;return result;
  }
}

// Hash navigation keeps this single conversation available to future VR/voice UI.
export const teacher=new TeacherClient(teacherConfig.apiOrigin);
