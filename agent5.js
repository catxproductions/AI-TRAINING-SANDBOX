/* Agent 5: a distinct browser-runtime personality. Loaded before app.js. */
(function(){
  "use strict";
  const STORAGE_KEY="ai-training-sandbox.agent-profiles.v1";
  const PROFILE_DEFAULTS={
    curiosity:{min:.2,max:.9,default:.72},
    cooperation:{min:.2,max:.9,default:.58},
    independence:{min:.2,max:.9,default:.9},
    playfulness:{min:.2,max:.9,default:.88},
    stubbornness:{min:.2,max:.9,default:.68}
  };
  const activeAgents=new Map();
  const profiles=new Map();
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));

  function normalizeProfile(input={},agentId=5){
    const base={};
    for(const [key,meta] of Object.entries(PROFILE_DEFAULTS)){
      const fallback=agentId===5?meta.default:meta.default*.82;
      const candidate=Number.isFinite(input[key])?Number(input[key]):fallback;
      base[key]=clamp(candidate,meta.min,meta.max);
    }
    return base;
  }
  function profileFor(id){
    const numericId=Number(id)||5;
    if(!profiles.has(numericId))profiles.set(numericId,normalizeProfile({},numericId));
    return profiles.get(numericId);
  }
  function readSaved(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return;
      const saved=JSON.parse(raw);
      if(!saved||typeof saved!=="object")return;
      for(let id=1;id<=5;id++){
        const candidate=saved[id];
        if(candidate&&typeof candidate==="object")profiles.set(id,normalizeProfile(candidate,id));
      }
    }catch{/* Storage may be unavailable; the simulation still works. */}
  }
  function saveProfiles(){
    try{
      const saved={};
      for(const [id,profile] of profiles)saved[id]=profile;
      localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));
    }catch{/* Ignore unavailable or full storage. */}
  }
  function syncAgent(agent){
    if(!agent||!agent.personality)return;
    const profile=profileFor(agent.id);
    for(const key of Object.keys(PROFILE_DEFAULTS)){
      if(typeof agent.personality[key]==="number")agent.personality[key]=profile[key];
    }
    if(agent.emotion&&Number.isFinite(profile.curiosity))agent.emotion.curiosity=clamp(profile.curiosity,.2,.9);
  }
  function applyMutations(agentId,update){
    const id=Number(agentId)||5;
    const next=normalizeProfile({...profileFor(id),...update},id);
    profiles.set(id,next);
    const active=activeAgents.get(id);
    if(active)syncAgent(active);
    saveProfiles();
    return {...next};
  }
  readSaved();

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
    if(agent.state==="frustrated"){
      agent.emotion.frustration=clamp(agent.emotion.frustration+.0008);
      agent.emotion.curiosity=clamp(agent.emotion.curiosity+.0004);
    }else{
      agent.emotion.frustration=clamp(agent.emotion.frustration-.0012);
      agent.emotion.happiness=clamp(agent.emotion.happiness+.00025);
    }
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
  window.AgentSelfTuning={
    normalize(input,id){return normalizeProfile(input||{},Number(id)||5);},
    getProfile(id){return {...profileFor(id)};},
    apply(id,input){return applyMutations(Number(id)||5,input||{});},
    reset(id){
      const numericId=Number(id);
      if(Number.isInteger(numericId)&&numericId>=1&&numericId<=5){
        profiles.set(numericId,normalizeProfile({},numericId));
        const active=activeAgents.get(numericId);
        if(active)syncAgent(active);
      }else{
        for(let i=1;i<=5;i++){
          profiles.set(i,normalizeProfile({},i));
          const active=activeAgents.get(i);
          if(active)syncAgent(active);
        }
      }
      saveProfiles();
      return true;
    }
  };
  window.AgentFiveBehavior={initialize,update,scoreDetour,steering};
})();

// The steering layer avoids obstacles, but avoidance alone is not a physical
// collision: fast-moving agents can still cross an obstacle between frames.
// Resolve overlap against the actual rendered obstacle rectangles each frame.
(function(){
  "use strict";
  const collisionTimers=new WeakMap();

  function resolveObstacleContacts(){
    if(typeof agents==="undefined"||typeof objects==="undefined"||typeof arena==="undefined")return;
    const bounds=arena.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;

    const obstacles=objects.filter(object=>object.type==="obstacle"&&object.el).map(object=>object.el.getBoundingClientRect());
    for(const agent of agents){
      if(!agent.el)continue;
      const agentRect=agent.el.getBoundingClientRect();
      const radius=Math.max(agentRect.width,agentRect.height)/2;
      let centerX=agentRect.left+agentRect.width/2;
      let centerY=agentRect.top+agentRect.height/2;
      let collided=false;

      for(const rect of obstacles){
        const nearestX=Math.max(rect.left,Math.min(centerX,rect.right));
        const nearestY=Math.max(rect.top,Math.min(centerY,rect.bottom));
        let dx=centerX-nearestX;
        let dy=centerY-nearestY;
        let distance=Math.hypot(dx,dy);
        if(distance>=radius)continue;

        let nx,ny,overlap;
        if(distance>0){
          nx=dx/distance;
          ny=dy/distance;
          overlap=radius-distance;
        }else{
          // The orb's center is inside the obstacle; eject it through the
          // nearest face with enough room for the entire orb to clear it.
          const faces=[
            {gap:centerX-rect.left,nx:-1,ny:0},
            {gap:rect.right-centerX,nx:1,ny:0},
            {gap:centerY-rect.top,nx:0,ny:-1},
            {gap:rect.bottom-centerY,nx:0,ny:1},
          ].sort((a,b)=>a.gap-b.gap);
          ({nx,ny}=faces[0]);
          overlap=radius+faces[0].gap;
        }

        centerX+=nx*(overlap+.5);
        centerY+=ny*(overlap+.5);
        const velocityAlongNormal=(agent.vx||0)*nx+(agent.vy||0)*ny;
        if(velocityAlongNormal<0){
          const restitution=.45;
          agent.vx-= (1+restitution)*velocityAlongNormal*nx;
          agent.vy-= (1+restitution)*velocityAlongNormal*ny;
        }
        collided=true;
      }

      if(!collided)continue;
      centerX=Math.max(bounds.left+radius,Math.min(bounds.right-radius,centerX));
      centerY=Math.max(bounds.top+radius,Math.min(bounds.bottom-radius,centerY));
      agent.x=(centerX-bounds.left)/bounds.width;
      agent.y=(centerY-bounds.top)/bounds.height;
      agent.el.style.left=`${agent.x*100}%`;
      agent.el.style.top=`${agent.y*100}%`;
      agent.el.classList.add("is-colliding");
      const existing=collisionTimers.get(agent.el);
      if(!existing){
        collisionTimers.set(agent.el,setTimeout(()=>{
          agent.el.classList.remove("is-colliding");
          collisionTimers.delete(agent.el);
        },180));
      }
    }
    requestAnimationFrame(resolveObstacleContacts);
  }

  // All deferred scripts execute before the first animation-frame callback,
  // so app.js has initialized the shared simulation state by this point.
  requestAnimationFrame(resolveObstacleContacts);
})();
