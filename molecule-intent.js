import {MOLECULE_CATALOG} from './molecule-catalog.js?v=all-subject-30';

// A deliberately small, deterministic tool router. Text remains ordinary chat;
// model replies never execute code or silently change the current scene.
const entries=Array.isArray(MOLECULE_CATALOG)?MOLECULE_CATALOG:Object.entries(MOLECULE_CATALOG).map(([id,value])=>({id,...value}));
const byId=new Map(entries.map(entry=>[entry.id,entry]));
const normalize=value=>String(value||'').normalize('NFKC').replace(/[₀-₉]/g,char=>String('₀₁₂₃₄₅₆₇₈₉'.indexOf(char))).replace(/[−–—]/g,'-').toLowerCase();
const modelHint=/(?:3\s*d|三维|立体|空间构[型形]|分子构[型形]|构[型形]|形状|长什么样|分子模型|球棍|模型|\bmodels?\b|\bmolecular\s+(?:shape|structure|geometry)\b|\bshape\b|\bgeometry\b)/i;
const displayVerb=/(?:展示|显示|调出|呈现|换成|换为|换个|换|改用|改成|改为|看一下|看看|看一看|想看|\bshow\b|\bdisplay\b|\bview\b|\bsee\b|\brender\b|\bload\b|\bswitch\b)/i;
const requestVerb=/(?:给我|给出|想要|需要|我要|我想|\bwant\b|\bneed\b|\bgive\b)/i;
const dipoleHint=/(?:偶极矩|偶极|极性箭头|合成箭头|净箭头|净极性|\bdipole(?:\s+moments?)?\b|\bnet\s+(?:arrow|dipole)\b)/i;
const hideVerb=/(?:隐藏|收起|关闭|关掉|去掉|移除|删除|清除|清空|拿走|不要|不需要|不用|别再|\bhide\b|\bremove\b|\bclear\b|\bclose\b|\bturn\s+off\b|\bwithout\b|\bdon['’]?t\s+(?:show|display)\b)/i;
const comparisons=/(?:比较|对比|并排|同时|一起|和|与|以及|、|\bcompare\b|\bversus\b|\bvs\.?\b|\band\b)/i;
const aliases=new Map();
for(const entry of entries){
  for(const raw of [entry.name,entry.englishName,entry.formula,entry.molecularFormula,...(entry.aliases||[])]){
    const name=normalize(raw).trim();if(!name)continue;
    if(!aliases.has(name))aliases.set(name,new Set());aliases.get(name).add(entry.id);
  }
}

function validBoundary(text,start,end,alias){
  const before=text[start-1]||'',after=text[end]||'';
  if(/[a-z0-9]/.test(alias[0])&&/[a-z0-9]/.test(before))return false;
  if(/[a-z0-9]/.test(alias.at(-1))&&/[a-z0-9]/.test(after))return false;
  // Do not read water in fruit, benzene in an unlisted derivative, or methane
  // as the tail of dichloromethane. Longer known aliases are matched separately.
  if(/^[\u3400-\u9fff]$/.test(alias)&&after&&!/[的分气模型与和、，。？！?\s]/.test(after))return false;
  if(/[\u3400-\u9fff]/.test(alias[0])&&/[氟氯溴碘硝羟基甲乙丙丁戊己庚辛壬癸异环二三四五六七八九]/.test(before))return false;
  return true;
}

function negated(text,start){
  // A later positive replacement clause wins: “不要水，换成二氧化碳”.
  const prefix=text.slice(0,start).replace(/要不要/g,'是否').split(/[，,。.!?！？;；\n]|(?:而是|换成|换为|改成|改为|改用|只保留|保留|换|\binstead\b|\bbut\b|\brather\b)/i).at(-1);
  const negative=/(?:不要|不需要|不想|不用|无需|别|不展示|不显示|隐藏|收起|关闭|关掉|去掉|移除|删除|清除|拿走|\bhide\b|\bremove\b|\bclear\b|\bclose\b|\bdon['’]?t\b|\bdo\s+not\b|\bnot\b|\bwithout\b)/gi;
  let match,last=-1;while((match=negative.exec(prefix)))last=match.index;
  if(last<0)return false;
  const tail=prefix.slice(last);
  return tail.length<65&&!/(?:但是|不过|还是|我要|我想要|\bthen\b)/i.test(tail);
}

function mentions(text){
  const found=[];
  for(const [alias,ids] of aliases){
    let at=text.indexOf(alias);
    while(at!==-1){
      const end=at+alias.length;
      if(validBoundary(text,at,end,alias))found.push({start:at,end,alias,ids:[...ids],negative:negated(text,at)});
      at=text.indexOf(alias,end);
    }
  }
  // Formula/name duplicates at one span are one match; contained shorter names
  // must not create an extra model (e.g. an alcohol inside a longer alias).
  return found.filter(item=>!found.some(other=>other!==item&&other.start<=item.start&&other.end>=item.end&&other.end-other.start>item.end-item.start)).sort((a,b)=>a.start-b.start||b.end-a.end);
}

function requestedIds(found){
  const positives=found.filter(item=>!item.negative);
  const certain=new Set(positives.filter(item=>item.ids.length===1).flatMap(item=>item.ids));
  const resolved=[];
  for(const item of positives){
    const overlap=item.ids.filter(id=>certain.has(id));
    const ids=item.ids.length>1&&overlap.length===1?overlap:item.ids;
    if(ids.length>1)return {ambiguous:ids};
    for(const id of ids)if(!resolved.includes(id))resolved.push(id);
  }
  return {ids:resolved};
}

function dipoleSupport(ids){
  const missing=ids.filter(id=>!['polar','zero'].includes(byId.get(id)?.dipole?.kind));
  return {supported:ids.length>missing.length,message:missing.length?`${missing.map(id=>byId.get(id)?.name||byId.get(id)?.formula||id).join('、')}的净偶极方向暂未标定，先保留结构模型，不绘制猜测的箭头。`:''};
}

export function resolveMoleculeIntent(input,current={ids:[],dipole:false}){
  const text=normalize(input).slice(0,5000).trim();
  if(!text)return {type:'none'};
  const currentIds=(current.ids||[]).filter(id=>byId.has(id)).slice(0,2);
  const found=mentions(text),request=requestedIds(found);
  const wantsDipole=dipoleHint.test(text),wantsModel=modelHint.test(text),wantsDisplay=displayVerb.test(text);
  const hide=hideVerb.test(text);
  // “Do not show dipoles” means hide that overlay, not the molecule.
  const dipoleMatch=text.match(dipoleHint);
  const dipolePrefix=dipoleMatch?text.slice(0,dipoleMatch.index).split(/[，,。.!?！？;；\n]|(?:而是|换成|换为|改成|改为|改用|换|然后|\binstead\b|\bbut\b)/i).at(-1):'';
  const dipoleSuffix=dipoleMatch?text.slice(dipoleMatch.index+dipoleMatch[0].length):'';
  const hideDipole=wantsDipole&&(hideVerb.test(dipolePrefix)||/^(?:的)?(?:箭头)?\s*(?:收起|关闭|关掉|去掉|移除|隐藏|不要|\boff\b)/i.test(dipoleSuffix));
  if(request.ambiguous&&(wantsModel||wantsDisplay||wantsDipole)){
    const choices=request.ambiguous.map(id=>byId.get(id)?.name||id);
    return {type:'ambiguous',ids:request.ambiguous,message:`这个名称或分子式对应多种结构：${choices.join('、')}。请指定其中一种，我再展示对应模型。`};
  }
  let ids=request.ids||[];
  if(ids.length>2&&comparisons.test(text))return {type:'ambiguous',ids:ids.slice(0,2),message:'为了看清结构，当前最多并排展示两个分子。请指定这次想观察的两个。'};
  if(ids.length>1&&!comparisons.test(text))ids=ids.slice(-1);
  if(hideDipole){
    if(ids.length&&(wantsModel||wantsDisplay))return {type:'show',ids,dipole:false};
    return {type:'hideDipole',ids:currentIds,dipole:false};
  }
  if(!ids.length&&hide&&(wantsModel||found.length)){
    const negativeIds=new Set(found.filter(item=>item.negative).flatMap(item=>item.ids));
    if(negativeIds.size){
      const retained=currentIds.filter(id=>!negativeIds.has(id));
      if(retained.length===currentIds.length)return {type:'none'};
      return retained.length?{type:'show',ids:retained,dipole:!!current.dipole}:{type:'clear',ids:[],dipole:false};
    }
    return {type:'clear',ids:[],dipole:false};
  }
  if(ids.length&&(wantsModel||wantsDisplay||wantsDipole)){
    if(wantsDipole){
      const support=dipoleSupport(ids);
      return {type:'show',ids,dipole:support.supported,...(support.message?{message:support.message}:{})};
    }
    return {type:'show',ids,dipole:false};
  }
  if(wantsDipole&&(!found.length||found.every(item=>item.negative))){
    if(!currentIds.length)return {type:'unsupported',message:'先告诉我想观察哪个分子，例如“展示水分子的 3D 模型”，再为它显示偶极方向。'};
    const support=dipoleSupport(currentIds);
    return support.supported?{type:'dipole',ids:currentIds,dipole:true,...(support.message?{message:support.message}:{})}:{type:'unsupported',message:support.message};
  }
  // A clear model request must not pretend that an unlisted model appeared.
  if(wantsModel&&(wantsDisplay||requestVerb.test(text))){
    if(found.length&&found.every(item=>item.negative))return {type:'none'};
    if(currentIds.length&&/(?:这个|这些|它|当前|刚才|\bit\b|\bthese\b|\bcurrent\b)/.test(text))return {type:'show',ids:currentIds,dipole:!!current.dipole};
    return {type:'unsupported',message:'暂未识别到已收录的分子名称。可以说具体中文名、英文名或分子式；未收录的模型不会用其他结构代替。'};
  }
  return {type:'none'};
}

export function suggestedMolecules(reply,current={ids:[]}){
  const text=normalize(reply).slice(0,12000);
  // Suggestions stay optional buttons. Ordinary mentions in an answer are not
  // authority to replace the student's chosen molecule.
  const proposal=/(?:要不要|想不想|不妨|可以.{0,14}(?:看看|观察|展示|调出)|建议.{0,14}(?:看|观察)|\bwould\s+you\s+like\b|\bwe\s+(?:could|can)\s+(?:view|show|look)\b|\btry\s+(?:viewing|showing)\b)/i;
  const offered=[];
  for(const sentence of text.split(/[。！？!?\n]/)){
    if(!proposal.test(sentence)||!modelHint.test(sentence))continue;
    const result=requestedIds(mentions(sentence));if(result.ambiguous)continue;
    for(const id of result.ids||[])if(!offered.includes(id)&&!(current.ids||[]).includes(id))offered.push(id);
  }
  return offered.slice(0,2);
}
