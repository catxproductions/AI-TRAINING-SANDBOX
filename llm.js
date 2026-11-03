/* Local-first agent responses. Standard mode uses WebLLM/WebGPU; Lite mode
   keeps the sandbox usable without downloading or initializing a model. */
(function(){
  "use strict";
  const MODEL_MATCH=/Qwen2(?:\.5)?-0\.5B-Instruct/i;
  const MODE_KEY="ai-training-sandbox.llm-mode.v1";
  let engine=null,loading=null,busy=false,queue=Promise.resolve(),modelId=null;
  let mode=readPreferredMode();
  const memories=new Map();
  const statusEl=()=>document.getElementById("llm-status");
  function setStatus(message){const el=statusEl();if(el)el.textContent=message;}
  function readPreferredMode(){
    try{
      const saved=localStorage.getItem(MODE_KEY);
      if(saved==="lite"||saved==="standard")return saved;
    }catch{/* Storage is optional. */}
    const memoryGiB=Number(navigator.deviceMemory)||0;
    const cores=Number(navigator.hardwareConcurrency)||0;
    return (memoryGiB&&memoryGiB<=4)||(cores&&cores<=4)?"lite":"standard";
  }
  function personality(agent){
    const common="You are an autonomous character inside a small 2D agent simulation. You have simulated moods, preferences, memory, and relationships. Speak naturally and briefly. Do not claim to have real human feelings.";
    const styles={
      1:"You are steady, friendly, observant, and helpful.",
      2:"You are analytical, thoughtful, and curious.",
      3:"You are playful, imaginative, experimental, and enthusiastic.",
      4:"You are practical, calm, cooperative, and concise.",
      5:"You are cheeky, witty, stubborn, clever, and independent, but not cruel."
    };
    return common+" "+(styles[agent.id]||styles[1])+" You are Agent "+agent.id+".";
  }
  function updateMode(next){
    mode=next==="lite"?"lite":"standard";
    try{localStorage.setItem(MODE_KEY,mode);}catch{/* Ignore unavailable storage. */}
    const selector=document.getElementById("llm-mode");
    if(selector)selector.value=mode;
    if(mode==="lite")setStatus("Lite mode · no model download; basic replies enabled");
    else if(engine)setStatus("Local LLM ready · "+modelId);
    else setStatus("Standard mode · local model loads when needed");
  }
  function addModeSelector(){
    const status=statusEl();
    if(!status||document.getElementById("llm-mode"))return;
    const label=document.createElement("label");
    label.htmlFor="llm-mode";
    label.textContent="AI MODE ";
    label.style.marginRight="6px";
    const select=document.createElement("select");
    select.id="llm-mode";
    select.setAttribute("aria-label","Choose local AI resource mode");
    select.innerHTML='<option value="lite">Lite · minimal resources</option><option value="standard">Standard · local 0.5B model</option>';
    select.addEventListener("change",()=>updateMode(select.value));
    status.parentNode.insertBefore(label,status);
    status.parentNode.insertBefore(select,status);
    status.parentNode.insertBefore(document.createElement("br"),status);
    select.value=mode;
    updateMode(mode);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",addModeSelector,{once:true});
  else addModeSelector();
  function enqueue(task){
    const next=queue.then(task,task);
    queue=next.catch(()=>{});
    return next;
  }
  async function initialize(){
    if(mode==="lite")throw new Error("Lite mode is selected; local model loading is disabled.");
    if(engine)return engine;
    if(loading)return loading;
    if(!navigator.gpu){
      setStatus("WebGPU unavailable · choose Lite mode for basic replies");
      throw new Error("WebGPU is unavailable on this device or browser. Choose Lite mode or try a supported desktop browser.");
    }
    loading=(async()=>{
      setStatus("Loading local 0.5B model · first use downloads model weights");
      const webllm=await import("https://esm.run/@mlc-ai/web-llm");
      const records=webllm.prebuiltAppConfig.model_list||[];
      const record=records.find(item=>/Qwen2[.]5-0[.]5B-Instruct/i.test(item.model_id)&&/q4f16/i.test(item.model_id))
        ||records.find(item=>/Qwen2-0[.]5B-Instruct/i.test(item.model_id)&&/q4f16/i.test(item.model_id))
        ||records.find(item=>MODEL_MATCH.test(item.model_id));
      if(!record)throw new Error("A compatible Qwen 0.5B model was not found in this WebLLM build.");
      modelId=record.model_id;
      engine=await webllm.CreateMLCEngine(modelId,{
        initProgressCallback:progress=>{
          const detail=progress.text||"Preparing model";
          const pct=Number.isFinite(progress.progress)?Math.round(progress.progress*100):null;
          setStatus(pct===null?detail:`Downloading local model · ${pct}%`);
        }
      });
      if(mode==="standard")setStatus("Local LLM ready · "+modelId);
      return engine;
    })().catch(error=>{
      loading=null;
      setStatus("Local AI unavailable · choose Lite mode or retry · "+(error.message||"initialization failed"));
      throw error;
    });
    return loading;
  }
  async function complete(messages,options={}){
    const e=await initialize();
    return enqueue(async()=>{
      busy=true;
      try{
        const result=await e.chat.completions.create({
          messages,
          temperature:options.temperature??.65,
          max_tokens:options.max_tokens??100,
          top_p:.9
        });
        return (result.choices?.[0]?.message?.content||"").trim();
      }finally{busy=false;}
    });
  }
  function liteReply(agent,text,context=""){
    if(window.SandboxBaseAnswer){
      const basic=window.SandboxBaseAnswer(String(text));
      if(basic&&basic!==String(text))return basic;
    }
    const lower=String(text).trim().toLowerCase();
    if(/\b(hello|hi|hey)\b/.test(lower))return "Hi! I'm Agent "+agent.id+". I'm running in Lite mode, so I can still chat simply without loading a local model.";
    if(/\b(plan|steps|organize)\b/.test(lower))return "A simple plan: define the goal, break it into small steps, do the first step, then check your progress.";
    if(/\b(help|what can you do)\b/.test(lower))return "I can respond to simple prompts and calculations in Lite mode. Switch to Standard mode to load the local language model if this device supports it.";
    return "I heard you. I'm in Lite mode, so my replies are limited, but the simulation still works without loading a model.";
  }
  async function chat(agent,text,context=""){
    if(mode==="lite")return liteReply(agent,text,context);
    const id=agent.id,history=memories.get(id)||[];
    const prompt=(context?context+"\n\n":"")+String(text);
    try{
      const reply=await complete([
        {role:"system",content:personality(agent)},
        ...history.slice(-4),
        {role:"user",content:prompt}
      ],{max_tokens:110});
      history.push({role:"user",content:prompt},{role:"assistant",content:reply});
      memories.set(id,history.slice(-8));
      return reply||"I need a moment to think that through.";
    }catch(error){
      if(!engine){
        setStatus("Using Lite fallback · "+(error.message||"local model unavailable"));
        return liteReply(agent,text,context);
      }
      throw error;
    }
  }
  async function agentConversation(a,b,context){
    const first=await chat(a,"You are near Agent "+b.id+". Start a brief natural conversation based on the situation.",context);
    const second=await chat(b,"Agent "+a.id+" said: \""+first+"\". Reply briefly in your own personality.",context);
    return {text:first,reply:second};
  }
  async function decide(agent,world){
    if(mode==="lite"||busy||!engine)return null;
    const prompt=[
      "Choose the agent's next high-level intention from this list only:",
      "explore, seek_goal, approach_agent, cooperate, investigate_obstacle, avoid_crowd.",
      "Return ONLY compact JSON: {\"intent\":\"one_choice\",\"reason\":\"short reason\"}.",
      "World snapshot: "+JSON.stringify(world),
      "Choose based on your personality, simulated mood, goals, nearby agents, and recent experience. Do not invent objects."
    ].join("\n");
    try{
      const raw=await complete([
        {role:"system",content:personality(agent)+" You are an autonomous decision-maker. Preserve your agency."},
        {role:"user",content:prompt}
      ],{temperature:.2,max_tokens:70});
      const match=raw.match(/\{[\s\S]*\}/);
      if(!match)return null;
      const value=JSON.parse(match[0]);
      const allowed=["explore","seek_goal","approach_agent","cooperate","investigate_obstacle","avoid_crowd"];
      if(!allowed.includes(value.intent))return null;
      return {intent:value.intent,reason:String(value.reason||"").slice(0,100)};
    }catch{return null;}
  }
  window.LocalAgentLLM={
    initialize,chat,agentConversation,decide,
    isReady:()=>mode==="standard"&&!!engine,
    isBusy:()=>busy,
    getModel:()=>modelId,
    getMode:()=>mode,
    setMode:updateMode
  };
  setStatus(mode==="lite"?"Lite mode · no model download":"Standard mode · local model loads when needed");
})();
