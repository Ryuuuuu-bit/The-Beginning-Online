import {GuideProgressSchema,GuideStateSchema,type GuideProgress,type GuideState} from '@the-beginning-online/shared';
/** Legacy preferences are imported only when the character has no server state. */
export function readGuideProgress(raw: string | null, count: number) {
 try {
  const value = JSON.parse(raw ?? 'null');
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {step: Number.isInteger(value.step) ? Math.max(0, Math.min(count, value.step)) : 0,
   off: value.off === true, min: value.min === true};
 } catch { return null; }
}

export interface GuideCache {progress:GuideProgress;revision:number;dirty:boolean;sent?:GuideProgress}
export function readGuideCache(raw:string|null):GuideCache|null{
 try{const value=JSON.parse(raw??'null'),progress=GuideProgressSchema.safeParse(value?.progress);
  const sent=value?.sent===undefined?undefined:GuideProgressSchema.parse(value.sent);
  return progress.success&&Number.isInteger(value?.revision)&&value.revision>=0&&value.revision<=2147483647&&typeof value.dirty==='boolean'?{progress:progress.data,revision:value.revision,dirty:value.dirty,...(sent?{sent}:{})}:null;
 }catch{return null;}
}

/** Serialize writes and keep a retryable outbox; a newer server revision always wins a conflict. */
export function createGuideSync(o:{initial:GuideProgress;cached:GuideCache|null;read:()=>Promise<GuideState|null>;write:(progress:GuideProgress,revision:number)=>Promise<{guide:GuideState|null;conflict:boolean}>;cache:(value:GuideCache)=>void;apply:(value:GuideProgress)=>void;status:(value:'loading'|'saving'|'saved'|'error'|'conflict')=>void}){
 let revision=0,ready=false,busy=false,failed=false,pending:GuideProgress|null=null,sending:GuideProgress|null=null,cached=o.cached;
 const same=(a:GuideProgress,b:GuideProgress)=>a.step===b.step&&a.off===b.off&&a.min===b.min;
 const persist=(progress:GuideProgress,dirty:boolean)=>{cached={progress:{...progress},revision,dirty,...(dirty&&sending?{sent:{...sending}}:{})};o.cache(cached);};
 async function flush(){
  if(busy||!ready||!pending)return;busy=true;
  try{
   while(pending){
    const sent=pending;pending=null;sending=sent;persist(sent,true);o.status('saving');
    try{
     const result=await o.write(sent,revision);
     if(result.conflict){pending=null;ready=false;busy=false;await load(true);return;}
     const saved=GuideStateSchema.parse(result.guide);revision=saved.revision;sending=null;persist(pending??sent,!!pending);
    }catch{failed=true;pending=pending??sent;persist(pending,true);o.status('error');return;}
   }o.status('saved');
  }finally{busy=false;}
 }
 async function load(conflicted=false){
  if(busy)return;busy=true;o.status('loading');
  try{
   const response=await o.read(),cloud=response===null?null:GuideStateSchema.parse(response);revision=cloud?.revision??0;
   const acknowledged=cloud&&cached?.sent&&cloud.revision===cached.revision+1&&same(cloud,cached.sent);
   const candidate=cached?.dirty&&(cached.revision===revision||acknowledged)?cached.progress:null;
   const dirty=candidate&&(!cloud||!same(candidate,cloud))?candidate:null;
   const progress=dirty??(cloud?{version:cloud.version,step:cloud.step,off:cloud.off,min:cloud.min}:o.initial);
   pending=dirty||!cloud?progress:null;ready=true;failed=false;sending=null;persist(progress,!!pending);o.apply(progress);
   if(!pending)o.status(conflicted?'conflict':'saved');
  }catch{ready=false;o.status('error');}finally{busy=false;}
  await flush();
 }
 return {get ready(){return ready;},start:load,retry:()=>ready&&!failed?flush():load(),update(progress:GuideProgress){if(!ready)return;pending=GuideProgressSchema.parse(progress);persist(pending,true);void(failed?load():flush());}};
}
