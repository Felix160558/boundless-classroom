// Browser-local image preparation. Files leave the browser only when a turn is sent.
export const MAX_ATTACHMENTS=3,MAX_IMAGE_FILE_BYTES=5*1024*1024,MAX_PDF_FILE_BYTES=20*1024*1024,MAX_PREPARED_BYTES=1024*1024;
const types=new Set(['image/jpeg','image/png','image/webp']);
export function parsePdfPages(value,total,available=MAX_ATTACHMENTS){
  const source=String(value).trim();
  if(!source||!/^[0-9,，、\s-]+$/.test(source))throw new Error('请输入页码，例如 1、3 或 1-3。');
  const pages=[];
  for(const part of source.replace(/[，、]/g,',').split(',')){
    const match=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if(!match)throw new Error('请输入页码，例如 1、3 或 1-3。');
    const first=Number(match[1]),last=Number(match[2]||match[1]);
    if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first<1||last>total||last<first)throw new Error('页码超出这份 PDF 的范围。');
    if(last-first+1>available)throw new Error('每次最多添加 '+available+' 页，请只选择要讨论的页。');
    for(let page=first;page<=last;page++)if(!pages.includes(page))pages.push(page);
    if(pages.length>available)throw new Error('本次还能添加 '+available+' 页，请减少所选页数。');
  }
  return pages;
}
export function attachmentKind(file){
  if(types.has(file.type)){if(file.size>MAX_IMAGE_FILE_BYTES)throw new Error('单张图片最多 5 MB，请先裁剪或缩小。');return 'image';}
  if(file.type==='application/pdf'||/\.pdf$/i.test(file.name||'')){if(file.size>MAX_PDF_FILE_BYTES)throw new Error('PDF 最多 20 MB，可以只导出需要的几页。');return 'pdf';}
  throw new Error('暂支持 JPG、PNG、WebP 和 PDF。HEIC 请先转为 JPG。');
}
function rawSize(data){return Math.floor((data.length-data.indexOf(',')-1)*3/4)-(data.endsWith('==')?2:data.endsWith('=')?1:0);}
function prepared(canvas,name){
  // One high-quality encode, never iteratively blur equations to make a file fit.
  const data=canvas.toDataURL('image/jpeg',.94);
  if(rawSize(data)>MAX_PREPARED_BYTES)throw new Error('这张图细节较多，请裁剪到具体题目后上传，避免压缩模糊公式。');
  return {id:crypto.randomUUID(),name:[...name].slice(0,110).join(''),mime:'image/jpeg',data};
}
async function prepareImage(file){
  const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const jpeg=head[0]===255&&head[1]===216&&head[2]===255;
  const png=[137,80,78,71,13,10,26,10].every((byte,index)=>head[index]===byte);
  const webp=String.fromCharCode(...head.slice(0,4))==='RIFF'&&String.fromCharCode(...head.slice(8,12))==='WEBP';
  if(!(file.type==='image/jpeg'&&jpeg||file.type==='image/png'&&png||file.type==='image/webp'&&webp))throw new Error('图片格式与文件内容不符，请重新导出为 JPG、PNG 或 WebP。');
  const url=URL.createObjectURL(file);let image;
  try{
    image=new Image();image.decoding='async';image.src=url;await image.decode();
    const width=image.naturalWidth,height=image.naturalHeight;
    if(!width||!height||width*height>40000000)throw new Error('这张图片尺寸过大或无法读取，请裁剪后再试。');
    const scale=Math.min(1,2048/Math.max(width,height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('无法准备图片，请换一张截图重试。');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const result=prepared(canvas,file.name||'image.jpg');canvas.width=canvas.height=1;return result;
  }catch(error){throw new Error(error?.message?.includes('请')?error.message:'图片无法读取，请换一张 JPG、PNG 或 WebP 图片。');}
  finally{URL.revokeObjectURL(url);if(image)image.src='';}
}
let pdfModule;
async function pdfjs(){
  if(!pdfModule)pdfModule=import('./pdf.mjs?v=6.5.438').then(module=>{module.GlobalWorkerOptions.workerSrc=new URL('./pdf.worker.mjs?v=6.5.438',import.meta.url).href;return module;}).catch(error=>{pdfModule=null;throw error;});
  return pdfModule;
}
export function appendAttachmentImages(container,attachments){
  if(!attachments?.length)return;
  const row=document.createElement('div');row.className='sent-attachments';
  for(const item of attachments){
    const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');
    image.src=item.data;image.alt=item.name;image.decoding='async';caption.textContent=item.name;
    // Retain only a small thumbnail in the visible chat after a successful turn.
    image.addEventListener('load',()=>{
      if(image.dataset.thumbnail)return;image.dataset.thumbnail='true';
      const canvas=document.createElement('canvas'),scale=Math.min(1,250/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');if(context){context.drawImage(image,0,0,canvas.width,canvas.height);image.src=canvas.toDataURL('image/jpeg',.85);}canvas.width=canvas.height=1;
    },{once:true});
    figure.append(image,caption);row.append(figure);
  }
  container.append(row);
}
export function createAttachments({form,input,button,preview,status,pdfPanel,pdfName,pdfPages,pdfRange,pdfAdd,pdfCancel,progress,processingCancel,privacy,onChange=()=>{},onError=()=>{},getEnglish=()=>false}){
  let items=[],busy=false,epoch=0,pdf=null,pdfTask=null,renderTask=null,locked=false;
  const text=(zh,en)=>getEnglish()?en:zh;
  function notify(message=''){
    status.textContent=message;status.hidden=!message;progress.hidden=!message;processingCancel.hidden=!busy;
    privacy.hidden=!items.length&&!pdf&&!busy;
    button.disabled=locked||busy;input.disabled=locked||busy;pdfAdd.disabled=locked||busy;
    form.dataset.attachmentsBusy=String(busy);onChange();
  }
  function render(){
    preview.replaceChildren();preview.hidden=!items.length;
    for(const item of items){
      const card=document.createElement('div');card.className='attachment-preview';
      const image=document.createElement('img');image.src=item.data;image.alt=item.name;
      const name=document.createElement('span');name.textContent=item.name;
      const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title=text('移除图片','Remove image');remove.setAttribute('aria-label',remove.title+' '+item.name);remove.disabled=locked;
      remove.addEventListener('click',()=>{items=items.filter(value=>value.id!==item.id);render();notify();});
      card.append(image,name,remove);preview.append(card);
    }
  }
  async function closePdf(){
    const task=renderTask;renderTask=null;try{task?.cancel();}catch{}
    const loading=pdfTask;pdfTask=null;const previous=pdf;pdf=null;pdfPanel.hidden=true;
    try{await (previous?previous.document.destroy():loading?.destroy());}catch{}
  }
  async function cancel(){epoch++;busy=false;void closePdf();notify();}
  async function addFiles(files){
    if(locked||busy)return;
    const entries=Array.from(files||[]);if(!entries.length)return;
    if(entries.length>MAX_ATTACHMENTS){onError(text('一次最多选择 3 个文件。','Choose at most 3 files at a time.'));return;}
    if(entries.length>1&&entries.some(file=>file.type==='application/pdf'||/\.pdf$/i.test(file.name||''))){onError(text('PDF 请每次单独选择一份，再选择要讨论的页。','Choose one PDF at a time, then select the pages to discuss.'));input.value='';return;}
    const generation=++epoch;busy=true;notify(text('正在准备附件…','Preparing attachments…'));
    try{
      for(const file of entries){
        if(generation!==epoch)return;
        const kind=attachmentKind(file);
        if(items.length>=MAX_ATTACHMENTS)throw new Error('一次最多 3 张图片或 PDF 页面，请先移除部分附件。');
        if(kind==='image'){
          const item=await prepareImage(file);if(generation!==epoch)return;items.push(item);render();
        }else{
          await closePdf();if(generation!==epoch)return;
          notify(text('正在读取 PDF…','Reading PDF…'));
          const library=await pdfjs();if(generation!==epoch)return;
          const data=new Uint8Array(await file.arrayBuffer());if(generation!==epoch)return;
          pdfTask=library.getDocument({data,isEvalSupported:false,useSystemFonts:true,stopAtErrors:true,enableXfa:false,disableAutoFetch:true,useWasm:false,isImageDecoderSupported:false});
          pdfTask.onPassword=()=>{void pdfTask?.destroy();};
          const document=await pdfTask.promise;if(generation!==epoch){await document.destroy();return;}
          pdf={document,name:file.name};pdfTask=null;
          pdfName.textContent=file.name;pdfPages.textContent=text('共 '+document.numPages+' 页 · 仅发送所选页',document.numPages+' pages · Only selected pages are sent');
          pdfRange.value='1';pdfRange.setAttribute('max',String(document.numPages));pdfPanel.hidden=false;
          break;
        }
      }
      if(generation===epoch){busy=false;notify();}
    }catch(error){
      if(generation!==epoch)return;
      busy=false;await closePdf();notify();
      onError(error?.name==='PasswordException'?'暂不支持加密 PDF，请解密后重试，或截图上传。':error?.message?.includes('请')?error.message:'附件未能读取。特殊或加密 PDF 请将所需页截图后上传。');
    }finally{input.value='';}
  }
  input.addEventListener('change',()=>void addFiles(input.files));
  button.addEventListener('click',()=>{if(!busy&&!locked)input.click();});
  pdfCancel.addEventListener('click',()=>void cancel());
  processingCancel.addEventListener('click',()=>void cancel());
  pdfAdd.addEventListener('click',async()=>{
    if(locked||busy||!pdf)return;
    let pages;try{pages=parsePdfPages(pdfRange.value,pdf.document.numPages,MAX_ATTACHMENTS-items.length);}catch(error){onError(error.message);return;}
    const generation=++epoch,source=pdf;busy=true;
    try{
      const preparedPages=[];
      for(const [index,pageNumber] of pages.entries()){
        notify(text('正在准备第 '+pageNumber+' 页 · '+(index+1)+'/'+pages.length,'Preparing page '+pageNumber+' · '+(index+1)+'/'+pages.length));
        const page=await source.document.getPage(pageNumber);if(generation!==epoch)return;
        const natural=page.getViewport({scale:1}),scale=Math.min(2.5,2048/Math.max(natural.width,natural.height)),viewport=page.getViewport({scale});
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
        const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('无法绘制 PDF，请截图后上传。');
        renderTask=page.render({canvasContext:context,viewport,background:'rgb(255,255,255)',annotationMode:0});await renderTask.promise;renderTask=null;
        if(generation!==epoch){canvas.width=canvas.height=1;return;}
        const sample=document.createElement('canvas');sample.width=sample.height=64;const sampleContext=sample.getContext('2d',{willReadFrequently:true});
        if(sampleContext){sampleContext.drawImage(canvas,0,0,64,64);const pixels=sampleContext.getImageData(0,0,64,64).data;let marks=0;for(let i=0;i<pixels.length;i+=4)if(Math.min(pixels[i],pixels[i+1],pixels[i+2])<250)marks++;sample.width=sample.height=1;if(!marks)throw new Error('这一页为空白或未能正确显示，请将所需内容截图后上传。');}
        preparedPages.push(prepared(canvas,[...source.name].slice(0,85).join('')+' · p.'+pageNumber));canvas.width=canvas.height=1;page.cleanup();
      }
      if(generation!==epoch)return;
      items.push(...preparedPages);await closePdf();busy=false;render();notify();
    }catch(error){if(generation!==epoch)return;busy=false;notify();onError(error?.message?.includes('请')?error.message:'此 PDF 页面无法完整显示，请截图后上传。');}
  });
  const hasFiles=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  form.addEventListener('dragover',event=>{if(!hasFiles(event))return;event.preventDefault();if(!locked&&!busy)form.classList.add('attachment-dragover');});
  form.addEventListener('dragleave',event=>{if(!form.contains(event.relatedTarget))form.classList.remove('attachment-dragover');});
  form.addEventListener('drop',event=>{if(!hasFiles(event))return;event.preventDefault();form.classList.remove('attachment-dragover');if(!locked&&!busy)void addFiles(event.dataTransfer.files);});
  form.addEventListener('paste',event=>{
    const images=Array.from(event.clipboardData?.files||[]).filter(file=>types.has(file.type));
    if(images.length&&!locked&&!busy){event.preventDefault();void addFiles(images);}
  });
  notify();
  return {get busy(){return busy;},get count(){return items.length;},get hasPdf(){return !!pdf;},snapshot(){return items.map(({name,mime,data})=>({name,mime,data}));},
    clear(){epoch++;busy=false;items=[];void closePdf();render();notify();},
    restore(attachments){if(items.length||busy||pdf)return false;items=(attachments||[]).slice(0,MAX_ATTACHMENTS).map(item=>({...item,id:crypto.randomUUID()}));render();notify();return true;},
    matches(attachments=[]){return items.length===attachments.length&&items.every((item,index)=>['name','mime','data'].every(key=>item[key]===attachments[index][key]));},
    lock(value){if(locked===Boolean(value))return;locked=Boolean(value);render();notify();},cancel,
    dispose(){epoch++;items=[];busy=false;void closePdf();preview.replaceChildren();input.value='';}
  };
}
