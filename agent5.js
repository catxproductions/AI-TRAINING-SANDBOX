/* Agent 5: a distinct browser-runtime personality. Loaded before app.js. */
(function(){
  "use strict";
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
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
    const bond=agent.relationships[nearest.other.id]||0;
    const d=Math.max(1,nearest.d),strength=(150-d)/150*(bond>.06?.13:.035);
    return{x:(nearest.other.x-agent.x)/d*strength,y:(nearest.other.y-agent.y)/d*strength};
  }
  window.AgentFiveBehavior={initialize,update,scoreDetour,steering};
})();