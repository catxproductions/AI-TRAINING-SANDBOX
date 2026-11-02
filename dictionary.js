/* Small offline-first English dictionary with an optional single-word lookup. */
(function () {
  "use strict";
  const words = {
    hello:["interjection","used as a greeting","hi, hey"],
    agent:["noun","a person or system that acts or makes decisions","actor, assistant"],
    curious:["adjective","eager to learn or know something","interested, inquisitive"],
    happy:["adjective","feeling pleasure or contentment","glad, cheerful"],
    frustrated:["adjective","upset because something is difficult or blocked","annoyed, discouraged"],
    goal:["noun","an aim or desired result","target, objective"],
    obstacle:["noun","something that makes progress difficult","barrier, hindrance"],
    friend:["noun","someone you know and like","companion, ally"],
    trust:["noun","belief that someone is reliable","confidence, faith"],
    cooperate:["verb","to work together toward a shared result","collaborate, assist"],
    explore:["verb","to travel through or learn about something","investigate, discover"],
    learn:["verb","to gain knowledge or skill","study, understand"],
    think:["verb","to use your mind to consider something","reason, consider"],
    talk:["verb","to communicate using words","speak, chat"],
    dictionary:["noun","a reference that explains words and their meanings","wordbook, glossary"],
    simulation:["noun","a model that imitates a process or system","model, experiment"],
    collision:["noun","an event in which moving objects bump into each other","impact, contact"],
    plan:["noun","a set of steps for reaching an aim","strategy, outline"],
    help:["verb","to make a task easier for someone","assist, support"],
    funny:["adjective","causing amusement"," amusing, humorous"],
    bratty:["adjective","cheekily difficult or mischievous","sassy, cheeky"],
    brave:["adjective","ready to face a challenge","bold, courageous"],
    calm:["adjective","peaceful and not excited","relaxed, quiet"],
    why:["adverb","for what reason","how come"],
    what:["pronoun","asks for information about something","which thing"],
    where:["adverb","asks about a place","in what place"],
    how:["adverb","asks about a method or condition","in what way"]
  };
  async function lookup(input) {
    const word = String(input || "").trim().toLowerCase().replace(/[^a-z'-]/g, "");
    if (!word) return null;
    if (words[word]) return {word, part:words[word][0], definition:words[word][1], synonyms:words[word][2].replace(/^ /,"").split(/,\s*/), source:"built-in"};
    try {
      const response = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word), {headers:{Accept:"application/json"}});
      if (!response.ok) return null;
      const data = await response.json();
      const entry = data && data[0];
      const meaning = entry && entry.meanings && entry.meanings[0];
      const definition = meaning && meaning.definitions && meaning.definitions[0];
      if (!definition || !definition.definition) return null;
      return {word, part:meaning.partOfSpeech || "word", definition:definition.definition, synonyms:(definition.synonyms || []).slice(0,5), source:"English dictionary API"};
    } catch (_) { return null; }
  }
  window.EnglishDictionary = {lookup, hasWord: word => Object.prototype.hasOwnProperty.call(words, String(word).toLowerCase()), words};
})();