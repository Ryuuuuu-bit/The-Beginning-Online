import{Router}from'express';import type{Store}from'../store/types.js';import{requireSession}from'../session.js';import{missing}from'../errors.js';import{characterName,characterGender,creationJob}from'../store/progress.js';
import {GuideWriteSchema} from '@the-beginning-online/shared';
export function characterRoutes(store:Store){const r=Router();r.use(requireSession);
 r.param('id',(_req,_res,next,id)=>{if(!/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id))return next(missing());next();});
 r.get('/',async(req,res)=>res.json({characters:await store.characters(req.auth!.account.id)}));
 r.post('/',async(req,res)=>{const{name,nameKey}=characterName(req.body?.name);res.status(201).json({character:await store.createCharacter(req.auth!.account.id,name,nameKey,creationJob(req.body?.jobId===undefined?'swordsman':req.body.jobId),characterGender(req.body?.gender))});});
 r.post('/:id/job',async(req,res)=>{res.json({character:await store.chooseJob(req.auth!.account.id,String(req.params.id),creationJob(req.body?.jobId))});});
 r.get('/:id',async(req,res)=>{const c=await store.character(req.auth!.account.id,String(req.params.id));if(!c)throw missing();res.json({character:c});});
 r.get('/:id/guide',async(req,res)=>res.json({guide:await store.guide(req.auth!.account.id,String(req.params.id))}));
 // Only cosmetic handbook state is client-writable; gameplay progress remains server-owned.
 r.put('/:id/guide',async(req,res)=>{
  const parsed=GuideWriteSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:{code:'BAD_GUIDE',message:'ข้อมูลคู่มือไม่ถูกต้อง'}});return;}
  const result=await store.saveGuide(req.auth!.account.id,String(req.params.id),parsed.data.progress,parsed.data.revision);
  res.status(result.conflict?409:200).json(result);
 });
 r.delete('/:id',async(req,res)=>{await store.deleteCharacter(req.auth!.account.id,String(req.params.id));res.json({ok:true});});
 r.post('/:id/select',async(req,res)=>{const c=await store.character(req.auth!.account.id,String(req.params.id));if(!c)throw missing();await store.select(req.auth!.session.id,c.id);res.json({character:c});});
 r.post('/:id/progress',async(req,res)=>{if(!await store.character(req.auth!.account.id,String(req.params.id)))throw missing();res.status(410).json({error:{code:'SERVER_AUTHORITY',message:'บันทึกจากเซิร์ฟเวอร์เท่านั้น'}});});
 return r;
}
