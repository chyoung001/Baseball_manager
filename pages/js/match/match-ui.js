// ===================== MATCH UI (DOM 렌더링) =====================
// DOM 조작만 포함. 순수 계산/게임 로직 없음.
// 의존: match-state.js (matchState, _luRowCache), helpers.js ($), state.js (getStartingBatters)

function initScoreboard(){
  const g=$('scoreGrid');if(!g)return;
  let h='<div class="score-cell header"></div>';
  for(let i=1;i<=9;i++)h+=`<div class="score-cell header">${i}</div>`;
  h+='<div class="score-cell header">R</div><div class="score-cell header">H</div><div class="score-cell header">E</div>';
  h+=`<div class="score-cell team-name" id="sbGAway">AWY</div>`;
  for(let i=1;i<=9;i++)h+=`<div class="score-cell" id="sbA${i}">-</div>`;
  h+='<div class="score-cell total" id="sbGAR">0</div><div class="score-cell" id="sbGAH">0</div><div class="score-cell" id="sbGAE">0</div>';
  h+=`<div class="score-cell team-name" id="sbGHome">HOM</div>`;
  for(let i=1;i<=9;i++)h+=`<div class="score-cell" id="sbH${i}">-</div>`;
  h+='<div class="score-cell total" id="sbGHR">0</div><div class="score-cell" id="sbGHH">0</div><div class="score-cell" id="sbGHE">0</div>';
  g.innerHTML=h;
}

function renderScoreboard(){initScoreboard();drawField();}

function setSpeed(spd,btn){
  G.matchSpeed=spd;
  document.querySelectorAll('.speed-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

function addLog(text,type){
  const log=$('playLog');if(!log)return;
  const d=document.createElement('div');
  d.className='log-entry '+(type||'');
  d.textContent=text;
  log.prepend(d);
  log.scrollTop=0; // 최신 로그가 보이도록
}

function updateMatchUI(){
  const s=matchState;if(!s.home)return;
  const el=id=>document.getElementById(id);
  const aR=s.score.away.reduce((a,b)=>a+b,0);
  const hR=s.score.home.reduce((a,b)=>a+b,0);

  // 숨겨진 호환 요소
  $('sbAR').textContent=aR;$('sbHR').textContent=hR;
  $('sbAH').textContent=s.hits.away;$('sbHH').textContent=s.hits.home;
  $('sbAE').textContent=s.errors.away;$('sbHE').textContent=s.errors.home;

  // ── 스코어보드 ──
  if(el('sbAwayR'))el('sbAwayR').textContent=aR;
  if(el('sbHomeR'))el('sbHomeR').textContent=hR;
  if(el('sbAwayH'))el('sbAwayH').textContent=s.hits.away;
  if(el('sbHomeH'))el('sbHomeH').textContent=s.hits.home;
  if(el('sbAwayE'))el('sbAwayE').textContent=s.errors.away;
  if(el('sbHomeE'))el('sbHomeE').textContent=s.errors.home;
  if(el('sbAwayName'))el('sbAwayName').textContent=s.away.name;
  if(el('sbHomeName'))el('sbHomeName').textContent=s.home.name;
  if(el('sbAwayEmoji'))el('sbAwayEmoji').textContent=s.away.emoji||'⚾';
  if(el('sbHomeEmoji'))el('sbHomeEmoji').textContent=s.home.emoji||'⚾';
  if(el('sbInningBadge'))el('sbInningBadge').textContent=`${s.inning}회${s.half==='top'?'초':'말'}`;

  // 디테일 스코어 그리드
  s.score.away.forEach((v,i)=>{const c=$(`sbA${i+1}`);if(c)c.textContent=v;});
  s.score.home.forEach((v,i)=>{const c=$(`sbH${i+1}`);if(c)c.textContent=v;});
  // 그리드 내 R/H/E 총계
  const _gid=id=>{const e=document.getElementById(id);if(e)e.textContent='';return e;};
  const ga=_gid('sbGAR');if(ga)ga.textContent=aR;const gh=_gid('sbGHR');if(gh)gh.textContent=hR;
  const gah=_gid('sbGAH');if(gah)gah.textContent=s.hits.away;const ghh=_gid('sbGHH');if(ghh)ghh.textContent=s.hits.home;
  const gae=_gid('sbGAE');if(gae)gae.textContent=s.errors.away;const ghe=_gid('sbGHE');if(ghe)ghe.textContent=s.errors.home;
  document.querySelectorAll('.score-cell.active-inning').forEach(e=>e.classList.remove('active-inning'));
  const ael=$((s.half==='top'?'sbA':'sbH')+s.inning);if(ael)ael.classList.add('active-inning');

  // 공격/수비 모드
  const stadium=el('matchStadium');
  const batTeam=s.half==='top'?s.away:s.home;
  const fldTeam=s.half==='top'?s.home:s.away;
  const fldKey=s.half==='top'?'home':'away';
  const batKey=s.half==='top'?'away':'home';
  const isMyBat=batTeam===G.myTeam;
  if(stadium){stadium.classList.toggle('mode-offense',isMyBat);stadium.classList.toggle('mode-defense',!isMyBat);}

  // 아웃 인디케이터
  for(let i=0;i<3;i++){const dot=el('outDot'+i);if(dot)dot.classList.toggle('active',i<s.outs);}

  // 현재 투수/타자 참조
  const pitcher=s.currentPitcher[fldKey];
  const stBat=getStartingBatters(batTeam);
  const curBat=stBat.length>0?stBat[s.batterIdx[batKey]%stBat.length]:null;

  // 숨겨진 호환
  $('miInning').textContent=`${s.inning}회 ${s.half==='top'?'초':'말'}`;
  $('miOuts').textContent=s.outs;
  $('miPitcher').textContent=pitcher?pitcher.name:'-';
  $('miBatter').textContent=curBat?curBat.name:'-';

  // ── 하단 3분할 대시보드 ──
  _renderDashboard(s,batTeam,fldTeam,fldKey,batKey,pitcher,curBat);
}

// ===== 하단 3분할 대시보드 — textContent만 갱신 (DOM 리플로우 방지) =====
function _ensureLineupRows(n){
  const body=$('luBody');if(!body)return;
  if(_luRowCache&&_luRowCache.length===n)return;
  let h='';
  for(let i=0;i<n;i++){
    h+=`<tr id="luR${i}"><td class="lu-num">${i+1}</td><td id="luMk${i}"></td><td class="lu-pos" id="luPos${i}"></td><td class="lu-name" id="luNm${i}"></td><td class="lu-today" id="luTd${i}"></td><td id="luAvg${i}"></td></tr>`;
  }
  body.innerHTML=h;
  _luRowCache=new Array(n);
}

function _renderDashboard(s,batTeam,fldTeam,fldKey,batKey,pitcher,curBat){
  const _t=id=>{const e=document.getElementById(id);return e||null;};

  // ── 좌측: 라인업 (행 수 변경 시만 innerHTML, 이후 textContent) ──
  const title=_t('luTitle');
  if(title)title.textContent=`${batTeam.emoji||'⚾'} ${batTeam.name} LINEUP`;
  const lineup=getStartingBatters(batTeam);
  _ensureLineupRows(lineup.length);
  const onBase=new Set((s.bases||[]).filter(Boolean));
  lineup.forEach((p,i)=>{
    const row=_t('luR'+i);if(!row)return;
    const act=p===curBat;const ob=onBase.has(p.name);
    row.className=(act?'lu-active':'')+(ob?' lu-onbase':'');
    const mk=_t('luMk'+i);if(mk)mk.textContent=act?'▸':'';
    const pos=_t('luPos'+i);if(pos)pos.textContent=p.pos||'?';
    const nm=_t('luNm'+i);if(nm)nm.textContent=p.name;
    const td=_t('luTd'+i);if(td){const t=p.today||{ab:0,h:0};td.textContent=`${t.h}-${t.ab}`;}
    const av=_t('luAvg'+i);if(av)av.textContent=p.ss&&p.ss.ab>0?(p.ss.h/p.ss.ab).toFixed(3).slice(1):'---';
  });

  // ── 중앙: 투수 (textContent만) ──
  if(pitcher){
    const pt=pitcher.today||{outs:0,h:0,er:0,bb:0,k:0,np:0};
    const so=pitcher.ss||{};const sOuts=so.outs||0;
    const sERA=sOuts>0?(so.er*27/sOuts).toFixed(2):'0.00';
    const sIP=Math.floor(sOuts/3)+'.'+(sOuts%3);
    const todayIP=Math.floor(pt.outs/3)+'.'+(pt.outs%3);
    if(_t('pdName'))_t('pdName').textContent=pitcher.name;
    if(_t('pdSeason'))_t('pdSeason').textContent=`시즌 ${so.w||0}-${so.l||0} | ERA ${sERA} | IP ${sIP}`;
    if(_t('pdIP'))_t('pdIP').textContent=todayIP;
    if(_t('pdH'))_t('pdH').textContent=pt.h;
    if(_t('pdER'))_t('pdER').textContent=pt.er;
    if(_t('pdBB'))_t('pdBB').textContent=pt.bb;
    if(_t('pdK'))_t('pdK').textContent=pt.k;
    if(_t('pdNP'))_t('pdNP').textContent=pt.np;
    const stam=pitcher.currentStamina||0;
    if(_t('pdStamLabel'))_t('pdStamLabel').textContent=`STAMINA ${stam}`;
    const bar=_t('pdStamBar');
    if(bar){bar.style.width=stam+'%';bar.className='stamina-bar-fill '+(stam>50?'stam-high':stam>25?'stam-mid':'stam-low');}
  }

  // ── 우측: 타자 (textContent만) ──
  if(curBat){
    const bt=curBat.today||{ab:0,h:0,hr:0,rbi:0,bb:0,k:0};
    const ss=curBat.ss||{};
    const sAvg=ss.ab>0?(ss.h/ss.ab).toFixed(3):'0.000';
    const sOBP=(ss.ab+(ss.bb||0))>0?((ss.h+(ss.bb||0))/(ss.ab+(ss.bb||0))).toFixed(3):'0.000';
    if(_t('bdPos'))_t('bdPos').textContent=`${curBat.pos||'?'} · AT BAT`;
    if(_t('bdName'))_t('bdName').textContent=curBat.name;
    if(_t('bdSeason'))_t('bdSeason').textContent=`시즌 AVG ${sAvg} | OBP ${sOBP} | ${ss.hr||0}HR ${ss.rbi||0}RBI`;
    if(_t('bdAB'))_t('bdAB').textContent=bt.ab;
    if(_t('bdH'))_t('bdH').textContent=bt.h;
    if(_t('bdHR'))_t('bdHR').textContent=bt.hr;
    if(_t('bdRBI'))_t('bdRBI').textContent=bt.rbi;
    if(_t('bdBB'))_t('bdBB').textContent=bt.bb;
    if(_t('bdK'))_t('bdK').textContent=bt.k;
  }
}

// ===== 이벤트 플래시 이펙트 =====
function _flashField(cls){
  const d=document.getElementById('bcDiamond');if(!d)return;
  d.classList.remove('flash-gold','flash-red','flash-purple');
  void d.offsetWidth; // reflow 강제로 애니메이션 재시작
  d.classList.add(cls);
  setTimeout(()=>d.classList.remove(cls),800);
}

// ===================== FIELD DRAWING (DOM 기반) =====================
// 수비수 포지션 좌표 — 상수화로 미세 조정 용이
const DEFENDER_POS={
  C:{x:50,y:93}, P:{x:50,y:58},
  '1B':{x:72,y:60}, '2B':{x:62,y:44}, '3B':{x:28,y:60}, SS:{x:38,y:44},
  LF:{x:16,y:22}, CF:{x:50,y:12}, RF:{x:84,y:22}
};
function _defPosGroup(pos){
  if(pos==='LF'||pos==='CF'||pos==='RF') return 'pos-of';
  if(pos==='1B'||pos==='2B'||pos==='3B'||pos==='SS') return 'pos-if';
  return 'pos-battery';
}

// 수비수 하이라이트 (타구 방향 연출)
function highlightDefender(pos){
  const el=document.getElementById('def-'+pos);
  if(!el)return;
  el.classList.add('action-highlight');
  setTimeout(()=>el.classList.remove('action-highlight'),1000);
}

function drawField(){
  const s=matchState;if(!s.home)return;
  const el=id=>document.getElementById(id);

  // 주자 표시
  ['1B','2B','3B'].forEach((b,i)=>{
    const runner=el('runner'+b);
    const base=el('base'+b);
    if(runner)runner.classList.toggle('visible',!!s.bases[i]);
    if(base)base.classList.toggle('occupied',!!s.bases[i]);
  });

  // 마운드 투수 표시 (textContent only — 뼈대 span은 최초 1회만 생성)
  const fldKey=s.half==='top'?'home':'away';
  const pitcher=s.currentPitcher[fldKey];
  const mound=el('bcMoundPitcher');
  if(mound&&pitcher){
    if(!mound.dataset.init){mound.innerHTML='<span class="bc-mp-name"></span><br><span class="bc-mp-stat"></span>';mound.dataset.init='1';}
    const nm=mound.querySelector('.bc-mp-name');const st=mound.querySelector('.bc-mp-stat');
    if(nm)nm.textContent=`${pitcher.name}`;
    if(st){const pt=pitcher.today||{np:0,outs:0};st.textContent=`IP ${Math.floor(pt.outs/3)}.${pt.outs%3} | ${pt.np}구`;}
  }

  // 타석 타자 표시 (textContent only)
  const batTeam=s.half==='top'?s.away:s.home;
  const batKey=s.half==='top'?'away':'home';
  const stBat=getStartingBatters(batTeam);
  const curBat=stBat.length>0?stBat[s.batterIdx[batKey]%stBat.length]:null;
  const bbox=el('bcBatterBox');
  if(bbox&&curBat){
    if(!bbox.dataset.init){bbox.innerHTML='<span class="bc-bb-name"></span><br><span class="bc-bb-stat"></span>';bbox.dataset.init='1';}
    const nm=bbox.querySelector('.bc-bb-name');const st=bbox.querySelector('.bc-bb-stat');
    if(nm)nm.textContent=curBat.name;
    if(st){const bt=curBat.today||{ab:0,h:0};st.textContent=`${bt.h}-${bt.ab}`;}
  }

  // 수비수 이름표 배치 (이닝 전환 시에만 재빌드 — 캐시 키: half+inning)
  const fldTeam=s.half==='top'?s.home:s.away;
  const defPanel=el('bcDefenders');
  if(defPanel){
    const cacheKey=s.half+s.inning+fldKey;
    if(defPanel.dataset.ck!==cacheKey){
      defPanel.dataset.ck=cacheKey;
      let dhtml='';
      const defenders=getStartingBatters(fldTeam);
      defenders.forEach(p=>{
        const coord=DEFENDER_POS[p.pos];
        if(!coord)return;
        const grp=_defPosGroup(p.pos);
        dhtml+=`<div class="bc-def-tag ${grp}" id="def-${p.pos}" style="left:${coord.x}%;top:${coord.y}%;transform:translate(-50%,-50%);">
          <div class="def-name">${p.name}</div>
          <div class="def-stat">${p.pos}: F${p.fielding||0}</div>
        </div>`;
      });
      defPanel.innerHTML=dhtml;
    }
  }
}
