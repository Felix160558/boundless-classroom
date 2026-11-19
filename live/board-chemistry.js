import { MOLECULE_CATALOG } from '../molecule-catalog.js?v=quiet-shape-31';

function boardAspect(aspect) { return Number.isFinite(aspect) && aspect > 0 ? aspect : 2; }
const xy = (point, aspect) => [(point.x ?? point[0]) * aspect, point.y ?? point[1]];
function bounds(points) {
  let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
  for (const [x,y] of points) {
    x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y);
  }
  return {x0,x1,y0,y1,w:x1-x0,h:y1-y0};
}
function pathLength(points) {
  let length=0;
  for(let i=1;i<points.length;i++) length+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
  return length;
}
function inside([x,y], vertices) {
  let yes=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const [x0,y0]=vertices[i], [x1,y1]=vertices[j];
    if ((y0>y)!==(y1>y) && x < x0 + (x1-x0)*(y-y0)/(y1-y0)) yes=!yes;
  }
  return yes;
}

// The closed gesture is separate from the ink being recognized. Work in the
// board's metric coordinates so a steep viewing angle doesn't skew selection.
export function selectCircledInk(circlePoints, strokes, aspect=2) {
  if(circlePoints.length<6) return null;
  aspect=boardAspect(aspect);
  const polygon=circlePoints.map(p=>xy(p,aspect));
  const b=bounds(polygon), [sx,sy]=polygon[0], [ex,ey]=polygon.at(-1);
  const shortest=Math.min(b.w,b.h), longest=Math.max(b.w,b.h);
  if(shortest<.024 || longest/shortest>13 || Math.hypot(ex-sx,ey-sy)>Math.min(.09,shortest*.39)) return null;
  let area=0;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) area+=polygon[j][0]*polygon[i][1]-polygon[i][0]*polygon[j][1];
  area=Math.abs(area/2);
  const length=pathLength(polygon)+Math.hypot(ex-sx,ey-sy);
  if(area/b.w/b.h<.32 || length>3.05*(b.w+b.h)) return null;
  return Array.from(strokes).filter(s=>{
    if(!s.points?.length) return false;
    let count=0;
    for(const p of s.points){
      const [x,y]=xy(p,aspect);
      if(x<b.x0 || x>b.x1 || y<b.y0 || y>b.y1) return false;
      if(inside([x,y],polygon)) count++;
    }
    return count/s.points.length>=.94;
  });
}

function pointSegment([x,y], [x0,y0], [x1,y1]) {
  const dx=x1-x0, dy=y1-y0;
  const t=Math.max(0,Math.min(1,((x-x0)*dx+(y-y0)*dy)/(dx*dx+dy*dy || 1)));
  return (x-x0-t*dx)**2+(y-y0-t*dy)**2;
}
const cross = ([ax,ay],[bx,by],[cx,cy]) => (bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
function segmentsTouch(a,b,c,d,r2) {
  if((a[0]-c[0])**2+(a[1]-c[1])**2<=r2) return true;
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  if(abC*abD<0 && cdA*cdB<0) return true;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b))<=r2;
}
export function strokesAtEraser(points, strokes, aspect=2, radius=.022) {
  if(!points.length) return [];
  aspect=boardAspect(aspect);
  const trail=points.map(p=>xy(p,aspect)), e=bounds(trail);
  const hits=[];
  for(const s of strokes){
    if(!s.points?.length) continue;
    const ink=s.points.map(p=>xy(p,aspect)), b=bounds(ink);
    const reach=radius+(Number(s.width)||0)/2000;
    if(e.x0>b.x1+reach || e.x1<b.x0-reach || e.y0>b.y1+reach || e.y1<b.y0-reach) continue;
    const r2=reach**2;
    if(trail.some((p,i)=>ink.some((q,j)=>segmentsTouch(trail[i-1]||p,p,ink[j-1]||q,q,r2)))) hits.push(s.id);
  }
  return hits;
}

function key(text) { return String(text ?? '').normalize('NFKC').replace(/[−–—]/g,'-').replace(/\s+/g,'').toUpperCase(); }
const aliases=new Map();
for(const entry of Object.values(MOLECULE_CATALOG)){
  for(const name of [entry.formula,entry.molecularFormula,entry.name,entry.englishName,...entry.aliases]){
    if(!name) continue;
    const norm=key(name);
    if(!aliases.has(norm)) aliases.set(norm,{text:name,ids:new Set()});
    aliases.get(norm).ids.add(entry.id);
  }
}
export function lookupBoardMolecule(raw) {
  const text=String(raw ?? '').trim().slice(0,96);
  const norm=key(text);
  const match=aliases.get(norm) || aliases.get(norm.replace(/(?:分子|MOLECULE)$/u,''));
  return {text,ids:match?[...match.ids]:[]};
}

// Vector skeletons, not a language model: block Latin letters, numerals, and
// first-pass common Chinese names. Each slash is a pen lift, each bar a variant.
// These samples are normalized at runtime to account for size and subscripts.
const samples={
 A:'09 50 99/25 75|09 50 99/26 76|09 06 22 51 83 86 69 38 09/81 89',
 B:'09 00 60 91 81 54 04/54 94 97 69 09|00 09/04 40 71 94 97 59 09',
 C:'93 60 20 02 07 29 69 96|92 61 31 04 05 38 79 98',
 D:'09 00 50 82 95 88 59 09|90 99/96 74 45 27 18 49 79 97',
 E:'90 00 09 99/04 74|05 95 83 61 32 14 17 49 99',
 F:'09 00 90/04 74|89 62 40 22 28/06 76',
 G:'93 70 30 02 07 39 79 98 95 55|85 72 31 03 06 39 78 96 83 81 98 69',
 H:'00 09/90 99/04 94|09 00 09/05 25 54 83 94 99',
 I:'00 90/50 59/09 99|50 59|40 41/42 48 59',
 J:'00 90/80 87 69 29 06|43 42/64 68 59 27 05',
 K:'00 09/92 05 99|00 09/94 05 99',
 L:'00 09 99|20 19 99|30 38 59 89',
 M:'09 00 56 90 99|09 01 30 52 59/53 70 92 99|09 02 20 41 59/53 70 91 99',
 N:'09 00 99 90|09 02 22 51 82 99|09 01 60 92 99',
 O:'52 26 05 25 59 86 96 74 52|50 20 02 06 29 69 96 92 70 50|90 60 23 05 08 49 88 94 92 60',
 P:'09 00 60 92 94 65 05|09 02 52 83 95 67 07',
 Q:'50 20 02 07 29 69 97 92 70 50/55 99|92 51 21 04 05 49 86 92 99',
 R:'09 00 60 92 94 65 05/45 99|09 03 12 45 53 81 91',
 S:'92 60 20 02 24 75 96 87 59 29 07|91 61 22 03 14 75 87 69 29 08',
 T:'00 90/50 59|21 28 49 77/04 94',
 U:'00 06 29 69 96 90|00 06 28 59 86 90 99',
 V:'00 49 90',
 W:'00 29 54 79 90|00 06 29 56 63 66 79 96 90',
 X:'00 99/90 09',
 Y:'00 55 90/55 59|01 07 29 75 91 88 59 29',
 Z:'00 90 09 99|01 91 08 98',
 '0':'50 20 02 07 29 69 97 92 70 50|60 20 03 08 49 89 95 83 60',
 '1':'13 50 59/09 99|03 50 59|10 19',
 '2':'02 20 60 92 84 29 99|01 20 60 91 83 54 28 09 99|02 30 70 92 94 56 18 09 99',
 '3':'01 30 70 92 73 44 75 96 87 59 29 08|00 80 44 75 97 79 39 07',
 '4':'30 05 95/60 69|50 05 95/80 89|00 06 96/70 79',
 '5':'90 10 04 64 95 97 69 29 07|90 10 04 44 84 97 79 39 07',
 '6':'91 60 31 04 07 29 69 97 95 64 24 05|90 50 23 05 08 39 79 96 65 35 06',
 '7':'00 90 39|00 90 39/26 86',
 '8':'54 20 02 26 69 96 74 20 40 80 92 74 54|54 21 60 92 74 25 07 39 79 97 54',
 '9':'95 75 25 02 30 70 92 96 69 18|69 95 91 50 20 03 25 65 94',
 '-':'04 94','+':'04 94/50 59','(':'90 51 23 16 47 89',')':'00 41 73 86 57 19','·':'55','.':'55',
 水:'41 47 39/04 24 16 08/71 53/53 66 99',
 二:'21 71/08 98',
 氧:'20 02/12 82/23 73/14 74 75 86 99/23 35/63 55/15 75/26 66/07 77/47 49',
 化:'21 13 04/13 19/60 67 89 99/92 54',
 碳:'02 42/22 04/14 44 47 17 14/50 52 92 90/70 72/44 94/64 46 48 39/67 57/87 77/77 69/77 99',
 氨:'20 02/12 82/23 73/14 74 85 99/46 56/26 77/16 15 75 76/46 37 69/17 77/57 68 29',
 气:'20 02/12 92/24 74/15 75 77 99',
 甲:'12 82 87 17 12/14 84/48 40|12 82 87 17 12/14 84/40 49',
 乙:'01 91 16 09 89 98',
 丙:'00 90/02 92 97 88/02 09/49 41/43 37/44 77',
 烷:'01 06 28/00 04/31 13/04 02/60 71/33 32 92 93/44 84/35 95/55 47 39/75 77 89 99',
 烯:'01 06 28/00 04/31 13/04 02/40 82/80 31/23 93/63 35/37 34 87 89/67 65/65 69',
 炔:'11 06 38/10 15/41 23/02 04/52 92 94/44 94/70 74 57 39/74 99',
 醇:'00 40/12 42 47 07 02 12/11 14 04/31 33 43/06 46/60 71/51 91/52 82 84 54 52/54 86 67 69 58/46 96',
 苯:'01 91/20 22/70 72/03 93/40 48/43 25 07/43 66 98/27 77',
 分:'30 12 03/60 83 93/25 75 78 69 49/45 37 29',
 子:'11 81 44 47 39/05 95',
};

const SIDE=21, DIAG=Math.SQRT2;
const CJK=/[㐀-鿿]/u;
function distanceField(pixels) {
  const field=new Float32Array(SIDE*SIDE).fill(SIDE);
  for(const p of pixels) field[p]=0;
  for(let i=0;i<field.length;i++){
    const x=i%SIDE, y=Math.floor(i/SIDE);
    if(x) field[i]=Math.min(field[i],field[i-1]+1);
    if(y){
      field[i]=Math.min(field[i],field[i-SIDE]+1);
      if(x) field[i]=Math.min(field[i],field[i-SIDE-1]+DIAG);
      if(x<SIDE-1) field[i]=Math.min(field[i],field[i-SIDE+1]+DIAG);
    }
  }
  for(let i=field.length-1;i>=0;i--){
    const x=i%SIDE, y=Math.floor(i/SIDE);
    if(x<SIDE-1) field[i]=Math.min(field[i],field[i+1]+1);
    if(y<SIDE-1){
      field[i]=Math.min(field[i],field[i+SIDE]+1);
      if(x) field[i]=Math.min(field[i],field[i+SIDE-1]+DIAG);
      if(x<SIDE-1) field[i]=Math.min(field[i],field[i+SIDE+1]+DIAG);
    }
  }
  return field;
}
function raster(paths,b=bounds(paths.flat())){
  const safe=Math.max(b.w,b.h,1e-6), w=Math.max(b.w,safe*.19), h=Math.max(b.h,safe*.18);
  const pixels=new Set(), ratio=Math.log(Math.max(b.w,safe*.035)/Math.max(b.h,safe*.035));
  const scale=SIDE-5, center=(SIDE-1)/2;
  for(const path of paths){
    let x0,y0;
    for(const [x,y] of path){
      const x1=center+scale*(x-(b.x0+b.x1)/2)/w, y1=center+scale*(y-(b.y0+b.y1)/2)/h;
      if(x0===undefined) { x0=x1; y0=y1; }
      const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)*1.4));
      for(let j=0;j<=n;j++) pixels.add(Math.round(y0+(y1-y0)*j/n)*SIDE+Math.round(x0+(x1-x0)*j/n));
      x0=x1; y0=y1;
    }
  }
  return {pixels:[...pixels],field:distanceField(pixels),ratio,strokes:paths.length,length:paths.reduce((acc,p)=>acc+pathLength(p),0)/safe};
}
function avgDistance(from,to) {
  let sum=0;
  for(const i of from.pixels) sum+=to.field[i];
  return sum/from.pixels.length;
}
function glyphDistance(a,b,cjk) {
  // Both directions matter: a straight stroke is not a partially read H.
  const d1=avgDistance(a,b), d2=avgDistance(b,a);
  return (.40*(d1+d2)+.20*Math.max(d1,d2))/(SIDE-5)
    + .037*Math.min(2.8,Math.abs(a.ratio-b.ratio))
    + .014*Math.min(2,Math.abs(a.length-b.length))
    + (cjk ? .006*Math.min(6,Math.abs(a.strokes-b.strokes)) : .003*Math.max(0,a.strokes-3));
}

let library, vocabulary;
function buildLibrary(){
  if(library) return;
  library=new Map(Object.entries(samples).map(([char,variants])=>[char,variants.split('|').map(variant=>
    raster(variant.split('/').map(path=>path.split(' ').map(p=>[Number(p[0]),Number(p[1])])))
  )]));
  vocabulary=new Map();
  for(const [norm,match] of aliases){
    for(const word of CJK.test(norm)?[norm,norm+'分子']:[norm,norm+'MOLECULE']){
      if(word.length<=28 && [...word].every(char=>library.has(char)) && !vocabulary.has(word)) vocabulary.set(word,match);
    }
  }
}

function inkLattice(strokes,aspect) {
  const paths=[];
  for(const {points} of strokes){
    if(!points?.length) continue;
    const next=points.map(p=>xy(p,aspect)), previous=paths.at(-1);
    // Shared whiteboards split long pen gestures into smaller network packets.
    // A repeated exact endpoint marks continuity without changing ink IDs.
    if(previous?.at(-1)[0]===next[0][0] && previous.at(-1)[1]===next[0][1]) previous.push(...next.slice(1));
    else paths.push(next);
  }
  const ink=paths.map(points=>({points,b:bounds(points)})).sort((a,b)=>a.b.x0-b.b.x0 || a.b.y0-b.b.y0);
  const full=bounds(ink.flatMap(s=>s.points));
  const edges=ink.map(()=>[]);
  for(let i=0;i<ink.length;i++){
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,gap=0;
    for(let j=i;j<Math.min(i+18,ink.length);j++){
      const p=ink[j].b;
      if(j>i) gap=Math.max(gap,p.x0-x1);
      x0=Math.min(x0,p.x0); x1=Math.max(x1,p.x1);
      y0=Math.min(y0,p.y0); y1=Math.max(y1,p.y1);
      const w=x1-x0,h=y1-y0;
      if(j>i && gap>Math.max(full.h*.42,.013)) break;
      if(j>i && w>Math.max(full.h*1.95,h*2.35,.03)) break;
      const shape=raster(ink.slice(i,j+1).map(s=>s.points),{x0,x1,y0,y1,w,h});
      const scores=new Map();
      let bestChar='', minimum=Infinity;
      for(const [char,variants] of library){
        const cjk=CJK.test(char);
        const height=Math.max(h,full.h*.50,.018);
        if((!cjk&&(j-i>6 || gap>height*.14)) || (cjk&&(shape.length<.5 || gap>height*.27 || w>height*1.53))) continue;
        if(shape.pixels.length<=2 && !'.·'.includes(char)) continue;
        if(shape.pixels.length>2 && '.·'.includes(char)) continue;
        let score=Math.min(...variants.map(ref=>glyphDistance(shape,ref,cjk)));
        score+=.075*Math.max(0,gap/Math.max(h,full.h*.38,.018)-.10);
        // Reject stretched word fragments, and encourage constituent strokes
        // to stay together when they form one glyph.
        if(w>Math.max(h,full.h*.55)*1.48 && char!=='-'&&char!=='一') score+=.07;
        if(score<.35) scores.set(char,score);
        if(score<minimum){ minimum=score; bestChar=char; }
      }
      if(bestChar && minimum<.35) edges[i].push({end:j+1,scores,bestChar,minimum});
    }
  }
  return edges;
}

const glyphBase=.032;
function bestFree(edges){
  const states=Array(edges.length+1).fill(null);
  states[0]={cost:0,text:'',worst:0};
  for(let i=0;i<edges.length;i++){
    if(!states[i]) continue;
    for(const edge of edges[i]){
      const cost=states[i].cost+edge.minimum+glyphBase;
      if(!states[edge.end] || states[edge.end].cost>cost){
        states[edge.end]={cost,text:states[i].text+edge.bestChar,worst:Math.max(states[i].worst,edge.minimum)};
      }
    }
  }
  return states.at(-1);
}

function matchWord(word,edges){
  if(word.length>edges.length) return null;
  let states=new Map([[0,{cost:0,worst:0}]]);
  for(let i=0;i<word.length;i++){
    const char=word[i], next=new Map();
    for(const [start,path] of states){
      for(const edge of edges[start]??[]){
        if(edges.length-edge.end<word.length-i-1) continue;
        const d=edge.scores.get(char);
        if(d===undefined || d>.195 || d-edge.minimum>.085) continue;
        const cost=path.cost+d+glyphBase;
        if(!next.has(edge.end)||cost<next.get(edge.end).cost){
          next.set(edge.end,{cost,worst:Math.max(path.worst,d)});
        }
      }
    }
    if(!next.size) return null;
    states=next;
  }
  return states.get(edges.length)??null;
}

// Runs completely on the device and matches only known ChemBoard entries.
// Unrecognized/freehand/cursive writing can be supplied by typed correction.
export async function recognizeBoardMolecule(strokes, aspect=2){
  if(!strokes.length || strokes.length>100 || strokes.reduce((n,s)=>n+(s.points?.length||0),0)>6000) return {text:'',ids:[]};
  buildLibrary();
  const edges=inkLattice(strokes,boardAspect(aspect));
  const closest=bestFree(edges);
  if(!closest) return {text:'',ids:[]};
  const candidates=[];
  for(const [word,match] of vocabulary){
    const path=matchWord(word,edges);
    if(!path || path.cost/word.length-glyphBase>.117 || path.cost-closest.cost>Math.max(.055,word.length*.024)) continue;
    candidates.push({word,match,...path});
  }
  candidates.sort((a,b)=>a.cost-b.cost);
  const top=candidates[0];
  if(!top) return {text:closest.worst<.155?closest.text:'',ids:[]};
  const ids=[...top.match.ids];
  // Same chemical identity under multiple aliases isn't ambiguity. If two
  // different structures are comparably plausible, defer to the board writer.
  const rival=candidates.find(c=>[...c.match.ids].some(id=>!top.match.ids.has(id)));
  if(rival && rival.cost-top.cost<.032) return {text:closest.worst<.155?closest.text:'',ids:[]};
  return {text:top.match.text,ids};
}
