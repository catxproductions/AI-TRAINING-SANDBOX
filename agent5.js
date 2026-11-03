/* Agent 5: a distinct browser-runtime personality. Loaded before app.js. */
(function(){
  "use strict";
  const STORAGE_KEY="ai-training-sandbox.agent-profiles.v1";
  const PROFILE_KEYS=["curiosity","cooperation","independence"];
  const activeAgents=new Map();
  const profiles=new Map();
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
  const defaults=id=>({
    curiosity:id===5?.72:.55,
    cooperation:id===5?.58:.55,
    independence:id===5?.9:.55
  });
  function readSaved(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
      for(let id=1;id<=5;id++){
        const candidate=saved[id];
        if(!candidate||typeof candidate!=="object")continue;
        const profile=defaults(id);
        for(const key of PROFILE_KEYS){
          if(Number.isFinite(candidate[key]))profile[key]=clamp(candidate[key],.2,.9);
        }
        profiles.set(id,profile);
      }
    }catch{/* Storage may be disabled; agents still tune for this page session. */}
  }
  function profileFor(id){
    if(!profiles.has(id))profiles.set(id,defaults(id));
    return profiles.get(id);
  }
  function saveProfiles(){
    try{
      const saved={};
      for(const [id,profile] of profiles)saved[id]=profile;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));
    }catch{/* A full or unavailable storage area must not stop the simulation. */}
  }
  function syncAgent(agent){
    if(agent.id===5&&agent.personality){
      const profile=profileFor(agent.id);
      for(const key of PROFILE_KEYS)agent.personality[key]=profile[key];
    }
  }
  readSaved();
  const memory=new Map();
  function initialize(agent){
    agent.personality={name:"Agent 5",archetype:"mischievous specialist",confidence:.82,independence:.9,curiosity:.72,cooperation:.58,playfulness:.88,stubbornness:.68};
    agent.emotion.happiness=.58;
    agent.emotion.curiosity=.72;
    agent.emotion.label="curious";
    agent.relationships={};
    agent.mischiefPhase=0;
    agent.lastQuipAt=0;
    agent.el.title="Agent 5 — independent, clever, and a little cheeky";
    activeAgents.set(agent.id,agent);
    syncAgent(agent);
  }
  function update(agent,context){
    const p=agent.personality;
    if(!p)return "standard";
    if(agent.state==="frustrated"){agent.emotion.frustration=clamp(agent.emotion.frustration+.0008);agent.emotion.curiosity=clamp(agent.emotion.curiosity+.0004)}
    else{agent.emotion.frustration=clamp(agent.emotion.frustration-.0012);agent.emotion.happiness=clamp(agent.emotion.happiness+.00025)}
    if(context.now-agent.lastEmotionAt>1200){
      agent.lastEmotionAt=context.now;
      const hasGoal=context.objects.some(o=>o.type==="goal"&&!o.done);
      if(hasGoal)agent.emotion.curiosity=clamp(agent.emotion.curiosity+.025);
      if(agent.nearby>0)agent.emotion.frustration=clamp(agent.emotion.frustration+.018);
      else agent.emotion.frustration=clamp(agent.emotion.frustration-.025);
      const moods=[["frustrated",agent.emotion.frustration],["curious",agent.emotion.curiosity],["happy",agent.emotion.happiness],["sad",agent.emotion.sadness]];
      moods.sort((a,b)=>b[1]-a[1]);
      agent.emotion.label=moods[0][1]>.58?moods[0][0]:"content";
      agent.el.dataset.emotion=agent.emotion.label;
    }
    agent.mischiefPhase+=context.dt*(.4+p.playfulness*.2);
    return agent.emotion.label;
  }
  function scoreDetour(point,context){
    const clearance=context.obstacles.reduce((best,o)=>Math.min(best,Math.hypot(o.x-point.x,o.y-point.y)),Infinity);
    const distance=Math.hypot(context.goal.x-point.x,context.goal.y-point.y);
    const p=context.agent.personality;
    /* Prioritize safe clearance, then route efficiency; Agent 5 is less likely to
       oscillate between equally poor detours. */
    const novelty=Math.sin(point.x*.017+point.y*.013+context.agent.phase)*p.curiosity*5;
    return clearance*1.25-distance*.22+novelty;
  }
  function steering(agent,context){
    const nearest=context.agents.filter(other=>other!==agent).map(other=>({other,d:Math.hypot((other.x-agent.x)*context.r.width,(other.y-agent.y)*context.r.height)})).filter(x=>x.d<150).sort((a,b)=>a.d-b.d)[0];
    if(!nearest)return{x:0,y:0};
    const profile=profileFor(agent.id);
    const bond=agent.relationships[nearest.other.id]||0;
    const d=Math.max(1,nearest.d),strength=(150-d)/150*(bond>.06?.13:.035)*(.75+profile.cooperation*.5);
    return{x:(nearest.other.x-agent.x)/d*strength,y:(nearest.other.y-agent.y)/d*strength};
  }
  function adaptProfile(agent,world,result){
    if(!result)return;
    const profile=profileFor(agent.id),before=JSON.stringify(profile);
    const nearbyAgents=Array.isArray(world.nearbyAgents)?world.nearbyAgents.length:0;
    if(Number(world.nearbyObstacles)>0){
      profile.curiosity=clamp(profile.curiosity+.015,.2,.9);
      if(result.intent==="investigate_obstacle"||result.intent==="seek_goal")profile.independence=clamp(profile.independence+.005,.2,.9);
    }
    if(nearbyAgents&&["cooperate","approach_agent"].includes(result.intent))profile.cooperation=clamp(profile.cooperation+.015,.2,.9);
    if(result.intent==="avoid_crowd")profile.cooperation=clamp(profile.cooperation-.005,.2,.9);
    if(result.intent==="explore")profile.curiosity=clamp(profile.curiosity+.005,.2,.9);
    if(JSON.stringify(profile)!==before){
      activeAgents.set(agent.id,agent);
      syncAgent(agent);
      saveProfiles();
    }
  }
  function installDecisionHook(api){
    if(!api||typeof api.decide!=="function"||api.decide.__selfTuningWrapped)return;
    const original=api.decide;
    const wrapped=async function(agent,world){
      activeAgents.set(agent.id,agent);
      const profile=profileFor(agent.id);
      const enrichedWorld={...world,behaviorProfile:{...profile}};
      const result=await original(agent,enrichedWorld);
      adaptProfile(agent,world,result);
      return result;
    };
    wrapped.__selfTuningWrapped=true;
    api.decide=wrapped;
  }
  let llmApi;
  Object.defineProperty(window,"LocalAgentLLM",{
    configurable:true,
    enumerable:true,
    get(){return llmApi;},
    set(api){llmApi=api;installDecisionHook(api);}
  });
  window.AgentSelfTuning={
    getProfile(id){return {...profileFor(Number(id))};},
    reset(id){
      const numericId=Number(id);
      if(Number.isInteger(numericId)&&numericId>=1&&numericId<=5){
        profiles.set(numericId,defaults(numericId));
        const active=activeAgents.get(numericId);
        if(active)syncAgent(active);
      }else{
        profiles.clear();
        for(const active of activeAgents.values())syncAgent(active);
      }
      saveProfiles();
    }
  };
  window.AgentFiveBehavior={initialize,update,scoreDetour,steering};
})();
