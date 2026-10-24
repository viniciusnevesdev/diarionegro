(() => {
  "use strict";
  const SEL=".glass-card,.glass,.note-card,.timeline-card,.habit-card,.dn-glass-action,.dn-glass-soft,.dn-glass-force-glass,.dn-copilot-idle,.dn-next-action";
  const fx=e=>[...e.children].find(x=>x.classList?.contains("dn-glass-fx"));
  function one(e){
    if(!(e instanceof Element))return;

    if(e.classList.contains("habit-card")){
      const light =
        e.classList.contains("habit-add") ||
        e.classList.contains("habit-placeholder");

      e.classList.toggle("dn-glass-soft", !light);
      e.classList.toggle("dn-glass-force-glass", light);
    }
    e.classList.add("dn-glass-surface");
    e.dataset.dnGlass=e.classList.contains("dn-glass-soft")?"soft":"glass";
    if(getComputedStyle(e).position==="static")e.style.position="relative";
    if(!fx(e)){
      const n=document.createElement("span");
      n.className="dn-glass-fx";n.setAttribute("aria-hidden","true");e.appendChild(n);
    }
  }
  function tagGlassActions(r=document){
    const buttons=[];
    if(r instanceof HTMLButtonElement) buttons.push(r);
    r.querySelectorAll?.("button").forEach(b=>buttons.push(b));

    buttons.forEach(b=>{
      const text=(b.textContent||"")
        .replace(/\s+/g," ")
        .trim()
        .toLowerCase();

      if(text==="interpretar" || text==="interpretar com ia"){
        b.classList.add("dn-glass-action");
      }
    });
  }

  function hydrate(r=document){
    tagGlassActions(r);
    if(r instanceof Element&&r.matches(SEL))one(r);
    r.querySelectorAll?.(SEL).forEach(one);
  }
  function setVariant(t,v){
    const e=typeof t==="string"?document.querySelector(t):t;
    if(!e)return false;
    e.classList.toggle("dn-glass-soft",v==="soft");
    e.classList.toggle("dn-glass-force-glass",v!=="soft");
    one(e);return true;
  }
  hydrate();
  new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{
    if(n instanceof Element)hydrate(n);
  }))).observe(document.documentElement,{childList:true,subtree:true});
  window.DNGlass={hydrate,setVariant};
})();