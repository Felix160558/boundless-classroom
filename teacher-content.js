// Small DOM-only Markdown renderer: model HTML and URLs are never executed.
const inlinePattern=/(`[^`\n]+`|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\s)(?:\\.|[^$\n])+?(?<!\s)\$(?!\d)|\*\*[^\n]+?\*\*|__[^\n]+?__|\*[^*\n]+?\*|(?<!\w)_[^_\n]+?_(?!\w)|!?\[[^\]\n]+\]\([^\n)]*\))/g;
let mathEngine;

export function replyInline(text,depth=0){
  if(depth>4)return [{type:'text',text}];
  const parts=[];let position=0;
  for(const match of text.matchAll(new RegExp(inlinePattern))){
    if(match.index>position)parts.push({type:'text',text:text.slice(position,match.index)});
    const value=match[0];
    if(value.startsWith('`'))parts.push({type:'code',text:value.slice(1,-1)});
    else if(value.startsWith('\\(')||value.startsWith('$'))parts.push({type:'math',text:value.startsWith('$')?value.slice(1,-1):value.slice(2,-2)});
    else if(value.startsWith('**')||value.startsWith('__'))parts.push({type:'strong',children:replyInline(value.slice(2,-2),depth+1)});
    else if(value.startsWith('*')||value.startsWith('_'))parts.push({type:'em',children:replyInline(value.slice(1,-1),depth+1)});
    else parts.push({type:'text',text:value.slice(value.indexOf('[')+1,value.indexOf(']'))});
    position=match.index+value.length;
  }
  if(position<text.length)parts.push({type:'text',text:text.slice(position)});
  return parts;
}

function proseBlocks(text){
  const blocks=[],lines=text.split('\n');let paragraph=[];
  const flush=()=>{if(paragraph.length){blocks.push({type:'p',children:replyInline(paragraph.join('\n'))});paragraph=[];}};
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(!line||/^([-*_])(?:\s*\1){2,}$/.test(line)){flush();continue;}
    if(line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]||'')){
      flush();const cells=row=>row.trim().replace(/^\||\|$/g,'').split('|').slice(0,8).map(cell=>replyInline(cell.trim()));
      const table={type:'table',head:cells(line),rows:[]};i++;
      while(i+1<lines.length&&lines[i+1].includes('|')&&lines[i+1].trim()){i++;table.rows.push(cells(lines[i]));}
      blocks.push(table);continue;
    }
    const heading=line.match(/^#{1,6}\s+(.+)$/);
    if(heading){flush();blocks.push({type:'heading',children:replyInline(heading[1])});continue;}
    const item=line.match(/^(?:([-+*])\s+|(\d{1,3})[.)]\s+)(.+)$/);
    if(item){
      flush();const type=item[2]?'ol':'ul';let list=blocks.at(-1);
      if(list?.type!==type){list={type,start:Number(item[2]||1),items:[]};blocks.push(list);}
      list.items.push(replyInline(item[3]));continue;
    }
    if(line.startsWith('> ')){flush();blocks.push({type:'quote',children:replyInline(line.slice(2))});continue;}
    paragraph.push(line);
  }
  flush();return blocks;
}

export function replyBlocks(value){
  const text=String(value).slice(0,40000).replace(/\r\n?/g,'\n'),blocks=[];
  const special=/```[^\n]*\n[\s\S]*?```|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g;
  let position=0;
  for(const match of text.matchAll(special)){
    blocks.push(...proseBlocks(text.slice(position,match.index)));
    if(match[0].startsWith('```'))blocks.push({type:'pre',text:match[0].slice(match[0].indexOf('\n')+1,-3)});
    else blocks.push({type:'math',text:match[0].slice(2,-2).trim()});
    position=match.index+match[0].length;
  }
  blocks.push(...proseBlocks(text.slice(position)));return blocks;
}

export function plainFormula(text){
  let value=text.replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g,'$1');
  for(let i=0;i<8;i++)value=value.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g,'($1)/($2)').replace(/\\sqrt\{([^{}]+)\}/g,'√($1)');
  const symbols={sigma:'σ',pi:'π',alpha:'α',beta:'β',gamma:'γ',Delta:'Δ',delta:'δ',theta:'θ',lambda:'λ',mu:'μ',nu:'ν',omega:'ω',Omega:'Ω',rightarrow:'→',to:'→',leftarrow:'←',leftrightarrow:'↔',rightleftharpoons:'⇌',times:'×',cdot:'·',pm:'±',leq:'≤',geq:'≥',neq:'≠',approx:'≈',infty:'∞'};
  value=value.replace(/\\([a-zA-Z]+)/g,(all,name)=>Object.hasOwn(symbols,name)?symbols[name]:all).replace(/\\[,;! ]/g,' ');
  const sub='₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎',sup='⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾',chars='0123456789+-=()';
  return value.replace(/([_^])(?:\{([^{}]+)\}|([0-9+\-]))/g,(_,kind,a,b)=>{
    const content=a||b,alphabet=kind==='_'?sub:sup;
    return [...content].every(c=>chars.includes(c))?[...content].map(c=>alphabet[chars.indexOf(c)]).join(''):kind+'('+content+')';
  });
}

function inlinePlain(parts){return parts.map(part=>part.children?inlinePlain(part.children):part.type==='math'?(/\\[a-zA-Z]/.test(plainFormula(part.text))?'公式见对话':plainFormula(part.text)):part.text).join('');}
const trimText=(value,max)=>[...String(value).trim()].slice(0,max).join('');
export function lessonNotes(reply,supplied){
  if(supplied&&typeof supplied.title==='string'&&Array.isArray(supplied.points)){
    const points=supplied.points.filter(p=>typeof p==='string'&&p.trim()&&!/\\|\*\*|```|<[^>]*>/.test(p)).slice(0,3).map(p=>trimText(p.replace(/\s+/g,' '),96));
    if(points.length)return {title:/\\|<[^>]*>/.test(supplied.title)?'Key ideas':trimText(supplied.title.replace(/[*`#]/g,''),40),points};
  }
  // An extractive fallback, never an extra paid call or an invented summary.
  const paragraphs=replyBlocks(reply).flatMap(block=>block.children?[inlinePlain(block.children)]:block.items?block.items.map(inlinePlain):[]);
  const sentences=paragraphs.flatMap(p=>p.split(/(?<=[。！？.!?])\s*|\n/)).map(s=>s.trim()).filter(s=>s.length>5&&!/^(喵[，,！!]|你好|Hi[!,]|Hey[!,])/.test(s));
  const points=sentences.slice(0,3).map(s=>[...s].length>96?trimText(s,95)+'…':s);
  return points.length?{title:/[\u4e00-\u9fff]/.test(reply)?'一起记住':'Key ideas',points}:null;
}

function mathNode(source,display){
  const node=document.createElement(display?'div':'span');node.className=display?'reply-math':'reply-inline-math';node.textContent=plainFormula(source);
  mathEngine??=import('./katex.mjs');
  mathEngine.then(({default:katex})=>{
    const log=node.closest('.messages'),atBottom=log&&log.scrollHeight-log.scrollTop-log.clientHeight<80;
    try{katex.render(source,node,{displayMode:display,throwOnError:true,trust:false,strict:'ignore',maxExpand:500,maxSize:20,output:'htmlAndMathml'});}
    catch{node.classList.add('math-fallback');node.textContent=plainFormula(source);}
    if(atBottom)log.scrollTop=log.scrollHeight;
  }).catch(()=>{mathEngine=null;node.classList.add('math-fallback');});
  return node;
}
function appendInline(target,parts){
  for(const part of parts){
    if(part.type==='math'){target.append(mathNode(part.text,false));continue;}
    if(part.type==='text'){target.append(document.createTextNode(part.text));continue;}
    const node=document.createElement(part.type);if(part.children)appendInline(node,part.children);else node.textContent=part.text;target.append(node);
  }
}
export function renderTeacherReply(target,text){
  target.replaceChildren();target.classList.add('rich-reply');
  for(const block of replyBlocks(text)){
    if(block.type==='math'){target.append(mathNode(block.text,true));continue;}
    if(block.type==='table'){
      const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody');
      for(const [cells,tag,parent] of [[block.head,'th',head],...block.rows.map(row=>[row,'td',body])]){
        const row=document.createElement('tr');for(const content of cells){const cell=document.createElement(tag);appendInline(cell,content);row.append(cell);}parent.append(row);
      }
      table.append(head,body);const wrap=document.createElement('div');wrap.className='reply-table';wrap.append(table);target.append(wrap);continue;
    }
    const tag=block.type==='heading'?'p':block.type==='quote'?'blockquote':block.type;
    const node=document.createElement(tag);
    if(block.type==='heading')node.className='reply-heading';
    if(block.items){if(block.type==='ol')node.start=block.start;for(const item of block.items){const li=document.createElement('li');appendInline(li,item);node.append(li);}}
    else if(block.type==='pre'){const code=document.createElement('code');code.textContent=block.text;node.append(code);}
    else appendInline(node,block.children);
    target.append(node);
  }
}
