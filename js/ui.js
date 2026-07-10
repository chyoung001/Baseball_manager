// ===================== UI NAVIGATION =====================
let _currentRosterTab='batters';
function switchTab(tab){
  document.querySelectorAll('.nav-tab').forEach(t=>{const on=t.dataset.tab===tab;t.classList.toggle('active',on);t.setAttribute('aria-selected',on);});
  ['dashboard','roster','match','training','market','standings','analysis','invest','draft'].forEach(s=>$(s+'Screen').classList.toggle('active',s===tab));
  if(tab==='roster'){renderRoster();_restoreRosterTab();}
  if(tab==='standings')renderStandings();
  if(tab==='training')renderTraining();
  if(tab==='market')renderMarket();
  if(tab==='match')renderScoreboard();
  if(tab==='dashboard')renderDashboard();
  if(tab==='analysis')renderAnalysis();
  if(tab==='invest'){currentInvestTab='finance';renderInvest();}
  if(tab==='draft')renderDraft();
}

function updateHeader(){
  $('hdrTeam').innerHTML=`${G.myTeam.emoji} <span>${G.myTeam.name}</span>`;
  $('hdrSeason').textContent=G.season;$('hdrBudget').textContent=G.myTeam.budget;
  $('hdrPop').innerHTML=starsHTML(G.myTeam.popularity);$('hdrGame').textContent=G.gameNum;
  const tg=$('hdrTotalGames');if(tg)tg.textContent=G.totalGames||TOTAL_REGULAR;
  const ph=getPhaseInfo();
  const phEl=$('hdrPhase');if(phEl)phEl.textContent=`${ph.icon} ${ph.name}`;
  updateNavAdvance();
}

// ── 네비게이션 바 "다음" 버튼 상태 갱신 ──
function updateNavAdvance(){
  const btn=$('btnNavAdvance');if(!btn)return;
  const phase=G.phase;
  if(phase==='first_half'||phase==='second_half'){
    btn.textContent='▶ 다음 경기';
    btn.style.display='';
  } else if(phase==='preseason'||phase==='allstar'||phase==='postseason'||phase==='awards'||phase==='stove_league'){
    const ph=getPhaseInfo();
    btn.textContent='▶ '+ph.name;
    btn.style.display='';
  } else {
    btn.style.display='none';
  }
}

function navAdvance(){
  if(G.matchInProgress)return;
  const phase=G.phase;
  if(phase==='first_half'||phase==='second_half'){
    switchTab('match');
    startMatch();
  } else {
    advancePhase();
  }
}

// ===================== GAME MENU =====================
function toggleGameMenu(){$('gameMenu').classList.toggle('open');}
document.addEventListener('click',e=>{if(!e.target.closest('.game-menu-wrap'))$('gameMenu').classList.remove('open');});

// ===================== ROSTER SUB-TABS =====================
function switchRosterTab(tab){
  _currentRosterTab=tab;
  document.querySelectorAll('#rosterScreen .roster-tab').forEach(t=>t.classList.remove('active'));
  const clicked=event.target.closest('.roster-tab');if(clicked)clicked.classList.add('active');
  $('rosterBatters').classList.toggle('active',tab==='batters');
  $('rosterPitchers').classList.toggle('active',tab==='pitchers');
  $('rosterFutures').classList.toggle('active',tab==='futures');
  $('rosterDevelopmental').classList.toggle('active',tab==='developmental');
  $('rosterIL').classList.toggle('active',tab==='il');
  if(tab==='futures')renderFutures();
  if(tab==='developmental')renderDevelopmental();
  if(tab==='il')renderILPage();
}

// ===================== ROSTER TAB RESTORE =====================
function _restoreRosterTab(){
  if(_currentRosterTab==='batters')return;
  const tabMap={pitchers:'투수',futures:'퓨처스',developmental:'육성',il:'부상'};
  document.querySelectorAll('#rosterScreen .roster-tab').forEach(t=>{
    const match=tabMap[_currentRosterTab];
    t.classList.toggle('active',match&&t.textContent.includes(match));
  });
  ['Batters','Pitchers','Futures','Developmental','IL'].forEach(k=>{
    const el=$('roster'+k);if(el)el.classList.toggle('active',k.toLowerCase()===_currentRosterTab);
  });
  if(_currentRosterTab==='futures')renderFutures();
  if(_currentRosterTab==='developmental')renderDevelopmental();
  if(_currentRosterTab==='il')renderILPage();
}

// Bind nav-tab click + keyboard events after DOM is ready (탭 role/포커스/방향키 접근성)
document.addEventListener('DOMContentLoaded',()=>{
  const navWrap=document.querySelector('.nav-tabs');
  if(navWrap)navWrap.setAttribute('role','tablist');
  const tabs=[...document.querySelectorAll('.nav-tab')];
  tabs.forEach((t,i)=>{
    t.setAttribute('role','tab');
    t.setAttribute('tabindex','0');
    t.setAttribute('aria-selected',t.classList.contains('active'));
    const activate=()=>{
      if(G.matchInProgress){showToast('⚾ 경기 진행 중에는 탭을 전환할 수 없습니다.');return;}
      switchTab(t.dataset.tab);
    };
    t.addEventListener('click',activate);
    t.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}
      else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length].focus();}
    });
  });
});
