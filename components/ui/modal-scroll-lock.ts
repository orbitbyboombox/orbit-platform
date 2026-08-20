type ScrollSnapshot={x:number;y:number;body:Partial<CSSStyleDeclaration>};
let lockCount=0;
let snapshot:ScrollSnapshot|null=null;

export function acquireModalScrollLock(){
  if(typeof window==="undefined")return()=>{};
  if(lockCount++===0){
    const body=document.body;
    snapshot={x:window.scrollX,y:window.scrollY,body:{overflow:body.style.overflow,position:body.style.position,top:body.style.top,left:body.style.left,right:body.style.right,width:body.style.width}};
    body.style.overflow="hidden";body.style.position="fixed";body.style.top=`-${snapshot.y}px`;body.style.left=`-${snapshot.x}px`;body.style.right="0";body.style.width="100%";
  }
  let released=false;
  return()=>{if(released)return;released=true;if(--lockCount>0)return;lockCount=0;const current=snapshot;snapshot=null;if(!current)return;Object.assign(document.body.style,current.body);window.scrollTo({left:current.x,top:current.y,behavior:"instant"})};
}

export function modalScrollLockCount(){return lockCount;}
