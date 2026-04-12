// ===================== MATCH (퍼사드 / 진입점) =====================
// 외부에서 호출되는 공용 API만 유지. 실제 로직은 분리된 모듈에 위치.
//   match-state.js  → 상태 객체, TTO 상수
//   match-engine.js → 순수 수학 (TTO, 피로도, 회귀, XP, 불펜 선택)
//   match-ui.js     → DOM 렌더링 (스코어보드, 필드, 대시보드, 로그)
//   match-flow.js   → 게임 루프 (simulatePlay, startMatch, endMatch, AI 시뮬)

// N게임 자동 시뮬
function autoSimGames(n){
  if(G.matchInProgress)return;
  const playablePhases=['first_half','second_half'];
  if(!playablePhases.includes(G.phase)){advancePhase();return;}

  // 로스터 최소 검증
  const rosterCheck=validateActiveRoster(G.myTeam);
  if(!rosterCheck.ok){
    alert('⚠️ 최소 로스터 규정 위반!\n• '+rosterCheck.violations.join('\n• ')+'\n\n로스터 탭에서 콜업하세요.');
    switchTab('roster');return;
  }

  // 버튼 비활성화
  ['btnPlayMatch','btnAutoSim10','btnAutoSim30','btnAutoSimHalf'].forEach(id=>{const b=$(id);if(b)b.disabled=true;});
  $('matchStatus').textContent='⏩ 자동 진행 중...';
  $('playLog').innerHTML='';

  let simmed=0,wins=0,losses=0;

  function runOne(){
    // 페이즈/시즌 종료 체크
    if(G.phase==='first_half'&&G.gameNum>=FIRST_HALF_END){
      finish('전반기 종료');G.phase='allstar';advancePhase();return;
    }
    if(G.gameNum>=TOTAL_REGULAR){
      finish('정규시즌 종료');G.phase='postseason';advancePhase();return;
    }
    if(simmed>=n){finish();return;}

    const result=_simMyGame();
    if(result===false){finish('로스터 부족');return;}
    simmed++;
    if(result)wins++;else losses++;

    // UI 상태 표시 (10경기 단위 쓰로틀링 — DOM 리플로우 방지)
    if(simmed%10===0||simmed>=n)$('matchStatus').textContent=`⏩ ${simmed}/${n} — ${wins}승 ${losses}패`;

    // 다음 게임을 비동기로 (UI 블로킹 방지, 약간의 딜레이)
    setTimeout(runOne,0);
  }

  function finish(reason){
    ['btnPlayMatch','btnAutoSim10','btnAutoSim30','btnAutoSimHalf'].forEach(id=>{const b=$(id);if(b)b.disabled=false;});
    const msg=reason?`(${reason})`:'';
    $('matchStatus').textContent=`완료! ${simmed}경기 ${wins}승 ${losses}패 ${msg}`;
    addLog(`⏩ 자동 진행 완료 — ${simmed}경기 (${wins}승 ${losses}패) | 현재 ${G.myTeam.wins}승 ${G.myTeam.losses}패`,'inning');
    $('btnPlayMatch').textContent=G.gameNum>=G.totalGames?'🏆 시즌 결과 보기':'▶ 다음 경기 시작';
    updateHeader();
    renderStandings();
    saveGame();
  }

  runOne();
}

// 현재 페이즈 끝까지 자동 시뮬
function autoSimToBreak(){
  if(G.matchInProgress)return;
  const playablePhases=['first_half','second_half'];
  if(!playablePhases.includes(G.phase)){advancePhase();return;}
  // 남은 게임 수 계산
  let remaining;
  if(G.phase==='first_half') remaining=FIRST_HALF_END-G.gameNum;
  else remaining=TOTAL_REGULAR-G.gameNum;
  if(remaining<=0){advancePhase();return;}
  autoSimGames(remaining);
}
