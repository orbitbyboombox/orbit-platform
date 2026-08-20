type ScrollSnapshot={x:number;y:number;body:Partial<CSSStyleDeclaration>;html:Partial<CSSStyleDeclaration>};
let lockCount=0;
let snapshot:ScrollSnapshot|null=null;

export function acquireModalScrollLock(){
  if(typeof window==="undefined")return()=>{};
  if(lockCount++===0){
    const body=document.body,html=document.documentElement;
    snapshot={x:window.scrollX,y:window.scrollY,body:{overflow:body.style.overflow,position:body.style.position,top:body.style.top,left:body.style.left,width:body.style.width,overscrollBehavior:body.style.overscrollBehavior},html:{overflow:html.style.overflow,overscrollBehavior:html.style.overscrollBehavior}};
    html.style.overflow="hidden";html.style.overscrollBehavior="none";
    body.style.overflow="hidden";body.style.position="fixed";body.style.top=`-${snapshot.y}px`;body.style.left=`-${snapshot.x}px`;body.style.width="100%";body.style.overscrollBehavior="none";
  }
  let released=false;
  return()=>{if(released)return;released=true;if(--lockCount>0)return;lockCount=0;const current=snapshot;snapshot=null;if(!current)return;Object.assign(document.body.style,current.body);Object.assign(document.documentElement.style,current.html);window.scrollTo({left:current.x,top:current.y,behavior:"instant"})};
}

export function modalScrollLockCount(){return lockCount;}
