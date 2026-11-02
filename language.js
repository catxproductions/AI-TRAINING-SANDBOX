/* Rule-based language and agent-to-agent conversation helpers. */
(function () {
  "use strict";
  const pick = list => list[Math.floor(Math.random() * list.length)];
  async function respond(message, agent) {
    const text = String(message || "").trim();
    const definitionMatch = text.match(/^(?:define|meaning of|look up|dictionary)\s+([a-z'-]+)[?.!]*$/i);
    if (definitionMatch) {
      const result = await window.EnglishDictionary.lookup(definitionMatch[1]);
      if (!result) return "I couldn't find that word. Try a simpler spelling or another word.";
      const synonyms = result.synonyms && result.synonyms.length ? " Similar words: " + result.synonyms.join(", ") + "." : "";
      return result.word + " (" + result.part + "): " + result.definition + synonyms;
    }
    const wordMatch = text.match(/^what does\s+([a-z'-]+)\s+mean[?.!]*$/i);
    if (wordMatch) {
      const result = await window.EnglishDictionary.lookup(wordMatch[1]);
      return result ? result.word + " means: " + result.definition : "I couldn't find that word in the dictionary.";
    }
    const base = window.SandboxBaseAnswer(text);
    if (agent && agent.id === 5) return pick(["Obviously, I have this handled. ","Try to keep up. ","Fine, I’ll help. "]) + base;
    if (agent && agent.id === 2) return pick(["Let's reason it out. ","Good question. "]) + base;
    if (agent && agent.id === 3) return pick(["Interesting! ","Let's explore that. "]) + base;
    if (agent && agent.id === 4) return pick(["I'll keep it practical. ","Here's my take. "]) + base;
    return base;
  }
  function agentChat(a, b) {
    const lines = [
      ["Hey Agent " + b.id + ", what are you working on?","I'm exploring the world. Any ideas?"],
      ["That goal looks interesting.","Agreed. Let's see if we can reach it."],
      ["I found an obstacle over there.","Thanks for the heads-up. I'll try another route."],
      ["Want to work together?","Sure. We can both learn from this sandbox."],
      ["Your route is a little strange.","It's called creativity. Look it up."]
    ];
    const pair = pick(lines);
    return {from: a.id, to: b.id, text: pair[0], reply: pair[1]};
  }
  window.SandboxLanguage = {respond, agentChat};
})();