export function updateManager({safe,paint,reload}){
  let registration,available=false,applying=false,notice='',timer,requested,port;
  let lastCheck=0;
  function show(){paint({available,applying,notice});}
  function finish(message=''){
    clearTimeout(timer);port?.close();applying=false;requested=null;notice=message;
    available=!!registration?.waiting;show();
  }
  function synchronize(){
    available=!!(registration?.waiting&&registration.active);
    if(!available&&!applying)notice='';
    show();
  }
  function watch(worker){
    worker?.addEventListener('statechange',synchronize);
    synchronize();
  }
  async function check(force=false){
    synchronize();
    if(!registration||document.hidden||(!force&&Date.now()-lastCheck<15000))return;
    lastCheck=Date.now();
    try{await registration.update();}catch{/* Offline: continue using the installed shell. */}
    synchronize();
  }
  function apply(){
    if(applying||!registration?.waiting||!safe())return;
    applying=true;notice='';requested=registration.waiting;show();
    const channel=new MessageChannel();port=channel.port1;
    channel.port1.onmessage=event=>{
      if(!applying)return;
      if(event.data==='other-windows')finish('updateOtherWindows');
      if(event.data==='failed')finish('updateRetry');
    };
    const worker=requested;
    function activated(){
      if(worker.state==='activated'&&applying&&worker===requested&&safe()){
        clearTimeout(timer);applying=false;reload();
      }
      if(['activated','redundant'].includes(worker.state))worker.removeEventListener('statechange',activated);
    }
    worker.addEventListener('statechange',activated);
    timer=setTimeout(()=>{channel.port1.close();if(applying)finish('updateRetry');},12000);
    try{requested.postMessage({type:'activate-update'},[channel.port2]);}
    catch{finish('updateRetry');}
  }
  return {apply,get applying(){return applying;},show,async start(promise){
    try{registration=await promise;}catch{return;}
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(applying&&requested===navigator.serviceWorker.controller&&safe()){clearTimeout(timer);applying=false;reload();return;}
      synchronize();
    });
    registration.addEventListener('updatefound',()=>watch(registration.installing));
    watch(registration.installing);
    const resume=()=>check();
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('pageshow',resume);
    window.addEventListener('online',()=>check(true));
    setInterval(resume,60*60*1000);
    check(true);
  }};
}
