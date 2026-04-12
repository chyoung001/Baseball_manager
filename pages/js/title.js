// ===================== TITLE SCREEN =====================
function initTitleScreen(){
  $('teamSelect').innerHTML='';
  TEAMS_DATA.forEach((t,i)=>{
    $('teamSelect').innerHTML+=`<div class="team-option" onclick="selectTeam(${i})">
      <div class="emoji">${t.emoji}</div>
      <div class="name">${t.name}</div>
      <div class="desc">${t.desc}</div>
      <div class="concept-tag" style="background:${t.conceptColor}22;color:${t.conceptColor};border:1px solid ${t.conceptColor}44;">${t.conceptLabel}</div>
      <div style="margin-top:6px;">${starsHTML(t.basePop)}</div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-top:2px;">💰 ${won(t.baseBudget)}</div>
    </div>`;
  });
}

function selectTeam(idx){
  G.teamIdx=idx;initTeams(idx);G.season=1;G.gameNum=0;G.trainedBatter=false;G.trainedPitcher=false;
  G.phase='stove_league';G.hallOfFame=[];G.previousSeasonStandings=[];
  G.faPool=[];G.faBiddingLog=[];
  generateMarket();
  $('titleScreen').classList.remove('active');
  $('gameHeader').style.display='block';
  updateHeader();
  advancePhase(); // → stove_league 모달 표시
}

// ===================== INIT =====================
(function bootGame(){
  if(loadGame()){
    // 자동 복원 성공 → 바로 게임
    $('titleScreen').classList.remove('active');
    $('gameHeader').style.display='block';
    updateHeader();
    switchTab('dashboard');
    // 비경기 페이즈에서 저장된 경우 모달 재표시
    const nonPlayPhases=['preseason','allstar','postseason','awards','stove_league'];
    if(nonPlayPhases.includes(G.phase))advancePhase();
  }else{
    initTitleScreen();
    // localStorage에 세이브가 없어도, 타이틀에서 파일 불러오기는 가능
  }
  // localStorage 세이브 존재 시 "이어하기" 버튼 표시
  _renderTitleContinue();
  drawField();
})();

function _renderTitleContinue(){
  const el=$('titleContinue');if(!el)return;
  const raw=localStorage.getItem(SAVE_KEY);
  if(!raw){el.innerHTML='';return;}
  try{
    const d=JSON.parse(raw);
    const t=TEAMS_DATA[d.teamIdx]||{};
    el.innerHTML=`
      <div style="background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(245,158,11,0.02));border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:16px 24px;margin-bottom:20px;max-width:400px;text-align:center;">
        <div style="font-family:'Orbitron',sans-serif;font-size:0.75rem;color:var(--accent);margin-bottom:8px;">저장된 게임</div>
        <div style="font-size:1.1rem;margin-bottom:4px;">${t.emoji||''} <b>${t.name||'알 수 없음'}</b></div>
        <div style="font-size:0.75rem;color:var(--text-dim);">시즌 ${d.season||1} · ${d.gameNum||0}/${d.totalGames||84} 경기</div>
        <button class="btn btn-primary" onclick="_continueGame()" style="margin-top:12px;width:100%;">▶ 이어하기</button>
      </div>`;
  }catch(e){el.innerHTML='';}
}

function _continueGame(){
  if(loadGame()){
    $('titleScreen').classList.remove('active');
    $('gameHeader').style.display='block';
    updateHeader();
    switchTab('dashboard');
    // 비경기 페이즈에서 저장된 경우 모달 재표시
    const nonPlayPhases=['preseason','allstar','postseason','awards','stove_league'];
    if(nonPlayPhases.includes(G.phase))advancePhase();
  }
}
