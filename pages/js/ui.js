// ===================== UI NAVIGATION =====================
let _currentRosterTab='batters';
function switchTab(tab){
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
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

// Bind nav-tab click events after DOM is ready
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.nav-tab').forEach(t=>t.addEventListener('click',()=>{
    if(G.matchInProgress){showToast('⚾ 경기 진행 중에는 탭을 전환할 수 없습니다.');return;}
    switchTab(t.dataset.tab);
  }));
});
