// ===================== MATCH POSTGAME (경기 후 처리 — 컨디션/부상/서비스타임/2군) =====================
// 실경기(endMatch)·간이 시뮬(_simMyGame/_simAIGame) 공용 후처리 계층

// ═══════════════════════════════════════════════════════
// 선수 컨디션 공용 헬퍼 — 실경기(endMatch)·간이 시뮬(_simMyGame) 공통
// (동일 로직이 두 경로에 복제되어 수치가 발산하던 문제 해소)
// ═══════════════════════════════════════════════════════
// 부상 판정 임계: injuryRisk 단일 곡선(utils-stats) + 최소 2 플로어 (다이스 최소 확률 보장)
function _injuryThreshold(dur){return Math.max(2,Math.round(injuryRisk(dur)));}
// 미등판/휴식 회복 보너스: 내구성 + (투수) 연투회복 히든
function _restRecoveryBonus(p){
  const durBonus=Math.round(((hiddenEff(p,'_durability'))-50)/25);
  const recBonus=p.isPitcher?Math.round(((hiddenEff(p,'_recovery'))-50)/25):0;
  return durBonus+recBonus;
}
// P2-3 서비스타임 적립 (전 구단, 게임일당 1회) — 반드시 그날의 부상 롤 "이전"에 호출
// (부상 롤 뒤에 두면 출전했지만 당일 부상당한 선수가 등록 크레딧을 잃는다)
function _accrueServiceDay(){
  G.teams.forEach(tm=>tm.roster.forEach(p=>{if((p.status||'active')==='active'&&p.role!=='overseas')p._svcGames=(p._svcGames||0)+1;}));
}
// 슬럼프 발동 롤: 성공 시 지속 경기 수, 아니면 0 (P2-5 슬럼프 완화 시설 반영)
function _rollSlumpOnset(p,team){
  const scLv=(team&&team.slumpCareLevel)||0;
  const prob=Math.max(1,Math.round((15-Math.round((hiddenEff(p,'_consistency'))/5))*(1-(SLUMP_CARE_RELIEF[scLv]||0))));
  if(rand(1,100)>prob)return 0;
  return Math.max(1,rand(3,7)-(scLv>=3?1:0));
}


// ===================== POST-GAME PROCESSING =====================

function runFuturesMiniGame(team) {
  const fb = getFuturesPlayers(team).filter(p=>!p.isPitcher);
  if(fb.length===0) return;
  const opp_stuff = 55 * FUTURES_PITCHER_DEBUFF; // weaker minor-league opposition
  const hits = fb.filter(p=>{
    const hc = (p.contact||40)/((p.contact||40)+opp_stuff);
    return Math.random() < hc;
  }).length;
  const oppRuns = rand(1,5);
  const runs = hits + rand(0,2);
  if(hits>0 || runs>0) addLog(`🌱 2군: ${runs>oppRuns?'승리':'패배'} (${runs}:${oppRuns}) — ${hits}안타`,'pitching');
}

function processPostGame() {
  const t = G.myTeam;
  // 1. Cooldown decrement (futures + il)
  t.roster.forEach(p=>{ if((p.cooldown||0)>0) p.cooldown--; });
  // 2. IL countdown
  t.roster.filter(p=>p.status==='il').forEach(p=>{
    if((p.ilGamesLeft||0)>0) p.ilGamesLeft--;
    if(p.ilGamesLeft<=0){
      p.status='futures'; p.isOnIL=false; p.cooldown=3; p.rehabGamesLeft=3; p._recentILReturn=10;
      addLog(`🏥 ${p.name} IL 복귀! 2군 재활 3경기`,'hit');
      showToast(`🏥 ${p.name} IL 복귀 — 2군 재활 3경기 후 콜업 가능`);
    }
  });
  // 3. Rehab decrement
  t.roster.filter(p=>p.status==='futures'&&(p.rehabGamesLeft||0)>0).forEach(p=>{
    p.rehabGamesLeft--;
    if(p.rehabGamesLeft===0) showToast(`💪 ${p.name} 재활 완료! 콜업 가능`);
  });
  // 4. XP — active players
  t.roster.filter(p=>(p.status||'active')==='active'&&p.role!=='overseas').forEach(p=>{
    awardXP(p, (p.role==='starting'||p.role==='rotation') ? XP_ACTIVE_STARTER : XP_ACTIVE_BENCH);
  });
  // 5. XP + condition recovery — futures
  // 세이버스(pitching)는 2군 XP -10% 패널티
  const minorXpMult=t.concept==='pitching'?0.9:1.0;
  t.roster.filter(p=>p.status==='futures').forEach(p=>{
    awardXP(p, Math.round(XP_FUTURES*minorXpMult));
    p.condition=clamp(p.condition+rand(FUTURES_COND_RECOVERY_MIN,FUTURES_COND_RECOVERY_MAX),30,100);
  });
  // 6. XP + condition recovery — developmental
  t.roster.filter(p=>p.status==='developmental').forEach(p=>{
    awardXP(p, Math.round(XP_DEVELOPMENTAL*minorXpMult));
    p.condition=clamp(p.condition+rand(FUTURES_COND_RECOVERY_MIN-1,FUTURES_COND_RECOVERY_MAX-1),30,100);
  });
  // 7. Futures mini-game
  runFuturesMiniGame(t);
  // 8. 9월 확대 엔트리 안내 — 경로(관전/자동) 무관 시즌당 1회 (멱등 가드)
  if(G.phase==='second_half'&&G.gameNum>=EXPANDED_ENTRY_START&&!G.expandedEntryNotified){
    showToast('📋 9월 확대 엔트리! 1군 최대 32명');
    G.expandedEntryNotified=true;
  }
}

