/* Agent 5: a distinct browser-runtime personality. Loaded before app.js. */
(function(){
  "use strict";
  const STORAGE_KEY="ai-training-sandbox.agent-profiles.v1";
  const PROFILE_DEFAULTS={curiosity:{min:.2,max:.9,default:.72},cooperation:{min:.2,max:.9,default:.58},independence:{min:.2,max:.9,default:.9},playfulness:{min:.2,max:.9,default:.88},stubbornness:{min:.2,max:.9,default:.68}};
  const activeAgents=new Map(),profiles=new Map();
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
  function normalizeProfile(input={},agentId=5){const base={};for(const [key,meta] of Object.entries(PROFILE_DEFAULTS)){const fallback=agentId===5?meta.default:meta.default*.82,candidate=Number.isFinite(input[key])?Number(input[key]):fallback;base[key]=clamp(candidate,meta.min,meta.max);}return base;}
  function profileFor(id){const numericId=Number(id)||5;if(!profiles.has(numericId))profiles.set(numericId,normalizeProfile({},numericId));return profiles.get(numericId);}
  function readSaved(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;const saved=JSON.parse(raw);if(!saved||typeof saved!=="object")return;for(let id=1;id<=5;id++){const candidate=saved[id];if(candidate&&typeof candidate==="object")profiles.set(id,normalizeProfile(candidate,id));}}catch{/* Storage may be unavailable; the simulation still works. */}}
  function saveProfiles(){try{const saved={};for(const [id,profile] of profiles)saved[id]=profile;localStorage.setItem(STORAGE_KEY,JSON.stringify(saved));}catch{/* Ignore unavailable or full storage. */}}
  function syncAgent(agent){if(!agent||!agent.personality)return;const profile=profileFor(agent.id);for(const key of Object.keys(PROFILE_DEFAULTS)){if(typeof agent.personality[key]==="number")agent.personality[key]=profile[key];}if(agent.emotion&&Number.isFinite(profile.curiosity))agent.emotion.curiosity=clamp(profile.curiosity,.2,.9);}
  function applyMutations(agentId,update){const id=Number(agentId)||5,next=normalizeProfile({...profileFor(id),...update},id);profiles.set(id,next);const active=activeAgents.get(id);if(active)syncAgent(active);saveProfiles();return {...next};}
  readSaved();
  function initialize(agent){agent.personality={name:"Agent 5",archetype:"mischievous specialist",confidence:.82,independence:.9,curiosity:.72,cooperation:.58,playfulness:.88,stubbornness:.68};agent.emotion.happiness=.58;agent.emotion.curiosity=.72;agent.emotion.label="curious";agent.relationships={};agent.mischiefPhase=0;agent.lastQuipAt=0;agent.el.title="Agent 5 — independent, clever, and a little cheeky";activeAgents.set(agent.id,agent);syncAgent(agent);}
  function update(agent,context){const p=agent.personality;if(!p)return "standard";if(agent.state==="frustrated"){agent.emotion.frustration=clamp(agent.emotion.frustration+.0008);agent.emotion.curiosity=clamp(agent.emotion.curiosity+.0004);}else{agent.emotion.frustration=clamp(agent.emotion.frustration-.0012);agent.emotion.happiness=clamp(agent.emotion.happiness+.00025);}if(context.now-agent.lastEmotionAt>1200){agent.lastEmotionAt=context.now;const hasGoal=context.objects.some(o=>o.type==="goal"&&!o.done);if(hasGoal)agent.emotion.curiosity=clamp(agent.emotion.curiosity+.025);if(agent.nearby>0)agent.emotion.frustration=clamp(agent.emotion.frustration+.018);else agent.emotion.frustration=clamp(agent.emotion.frustration-.025);const moods=[["frustrated",agent.emotion.frustration],["curious",agent.emotion.curiosity],["happy",agent.emotion.happiness],["sad",agent.emotion.sadness]];moods.sort((a,b)=>b[1]-a[1]);agent.emotion.label=moods[0][1]>.58?moods[0][0]:"content";agent.el.dataset.emotion=agent.emotion.label;}agent.mischiefPhase+=context.dt*(.4+p.playfulness*.2);return agent.emotion.label;}
  function scoreDetour(point,context){const clearance=context.obstacles.reduce((best,o)=>Math.min(best,Math.hypot(o.x-point.x,o.y-point.y)),Infinity),distance=Math.hypot(context.goal.x-point.x,context.goal.y-point.y),p=context.agent.personality,novelty=Math.sin(point.x*.017+point.y*.013+context.agent.phase)*p.curiosity*5;return clearance*1.25-distance*.22+novelty;}
  function steering(agent,context){const nearest=context.agents.filter(other=>other!==agent).map(other=>({other,d:Math.hypot((other.x-agent.x)*context.r.width,(other.y-agent.y)*context.r.height)})).filter(x=>x.d<150).sort((a,b)=>a.d-b.d)[0];if(!nearest)return{x:0,y:0};const profile=profileFor(agent.id),bond=agent.relationships[nearest.other.id]||0,d=Math.max(1,nearest.d),strength=(150-d)/150*(bond>.06?.13:.035)*(.75+profile.cooperation*.5);return{x:(nearest.other.x-agent.x)/d*strength,y:(nearest.other.y-agent.y)/d*strength};}
  window.AgentSelfTuning={normalize(input,id){return normalizeProfile(input||{},Number(id)||5);},getProfile(id){return {...profileFor(id)};},apply(id,input){return applyMutations(Number(id)||5,input||{});},reset(id){const numericId=Number(id);if(Number.isInteger(numericId)&&numericId>=1&&numericId<=5){profiles.set(numericId,normalizeProfile({},numericId));const active=activeAgents.get(numericId);if(active)syncAgent(active);}else{for(let i=1;i<=5;i++){profiles.set(i,normalizeProfile({},i));const active=activeAgents.get(i);if(active)syncAgent(active);}}saveProfiles();return true;}};
  window.AgentFiveBehavior={initialize,update,scoreDetour,steering};
})();

// Resolve overlap against the actual rendered obstacle rectangles each frame.
(function(){
  "use strict";
  const collisionTimers=new WeakMap();
  function resolveObstacleContacts(){
    if(typeof agents==="undefined"||typeof objects==="undefined"||typeof arena==="undefined")return;
    const bounds=arena.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
    const obstacles=objects.filter(object=>object.type==="obstacle"&&object.el).map(object=>object.el.getBoundingClientRect());
    for(const agent of agents){
      if(!agent.el)continue;
      const rect=agent.el.getBoundingClientRect(),radius=Math.max(rect.width,rect.height)/2;
      let centerX=rect.left+rect.width/2,centerY=rect.top+rect.height/2,collided=false;
      for(const obstacle of obstacles){
        const nearestX=Math.max(obstacle.left,Math.min(centerX,obstacle.right)),nearestY=Math.max(obstacle.top,Math.min(centerY,obstacle.bottom));
        const dx=centerX-nearestX,dy=centerY-nearestY,distance=Math.hypot(dx,dy);if(distance>=radius)continue;
        let nx,ny,overlap;
        if(distance>0){nx=dx/distance;ny=dy/distance;overlap=radius-distance;}
        else{const faces=[{gap:centerX-obstacle.left,nx:-1,ny:0},{gap:obstacle.right-centerX,nx:1,ny:0},{gap:centerY-obstacle.top,nx:0,ny:-1},{gap:obstacle.bottom-centerY,nx:0,ny:1}].sort((a,b)=>a.gap-b.gap);({nx,ny}=faces[0]);overlap=radius+faces[0].gap;}
        centerX+=nx*(overlap+.5);centerY+=ny*(overlap+.5);
        const along=(agent.vx||0)*nx+(agent.vy||0)*ny;if(along<0){agent.vx-=(1+.45)*along*nx;agent.vy-=(1+.45)*along*ny;}collided=true;
      }
      if(!collided)continue;
      centerX=Math.max(bounds.left+radius,Math.min(bounds.right-radius,centerX));centerY=Math.max(bounds.top+radius,Math.min(bounds.bottom-radius,centerY));
      agent.x=(centerX-bounds.left)/bounds.width;agent.y=(centerY-bounds.top)/bounds.height;agent.el.style.left=`${agent.x*100}%`;agent.el.style.top=`${agent.y*100}%`;
      agent.el.classList.add("is-colliding");if(!collisionTimers.has(agent.el))collisionTimers.set(agent.el,setTimeout(()=>{agent.el.classList.remove("is-colliding");collisionTimers.delete(agent.el);},180));
    }
    requestAnimationFrame(resolveObstacleContacts);
  }
  requestAnimationFrame(resolveObstacleContacts);
})();

// Password-gated prompt inspector for local debugging. This exposes only the
// application request inputs—not private model reasoning or generated tokens.
(function(){
  "use strict";
  const ACCESS_CODE="198387-5"; // Convenience gate only; source is public in a browser app.
  const entries=[];
  let enabled=false;
  function addEntry(title,data){if(!enabled)return;entries.unshift({title,time:new Date().toLocaleTimeString(),data});entries.length=Math.min(entries.length,30);render();}
  function render(){const list=document.querySelector("#prompt-inspector-list");if(!list)return;list.replaceChildren();for(const entry of entries){const item=document.createElement("li"),title=document.createElement("strong"),time=document.createElement("time"),pre=document.createElement("pre");title.textContent=entry.title;time.textContent=entry.time;pre.textContent=entry.data;item.append(title,time,pre);list.append(item);}}
  function openInspector(){
    if(document.getElementById("prompt-inspector"))return;
    const style=document.createElement("style");style.textContent="#prompt-inspector{position:fixed;z-index:10000;right:16px;bottom:16px;width:min(620px,calc(100vw - 32px));max-height:70vh;overflow:auto;padding:16px;background:#172d2a;color:#f3f1e9;border:1px solid #78b9a8;border-radius:10px;box-shadow:0 12px 40px #0008;font:13px/1.45 system-ui}#prompt-inspector header{display:flex;justify-content:space-between;align-items:center;gap:12px}#prompt-inspector h2{font-size:16px;margin:0}#prompt-inspector button{cursor:pointer}#prompt-inspector p{color:#d1ddd5}#prompt-inspector ol{padding:0;list-style:none}#prompt-inspector li{border-top:1px solid #ffffff30;padding:10px 0}#prompt-inspector time{float:right;color:#b9cbc2;font-size:11px}#prompt-inspector pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;background:#0d1d1b;padding:10px;border-radius:5px;color:#e3eadf}";document.head.append(style);
    const panel=document.createElement("section");panel.id="prompt-inspector";panel.setAttribute("role","region");panel.setAttribute("aria-label","Developer prompt inspector");
    const header=document.createElement("header"),heading=document.createElement("h2"),close=document.createElement("button"),note=document.createElement("p"),list=document.createElement("ol");list.id="prompt-inspector-list";heading.textContent="Developer prompt inspector";close.type="button";close.textContent="Close";close.addEventListener("click",()=>panel.remove());note.textContent="Captured app request inputs only. This does not reveal private model reasoning. Requests may include chat text and world state.";header.append(heading,close);panel.append(header,note,list);document.body.append(panel);render();
  }
  function install(){
    const api=window.LocalAgentLLM;
    if(!api||window.__promptInspectorInstalled)return false;
    window.__promptInspectorInstalled=true;
    for(const method of ["chat","decide"]){if(typeof api[method]!=="function")continue;const original=api[method];api[method]=function(...args){const agent=args[0],input=args[1],data=method==="chat"?`Context and user input:\n${String(args[2]||"")}\n\n${String(input||"")}`:`Decision request world snapshot:\n${JSON.stringify(input,null,2)}\n\nAllowed intent selection prompt: choose explore, seek_goal, approach_agent, cooperate, investigate_obstacle, or avoid_crowd.`;addEntry(`Agent ${agent?.id??"?"} · ${method}`,data);return original.apply(this,args);};}
    return true;
  }
  function activate(){
    if(enabled){openInspector();return;}
    const supplied=window.prompt("Developer mode password");
    if(supplied!==ACCESS_CODE){if(supplied!==null)window.alert("Incorrect password.");return;}
    enabled=true;install();openInspector();
  }
  function hotkey(event){if(event.ctrlKey&&event.shiftKey&&event.key.toLowerCase()==="d"){event.preventDefault();activate();}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>document.addEventListener("keydown",hotkey));else document.addEventListener("keydown",hotkey);
})();
