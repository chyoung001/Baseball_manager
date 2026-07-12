// ===================== MATCH FLOW (게임 루프 / 규칙 / 시뮬) =====================
// 게임 진행 흐름: startMatch → simulatePlay → endMatch, AI 시뮬, 포스트게임 처리
// 의존: match-state.js, match-engine.js, match-ui.js, helpers.js, state.js, constants.js

// ── 시리즈 구조 (21시리즈 × 3연전) ──
function getCurrentSeries(){return Math.floor(G.gameNum/SERIES_LENGTH);}   // 0-기반 시리즈 인덱스
function getGameInSeries(){return G.gameNum%SERIES_LENGTH;}                 // 시리즈 내 경기 순번 (0,1,2)
function isMyTeamHome(){return getCurrentSeries()%2===0;}                   // 시리즈 단위 홈/원정 (3경기 동일 구장)
function getOpponent(){
  // 상대는 시리즈 단위로 고정 — 3연전 동안 동일 팀, 시리즈마다 순환.
  const o=G.teams.filter(t=>t!==G.myTeam);
  return o[getCurrentSeries()%o.length];
}

function getStartingPitcher(team){
  const rot=getRotation(team);
  if(rot.length>0) return rot[team.rotationIdx%rot.length];
  // 로테이션 전원 IL/해외: 활성 투수 중 누구든 기용
  return getPitchers(team).find(p=>(p.status||'active')==='active'&&p.role!=='overseas')||null;
}

function startMatch(){
  if(G.matchInProgress)return;
  // ── 페이즈 체크: 경기 진행이 가능한 페이즈인지 ──
  const playablePhases=['first_half','second_half'];
  if(!playablePhases.includes(G.phase)){
    advancePhase();return;
  }
  // 정규시즌 종료 체크
  if(G.gameNum>=TOTAL_REGULAR){
    G.phase='postseason';advancePhase();return;
  }
  // 전반기 종료 → 올스타 & 드래프트
  if(G.phase==='first_half'&&G.gameNum>=FIRST_HALF_END){
    G.phase='allstar';advancePhase();return;
  }
  // ── 최소 로스터 규정 체크 ──
  const rosterCheck=validateActiveRoster(G.myTeam);
  if(!rosterCheck.ok){
    const msg='⚠️ 경기를 시작할 수 없습니다!\n\n최소 로스터 규정 위반:\n• '+rosterCheck.violations.join('\n• ')+'\n\n로스터 탭에서 2군 선수를 콜업하세요.';
    alert(msg);
    switchTab('roster');
    return;
  }
  G.matchInProgress=true;
  $('btnPlayMatch').disabled=true;$('btnPlayMatch').textContent='경기 진행 중...';$('playLog').innerHTML='';

  // 팬 이벤트 사기 부스트 적용
  if(G.myTeam.moralBoost>0){
    G.myTeam.roster.filter(p=>p.role!=='overseas').forEach(p=>p.condition=clamp(p.condition+G.myTeam.moralBoost,30,100));
    addLog(`🎉 팬 이벤트 효과! 선수단 컨디션 +${G.myTeam.moralBoost}`,'hit');
    G.myTeam.moralBoost=0;
  }

  const opp=getOpponent();const isHome=isMyTeamHome();
  const homeTeam=isHome?G.myTeam:opp;const awayTeam=isHome?opp:G.myTeam;

  // Reset stamina & NP for game
  [homeTeam,awayTeam].forEach(t=>getPitchers(t).forEach(p=>{
    p.currentStamina=100; // 경기 시작=풀(%). NP식 100*(1-np/maxNP)·시즌 리셋과 동일 스케일
    p._simNP=0;p._pitchedThisGame=false;
  }));

  const homeSP=getStartingPitcher(homeTeam);
  const awaySP=getStartingPitcher(awayTeam);
  if(!homeSP||!awaySP){
    const noSPTeam=!homeSP?homeTeam:awayTeam;
    showToast(`⚠️ ${noSPTeam.name} 투수 부족 — 자동 승리 처리`);
    G.matchInProgress=false;
    $('btnPlayMatch').disabled=false;$('btnPlayMatch').textContent='경기 시작';
    return;
  }

  // 당일 스탯 초기화 (출전 선수 전원)
  [homeTeam,awayTeam].forEach(t=>{
    getStartingBatters(t).forEach(p=>{p.today={ab:0,h:0,hr:0,rbi:0,bb:0,k:0,r:0};});
    getPitchers(t).forEach(p=>{p.today={ip:0,outs:0,h:0,er:0,bb:0,k:0,np:0};});
  });

  matchState={
    home:homeTeam,away:awayTeam,inning:1,half:'top',outs:0,bases:[null,null,null],
    score:{home:Array(9).fill(0),away:Array(9).fill(0)},
    hits:{home:0,away:0},errors:{home:0,away:0},
    batterIdx:{home:0,away:0},
    currentPitcher:{home:homeSP,away:awaySP},
    pitchCount:{home:0,away:0},_prevOuts:0,
    relieversUsed:{home:[],away:[]},
    startingPitcher:{home:homeSP,away:awaySP},
    spOutsStart:{home:homeSP&&homeSP.ss?(homeSP.ss.outs||0):0,away:awaySP&&awaySP.ss?(awaySP.ss.outs||0):0},
  };

  initScoreboard();
  _luRowCache=null; // 라인업 캐시 리셋
  $('matchStatus').textContent=`${awayTeam.name} vs ${homeTeam.name}`;
  addLog(`⚾ ${awayTeam.name} vs ${homeTeam.name} 경기 시작!`,'inning');
  addLog(`📢 선발 투수: ${awaySP.name} vs ${homeSP.name}`,'pitching');
  // 마운드/타석 뼈대 리셋 (캐시 초기화)
  const _mp=document.getElementById('bcMoundPitcher');if(_mp)delete _mp.dataset.init;
  const _bb=document.getElementById('bcBatterBox');if(_bb)delete _bb.dataset.init;
  const _dp=document.getElementById('bcDefenders');if(_dp)delete _dp.dataset.ck;
  updateMatchUI();drawField();setTimeout(simulatePlay,G.matchSpeed);
}

function simulatePlay(){
  if(!G.matchInProgress)return;
  const batTeam=matchState.half==='top'?matchState.away:matchState.home;
  const fldTeam=matchState.half==='top'?matchState.home:matchState.away;
  const fldKey=matchState.half==='top'?'home':'away';
  const batKey=matchState.half==='top'?'away':'home';
  const scoreKey=batKey;
  const ii=matchState.inning-1;

  // Get batter
  const starters=getStartingBatters(batTeam);
  if(starters.length===0){endMatch();return;}
  const batter=starters[matchState.batterIdx[batKey]%starters.length];

  // Get current pitcher & check stamina
  let pitcher=matchState.currentPitcher[fldKey];
  if(!pitcher){endMatch();return;}

  // ── 불펜 등판 로직 (shouldHookPitcher 통합) ──
  const todayER=(pitcher.today&&pitcher.today.er)||0;
  if(shouldHookPitcher(pitcher, matchState.inning, todayER, fldTeam.concept)){
    const bp=getBullpen(fldTeam).filter(p=>(p._consecutiveDaysPitched||0)<3&&(p.condition||100)>=20&&!matchState.relieversUsed[fldKey].includes(p));
    if(bp.length>0){
      // 현재 점수 상황 계산
      const myRuns=matchState.score[fldKey].reduce((a,b)=>a+b,0);
      const oppRuns=matchState.score[fldKey==='home'?'away':'home'].reduce((a,b)=>a+b,0);
      const lead=myRuns-oppRuns;
      const inn=matchState.inning;
      let pick_p=null, logTag='';

      // CP: 9회+, 1~3점 리드 (세이브 상황)
      if(inn>=9 && lead>=1 && lead<=3){
        pick_p=bp.find(p=>p.pos==='CP');
        if(pick_p)logTag='🔒 마무리';
      }
      // SU: 7~8회, 리드 또는 동점
      if(!pick_p && inn>=7 && inn<=8 && lead>=0){
        pick_p=bp.find(p=>p.pos==='SU');
        if(pick_p)logTag='⚡ 필승조';
      }
      // MR: 6~8회, 1~4점 뒤지는 상황 (추격조)
      if(!pick_p && inn>=6 && lead>=-4 && lead<0){
        pick_p=bp.find(p=>p.pos==='MR');
        if(pick_p)logTag='🔄 추격조';
      }
      // LR: 선발 조기강판(5회 이전) 또는 5점+ 차이 (대량 리드/대량 열세)
      if(!pick_p && (inn<=5 || Math.abs(lead)>=5)){
        pick_p=bp.find(p=>p.pos==='LR');
        if(pick_p)logTag='📋 롱릴리프';
      }
      // CP 확장 등판: 9회+, 4점 이상 리드 → CP 아끼고 MR 투입
      if(!pick_p && inn>=9 && lead>=4){
        pick_p=bp.find(p=>p.pos==='MR')||bp.find(p=>p.pos==='LR');
        if(pick_p)logTag='🔄 추격조';
      }
      // 필승조 확장: CP 없으면 필승조가 마무리 대행
      if(!pick_p && inn>=9 && lead>=1){
        pick_p=bp.find(p=>p.pos==='SU');
        if(pick_p)logTag='⚡ 필승조(마무리 대행)';
      }
      // 폴백: 아무나 가용한 투수
      if(!pick_p){
        pick_p=bp[0];
        logTag='🔄 불펜';
      }

      if(pick_p){
        pitcher=pick_p;
        matchState.currentPitcher[fldKey]=pick_p;
        matchState.relieversUsed[fldKey].push(pick_p);
        addLog(`${logTag} ${pick_p.name} 등판!`,'pitching');
      }
    }
  }

  // === TTO + BABIP 기반 타석 판정 (63경기 최적화) ===

  // ── [1] 실시간 부상 확률 (투구수 가중 + 돌발 부상) — 피로/계수 계산 前 교체 확정 ──
  // 부상 교체가 이 아래 컨셉 보너스·피로 계수보다 먼저 일어나야 전부 최종 투수 기준으로 계산됨.
  if(pitcher.status!=='il'){
    let injuryChance;
    const _pitNP=(pitcher.today&&pitcher.today.np)||0;
    if((pitcher.condition||100)<60){
      // 저컨디션: 기존 확률 + 투구수 가중
      const npFactor=1+Math.max(0,_pitNP-60)*0.02;
      injuryChance=(60-(pitcher.condition||100))*0.0003*npFactor;
    }else{
      // 돌발 부상: 매우 낮은 확률 (0.05%)
      injuryChance=0.0005;
    }
    if(Math.random()<injuryChance){
      const _inj=rollInjuryDuration();
      pitcher.status='il';pitcher.isOnIL=true;pitcher.ilGamesLeft=_inj.games;
      addLog(`🤕 ${pitcher.name} 투구 중 ${_inj.label}! IL ${_inj.games}경기`,'out');
      showToast(`🤕 ${pitcher.name} 마운드에서 부상! (${_inj.label})`);
      const bpEmg=getBullpen(fldTeam).filter(p=>p.currentStamina>15&&(p.condition||100)>=30&&!matchState.relieversUsed[fldKey].includes(p));
      if(bpEmg.length>0){
        pitcher=bpEmg[0];matchState.currentPitcher[fldKey]=pitcher;matchState.relieversUsed[fldKey].push(pitcher);
        addLog(`🔄 긴급 교체! ${pitcher.name} 등판`,'pitching');
      }
    }
  }

  // ── [2] 팀 컨셉 보너스 ──
  let batBonus=0,pitchBonus=0;
  if(batTeam.concept==='contact_hit') batBonus+=4;
  if(batTeam.concept==='speed')       batBonus+=3;
  if(batTeam.concept==='sabermetrics')batBonus+=3;
  if(batTeam.concept==='prospect')    batBonus+=2;  // 육성팀: 젊은 타자 기량 발전 중
  if(fldTeam.concept==='power_hit')   pitchBonus+=5;
  if(fldTeam.concept==='defense')     pitchBonus+=4;
  if(fldTeam.concept==='pitching')    pitchBonus+=4;
  if(fldTeam.concept==='bullpen'&&pitcher.role==='bullpen') pitchBonus+=5;

  // ── [3] 투수 피로도 (스태미나 + 투구수 커브) — 최종(교체 후) 투수 기준 ──
  const fatigue=_fatigueDebuff((pitcher.today&&pitcher.today.np)||0);
  const stamFactor=pitcher.currentStamina<=5?0.40:pitcher.currentStamina<25?0.75:pitcher.currentStamina<50?0.88:1.0;
  const condFactor=Math.min(1.0,(pitcher.condition||100)/100);
  const adjVelocity=Math.max(1,(statEff(pitcher,'velocity'))+fatigue.vel);
  const velMult=1+adjVelocity/400;

  // ── [4] 히든 스탯 반영 ──
  const hasRISP=!!(matchState.bases[1]||matchState.bases[2]);
  const clutchAdd=hasRISP?((statEff(pitcher,'clutch'))*0.05):0;
  const batCon=hiddenEff(batter,'_consistency'); // 1~100 스케일
  const batInSlump=(batter._slumpGames||0)>0;
  const batSwingBase=Math.round((100-batCon)/5);
  const batSwing=batInSlump?rand(-batSwingBase,Math.floor(batSwingBase*0.3)):rand(-batSwingBase,batSwingBase);
  const pitCon=hiddenEff(pitcher,'_consistency');
  const pitSwingBase=Math.round((100-pitCon)/5);
  const pitSwing=rand(-pitSwingBase,pitSwingBase);
  const aTotal=matchState.score.away.reduce((a,b)=>a+b,0);
  const hTotal=matchState.score.home.reduce((a,b)=>a+b,0);
  const inning=matchState.inning||1;
  const scoreDiff=Math.abs(aTotal-hTotal);
  const hasRunnersInScoring=!!(matchState.bases[1]||matchState.bases[2]);
  const tiebreakRunner=!!(matchState.bases[0]||matchState.bases[1]||matchState.bases[2])&&scoreDiff<=1;
  const isHighLeverage=inning>=7&&(scoreDiff<=3||hasRunnersInScoring||tiebreakRunner);
  // P2-5 멘탈 코칭 룸: 클러치 보정 증폭 (설계: 시설 7 — 자연 확장, 독립 레이어 아님)
  const _mcBat=1+(MENTAL_COACH_AMP[batTeam.mentalCoachLevel||0]||0);
  const _mcPit=1+(MENTAL_COACH_AMP[fldTeam.mentalCoachLevel||0]||0);
  const batBigGame=isHighLeverage?((hiddenEff(batter,'_clutchHidden'))-50)*0.12*_mcBat:0;
  const pitBigGame=isHighLeverage?((hiddenEff(pitcher,'_clutchHidden'))-50)*0.12*_mcPit:0;

  // ── [5] 유효 투수 스탯 (피로도 커브 반영) ──
  const effStuff=((statEff(pitcher,'stuff'))+pitchBonus+clutchAdd+pitSwing+pitBigGame)*velMult*stamFactor*condFactor;
  const effControl=((statEff(pitcher,'control'))+fatigue.ctrl+pitchBonus*0.5+clutchAdd*0.6+pitSwing*0.5+pitBigGame*0.5)*stamFactor*condFactor;
  const effMovement=((statEff(pitcher,'movement'))+fatigue.mov+pitchBonus*0.3+pitSwing*0.3)*velMult*stamFactor;

  // ── [6] 유효 타자 스탯 ──
  const isSlumping=(batter.condition||100)<SLUMP_CONDITION_THRESHOLD;
  const slumpDebuff=isSlumping?SLUMP_DEBUFF:0;
  const rehabDebuff=(batter.rehabGamesLeft||0)>0?REHAB_DEBUFF:0;
  const totalDebuff=slumpDebuff+rehabDebuff;
  const adjContact=(statEff(batter,'contact'))+batBonus-totalDebuff+batSwing+batBigGame;
  const adjPower=(statEff(batter,'power'))+batBonus*0.5-totalDebuff*0.8+batSwing*0.5+batBigGame*0.5;
  const adjEye=(statEff(batter,'eye'))+batBonus*0.3+batSwing*0.3;
  const batSpeed=(statEff(batter,'speed'));

  // ── [7] 수비력 (하프이닝 캐시 — 전환 페널티 포함 평균이 타석마다 재계산되던 것 방지) ──
  // 수비 라인업은 하프이닝 중 바뀌지 않음: 이닝/공수 교대 시 키가 달라져 자동 재계산
  const _defKey=fldKey+':'+matchState.inning+':'+matchState.half;
  if(!matchState._defCache||matchState._defCache.key!==_defKey){
    const fldStarters=getStartingBatters(fldTeam);
    matchState._defCache={
      key:_defKey,
      avgFielding:fldStarters.length>0?fldStarters.reduce((s,p)=>s+effFielding(p),0)/fldStarters.length:50, // 전환 페널티 반영
      avgArm:fldStarters.length>0?fldStarters.reduce((s,p)=>s+effArm(p),0)/fldStarters.length:50,
    };
  }
  const avgFielding=matchState._defCache.avgFielding;
  const avgArm=matchState._defCache.avgArm;
  const armPenalty=Math.max(0.4,1-avgArm/200);

  // ── [8] 동적 회귀 보정 ──
  const regression=_calcRegression(batter,pitcher);

  // ── [9] TTO 확률 계산 (HR → K → BB → InPlay) — 극단값 상한 축소 + 홈구장 파크팩터 곱셈 ──
  const _park=getParkFactor(matchState.home); // 홈구장 = 양팀 공통
  const pHR=clamp((TTO_BASE_HR+(adjPower-effMovement)/165*0.16)*_park.hr, 0.005, 0.08);
  const pK =clamp(TTO_BASE_K +(effStuff-adjContact)/165*0.15, 0.04, 0.30);
  const pBB=clamp(TTO_BASE_BB+(adjEye-effControl)/165*0.12, 0.02, 0.15);

  // ── [10] BABIP (인플레이 안타 확률) ──
  const contactMod=1+(adjContact-50)/330;
  const defMod=1-(avgFielding-50)/412;
  const babip=clamp(TTO_BASE_BABIP*contactMod*defMod*regression.hitMod*regression.erMod*_park.hit, 0.200, 0.380);

  // ── [11] 인플레이 세부 확률 ──
  const pError=clamp(0.02-(avgFielding-50)/3300, 0.005, 0.04);
  let gbAdj=0;
  if(fldTeam.concept==='defense') gbAdj+=0.05;
  if(batTeam.concept==='power_hit') gbAdj-=0.05;
  const gbRate=clamp(0.45+(effMovement-adjPower)/330+gbAdj, 0.30, 0.65);
  const xbhRate=clamp(0.20+(adjPower-50)/330, 0.10, 0.40);
  const tripleRate=batSpeed>75?0.025:batSpeed>51?0.012:0.004;
  const doubleRate=xbhRate-tripleRate;

  // ── Stats references ──
  const bs=batter.ss||(batter.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});
  const ps=pitcher.ss||(pitcher.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});
  const bt=batter.today||(batter.today={ab:0,h:0,hr:0,rbi:0,bb:0,k:0,r:0});
  const pt=pitcher.today||(pitcher.today={ip:0,outs:0,h:0,er:0,bb:0,k:0,np:0});

  // ═══════ 투구 전 도루 시도 (타석 결과와 독립) ═══════
  if(matchState.outs<3){
    const _stCatcher=fldTeam.roster.find(p=>p.pos==='C'&&(p.status||'active')==='active'&&p.role==='starting');
    const _stCatchArm=_stCatcher?(statEff(_stCatcher,'arm')):50;
    const _stCatchF=Math.max(0.40,1-_stCatchArm/200);
    const _stMult=batTeam.concept==='speed'?0.55:batTeam.concept==='sabermetrics'?0.22:0.38;
    // 1루→2루 도루
    if(matchState.bases[0]&&!matchState.bases[1]){
      const _stR0=matchState.bases[0];
      const _stSpd=(statEff(_stR0,'speed'));
      const _stChance=_stSpd*_stMult*_stCatchF*0.3; // 타석당 30% 스케일 (매 타석 체크하므로)
      const _stRoll=rand(1,100);
      if(_stRoll<=_stChance){
        matchState.bases[1]=_stR0;matchState.bases[0]=null;
        if(_stR0.ss)_stR0.ss.sb=(_stR0.ss.sb||0)+1;
        addLog(`💨 ${batTeam.concept==='speed'?'[발야구] ':''}${_stR0.name} 도루 성공!`,'hit');
      }else if(_stRoll<=_stChance*1.6){
        matchState.bases[0]=null;matchState.outs++;
        addLog(`🚫 ${_stR0.name} 도루 실패! 포수 송구에 아웃`,'out');
        highlightDefender('C');
      }
    }
    // 2루→3루 도루
    if(matchState.bases[1]&&!matchState.bases[2]&&matchState.outs<3){
      const _stR1=matchState.bases[1];
      const _stSpd1=(statEff(_stR1,'speed'));
      const _st3Chance=_stSpd1*_stMult*_stCatchF*0.12; // 3루 도루는 더 희귀
      const _st3Roll=rand(1,100);
      if(_st3Roll<=_st3Chance){
        matchState.bases[2]=_stR1;matchState.bases[1]=null;
        if(_stR1.ss)_stR1.ss.sb=(_stR1.ss.sb||0)+1;
        addLog(`💨 ${batTeam.concept==='speed'?'[발야구] ':''}${_stR1.name} 2루→3루 도루 성공!`,'hit');
      }else if(_st3Roll<=_st3Chance*1.6){
        matchState.bases[1]=null;matchState.outs++;
        addLog(`🚫 ${_stR1.name} 3루 도루 실패! 포수 송구에 아웃`,'out');
        highlightDefender('C');
      }
    }
  }
  // 3아웃 시 도루로 이닝 종료될 수 있으므로 체크
  if(matchState.outs>=3){
    matchState.outs=0;matchState._prevOuts=0;matchState.bases=[null,null,null];
    if(matchState.half==='top'){matchState.half='bottom';addLog(`── ${matchState.inning}회 말 ──`,'inning');}
    else{
      if(matchState.inning>=9){const aT=matchState.score.away.reduce((a,b)=>a+b,0);const hT=matchState.score.home.reduce((a,b)=>a+b,0);if(aT!==hT){endMatch();return;}matchState.score.away.push(0);matchState.score.home.push(0);}
      matchState.inning++;matchState.half='top';addLog(`── ${matchState.inning}회 초 ──`,'inning');
    }
    updateMatchUI();drawField();setTimeout(simulatePlay,G.matchSpeed);return;
  }

  // ═══════ TTO 1차 판정 ═══════
  const ttoRoll=Math.random();
  const _c1=pHR, _c2=_c1+pK, _c3=_c2+pBB;

  if(ttoRoll<_c1){
    // ── 홈런 ──
    let runs=1,_earnedRuns=1;matchState.bases.forEach((b,i)=>{if(b){runs++;if(!b._errorRunner)_earnedRuns++;matchState.bases[i]=null;}});
    matchState.score[scoreKey][ii]+=runs;matchState.hits[scoreKey]++;
    bs.ab++;bs.h++;bs.hr++;bs.rbi+=runs; ps.ha++; ps.phr++; ps.er+=_earnedRuns;
    bt.ab++;bt.h++;bt.hr++;bt.rbi+=runs; pt.h++; pt.er+=_earnedRuns;
    addLog(`💥 ${batter.name} 홈런! ${runs}점 득점!`,'homerun');
    _flashField('flash-purple');
    batter.popularity=clamp(batter.popularity+rand(2,5),0,100);
  }else if(ttoRoll<_c2){
    // ── 삼진 ──
    bs.ab++;bs.k++; ps.pk++;
    bt.ab++;bt.k++; pt.k++;
    matchState.outs++;addLog(`🔥 ${batter.name} 삼진`,'out');
    _flashField('flash-red');
  }else if(ttoRoll<_c3){
    // ── 볼넷 ──
    batter._errorRunner=false;
    bs.bb++; ps.pbb++; bt.bb++; pt.bb++;
    if(matchState.bases[0]&&matchState.bases[1]&&matchState.bases[2]){
      matchState.score[scoreKey][ii]++;bs.rbi++;bt.rbi++;
      if(!matchState.bases[2]._errorRunner){ps.er++;pt.er++;}
      matchState.bases[2]=matchState.bases[1];
      matchState.bases[1]=matchState.bases[0];
      matchState.bases[0]=batter;
      addLog(`🚶 ${batter.name} 볼넷 (밀어내기!)`,'run');
    }else{
      if(matchState.bases[1]&&matchState.bases[0])matchState.bases[2]=matchState.bases[1];
      if(matchState.bases[0])matchState.bases[1]=matchState.bases[0];
      matchState.bases[0]=batter;addLog(`🚶 ${batter.name} 볼넷`,'hit');
    }
  }else{
    // ═══════ 인플레이 2차 판정 (BABIP + 수비) ═══════
    const ipRoll=Math.random();
    if(ipRoll<pError){
      // ── 수비 에러 → 출루 (에러 기인 주자는 비자책점 처리) ──
      bs.ab++;bt.ab++;
      matchState.errors[fldKey]++;
      if(matchState.bases[2]){
        matchState.score[scoreKey][ii]++;bs.rbi++;bt.rbi++;
        if(!matchState.bases[2]._errorRunner){ps.er++;pt.er++;}
        matchState.bases[2]=null;
      }
      if(matchState.bases[1]){matchState.bases[2]=matchState.bases[1];matchState.bases[1]=null;}
      if(matchState.bases[0]){matchState.bases[1]=matchState.bases[0];matchState.bases[0]=null;}
      batter._errorRunner=true;
      matchState.bases[0]=batter;
      const _errPos=['SS','2B','3B','1B'][rand(0,3)];
      addLog(`⚠️ ${_errPos} 수비 에러! ${batter.name} 출루`,'hit');
      highlightDefender(_errPos);
    }else if(ipRoll<pError+babip){
      // ── BABIP 안타 → 타구 유형 판정 ──
      batter._errorRunner=false;
      matchState.hits[scoreKey]++;
      const hitRoll=Math.random();
      if(hitRoll<tripleRate){
        // ── 3루타 ──
        bs.ab++;bs.h++;bs.xbh++; ps.ha++;
        bt.ab++;bt.h++; pt.h++;
        let r=0,_er=0;matchState.bases.forEach((b,i)=>{if(b){r++;if(!b._errorRunner)_er++;matchState.bases[i]=null;}});
        matchState.bases[2]=batter;matchState.score[scoreKey][ii]+=r;bs.rbi+=r;if(r){ps.er+=_er;bt.rbi+=r;pt.er+=_er;}
        addLog(`🔵 ${batter.name} 3루타!${r?' '+r+'점!':' 진루'}`,r?'run':'hit');
      }else if(hitRoll<tripleRate+doubleRate){
        // ── 2루타 ──
        bs.ab++;bs.h++;bs.xbh++; ps.ha++;
        bt.ab++;bt.h++; pt.h++;
        let r=0,_er2=0;
        if(matchState.bases[2]){r++;if(!matchState.bases[2]._errorRunner)_er2++;matchState.bases[2]=null;}
        if(matchState.bases[1]){r++;if(!matchState.bases[1]._errorRunner)_er2++;matchState.bases[1]=null;}
        if(matchState.bases[0]){
          const _r0=matchState.bases[0];
          if((statEff(_r0,'speed'))>59&&Math.random()*100<(statEff(_r0,'speed'))*armPenalty*0.55){r++;if(!_r0._errorRunner)_er2++;matchState.bases[0]=null;}
          else{matchState.bases[2]=matchState.bases[0];matchState.bases[0]=null;}
        }
        matchState.bases[1]=batter;matchState.score[scoreKey][ii]+=r;bs.rbi+=r;if(r){ps.er+=_er2;bt.rbi+=r;pt.er+=_er2;}
        addLog(`🟡 ${batter.name} 2루타!${r?' '+r+'점!':' 진루'}`,r?'run':'hit');
      }else{
        // ── 단타 ──
        bs.ab++;bs.h++; ps.ha++;
        bt.ab++;bt.h++; pt.h++;
        let r=0,_er1=0;
        if(matchState.bases[2]){r++;if(!matchState.bases[2]._errorRunner)_er1++;matchState.bases[2]=null;}
        if(matchState.bases[1]){
          const _r1=matchState.bases[1];
          if(Math.random()*100<Math.min(75,(statEff(_r1,'speed'))*armPenalty*1.5)){r++;if(!_r1._errorRunner)_er1++;matchState.bases[1]=null;}
          else if(!matchState.bases[2]){matchState.bases[2]=matchState.bases[1];matchState.bases[1]=null;}
        }
        if(matchState.bases[0]){
          const _r0=matchState.bases[0];
          if((statEff(_r0,'speed'))>75&&Math.random()*100<(statEff(_r0,'speed'))*armPenalty*0.35&&!matchState.bases[2]){
            matchState.bases[2]=_r0;
          }else if(!matchState.bases[1]){
            matchState.bases[1]=_r0;
          }else{
            matchState.bases[1]=_r0;
          }
          matchState.bases[0]=null;
        }
        matchState.bases[0]=batter;matchState.score[scoreKey][ii]+=r;bs.rbi+=r;if(r){ps.er+=_er1;bt.rbi+=r;pt.er+=_er1;}
        addLog(`🟢 ${batter.name} 안타!${r?' '+r+'점 득점!':' 출루'}`,r?'run':'hit');
      }
    }else{
      // ── 범타 (아웃) — 땅볼/플라이 판정 ──
      bs.ab++;bt.ab++;
      const outRoll=Math.random();
      if(outRoll<gbRate){
        // ── 땅볼 → 병살타 체크 (타자 Speed ≤45이면 DP 확률 1.4배) ──
        const baseDpChance=fldTeam.concept==='defense'?0.14:0.09;
        const speedDpMod=batSpeed<=42?1.4:batSpeed>=75?0.6:1.0;
        if(matchState.outs<2&&matchState.bases[0]&&Math.random()<baseDpChance*speedDpMod){
          let dpRuns=0,dpER=0;
          if(matchState.outs===0&&matchState.bases[2]){dpRuns++;if(!matchState.bases[2]._errorRunner)dpER++;matchState.bases[2]=null;}
          if(matchState.bases[1]&&!matchState.bases[2]){matchState.bases[2]=matchState.bases[1];matchState.bases[1]=null;}
          matchState.bases[0]=null;
          matchState.outs+=2;
          if(dpRuns){matchState.score[scoreKey][ii]+=dpRuns;bs.rbi+=dpRuns;bt.rbi+=dpRuns;ps.er+=dpER;pt.er+=dpER;}
          addLog(`✌️ ${batter.name} 병살타! 순식간에 2아웃${dpRuns?' ('+dpRuns+'점 허용)':''}`,'out');
          highlightDefender('SS');highlightDefender('2B');
        }else{
          const _gbTo=['SS','2B','3B','1B'][rand(0,3)];
          matchState.outs++;addLog(`❌ ${batter.name} 땅볼 아웃 (${_gbTo})`,'out');
          highlightDefender(_gbTo);
        }
      }else{
        matchState.outs++;
        const _flyTo=['LF','CF','RF'][rand(0,2)];
        const fbType=Math.random()<0.3?'라인드라이브':'플라이';
        addLog(`❌ ${batter.name} ${fbType} 아웃 (${_flyTo})`,'out');
        highlightDefender(_flyTo);
        // ── 희생 플라이: 3루 주자 태그업 득점 (라인드라이브 제외, 2아웃 미만) ──
        if(fbType==='플라이'&&matchState.bases[2]&&matchState.outs<3){
          const _sfRunner=matchState.bases[2];
          const _sfSpd=statEff(_sfRunner,'speed');
          const _sfChance=clamp(0.50+(_sfSpd-50)/330, 0.30, 0.70);
          if(Math.random()<_sfChance){
            matchState.score[scoreKey][ii]++;
            bs.rbi++;bt.rbi++;
            if(!_sfRunner._errorRunner){ps.er++;pt.er++;}
            matchState.bases[2]=null;
            addLog(`✈️ ${batter.name} 희생플라이! ${_sfRunner.name} 홈인`,'run');
          }
        }
      }
      // 도루는 TTO 판정 전에 독립적으로 처리됨 (위쪽 코드 참조)
    }
  }

  matchState.batterIdx[batKey]++;
  matchState.pitchCount[fldKey]++;
  pt.np++; // 투구수 증가
  // NP 기반 스태미나 파생 (투구수/한계투구수 비율)
  const _maxNP=getMaxPitches(pitcher);
  pitcher.currentStamina=Math.max(0,Math.round(100*(1-pt.np/_maxNP)));
  // 투수 이닝 기록: 아웃카운트 정수 누적 (부동소수점 방지)
  const _outsAdded=matchState.outs-matchState._prevOuts;
  if(_outsAdded>0){ps.outs=(ps.outs||0)+_outsAdded;pt.outs+=_outsAdded;}
  matchState._prevOuts=matchState.outs;

  updateMatchUI();drawField();

  if(matchState.outs>=3){
    matchState.outs=0;matchState._prevOuts=0;matchState.bases=[null,null,null];
    if(matchState.half==='top'){matchState.half='bottom';addLog(`── ${matchState.inning}회 말 ──`,'inning');}
    else{
      if(matchState.inning>=9){const aT=matchState.score.away.reduce((a,b)=>a+b,0);const hT=matchState.score.home.reduce((a,b)=>a+b,0);if(aT!==hT){endMatch();return;}matchState.score.away.push(0);matchState.score.home.push(0);}
      matchState.inning++;matchState.half='top';addLog(`── ${matchState.inning}회 초 ──`,'inning');
    }
    if(matchState.half==='bottom'&&matchState.inning>=9){const aT=matchState.score.away.reduce((a,b)=>a+b,0);const hT=matchState.score.home.reduce((a,b)=>a+b,0);if(hT>aT){endMatch();return;}}
    updateMatchUI();drawField();
  }
  if(G.matchInProgress)setTimeout(simulatePlay,G.matchSpeed);
}

function _recordResult(team,didWin){
  if(!team.recentResults)team.recentResults=[];
  team.recentResults.push(didWin?'W':'L');
  if(team.recentResults.length>5)team.recentResults.shift();
  team.streak=(team.streak||0);
  if(didWin)team.streak=team.streak>0?team.streak+1:1;
  else team.streak=team.streak<0?team.streak-1:-1;
}


function endMatch(){
  G.matchInProgress=false;G.gameNum++;
  _accrueServiceDay(); // 부상 롤 이전 — 오늘 출전분 크레딧 보장
  const s=matchState;const awayR=s.score.away.reduce((a,b)=>a+b,0);const homeR=s.score.home.reduce((a,b)=>a+b,0);
  if(homeR>awayR){s.home.wins++;s.away.losses++;_recordResult(s.home,true);_recordResult(s.away,false);}
  else{s.away.wins++;s.home.losses++;_recordResult(s.away,true);_recordResult(s.home,false);}
  s.home.rs+=homeR;s.home.ra+=awayR;s.away.rs+=awayR;s.away.ra+=homeR;
  // BUG FIX: 기존 const won → const isWin 으로 변경 (won() 포매터 함수 shadowing 방지)
  const isWin=(s.home===G.myTeam&&homeR>awayR)||(s.away===G.myTeam&&awayR>homeR);
  addLog(`🏁 경기 종료! ${s.away.name} ${awayR}:${homeR} ${s.home.name} ${isWin?'🎉 승리!':'😢 패배'}`,'inning');

  // ── 투수 W/L/SV/ER/GP 기록 (선발 5이닝 조건) ──
  [['home',homeR,awayR],['away',awayR,homeR]].forEach(([key,rs,ra])=>{
    const spP=s.startingPitcher[key];
    const lastP=s.currentPitcher[key];
    const didWin=rs>ra;
    const spGameOuts=spP&&spP.ss?((spP.ss.outs||0)-(s.spOutsStart[key]||0)):0;
    const relievers=s.relieversUsed[key]||[];
    const lastRelief=relievers.length>0?relievers[relievers.length-1]:null;
    // GP 기록
    if(spP&&spP.ss)spP.ss.gp++;
    relievers.forEach(rp=>{if(rp.ss)rp.ss.gp++;});
    // W/L 기록
    if(didWin){
      // 승리 투수: 선발 5이닝+ → SP에게 W, 아니면 마지막 불펜에게 W
      if(spP&&spP.ss&&spGameOuts>=SP_WIN_MIN_OUTS)spP.ss.w++;
      else if(lastP&&lastP!==spP&&lastP.ss)lastP.ss.w++;
      else if(spP&&spP.ss)spP.ss.w++;
    }else{
      // 패배 투수: 선발 5이닝 미만 → SP에게 L, 5이닝+ → 마지막 릴리버에게 L
      if(spGameOuts<SP_WIN_MIN_OUTS){
        if(spP&&spP.ss)spP.ss.l++;
      }else{
        if(lastRelief&&lastRelief.ss)lastRelief.ss.l++;
        else if(spP&&spP.ss)spP.ss.l++;
      }
    }
    // SV: 승리팀 마지막 투수 (선발이 아니고, 최종 점수차 3점 이하)
    if(didWin&&lastP&&lastP!==spP&&lastP.ss){
      const margin=rs-ra;
      if(margin>=1&&margin<=3)lastP.ss.sv++;
    }
  });

  // Advance rotation
  G.teams.forEach(t=>{const r=getRotation(t).length;if(r>0)t.rotationIdx=(t.rotationIdx+1)%r;});

  // 훈련 쿨타임 감소
  if((G.trainingCooldown||0)>0) G.trainingCooldown--;

  if(isWin)G.myTeam.popularity=clamp(G.myTeam.popularity+rand(1,3),0,100);
  else G.myTeam.popularity=clamp(G.myTeam.popularity-rand(0,2),0,100);
  G.myTeam.roster.forEach(p=>{if(ovr(p)>=84)p.popularity=clamp(p.popularity+rand(0,2),0,100);});
  // 의료 시설 레벨에 따라 컨디션 저하 감소
  const medReduction=Math.floor((G.myTeam.medicalLevel||0)/20);
  const dropMin=Math.max(1,2-medReduction),dropMax=Math.max(dropMin,5-medReduction);
  // _durability 히든 스탯 반영 (1~100): 점진적 컨디션 보정 + 부상 확률
  getStartingBatters(G.myTeam).forEach(p=>{
    const dur=hiddenEff(p,'_durability');
    const durMod=Math.round((dur-50)/15); // -3~+3: 높으면 하락 감소, 낮으면 추가 하락
    p.condition=clamp(p.condition-rand(Math.max(1,dropMin-durMod),Math.max(1,dropMax-durMod)),30,100);
    // 부상: 내구성에 비례한 점진적 확률 (최소 0.67% 보장, 재부상 위험 반영)
    const _injThresh=_injuryThreshold(dur);
    const _injMult=(p._recentILReturn||0)>0?1.5:1.0; // 복귀 직후 재부상 위험 1.5배
    if(p.condition<55 && rand(1,300)<=Math.round(_injThresh*_injMult)){
      const _inj=rollInjuryDuration();
      p.status='il';p.isOnIL=true;p.ilGamesLeft=_inj.games;
      addLog(`🤕 ${p.name} ${_inj.label}! IL ${_inj.games}경기`,'out');
      showToast(`🤕 ${p.name} 부상! (${_inj.label}) IL ${_inj.games}경기`);
    }
    if((p._recentILReturn||0)>0) p._recentILReturn--;
    // 꾸준함 슬럼프 발동/해제 (모든 선수 가능, 꾸준한 선수는 낮은 확률)
    if((p._slumpGames||0)>0){ p._slumpGames--; }
    else{
      const _sg=_rollSlumpOnset(p,G.myTeam);
      if(_sg>0){
        p._slumpGames=_sg;
        addLog(`📉 ${p.name} 슬럼프 돌입! (${_sg}경기)`,'out');
      }
    }
  });
  getBenchBatters(G.myTeam).forEach(p=>{
    p.condition=clamp(p.condition+rand(1,3),30,100);
    if((p._slumpGames||0)>0) p._slumpGames--;
  });
  // ── 투수 컨디션/연투 관리 시스템 (NP 기반) ──
  const _pitchedSet=new Set();
  [s.startingPitcher.home,s.startingPitcher.away,s.currentPitcher.home,s.currentPitcher.away].forEach(p=>{if(p)_pitchedSet.add(p);});
  (s.relieversUsed.home||[]).forEach(p=>_pitchedSet.add(p));
  (s.relieversUsed.away||[]).forEach(p=>_pitchedSet.add(p));

  G.myTeam.roster.filter(p=>p.isPitcher&&p.role!=='overseas'&&(p.status||'active')==='active').forEach(p=>{
    const dur=hiddenEff(p,'_durability');
    const didPitch=_pitchedSet.has(p);

    if(didPitch){
      // 등판: 투구수 비례 컨디션 차감
      const np=(p.today&&p.today.np)||0;
      const maxNp=getMaxPitches(p);
      const npRatio=np/Math.max(1,maxNp);
      // 투구수 50% 이하: -5~10, 50~100%: -10~20, 100%+: -20~30
      let condDrop=npRatio<=0.5?rand(5,10):npRatio<=1.0?rand(10,20):rand(20,30);
      // 연투 페널티 (완화): 2연투 +5, 3연투 +15
      p._consecutiveDaysPitched=(p._consecutiveDaysPitched||0)+1;
      if(p._consecutiveDaysPitched>=3) condDrop+=15;
      else if(p._consecutiveDaysPitched>=2) condDrop+=5;
      p.condition=clamp((p.condition||100)-condDrop,0,100);
    }else{
      // 미등판: 컨디션 회복 + 연투 초기화 (내구성 + 연투회복 히든 반영)
      p.condition=clamp((p.condition||100)+15+_restRecoveryBonus(p),0,100);
      p._consecutiveDaysPitched=0;
    }
    // 투수 부상: 컨디션 40 미만, 최소 확률 보장 + 재부상 위험
    const _pitInjThresh=_injuryThreshold(dur);
    const _pitInjMult=(p._recentILReturn||0)>0?1.5:1.0;
    if(p.condition<40 && rand(1,400)<=Math.round(_pitInjThresh*_pitInjMult)){
      const _inj=rollInjuryDuration();
      p.status='il';p.isOnIL=true;p.ilGamesLeft=_inj.games;
      addLog(`🤕 ${p.name} ${_inj.label}! IL ${_inj.games}경기`,'out');
      showToast(`🤕 ${p.name} 부상! (${_inj.label}) IL ${_inj.games}경기`);
    }
    if((p._recentILReturn||0)>0) p._recentILReturn--;
  });

  // 팬 이벤트 수익 정산
  if(G.myTeam.eventRevenue>0){
    G.myTeam.budget+=G.myTeam.eventRevenue;
    addLog(`💰 팬 이벤트 수익 +${won(G.myTeam.eventRevenue)}`,'hit');
    G.myTeam.eventRevenue=0;
  }
  G.fanEventUsedThisGame=false;

  // 해외연수 복귀 처리 (POT 확장 + 스탯 부스트)
  G.myTeam.roster.forEach(p=>{
    if(p.role==='overseas'&&p.overseasUntil!==null&&G.gameNum>=p.overseasUntil){
      const boost=rand(OVERSEAS_BOOST_MIN,OVERSEAS_BOOST_MAX);
      if(p.isPitcher){const s=pick(['stuff','control','velocity','movement']);p[s]=clamp((p[s]||0)+boost,STAT_MIN,STAT_MAX);}
      else{const s=pick(['contact','power','eye','speed']);p[s]=clamp((p[s]||0)+boost,STAT_MIN,STAT_MAX);}
      p.role=p.prevRole||(p.isPitcher?'bullpen':'bench');
      p.overseasUntil=null;p.prevRole=null;
      addLog(`✈️ ${p.name} 해외 연수 복귀! 능력치 +${boost}`,'hit');
      showToast(`✈️ ${p.name} 복귀! 능력치 +${boost}`);
    }
  });

  simulateOtherGames();
  processPostGame();
  $('btnPlayMatch').disabled=false;$('btnPlayMatch').textContent=G.gameNum>=G.totalGames?'🏆 시즌 결과 보기':'▶ 다음 경기 시작';
  updateHeader();drawField();
  saveGame();
}

