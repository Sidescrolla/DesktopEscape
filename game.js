
'use strict';
const $=id=>document.getElementById(id);
const canvas=$('desktop'), ctx=canvas.getContext('2d'), menu=$('menu'), music=$('music');
const W=960,H=540,dt=1/120;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const center=p=>p.X+p.W/2;
const movable=p=>p.Kind===1||p.Kind===3;
const near=(a,b,c,d,r)=>(a-c)**2+(b-d)**2<r*r;
const names=['Browser','Minesweeper','Solitaire','Disk Cleanup','Photo Viewer','Terminal','Mail','Calendar','Chat','Screen Capture','Calculator','Music','File Explorer','Sticky Notes','Weather','Video Player','Paint','Task Manager','PDF Reader','Maps','Camera','Downloads','Text Editor','Contacts'];
const rare=['','Cloud Drive','Recycle Bin','Screen Recorder','Zip Extractor','Minesweeper'];
const themes=['Ringed Orbit','Midnight Metro','Deep Reef','Dune Sea','Aurora Pass','Storm Grid','Magma Vault','Clockwork','Cloud Kingdom','Warp Tunnel'];
const hues=[256,317,177,24,155,210,14,43,228,276];
const dyes=['#ffa14b','#69e6b3','#b18cff','#68bdff','#ff8189','#ffd953'];
const dyeNames=['Orange','Mint','Lavender','Sky Blue','Cherry','Gold'];
const hatNames=['No hat','Beanie','Top hat','Crown','Antenna'];
const dyePrice=[0,4,7,10,14,20],hatPrice=[0,6,12,18,26];
function read(key,fallback){
    try{return JSON.parse(localStorage.getItem('desktop-escape.'+key))??fallback;}catch{return fallback;}
}
function write(key,value){
    try{localStorage.setItem('desktop-escape.'+key,JSON.stringify(value));}catch{}
}
const options=read('options',{slot:1,sound:true,motion:true});
let save,screen='title',level=1,map,apps,ground,grab,cloud,popups,coins,cursors,recording;
let x,y,vx,vy,face,camera,time,grace,buffer,disco,nextWorm,recordStart;
const keys=new Set();
let pointer=null,audioReady=false,fx;
music.volume=.40;
function syncMusic(){
    if(audioReady&&options.sound&&!document.hidden) music.play().catch(()=>{});
    else music.pause();
}
function unlockAudio(){
    audioReady=true;
    syncMusic();
}
document.addEventListener('pointerdown',unlockAudio,{once:true});
document.addEventListener('keydown',unlockAudio,{once:true});
function tone(freq,duration=.1,type='sine'){
    if(!audioReady||!options.sound)return;
    try{
        fx??=new AudioContext();
        if(fx.state==='suspended')fx.resume().catch(()=>{});
        const start=fx.currentTime,osc=fx.createOscillator(),gain=fx.createGain();
        osc.type=type;osc.frequency.setValueAtTime(freq,start);
        gain.gain.setValueAtTime(.062,start);
        gain.gain.exponentialRampToValueAtTime(.001,start+duration);
        osc.connect(gain).connect(fx.destination);osc.start(start);osc.stop(start+duration);
    }catch{}
}
function loadSlot(){
    save=read('slot'+options.slot,{times:{},coins:0,dye:0,hat:0,dyes:1,hats:1});
}
function persist(){write('slot'+options.slot,save);}
function unlocked(){
    let n=1;while(n<levels.length&&save.times[n])n++;
    return n;
}
function title(){
    setup(unlocked());
    panel('title','Desktop Escape','Drag windows into place. Reach the exit before the desktop catches you.',[
        ['Continue · Level '+unlocked(),()=>start(unlocked())],['Level select',selectLevel],
        ['Cosmetics',()=>shop(save.dye,save.hat)],['Options',()=>settings(title)]]);
}
function panel(state,heading,body,buttons){
    screen=state; keys.clear();
    menu.replaceChildren();
    menu.hidden=false;$('touch').hidden=true;
    const h=document.createElement('h1'),p=document.createElement('p');
    h.textContent=heading;p.textContent=body;menu.append(h,p);
    for(const [label,action,disabled] of buttons){
        const btn=document.createElement('button');
        btn.textContent=label;btn.onclick=action;btn.disabled=!!disabled;menu.append(btn);
    }
}
function settings(back){
    panel('options','Options','Save slot '+options.slot,[
        ['Sound · '+(options.sound?'On':'Off'),()=>{options.sound=!options.sound;syncMusic();write('options',options);settings(back);}],
        ['Wallpaper motion · '+(options.motion?'On':'Off'),()=>{options.motion=!options.motion;write('options',options);settings(back);}],
        ['Switch save slot',()=>{options.slot=options.slot%3+1;write('options',options);loadSlot();title();}],
        ['Fullscreen',()=>{if(document.fullscreenElement)document.exitFullscreen();else $('game').requestFullscreen?.().catch(()=>{});}],
        ['Back',back]]);
}
function selectLevel(){
    panel('levels','Level select','Practice any of the 50 levels.',[['Play selected level',()=>start(Number(list.value))],['Back',title]]);
    const list=document.createElement('select');
    list.setAttribute('aria-label','Level');
    for(const m of levels){
        const option=document.createElement('option');option.value=m.Number;
        option.textContent=m.Number+' · '+m.Name+(save.times[m.Number]?' · '+save.times[m.Number].toFixed(2)+' s':'');
        list.append(option);
    }
    list.value=unlocked();menu.insertBefore(list,menu.querySelector('button'));
}
function shop(d,h){
    const cost=((save.dyes&(1<<d))?0:dyePrice[d])+((save.hats&(1<<h))?0:hatPrice[h]);
    panel('shop','Cosmetics',save.coins+' coins · Slot '+options.slot,[
        ['Color · '+dyeNames[d],()=>shop((d+1)%dyes.length,h)],
        ['Hat · '+hatNames[h],()=>shop(d,(h+1)%hatNames.length)],
        [cost?'Buy and equip · '+cost+' coins':'Equip',()=>{save.coins-=cost;save.dye=d;save.hat=h;save.dyes|=1<<d;save.hats|=1<<h;persist();shop(d,h);},cost>save.coins],
        ['Back',title]]);
    const badge=document.createElement('span');
    badge.textContent='● '+dyeNames[d]+' / '+hatNames[h];badge.style.color=dyes[d];
    menu.insertBefore(badge,menu.querySelector('button'));
}
function setup(n){
    level=n;map=levels[n-1];apps=map.Apps.map(p=>({...p,Collected:false}));
    ground=apps[0];x=center(ground);y=ground.Y-14;vx=vy=time=grace=buffer=disco=0;
    camera=clamp(x-W/2,0,map.Width-W);face=center(apps.at(-1))>x?1:-1;
    const edge=face>0?14:map.Width-14;
    cursors=[{x:edge,y:139},{x:edge,y:47}];
    grab=cloud=null;pointer=null;nextWorm=5.4;recordStart=-20;recording=[];
    const midpoint=center(apps.at(-3));
    popups=Array.from({length:3},(_,i)=>({Kind:4,W:62,HomeX:midpoint-119+i*69,HomeY:293+i*24,Offset:i*1.7,DownUntil:0}));
    const candidates=apps.slice(1,-1).filter(p=>!p.Trojan);
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    coins=candidates.slice(0,3+Math.min(3,Math.floor(n/12))).map(p=>({p,offset:(Math.floor(Math.random()*3)-1)*p.W*.19,got:false}));
    prepareWallpaper();
}
function play(){
    screen='game';menu.hidden=true;$('touch').hidden=false;
}
function start(n){setup(n);play();}
function pause(){
    if(screen!=='game')return;
    keys.clear();grab=null;pointer=null;
    panel('pause','Paused',map.Name,[['Resume',play],['Retry',()=>start(level)],['Options',()=>settings(()=>{screen='game';pause();})],['Main menu',title]]);
}
function finish(won,reason){
    tone(won?670:155,.28,won?'sine':'triangle');
    if(won&&level<=unlocked()){save.times[level]=Math.min(time,save.times[level]??Infinity);persist();}
    const buttons=[['Retry',()=>start(level)],['Main menu',title]];
    if(won&&level<levels.length)buttons.unshift(['Next level',()=>start(level+1)]);
    panel(won?'result':'crash',won?'Desktop escaped':'System crashed',won?map.Name+' · '+time.toFixed(2)+' s':reason,buttons);
}
function keyAt(i){
    return i>0&&i<apps.length-1&&(map.Keys===1?i===2:map.Keys>=2&&(i===1||i===apps.length-2||(map.Keys===3&&i===2)));
}
function keyCount(){return apps.filter((p,i)=>keyAt(i)&&!p.Collected).length;}
function appName(p,i){
    return i===0?'Home':i===apps.length-1?'Exit dock':p.Rare?rare[p.Rare]:p.Kind===2?'Shuttle':names[p.App];
}
function land(p){
    const name=appName(p,apps.indexOf(p));tone(230,.045);
    if(p.Kind===4){p.DownUntil=time+2;ground=null;vy=-610;grace=0;return;}
    if(p.Kind===5)return;
    if(name==='Music')disco=time+2.7;
    if(p.Trojan){if(!p.Fuse)p.Fuse=time+.72;return;}
    if(!p.Rare||p.Rare===2||p.Fuse>time)return;
    p.Fuse=time+2.2;
    if(p.Rare===1){
        cloud={Kind:5,W:94,X:x-47,Y:p.Y,source:p,start:time,DownUntil:0};ground=cloud;
    }
    if(p.Rare===3){recordStart=time;recording=[];}
    if(p.Rare===4){p.BaseW||=p.W;p.W=p.BaseW+86;p.ZipUntil=time+3.4;}
    if(p.Rare===5)p.BounceAt=time+.36;
    tone(520,.12);
}
function recycle(p){
    const bin=apps.find(b=>b!==p&&b.Rare===2&&b.DownUntil<=time&&near(center(p),p.Y,center(b),b.Y,53));
    if(!bin)return;
    p.Fuse=p.SpreadAt=0;p.Infected=false;
    const side=center(p)<center(bin)?-1:1;
    p.X=clamp(center(bin)+side*(bin.W/2+24)-p.W/2,Math.max(10,p.HomeX-130),Math.min(map.Width-p.W-10,p.HomeX+130));
    p.Y=clamp(bin.Y-25,p.HomeY-55,Math.min(455,p.HomeY+65));tone(610);
}
function world(){
    camera+=(clamp(x-W/2,0,map.Width-W)-camera)*dt*8;
    if(cloud){
        if(time-cloud.start<1.35){
            const target=cloud.source.Y-102*clamp((time-cloud.start)/.8,0,1);
            if(ground===cloud)y+=target-cloud.Y;
            cloud.Y=target;
        }else{if(ground===cloud)ground=null;cloud=null;}
    }
    if(map.Swarm)for(const p of popups){p.X=p.HomeX+69*Math.sin(time*1.13+p.Offset);p.Y=p.HomeY+40*Math.sin(time*.92+p.Offset);}
    if(map.Worm&&time>=nextWorm){
        nextWorm=time+3.9;
        const p=apps.filter(p=>movable(p)&&!p.Rare&&!p.Infected&&p.DownUntil<=time&&Math.abs(center(p)-x)<290)
            .sort((a,b)=>Math.abs(center(a)-x)-Math.abs(center(b)-x))[0];
        if(p){p.Infected=true;p.Fuse=time+1.25;p.SpreadAt=time+.62;}
    }
    for(const p of apps){
        if(p.ZipUntil&&p.ZipUntil<time&&ground!==p&&grab?.p!==p){p.W=p.BaseW;p.ZipUntil=0;}
        if(p.BounceAt&&p.BounceAt<=time){
            p.BounceAt=0;if(ground===p){ground=null;vy=-825;grace=0;tone(650);}
        }
        if(p.Infected&&p.SpreadAt&&p.SpreadAt<=time){
            p.SpreadAt=0;
            const neighbor=apps.find(q=>q!==p&&movable(q)&&!q.Rare&&q.DownUntil<=time&&!q.Infected&&Math.abs(q.Y-p.Y)<100&&Math.abs(center(q)-center(p))<(q.W+p.W)/2+75);
            if(neighbor){neighbor.Infected=true;neighbor.Fuse=time+1.65;}
        }
        if(p.Fuse&&p.Fuse<=time&&(p.Trojan||p.Infected)){
            if(grab?.p===p)grab=null;
            if(ground===p){ground=null;grace=.075;vy=30;}
            p.DownUntil=time+2.45;p.Fuse=p.SpreadAt=0;p.Infected=false;
        }
    }
    if(time-recordStart<1.55)recording.push({x,y});
    for(const c of coins){
        if(!c.got&&c.p.DownUntil<=time&&near(x,y,center(c.p)+c.offset,c.p.Y-30,28)){
            c.got=true;save.coins++;persist();tone(970);
        }
    }
}
function scanner(i){
    return {x:map.Width*(i+1)/(map.Hazards+1)+75*Math.sin(time*(1.27+level*.022)+i*2.8+level*.41),
        y:333-i*62+32*Math.sin(time*1.52+i*3+level*.21)};
}
function step(){
    time+=dt;
    if(map.Limit&&time>=map.Limit){finish(false,'Desktop shut down');return;}
    for(const p of apps)if(p.Kind===2){
        const old=p.X;
        p.X=p.HomeX+63*Math.sin(time*(1.11+level*.013)+p.Offset);
        if(ground===p)x+=p.X-old;
    }
    const dir=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    if(dir)face=dir;
    vx+=clamp(dir*315-vx,-2600*dt,2600*dt);x=clamp(x+vx*dt,13,map.Width-13);
    world();
    if(grab){
        const {p,dx,dy}=grab;
        p.X=clamp(pointer.x+camera-dx,Math.max(10,p.HomeX-130),Math.min(map.Width-p.W-10,p.HomeX+130));
        p.Y=clamp(pointer.y-dy,p.HomeY-55,Math.min(455,p.HomeY+65));
    }
    if(ground&&(x+10<=ground.X||x-10>=ground.X+ground.W))ground=null;
    grace=ground ? .10 :Math.max(0,grace-dt);
    if(buffer>0&&grace>0){vy=-661;ground=null;buffer=grace=0;tone(360,.075,'triangle');}
    buffer=Math.max(0,buffer-dt);
    if(!ground){
        const feet=y+14;vy+=1320*dt;y+=vy*dt;
        if(vy>=0){
            const surfaces=[...apps,...(map.Swarm?popups:[]),...(cloud?[cloud]:[])];
            for(const p of surfaces)if(p.DownUntil<=time&&x+10>p.X&&x-10<p.X+p.W&&feet<=p.Y+.35&&y+14>=p.Y&&(!ground||p.Y<ground.Y))ground=p;
            if(ground){y=ground.Y-14;vy=0;if(grab?.p===ground)grab=null;land(ground);}
        }
    }
    for(const [i,p] of apps.entries()){
        if(p.DownUntil<=time&&keyAt(i)&&!p.Collected&&near(x,y,center(p),p.Y-29,30)){p.Collected=true;tone(840);}
    }
    if(ground===apps.at(-1)&&keyCount()===0){finish(true,'');return;}
    if(y+14>=513){finish(false,'You hit the toolbar');return;}
    for(let i=0;i<map.Hazards;i++){
        const p=scanner(i);if(near(x,y,p.x,p.y,22)){finish(false,'A scanner caught you');return;}
    }
    for(let i=0;i<map.Pursuers;i++){
        if(time<map.Delay+i*3.2)continue;
        const p=cursors[i],offset=time-recordStart-1.55;
        const target=i===0&&offset>=0&&offset<1.55?recording[Math.floor(offset/dt)]:null;
        const dx=(target?.x??x)-p.x,dy=(target?.y??y)-p.y,d=Math.hypot(dx,dy);
        if(near(x,y,p.x,p.y,23)){finish(false,'The cursor caught you');return;}
        if(d>=1){const speed=Math.min(d,(map.Speed-i*22)*dt);p.x+=dx/d*speed;p.y+=dy/d*speed;}
    }
}
function toCanvas(e){
    const rect=canvas.getBoundingClientRect();
    return {x:(e.clientX-rect.left)*W/rect.width,y:(e.clientY-rect.top)*H/rect.height};
}
function hit(point){
    return apps.findLast(p=>p.DownUntil<=time&&point.x+camera>=p.X&&point.x+camera<=p.X+p.W&&point.y>=p.Y&&point.y<=p.Y+53);
}
canvas.addEventListener('pointerdown',e=>{
    if(screen!=='game'||e.button!==0||grab)return;
    pointer=toCanvas(e);const p=hit(pointer);
    if(p&&movable(p)&&p!==ground){
        grab={p,dx:pointer.x+camera-p.X,dy:pointer.y-p.Y,id:e.pointerId};
        canvas.setPointerCapture(e.pointerId);
    }
});
canvas.addEventListener('pointermove',e=>{
    if(screen!=='game'||(grab&&grab.id!==e.pointerId))return;
    pointer=toCanvas(e);const p=hit(pointer);
    canvas.style.cursor=grab?'grabbing':p&&movable(p)&&p!==ground?'grab':'default';
});
canvas.addEventListener('pointerup',e=>{
    if(grab?.id===e.pointerId){recycle(grab.p);grab=null;}
});
canvas.addEventListener('lostpointercapture',e=>{if(grab?.id===e.pointerId)grab=null;});
function jump(){buffer=.14;}
document.addEventListener('keydown',e=>{
    if((e.code==='Escape'&&['game','pause','crash','result'].includes(screen))||(screen==='game'&&['ArrowLeft','ArrowRight','ArrowUp','Space','KeyA','KeyD','KeyW','KeyR'].includes(e.code)))e.preventDefault();
    if(e.code==='Escape'&&!e.repeat){
        if(screen==='game')pause();else if(screen==='pause')play();else if(['crash','result'].includes(screen))title();
        return;
    }
    if(e.code==='KeyR'&&!e.repeat&&['game','crash','result'].includes(screen)){start(level);return;}
    if(screen==='game'){
        if(!e.repeat&&['Space','ArrowUp','KeyW'].includes(e.code))jump();
        keys.add(e.code);
    }
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();syncMusic();});
$('pause').onclick=pause;
for(const button of $('touch').querySelectorAll('[data-key]')){
    button.onpointerdown=e=>{
        e.preventDefault();button.setPointerCapture(e.pointerId);unlockAudio();
        if(button.dataset.key==='Space')jump();else keys.add(button.dataset.key);
    };
    button.onlostpointercapture=()=>keys.delete(button.dataset.key);
}


function rect(color,x,y,w,h){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function ellipse(color,x,y,rx,ry){
    ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
}
function line(color,points,width=1){
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();
    ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.stroke();
}
function text(color,value,x,y,size=13){
    ctx.fillStyle=color;ctx.font='600 '+size+'px ui-monospace,monospace';ctx.textBaseline='top';ctx.fillText(value,x,y);
}
const wallpaper=document.createElement('canvas');
wallpaper.width=W;wallpaper.height=H;
function prepareWallpaper(){
    const w=wallpaper.getContext('2d'),h=hues[map.Theme];
    const sky=w.createLinearGradient(0,0,750,540);
    sky.addColorStop(0,'hsl('+h+' 65% 8%)');sky.addColorStop(1,'hsl('+h+' 48% 24%)');
    w.fillStyle=sky;w.fillRect(0,0,W,H);
    for(let i=0;i<106;i++){
        w.fillStyle='hsla('+h+',90%,80%,'+(.12+i%7*.046)+')';
        w.fillRect((i*227+level*33)%W,(i*i*43+17*i)%515,1+i%3,1+i%2);
    }
    const orb=w.createRadialGradient(660,166,12,688,192,117);
    orb.addColorStop(0,'hsl('+h+' 73% 67%)');orb.addColorStop(1,'hsl('+h+' 45% 21%)');
    if([0,4,7,9].includes(map.Theme)){
        w.beginPath();w.arc(688,192,108,0,Math.PI*2);w.fillStyle=orb;w.fill();
        w.beginPath();w.ellipse(688,192,187,34,-.19,0,Math.PI*2);
        w.strokeStyle='hsla('+h+',85%,78%,.45)';w.lineWidth=7;w.stroke();
    }else{
        for(let layer=0;layer<3;layer++){
            w.fillStyle='hsla('+h+',42%,'+(28-layer*7)+'%,.75)';
            w.beginPath();w.moveTo(0,H);
            for(let i=0;i<=24;i++){
                const height=map.Theme===1?((i*94*(layer+1)+level*44)%111):Math.sin(i*.63+layer*1.7)*61+47;
                w.lineTo(i*40,410+layer*37-height);
            }
            w.lineTo(W,H);w.fill();
        }
    }
}
function drawWindow(p,i){
    const px=p.X, py=p.Y;
    if(px+p.W<camera||px>camera+W)return;
    if(p.DownUntil>time){
        ctx.strokeStyle='#6c5e96';ctx.setLineDash([4,6]);ctx.strokeRect(px,py,p.W,47);ctx.setLineDash([]);
        return;
    }
    const handle=p.Rare?'hsl('+((options.motion?time*136:290)+i*56)%360+' 95% 76%)':p.Infected?'#ff567c':movable(p)?'#d9bbff':'#92ade9';
    if(grab?.p===p){
        ctx.strokeStyle='#e7bfff99';ctx.setLineDash([5,5]);ctx.strokeRect(p.HomeX-130,p.HomeY-55,p.W+260,120);ctx.setLineDash([]);
    }
    rect('#0605149f',px+4,py+6,p.W,51);
    rect(handle,px-1,py-1,p.W+2,48);
    rect('#28213d',px,py,p.W,46);
    rect(grab?.p===p?'#6d499c':'#4a3a6b',px,py,p.W,17);
    const label=i===-2?'Cloud':i===-3?'Pop-up':appName(p,i);
    ctx.save();ctx.beginPath();ctx.rect(px+3,py,p.W-6,17);ctx.clip();
    text('#f3edff',label,px+6,py+2,11);ctx.restore();
    rect('#1f1831',px+6,py+22,p.W-12,17);
    if(i===apps.length-1)text(keyCount()?'#ffd083':'#8df2c4',keyCount()?'LOCKED':'EXIT',px+10,py+23,13);
    else if(movable(p))text('#b6a2d8',p===ground?'LOCKED':'⋮⋮',px+9,py+23,11);
    if(i>=0&&keyAt(i)&&!p.Collected){
        const k=center(p);
        ellipse('#ffbd40',k-4,py-28,6,6);ellipse('#52321c',k-4,py-28,2,2);
        rect('#ffdc70',k,py-30,11,4);rect('#ffdc70',k+6,py-30,3,7);
    }
}
function drawHero(){
    const running=ground&&Math.abs(vx)>20;
    const stride=running?Math.sin(time*23)*4:0;
    ellipse('#120c2388',x,y+13,12,3);
    line('#513044',[[x-5,y+7],[x-5-stride,y+13]],4);
    line('#513044',[[x+5,y+7],[x+5+stride,y+13]],4);
    ellipse(dyes[save.dye],x,y-1,11,12);
    ellipse('#fff3dc',x+3*face,y-4,5,4);
    ellipse('#23132a',x+5*face,y-4,2,2);
    const hat='#382952';
    if(save.hat===1)ellipse(hat,x,y-11,9,5);
    if(save.hat===2){rect(hat,x-6,y-22,12,10);rect(hat,x-10,y-13,20,3);}
    if(save.hat===3)line('#ffd760',[[x-8,y-12],[x-8,y-20],[x-3,y-16],[x,y-21],[x+4,y-16],[x+8,y-20],[x+8,y-12]],3);
    if(save.hat===4){line(hat,[[x,y-11],[x-3,y-21]],3);ellipse('#ffc576',x-3,y-22,3,3);}
}
function draw(){
    if(!options.motion||time>=disco)ctx.drawImage(wallpaper,0,0);
    else{
        ctx.drawImage(wallpaper,0,0);
        ctx.fillStyle='hsla('+Math.floor(time*240)%360+',90%,55%,.24)';ctx.fillRect(0,0,W,H);
    }
    if(options.motion){
        for(let i=0;i<28;i++)ellipse('#b69eff55',(i*173-camera*.22+time*9+W*4)%W,(i*89)%H,1.4,1.4);
    }
    ctx.save();ctx.translate(-camera,0);
    apps.forEach(drawWindow);
    if(map.Swarm)for(const p of popups)if(Number.isFinite(p.X))drawWindow(p,-3);
    if(cloud)drawWindow(cloud,-2);
    for(const c of coins)if(!c.got&&c.p.DownUntil<=time){
        const cx=center(c.p)+c.offset,cy=c.p.Y-32+(options.motion?Math.sin(time*6+cx)*3:0);
        ellipse('#9d6026',cx,cy,7,9);ellipse('#ffd768',cx,cy-1,5,7);
    }
    for(let i=0;i<map.Hazards;i++){
        const p=scanner(i);ctx.setLineDash([4,6]);line('#ff78a782',[[p.x-54,p.y],[p.x+54,p.y]]);ctx.setLineDash([]);
        ellipse('#ef4d88',p.x,p.y,18,10);ellipse('#401b43',p.x,p.y,9,6);ellipse('#ffe3ec',p.x,p.y,4,4);
    }
    for(let i=0;i<map.Pursuers;i++){
        if(time<map.Delay+i*3.2)continue;
        const p=cursors[i];ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+4,p.y+28);ctx.lineTo(p.x+11,p.y+20);ctx.lineTo(p.x+21,p.y+18);ctx.closePath();
        ctx.fillStyle='#ff69a3';ctx.fill();ctx.strokeStyle='#ffe0ec';ctx.lineWidth=2;ctx.stroke();
    }
    drawHero();ctx.restore();
    rect('#131023',0,513,W,27);rect('#7a67a8',0,513,W,1);
    text('#dcd0f6',themes[map.Theme],12,520,12);
    text('#ffdd82','Coins '+save.coins+'   Keys left '+keyCount(),704,520,12);
    if(screen==='game'){
        rect('#131023cf',12,12,Math.min(652,Math.max(270,map.Tip.length*6.4+22)),55);
        text('#f6efff','LEVEL '+level+'   '+map.Name,22,20,15);
        text('#e5d4f9',map.Tip,22,44,12);
        rect('#131023cf',796,12,152,30);
        text('#f8f0ff',map.Limit?'Shutdown '+Math.max(0,map.Limit-time).toFixed(1)+'s':time.toFixed(1)+' s',809,21,13);
    }
}
let last,lag=0;
function frame(now){
    lag+=last===undefined?0:Math.min(.09,(now-last)/1000);last=now;
    while(lag>=dt){if(screen==='game')step();lag-=dt;}
    draw();requestAnimationFrame(frame);
}
loadSlot();title();requestAnimationFrame(frame);

