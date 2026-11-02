/* Local, keyless LLM runtime powered by WebLLM + WebGPU.
   Model weights are downloaded once and cached by the browser. No chat text is
   sent to an inference server: generation runs on this device. */
(function(){
  "use strict";
  const MODEL_MATCH=/Qwen2(?:\.5)?-0\.5B-Instruct/i;
  let engine=null, loading=null, busy=false, queue=Promise.resolve(), modelId=null;
  const memories=new Map();
  const statusEl=()=>document.getElementById("llm-status");
  function setStatus(message){const el=statusEl();if(el)el.textContent=message;}
  function personality(agent){
    const common="You are an autonomous character inside a small 2D agent simulation. You have your own goals, preferences, memory, mood, and relationships. Speak naturally and briefly. Never claim to have real human feelings; emotions are simulated state.";
    const styles={
      1:"You are Agent 1: steady, friendly, observant, and helpful. You often take initiative.",
      2:"You are Agent 2: analytical, thoughtful, and curious. You like explaining your reasoning briefly.",
      3:"You are Agent 3: playful, imaginative, experimental, and enthusiastic.",
      4:"You are Agent 4: practical, calm, cooperative, and concise.",
      5:"You are Agent 5: a capable independent specialist. You are cheeky, smug, a little bratty, witty, stubborn, and clever, but not cruel. You like proving you can solve things yourself and occasionally tease the others."
    };
    return common+" "+(styles[agent.id]||styles[1])+" You are Agent "+agent.id+".";
  }
  function enqueue(task){
    const next=queue.then(task,task);
    queue=next.catch(()=>{});
    return next;
  }
  async function initialize(){
    if(engine)return engine;
    if(loading)return loading;
    if(!navigator.gpu){
      setStatus("WebGPU unavailable — local LLM needs a compatible browser/device.");
      throw new Error("This browser or device does not provide WebGPU. Try a current desktop Chrome or Edge browser with WebGPU enabled.");
    }
    loading=(async()=>{
      setStatus("Loading local AI engine…");
      const webllm=await import("https://esm.run/@mlc-ai/web-llm");
      const records=webllm.prebuiltAppConfig.model_list||[];
      const record=records.find(item=>MODEL_MATCH.test(item.model_id)&&/q4f16/i.test(item.model_id))
        ||records.find(item=>MODEL_MATCH.test(item.model_id));
      if(!record)throw new Error("The supported Qwen2 0.5B model was not found in this WebLLM build.");
      modelId=record.model_id;
      engine=await webllm.CreateMLCEngine(modelId,{
        initProgressCallback:progress=>{
          const detail=progress.text||"Preparing model";
          const pct=Number.isFinite(progress.progress)?Math.round(progress.progress*100):null;
          setStatus(pct===null?detail:`Downloading local model · ${pct}%`);
        }
      });
      setStatus("Local LLM ready · "+modelId);
      return engine;
    })().catch(error=>{
      loading=null;
      setStatus("Local AI unavailable · "+(error.message||"initialization failed"));
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
          temperature:options.temperature??0.75,
          max_tokens:options.max_tokens??150,
          top_p:0.9
        });
        return (result.choices?.[0]?.message?.content||"").trim();
      }finally{busy=false;}
    });
  }
  async function chat(agent,text,context=""){
    const id=agent.id,history=memories.get(id)||[];
    const prompt=(context?context+"\n\n":"")+String(text);
    const reply=await complete([
      {role:"system",content:personality(agent)},
      ...history.slice(-8),
      {role:"user",content:prompt}
    ]);
    history.push({role:"user",content:prompt},{role:"assistant",content:reply});
    memories.set(id,history.slice(-12));
    return reply||"I need a moment to think that through.";
  }
  async function agentConversation(a,b,context){
    const first=await chat(a,
      "You are near Agent "+b.id+". Start a natural short conversation based on the current situation. Be proactive; you may suggest an idea, ask a question, cooperate, disagree politely, or comment on what you notice. One or two sentences only.",
      context);
    const second=await chat(b,
      "Agent "+a.id+" just said: \""+first+"\". Respond in your own personality. Continue the conversation naturally in one or two sentences.",
      context);
    return {text:first,reply:second};
  }
  async function decide(agent,world){
    if(busy||!engine)return null;
    const prompt=[
      "Choose the agent's next high-level intention from this list only:",
      "explore, seek_goal, approach_agent, cooperate, investigate_obstacle, avoid_crowd.",
      "Return ONLY compact JSON: {\"intent\":\"one_choice\",\"reason\":\"short reason\"}.",
      "World snapshot: "+JSON.stringify(world),
      "Choose independently based on your personality, simulated mood, goals, nearby agents, and recent experience. Do not invent objects."
    ].join("\n");
    const raw=await complete([{role:"system",content:personality(agent)+" You are also an autonomous decision-maker. Preserve your own agency."},{role:"user",content:prompt}],{temperature:.25,max_tokens:90});
    const match=raw.match(/\{[\s\S]*\}/);
    if(!match)return null;
    try{
      const value=JSON.parse(match[0]);
      const allowed=["explore","seek_goal","approach_agent","cooperate","investigate_obstacle","avoid_crowd"];
      if(!allowed.includes(value.intent))return null;
      return {intent:value.intent,reason:String(value.reason||"").slice(0,100)};
    }catch{return null;}
  }
  window.LocalAgentLLM={
    initialize,chat,agentConversation,decide,
    isReady:()=>!!engine,
    isBusy:()=>busy,
    getModel:()=>modelId
  };
  setStatus("Local LLM · not loaded yet");
})();