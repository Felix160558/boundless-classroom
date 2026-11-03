import {teacherConfig} from './teacher-config.js?v=cloudflare-teacher-12';

export class TeacherError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
export class TeacherClient {
  constructor(origin=''){
    this.origin='';this.token='';this.conversationId=null;
    if(origin){
      const url=new URL(origin);
      if(url.origin!==origin||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw new Error('Teacher endpoint must be an HTTPS origin.');
      this.origin=origin;
    }
  }
  get configured(){return Boolean(this.origin);}
  get connected(){return Boolean(this.token);}
  reset(){this.conversationId=null;}
  turn(message,topic){return {message,topic,conversationId:this.conversationId,requestId:crypto.randomUUID()};}
  async request(path,data,signal){
    if(!this.configured)throw new TeacherError('unconfigured','AI 猫老师尚未开放。');
    const controller=new AbortController(),abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
    const timer=setTimeout(abort,65000);
    try{
      const response=await fetch(this.origin+path,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},body:JSON.stringify(data)});
      let result;try{result=await response.json();}catch{throw new TeacherError('network','猫老师的连接暂时中断，请稍后重试。');}
      if(!response.ok){if(response.status===401)this.token='';throw new TeacherError(result.code||'service',result.message||'猫老师暂时未能完成回复。');}
      return result;
    }catch(error){
      if(controller.signal.aborted)throw new TeacherError(signal?.aborted?'cancelled':'timeout',signal?.aborted?'已停止这次回答。':'等待时间较长，已停止等待。你可以稍后重试。');
      if(error instanceof TeacherError)throw error;
      throw new TeacherError('network','暂时无法连接猫老师，请检查网络后重试。');
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async connect(invite){
    const result=await this.request('/api/session',{invite});
    if(typeof result.token!=='string')throw new TeacherError('network','连接未能完成，请稍后再试。');
    this.token=result.token;
  }
  async send(turn,{signal}={}){
    if(!this.connected)throw new TeacherError('unauthorized','请先输入试用邀请码连接猫老师。');
    const result=await this.request('/api/chat',turn,signal);
    if(typeof result.reply!=='string'||typeof result.conversationId!=='string')throw new TeacherError('network','这次没有收到完整回复，请稍后重试。');
    this.conversationId=result.conversationId;return result;
  }
}

// Hash navigation keeps this single conversation available to future VR/voice UI.
export const teacher=new TeacherClient(teacherConfig.apiOrigin);
