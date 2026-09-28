/* Nền hạt bụi trôi — trang trí, dùng chung cho mọi trang.
   Không dính gì tới đồ thị: chỉ cần trong trang có <canvas id="field">. */
(function(){
  "use strict";
  const cv = document.getElementById("field"), ctx = cv.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w = 0, h = 0, dpr = 1, parts = [], raf = 0;

  function seed(){
    const n = Math.round(Math.min(150, (w*h)/15000));
    parts = [];
    for(let i = 0; i < n; i++){
      parts.push({x:Math.random()*w, y:Math.random()*h, z:0.25 + Math.random()*0.75,
                  vx:(Math.random()-0.5)*0.08, vy:-0.02 - Math.random()*0.08,
                  ph:Math.random()*Math.PI*2});
    }
  }
  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    if(reduce) paint(0);
  }
  function paint(t){
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#EDEBE6";
    for(const p of parts){
      const tw = 0.55 + 0.45*Math.sin(t*0.0006 + p.ph);
      ctx.globalAlpha = 0.04 + p.z*0.16*tw;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.z*1.2, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function step(t){
    for(const p of parts){
      p.x += p.vx*p.z; p.y += p.vy*p.z;
      if(p.y < -4){ p.y = h + 4; p.x = Math.random()*w; }
      if(p.x < -4) p.x = w + 4;
      if(p.x > w + 4) p.x = -4;
    }
    paint(t);
    raf = requestAnimationFrame(step);
  }
  window.addEventListener("resize", resize);
  resize();
  if(!reduce) raf = requestAnimationFrame(step);
  document.addEventListener("visibilitychange", ()=>{
    if(reduce) return;
    if(document.hidden){ cancelAnimationFrame(raf); raf = 0; }
    else if(!raf) raf = requestAnimationFrame(step);
  });
})();
