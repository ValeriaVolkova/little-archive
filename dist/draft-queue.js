// Serialize writes and coalesce pending snapshots, without losing the latest edit.
export function draftQueue(write,onState=()=>{}){
  let pending=null,running=null,error=null;
  async function drain(){
    while(pending){const value=pending;pending=null;
      try{await write(value);error=null;}catch(e){error=e;}
    }
    onState(error?'error':'saved');
  }
  return {
    save(value){pending=value;onState('saving');if(!running)running=drain().finally(()=>{running=null;});},
    async flush(){while(running)await running;if(error)throw error;}
  };
}
