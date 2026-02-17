
    (function(){
    'use strict';
    
    // ══════════════════════════════════════════
    // THEME MANAGEMENT
    // ══════════════════════════════════════════
    function initTheme(){
      const saved = localStorage.getItem('tempus-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const theme = saved || (prefersDark ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
    }
    
    function toggleTheme(){
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('tempus-theme', next);
      notify(`Theme: ${next.toUpperCase()}`);
    }
    
    // Initialize theme on load
    initTheme();
    
    // ══════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════
    const st = {
      glasses:[],
      running:false,
      paused:false,
      speed:1,
      elapsed:0,
      lastTs:null,
      nextId:1,
      nameIdx:0,
      totalFlips:0,
      goalSec:null,
      goalDone:false,
      autoPaused:false,
      log:[],
      raf:null,
      max:50,
    };
    
    const S={I:'idle',R:'running',P:'paused',E:'empty'};
    
    // ══════════════════════════════════════════
    // NAME SEQUENCE: A…Z, AA…ZZ
    // ══════════════════════════════════════════
    function genName(i){
      const L='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      return i<26 ? L[i] : L[Math.floor((i-26)/26)]+L[(i-26)%26];
    }
    
    // ══════════════════════════════════════════
    // MODEL
    // ══════════════════════════════════════════
    function makeGlass(cap,name){
      const nm = name.trim()||genName(st.nameIdx);
      st.nameIdx++;
      return {
        id:st.nextId++, name:nm, capacity:cap,
        remaining:cap, status:S.I,
        dir:'TTB', pct:100,
        flipping:false, flipCount:0,
        lastFlipAt:st.elapsed,
      };
    }
    
    // ══════════════════════════════════════════
    // TICK — single rAF loop
    // ══════════════════════════════════════════
    function tick(ts){
      st.raf = requestAnimationFrame(tick);
      if(!st.running||st.paused) return;
      if(st.lastTs===null){st.lastTs=ts;return;}
    
      const raw = Math.min(ts-st.lastTs, 200);
      const dSec = (raw/1000)*st.speed;
      st.lastTs = ts;
      st.elapsed += raw*st.speed;
    
      // check goal
      if(st.goalSec!==null&&!st.goalDone&&st.elapsed/1000>=st.goalSec){
        st.goalDone=true;
        goalReached();
        return;
      }
    
      let emptied=false;
      for(const g of st.glasses){
        if(g.status!==S.R) continue;
        g.remaining = Math.max(0, g.remaining-dSec);
        g.pct = (g.remaining/g.capacity)*100;
        if(g.remaining<=0){
          g.remaining=0; g.pct=0; g.status=S.E;
          emptied=true;
          onEmpty(g);
        }
      }
      if(emptied) autoPause();
      else updateUI();
    }
    
    function onEmpty(g){
      notify(`${g.name} is empty!`,'grn');
      chime();
    }
    
    function autoPause(){
      st.paused=true; st.autoPaused=true; st.lastTs=null;
      for(const g of st.glasses) if(g.status===S.R) g.status=S.P;
      $('apBanner').classList.add('on');
      updateUI();
      openModal();
    }
    
    function goalReached(){
      st.running=false; st.paused=false;
      for(const g of st.glasses) if(g.status===S.R) g.status=S.P;
      $('goalDone').classList.add('on');
      notify('✓ GOAL REACHED — simulation stopped','grn');
      updateUI();
    }
    
    // ══════════════════════════════════════════
    // CONTROLS
    // ══════════════════════════════════════════
    function startSim(){
      if(st.goalDone) return;
      if(st.running&&!st.paused) return;
    
      if(st.autoPaused){
        if(st.glasses.some(g=>g.status===S.E)){openModal();return;}
        st.autoPaused=false;
        $('apBanner').classList.remove('on');
      }
    
      if(st.paused){
        st.paused=false; st.lastTs=null;
        for(const g of st.glasses) if(g.status===S.P) g.status=S.R;
        updateUI(); return;
      }
    
      st.running=true; st.paused=false; st.lastTs=null;
      for(const g of st.glasses){
        if(g.status===S.I){g.status=S.R; g.lastFlipAt=st.elapsed;}
      }
      updateUI();
    }
    
    function pauseSim(){
      if(!st.running||st.paused) return;
      st.paused=true; st.autoPaused=false; st.lastTs=null;
      $('apBanner').classList.remove('on');
      for(const g of st.glasses) if(g.status===S.R) g.status=S.P;
      updateUI();
    }
    
    function resetSim(){
      st.running=false; st.paused=false;
      st.lastTs=null; st.elapsed=0;
      st.totalFlips=0; st.goalDone=false;
      st.autoPaused=false; st.log=[];
      $('apBanner').classList.remove('on');
      $('goalDone').classList.remove('on');
      closeModal();
      for(const g of st.glasses){
        g.remaining=g.capacity; g.pct=100;
        g.status=S.I; g.dir='TTB';
        g.flipping=false; g.flipCount=0;
        g.lastFlipAt=0;
      }
      renderLog();
      updateUI();
      updateGoalDisplay();
    }
    
    // ══════════════════════════════════════════
    // GOAL FUNCTIONS
    // ══════════════════════════════════════════
    function setGoal(sec){
      st.goalSec = sec;
      st.goalDone = false;
      $('goalDone').classList.remove('on');
      updateGoalDisplay();
      notify(`Goal set: ${fmtHMS(sec)}`,'grn');
    }
    
    function clearGoal(){
      st.goalSec = null;
      st.goalDone = false;
      $('goalDone').classList.remove('on');
      updateGoalDisplay();
      notify('Goal cleared');
    }
    
    function updateGoalDisplay(){
      const disp = $('goalDisplay');
      const val = $('goalVal');
      if(st.goalSec !== null){
        disp.classList.add('active');
        val.textContent = fmtHMS(st.goalSec);
      } else {
        disp.classList.remove('active');
        val.textContent = '— NO GOAL —';
      }
      if(st.goalSec !== null){
        $('goalBarWrap').classList.add('on');
        $('goalBarFill').style.width = `${Math.min(100,(st.elapsed/1000/st.goalSec)*100)}%`;
      } else {
        $('goalBarWrap').classList.remove('on');
      }
    }
    
    // ══════════════════════════════════════════
    // FLIP — preserves elapsed sand when not empty
    // ══════════════════════════════════════════
    function flipGlass(id){
      const g=st.glasses.find(x=>x.id===id);
      if(!g) return;
    
      const remBefore   = g.remaining;
      const glassElMs   = st.elapsed - g.lastFlipAt;
    
      st.log.unshift({
        globalMs:st.elapsed,
        name:g.name,
        remaining:remBefore,
        glassElMs,
      });
    
      g.flipCount++;
      st.totalFlips++;
      g.flipping   = true;
      
      g.remaining  = g.capacity - g.remaining;
      g.pct        = (g.remaining / g.capacity) * 100;
      
      g.dir        = g.dir==='TTB'?'BTT':'TTB';
      g.lastFlipAt = st.elapsed;
      
      if(g.status === S.E || st.running) {
        g.status = S.R;
      } else if(g.status === S.P) {
        g.status = S.P;
      } else {
        g.status = S.I;
      }
    
      if(!st.running){st.running=true; st.lastTs=null;}
    
      setTimeout(()=>{
        g.flipping=false;
        const svg=document.getElementById(`svg-${g.id}`);
        if(svg) svg.classList.remove('flipping');
        renderGlass(g);
      },700);
    
      renderLog();
      notify(`${g.name} flipped × ${g.flipCount}`,'grn');
    }
    
    function openModal(){
      const body=$('flipBody');
      if(!st.glasses.length){
        body.innerHTML='<div class="fm-empty-note">No hourglasses added yet</div>';
      } else {
        body.innerHTML = st.glasses.map(g=>`
          <label class="fm-row${g.status===S.E?' is-empty':''}">
            <input type="checkbox" class="fm-chk" data-id="${g.id}"${g.status===S.E?' checked':''}>
            <span class="fm-nm">${g.name}</span>
            <span class="fm-st ${g.status}">${g.status.toUpperCase()}</span>
            <span class="fm-rem">${fmtMS(g.remaining)}</span>
            <span class="fm-fc">⇅${g.flipCount}</span>
            ${g.status===S.E?'<span class="fm-tag">EMPTY</span>':''}
          </label>
        `).join('');
      }
      $('flipBg').classList.add('open');
    }
    
    function closeModal(){
      $('flipBg').classList.remove('open');
    }
    
    function applyFlipAndStart(doFlip){
      if(doFlip){
        document.querySelectorAll('.fm-chk:checked').forEach(cb=>{
          flipGlass(parseInt(cb.dataset.id,10));
        });
      }
      closeModal();
      st.autoPaused=false; st.paused=false; st.lastTs=null;
      $('apBanner').classList.remove('on');
      if(!st.running) st.running=true;
      for(const g of st.glasses) if(g.status===S.P) g.status=S.R;
      updateUI();
    }
    
    function checkAutoPauseDone(){
      if(!st.autoPaused) return;
      if(!st.glasses.some(g=>g.status===S.E)){
        st.autoPaused=false; st.paused=false; st.lastTs=null;
        $('apBanner').classList.remove('on');
        for(const g of st.glasses) if(g.status===S.P) g.status=S.R;
        closeModal();
      }
    }
    
    // ══════════════════════════════════════════
    // JUMP
    // ══════════════════════════════════════════
    function jumpGlobal(dSec){
      if(st.goalDone) return;
      st.elapsed = Math.max(0, st.elapsed + dSec*1000);
    
      if(dSec>0){
        let emp=false;
        for(const g of st.glasses){
          if(g.status!==S.R&&g.status!==S.P) continue;
          g.remaining = Math.max(0, g.remaining-dSec);
          g.pct = (g.remaining/g.capacity)*100;
          if(g.remaining<=0){
            g.remaining=0; g.pct=0; g.status=S.E;
            emp=true; onEmpty(g);
          }
        }
        if(emp) autoPause();
        else updateUI();
      } else {
        const abs=Math.abs(dSec);
        for(const g of st.glasses){
          if(g.status!==S.R&&g.status!==S.P) continue;
          g.remaining=Math.min(g.capacity, g.remaining+abs);
          g.pct=(g.remaining/g.capacity)*100;
        }
        updateUI();
      }
    }
    
    function jumpSingle(id, dSec){
      const g=st.glasses.find(x=>x.id===id);
      if(!g||g.status===S.E) return;
      if(dSec>0){
        g.remaining=Math.max(0, g.remaining-dSec);
        if(g.remaining<=0){
          g.remaining=0; g.pct=0; g.status=S.E;
          onEmpty(g);
          if(st.running&&!st.paused) autoPause();
        } else {
          g.pct=(g.remaining/g.capacity)*100;
        }
      } else {
        g.remaining=Math.min(g.capacity, g.remaining+Math.abs(dSec));
        g.pct=(g.remaining/g.capacity)*100;
      }
      renderGlass(g);
    }
    
    // ══════════════════════════════════════════
    // ADD / REMOVE
    // ══════════════════════════════════════════
    function addGlass(cap,name){
      if(st.glasses.length>=st.max){notify(`Max ${st.max} reached`,'red');return;}
      const g=makeGlass(cap,name);
      if(st.running&&!st.paused){g.status=S.R; g.lastFlipAt=st.elapsed;}
      else if(st.running&&st.paused){g.status=S.P; g.lastFlipAt=st.elapsed;}
    
      st.glasses.push(g);
      const grid=$('hgGrid');
      grid.querySelector('.empty-st')?.remove();
      grid.appendChild(createCard(g));
      syncSVG(g);
      syncStats();
      notify(`${g.name} added (${fmtMS(cap)})`);
    }
    
    function removeGlass(id){
      const i=st.glasses.findIndex(g=>g.id===id);
      if(i<0) return;
      st.glasses.splice(i,1);
      document.getElementById(`hg-${id}`)?.remove();
      if(!st.glasses.length) showEmpty();
      checkAutoPauseDone();
      syncStats();
    }
    
    function showEmpty(){
      $('hgGrid').innerHTML='<div class="empty-st"><div class="big">⧗</div><p>ADD AN HOURGLASS TO BEGIN</p></div>';
    }
    
    // ══════════════════════════════════════════
    // SVG
    // ══════════════════════════════════════════
    function buildSVG(g){
      const W=75,H=112,cx=37.5,topY=4,botY=108,midY=56;
      const tw=30,bw=30,nw=2, id=g.id;
      return `<svg id="svg-${id}" class="hg-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="tC${id}"><polygon points="${cx-tw},${topY} ${cx+tw},${topY} ${cx+nw},${midY} ${cx-nw},${midY}"/></clipPath>
        <clipPath id="bC${id}"><polygon points="${cx-nw},${midY} ${cx+nw},${midY} ${cx+bw},${botY} ${cx-bw},${botY}"/></clipPath>
      </defs>
      <polygon id="gb${id}" points="${cx-tw},${topY} ${cx+tw},${topY} ${cx+nw},${midY} ${cx+nw},${midY} ${cx+bw},${botY} ${cx-bw},${botY} ${cx-nw},${midY} ${cx-nw},${midY}" fill="var(--glass-fill)" stroke="var(--glass-stroke)" stroke-width="1.5"/>
      <rect id="ts${id}" x="${cx-tw-2}" y="${midY-12}" width="${tw*2+4}" height="3" fill="rgba(196,122,43,.92)" clip-path="url(#tC${id})" style="display:none"/>
      <rect id="bs${id}" x="${cx-bw-2}" y="${botY-3}" width="${bw*2+4}" height="3" fill="rgba(232,168,76,.95)" clip-path="url(#bC${id})" style="display:none"/>
      <g id="sf${id}" style="display:none">
        <g class="sf" style="transform-origin:${cx}px ${midY}px"><circle cx="${cx}" cy="${midY-1}" r="1.15" fill="rgba(240,180,80,.95)"/></g>
        <g class="sf" style="transform-origin:${cx}px ${midY+4}px;animation-delay:.17s"><circle cx="${cx}" cy="${midY+4}" r=".8" fill="rgba(240,180,80,.55)"/></g>
      </g>
      <line x1="${cx-tw+4}" y1="${topY+6}" x2="${cx-nw-1}" y2="${midY-4}" stroke="var(--highlight)" stroke-width="2" stroke-linecap="round"/>
      <line x1="${cx-nw-1}" y1="${midY+4}" x2="${cx-bw+4}" y2="${botY-6}" stroke="var(--highlight)" stroke-width="2" stroke-linecap="round"/>
      <rect x="${cx-tw-1}" y="${topY-3}" width="${tw*2+2}" height="5" fill="var(--surf2)" stroke="var(--glass-stroke)" stroke-width="1"/>
      <rect x="${cx-bw-1}" y="${botY-1}" width="${bw*2+2}" height="5" fill="var(--surf2)" stroke="var(--glass-stroke)" stroke-width="1"/>
    </svg>`;
    }
    
    function syncSVG(g){
      const W=75,H=112,cx=37.5,topY=4,botY=108,midY=56;
      const tw=30,bw=30, id=g.id;
      const pct=g.pct/100, fp=1-pct;
      const tCH=midY-topY-10;
      const tSH=Math.max(0,pct*tCH);
      const tSY=midY-10-tSH;
      const bCH=botY-midY-10;
      const bSH=Math.min(bCH,fp*bCH);
      const bSY=botY-bSH;
      const isEmpty=g.status===S.E, isRun=g.status===S.R;
    
      const gb=document.getElementById(`gb${id}`);
      const ts=document.getElementById(`ts${id}`);
      const bs=document.getElementById(`bs${id}`);
      const sf=document.getElementById(`sf${id}`);
      if(!gb) return;
    
      gb.setAttribute('stroke', isEmpty?'var(--grn)':isRun?'var(--glass-stroke-run)':'var(--glass-stroke)');
      if(ts){
        ts.setAttribute('y',tSY); ts.setAttribute('height',Math.max(0,tSH+5));
        ts.style.display=(tSH>0.5&&!isEmpty)?'':'none';
      }
      if(bs){
        bs.setAttribute('y',bSY); bs.setAttribute('height',Math.max(0,bSH+5));
        bs.style.display=bSH>0.5?'':'none';
      }
      if(sf) sf.style.display=(isRun&&pct>0.002)?'':'none';
    
      const svgEl=document.getElementById(`svg-${id}`);
      if(svgEl&&g.flipping&&!svgEl.classList.contains('flipping'))
        svgEl.classList.add('flipping');
    }
    
    // ══════════════════════════════════════════
    // CARD DOM
    // ══════════════════════════════════════════
    function createCard(g){
      const d=document.createElement('div');
      d.id=`hg-${g.id}`; d.className=`hg-card ${g.status}`;
      d.innerHTML=`
        <div class="flip-badge">⇅ FLIP ME</div>
        <button class="btn-rm" title="Remove">×</button>
        <div class="hg-hdr">
          <div class="hg-nm" title="${g.name}">${g.name}</div>
          <div class="hg-id">#${p3(g.id)}</div>
        </div>
        <div class="hg-vis">${buildSVG(g)}</div>
        <div class="hg-st ${g.status}">${g.status.toUpperCase()}</div>
        <div class="hg-time">${fmtMS(g.remaining)}</div>
        <div class="hg-fc">⇅ 0 flips</div>
        <div class="jrow">
          <button class="btn-j neg" data-d="-60">−1m</button>
          <button class="btn-j neg" data-d="-10">−10s</button>
          <button class="btn-j" data-d="10">+10s</button>
          <button class="btn-j" data-d="60">+1m</button>
        </div>
        <div class="hg-pw"><div class="hg-pb" style="width:100%"></div></div>
        <div class="hg-pr"><span class="pc">100%</span><span class="cp">${fmtMS(g.capacity)}</span></div>
        <button class="btn-fl">⇅ FLIP</button>
      `;
      d.querySelector('.btn-rm').onclick=()=>removeGlass(g.id);
      d.querySelector('.btn-fl').onclick=()=>{
        flipGlass(g.id);
        checkAutoPauseDone();
        updateUI();
      };
      d.querySelectorAll('.btn-j').forEach(b=>b.onclick=()=>jumpSingle(g.id,parseInt(b.dataset.d,10)));
      return d;
    }
    
    // ══════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════
    function renderGlass(g){
      const card=document.getElementById(`hg-${g.id}`);
      if(!card) return;
      const isEmpty=g.status===S.E;
      const pct=Math.round(g.pct);
    
      card.className=`hg-card ${g.status}`;
      const st_el=card.querySelector('.hg-st');
      st_el.textContent=g.status.toUpperCase(); st_el.className=`hg-st ${g.status}`;
      card.querySelector('.hg-time').textContent=fmtMS(g.remaining);
      const fc=g.flipCount;
      card.querySelector('.hg-fc').textContent=`⇅ ${fc} flip${fc!==1?'s':''}`;
      const bar=card.querySelector('.hg-pb');
      bar.style.width=`${pct}%`; bar.className=`hg-pb${isEmpty?' g':''}`;
      card.querySelector('.pc').textContent=`${pct}%`;
      const fl=card.querySelector('.btn-fl');
      fl.disabled=false; 
      fl.className=`btn-fl${isEmpty?' cf':''}`;
      card.querySelectorAll('.btn-j').forEach(b=>b.disabled=isEmpty);
      syncSVG(g);
    }
    
    // ══════════════════════════════════════════
    // UPDATE ALL
    // ══════════════════════════════════════════
    function updateUI(){
      for(const g of st.glasses) renderGlass(g);
      $('clkVal').textContent=fmtHMS(st.elapsed/1000);
      $('hdrFlips').textContent=st.totalFlips;
    
      if(st.goalSec!==null){
        $('goalBarWrap').classList.add('on');
        $('goalBarFill').style.width=`${Math.min(100,(st.elapsed/1000/st.goalSec)*100)}%`;
      } else {
        $('goalBarWrap').classList.remove('on');
      }
    
      syncStats();
    
      const anyRun=st.running&&!st.paused;
      const bs=$('btnStart'), bp=$('btnPause');
      bs.classList.toggle('on',anyRun); bp.classList.toggle('on',st.paused);
      bs.disabled=(anyRun||st.goalDone);
      bp.disabled=(!st.running||st.paused||st.goalDone);
      document.querySelectorAll('.btn-gj').forEach(b=>b.disabled=st.goalDone);
    
      $('btnClrGoal').disabled = st.goalSec === null;
    }
    
    function syncStats(){
      const run=st.glasses.filter(g=>g.status===S.R).length;
      const emp=st.glasses.filter(g=>g.status===S.E).length;
      const pau=st.glasses.filter(g=>g.status===S.P).length;
      $('stTotal').textContent=st.glasses.length;
      $('stRun').textContent=run; $('stEmp').textContent=emp; $('stPau').textContent=pau;
      $('stFlips').textContent=st.totalFlips;
      $('hgCnt').textContent=`${st.glasses.length} hourglass${st.glasses.length!==1?'es':''}`;
    }
    
    function renderLog(){
      const tb=$('logTbody');
      if(!st.log.length){
        tb.innerHTML='<tr class="log-nil"><td colspan="4">No flips recorded yet</td></tr>';
        return;
      }
      tb.innerHTML=st.log.map(e=>`<tr>
        <td>${fmtHMS(e.globalMs/1000)}</td>
        <td>${e.name}</td>
        <td>${fmtMS(e.remaining)}</td>
        <td>${fmtMS(e.glassElMs/1000)}</td>
      </tr>`).join('');
    }
    
    // ══════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════
    function fmtHMS(s){
      s=Math.floor(Math.max(0,s));
      return `${p2(Math.floor(s/3600))}:${p2(Math.floor(s/60)%60)}:${p2(s%60)}`;
    }
    function fmtMS(s){
      s=Math.floor(Math.max(0,s));
      const m=Math.floor(s/60),r=s%60;
      if(m===0) return `${s}s`;
      if(r===0) return `${m}m`;
      return `${m}m ${p2(r)}s`;
    }
    function p2(n){return String(n).padStart(2,'0')}
    function p3(n){return String(n).padStart(3,'0')}
    function $(id){return document.getElementById(id)}
    
    // ══════════════════════════════════════════
    // NOTIFICATIONS & SOUND
    // ══════════════════════════════════════════
    function notify(msg,type=''){
      const el=document.createElement('div');
      el.className=`ntf${type?' '+type:''}`;
      el.textContent=msg;
      $('ntfWrap').appendChild(el);
      setTimeout(()=>el.remove(),2300);
    }
    function chime(){
      try{
        const ctx=new(window.AudioContext||window.webkitAudioContext)();
        const o=ctx.createOscillator(), g=ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.setValueAtTime(880,ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(440,ctx.currentTime+.35);
        g.gain.setValueAtTime(.14,ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.55);
        o.start(ctx.currentTime); o.stop(ctx.currentTime+.55);
      }catch(e){}
    }
    
    // ══════════════════════════════════════════
    // VALIDATION
    // ══════════════════════════════════════════
    function valCap(m,s){
      if(m.trim()===''&&s.trim()==='') return{ok:false,msg:'Enter capacity'};
      const mv=m.trim()===''?0:parseInt(m,10);
      const sv=s.trim()===''?0:parseInt(s,10);
      if(isNaN(mv)||mv<0||mv>59) return{ok:false,msg:'Minutes: 0–59'};
      if(isNaN(sv)||sv<0||sv>59) return{ok:false,msg:'Seconds: 0–59'};
      const t=mv*60+sv;
      if(t<=0) return{ok:false,msg:'Total must be > 0'};
      if(t>3600) return{ok:false,msg:'Max 60 minutes'};
      return{ok:true,val:t};
    }
    
    function valGoal(m,s){
      if(m.trim()===''&&s.trim()==='') return{ok:false,msg:'Enter goal time'};
      const mv=m.trim()===''?0:parseInt(m,10);
      const sv=s.trim()===''?0:parseInt(s,10);
      if(isNaN(mv)||mv<0||mv>59) return{ok:false,msg:'Minutes: 0–59'};
      if(isNaN(sv)||sv<0||sv>59) return{ok:false,msg:'Seconds: 0–59'};
      const t=mv*60+sv;
      if(t<=0) return{ok:false,msg:'Goal must be > 0'};
      return{ok:true,val:t};
    }
    
    // ══════════════════════════════════════════
    // BIND EVENTS
    // ══════════════════════════════════════════
    function bindEvents(){
      // THEME TOGGLE
      $('themeToggle').onclick = toggleTheme;
    
      // ADD HOURGLASS
      $('btnAdd').onclick=()=>{
        const cr=valCap($('iMin').value,$('iSec').value);
        $('capErr').textContent=cr.ok?'':cr.msg;
        if(!cr.ok) return;
    
        addGlass(cr.val,$('iName').value);
        $('iMin').value=''; $('iSec').value='';
        $('iName').value='';
      };
    
      ['iMin','iSec','iName'].forEach(id=>{
        $(id).addEventListener('keydown',e=>{if(e.key==='Enter')$('btnAdd').click()});
        $(id).addEventListener('input',()=>$('capErr').textContent='');
      });
    
      // SET GOAL
      $('btnSetGoal').onclick=()=>{
        const gr=valGoal($('gMin').value,$('gSec').value);
        $('goalErr').textContent=gr.ok?'':gr.msg;
        if(!gr.ok) return;
    
        setGoal(gr.val);
        $('gMin').value=''; $('gSec').value='';
      };
    
      ['gMin','gSec'].forEach(id=>{
        $(id).addEventListener('keydown',e=>{if(e.key==='Enter')$('btnSetGoal').click()});
        $(id).addEventListener('input',()=>$('goalErr').textContent='');
      });
    
      // CLEAR GOAL
      $('btnClrGoal').onclick=()=>clearGoal();
    
      // CONTROLS
      $('btnStart').onclick=()=>startSim();
      $('btnPause').onclick=()=>{pauseSim()};
      $('btnReset').onclick=()=>{resetSim();notify('All hourglasses reset')};
    
      // SPEED
      document.querySelectorAll('.btn-spd').forEach(b=>{
        b.onclick=()=>{
          st.speed=parseFloat(b.dataset.s);
          st.lastTs=null;
          document.querySelectorAll('.btn-spd').forEach(x=>x.classList.toggle('on',parseFloat(x.dataset.s)===st.speed));
        };
      });
    
      // GLOBAL JUMPS
      document.querySelectorAll('.btn-gj').forEach(b=>{
        b.onclick=()=>jumpGlobal(parseInt(b.dataset.d,10));
      });
    
      // CLEAR ALL
      $('btnClrAll').onclick=()=>{
        if(!st.glasses.length) return;
        st.glasses=[]; st.running=false; st.paused=false;
        st.elapsed=0; st.lastTs=null;
        st.totalFlips=0; st.log=[];
        st.autoPaused=false; st.goalDone=false;
        st.nameIdx=0;
        $('apBanner').classList.remove('on');
        $('goalDone').classList.remove('on');
        closeModal(); showEmpty();
        syncStats(); updateUI(); renderLog();
        notify('Cleared all hourglasses');
      };
    
      // MODAL BUTTONS
      $('btnFlipStart').onclick=()=>applyFlipAndStart(true);
      $('btnSkipStart').onclick=()=>applyFlipAndStart(false);
      $('btnMCancel').onclick=()=>closeModal();
      $('flipBg').onclick=e=>{if(e.target===e.currentTarget) closeModal()};
    
      // LOG TOGGLE
      $('logToggle').onclick=()=>{
        const b=$('logBody'), open=b.classList.toggle('open');
        $('logTxt').textContent=open?'▴ COLLAPSE':'▾ EXPAND';
      };
    }
    
    // ══════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════
    bindEvents();
    st.raf=requestAnimationFrame(tick);
    $('btnStart').disabled=false;
    $('btnPause').disabled=true;
    $('btnClrGoal').disabled=true;
    syncStats();
    updateGoalDisplay();
    
    })();