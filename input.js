'use strict';

function handleClick(cx,cy){
  if(anyPanelOpen())closeAllPanels();
  const rect=canvas.getBoundingClientRect();
  const wx=(cx-rect.left-vx)/vs,wy=(cy-rect.top-vy)/vs;
  const ix=Math.round(wx)|0,iy=Math.round(wy)|0;
  if(buildMode){
    buildMode=false;updBtn();
    if(ix>=0&&ix<MW&&iy>=0&&iy<MH&&cmap[iy*MW+ix]===PLAYER){
      const pc=countries[PLAYER];
      if(pc.gold<CITY_GOLD||pc.resources.wood.stock<CITY_WOOD||pc.resources.stone.stock<CITY_STONE){
        msg(`Нужно ${CITY_GOLD}🪙 + ${CITY_WOOD}🌲 + ${CITY_STONE}🪨`);return;
      }
      if(cities.some(c=>Math.hypot(c.x-wx,c.y-wy)<CITY_MIN_D)){msg('Слишком близко');return;}
      pc.gold-=CITY_GOLD;pc.resources.wood.stock-=CITY_WOOD;pc.resources.stone.stock-=CITY_STONE;
      cities.push({id:nextId++,ownerId:PLAYER,x:wx,y:wy,pop:10,investBudget:0,investTicks:0,isCapital:false});
      updateHUD();msg('🏙 Город основан!');
    } else msg('Только на своей территории');
    return;
  }
  for(const c of cities){
    const co=countries[c.ownerId];if(!co?.alive)continue;
    const R=gearRadius(c.pop);
    if(Math.hypot(cx-rect.left-c.x*vs-vx,cy-rect.top-c.y*vs-vy)<=R*vs+14){openCityPanel(c.id);return;}
  }
  if(showRes){
    for(const d of deposits){
      const co=countries[d.ownerId];if(!co?.alive)continue;
      if(Math.hypot(cx-rect.left-d.x*vs-vx,cy-rect.top-d.y*vs-vy)<=9*vs+14){
        const r=resById(d.res);
        if(d.ownerId===PLAYER){
          msg(d.mined?`${r.icon} ${r.name}: шахта уже построена`:`${r.icon} ${r.name}: ваше месторождение, открой «Развитие» чтобы построить шахту`);
        }else{
          msg(`${r.icon} ${r.name} — месторождение страны ${co.name}`);
        }
        return;
      }
    }
  }
  if(ix>=0&&ix<MW&&iy>=0&&iy<MH){
    const ow=cmap[iy*MW+ix];
    if(ow>=0){const co=countries[ow];if(co?.alive)msg(`${co.name} — нас. ${Math.floor(totalPop(ow))} чел.`);}
    else msg('Море');
  }
}

canvas.addEventListener('mousedown',e=>{drag={on:true,sx:e.clientX,sy:e.clientY,vx0:vx,vy0:vy,moved:0,lx:e.clientX,ly:e.clientY};});
window.addEventListener('mousemove',e=>{if(!drag.on)return;drag.moved+=Math.hypot(e.clientX-drag.lx,e.clientY-drag.ly);drag.lx=e.clientX;drag.ly=e.clientY;vx=drag.vx0+(e.clientX-drag.sx);vy=drag.vy0+(e.clientY-drag.sy);clamp();});
window.addEventListener('mouseup',e=>{if(drag.on&&drag.moved<8)handleClick(e.clientX,e.clientY);drag.on=false;});
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;const wx=(mx-vx)/vs,wy=(my-vy)/vs;vs=Math.max(.4,Math.min(14,vs*(e.deltaY>0?.88:1.13)));vx=mx-wx*vs;vy=my-wy*vs;clamp();},{passive:false});
canvas.addEventListener('touchstart',e=>{e.preventDefault();for(const t of e.changedTouches)touches[t.identifier]={x:t.clientX,y:t.clientY};const pts=Object.values(touches);if(pts.length===1)drag={on:true,sx:pts[0].x,sy:pts[0].y,vx0:vx,vy0:vy,moved:0,lx:pts[0].x,ly:pts[0].y};},{passive:false});
canvas.addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches)if(touches[t.identifier])touches[t.identifier]={x:t.clientX,y:t.clientY};const pts=Object.values(touches);if(pts.length===1&&drag.on){drag.moved+=Math.hypot(pts[0].x-drag.lx,pts[0].y-drag.ly);drag.lx=pts[0].x;drag.ly=pts[0].y;vx=drag.vx0+(pts[0].x-drag.sx);vy=drag.vy0+(pts[0].y-drag.sy);clamp();}},{passive:false});
canvas.addEventListener('touchend',e=>{e.preventDefault();const last=Object.values(touches);for(const t of e.changedTouches)delete touches[t.identifier];if(!Object.keys(touches).length&&drag.on&&drag.moved<14)handleClick(last[0].x,last[0].y);if(!Object.keys(touches).length)drag.on=false;},{passive:false});
// без этого обработчика прерванный ОС жестом тач (уведомление, edge-swipe, мультитач-конфликт) навсегда "зависал" в touches{},
// счётчик активных пальцев переставал возвращаться к 1, и клики на канвасе переставали работать до перезагрузки страницы
canvas.addEventListener('touchcancel',e=>{for(const t of e.changedTouches)delete touches[t.identifier];if(!Object.keys(touches).length)drag.on=false;},{passive:false});

function updBtn(){const b=document.getElementById('btn-build');if(buildMode){b.classList.add('active');b.querySelector('.lbl').textContent='Отмена';b.querySelector('span').textContent='✕';}else{b.classList.remove('active');b.children[0].textContent='🏙';b.querySelector('.lbl').textContent='Город';}}
document.getElementById('btn-build').onclick=function(){
  const pc=countries[PLAYER];if(!pc?.alive)return;
  if(!buildMode&&(pc.gold<CITY_GOLD||pc.resources.wood.stock<CITY_WOOD||pc.resources.stone.stock<CITY_STONE)){
    msg(`Нужно ${CITY_GOLD}🪙 + ${CITY_WOOD}🌲 + ${CITY_STONE}🪨`);return;
  }
  buildMode=!buildMode;updBtn();msg(buildMode?'Кликни на свою территорию':'Отменено');
};
document.getElementById('btn-new').onclick=()=>newGame();

function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;if(offC)fitView();}
window.addEventListener('resize',resize);
window.addEventListener('orientationchange',()=>setTimeout(resize,200));