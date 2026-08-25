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

// ── 시리즈 대진표 (8팀 라운드로빈) ──
// 내 팀을 고정축으로 한 circle method. 나머지 7팀을 시리즈마다 한 칸씩 회전시키면
// arr[n]이 항상 others[sIdx%7]가 되어 **getOpponent()와 정의상 일치** → 내 팀 일정은 완전히 보존된다.
// 21시리즈 = 3회 완전 순환 → 28개 대진이 각 3시리즈(9경기)로 균등.
//
// 이전엔 simulateOtherGames가 `teams.filter(...)`의 **배열 인접 인덱스**로 짝을 지어
// 28대진 중 9개만 성립했다(관측: 데빌즈-타이거즈가 한 시즌 45경기 = 시즌의 71%,
// 홈 배정도 세이버스 54 / 드림즈 9). AI 순위표가 실력이 아니라 '누구와 묶였는가'로 결정됐고,
// 드래프트 순서·리그 분배금·구단주 신임도 목표 순위가 전부 그 순위표를 참조한다.
//
// 홈 배정: 내 대진은 기존 isMyTeamHome()을 그대로 쓰고, AI 대진은 3회 맞대결을
// lo → hi → (인덱스합 패리티)로 배분한다 → 팀별 홈 30~33/63 (이상 31.5).
// (전 대진에 `(sIdx+i)` 패리티를 쓰면 팀의 링 위치 k가 라운드 r에 반비례해 (sIdx+k)가
//  라운드로빈 내내 상수가 되어 21~39로 흩어진다 — degenerate.)
function getSeriesPairings(sIdx){
  const others=G.teams.filter(t=>t!==G.myTeam);
  const n=others.length;                            // 7
  const r=((sIdx%n)+n)%n;
  const arr=[G.myTeam];
  for(let k=1;k<=n;k++) arr.push(others[(r+k)%n]);  // arr[n] === getOpponent()
  const idx=t=>G.teams.indexOf(t);
  const pairs=[];
  for(let i=0;i<(n+1)/2;i++){
    const a=arr[i], b=arr[n-i];
    if(i===0){
      pairs.push(sIdx%2===0?{home:a,away:b}:{home:b,away:a}); // = isMyTeamHome()
    }else{
      const lo=idx(a)<idx(b)?a:b, hi=(lo===a)?b:a, m=Math.floor(sIdx/n);
      const home=(m===0)?lo:(m===1)?hi:(((idx(lo)+idx(hi))%2===0)?lo:hi);
      pairs.push({home, away:(home===a)?b:a});
    }
  }
  return pairs;
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
    _prevOuts:0,
    relieversUsed:{home:[],away:[]},
    _seriesIdx:getCurrentSeries(), // 오늘의 시리즈 — endMatch는 G.gameNum++ 뒤라 재계산 불가
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
    if(rnd()<injuryChance){
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

  // ── 상황 컨텍스트 (관전 경로: matchState 기반) → 통합 엔진 resolvePA 입력 ──
  const _park=getParkFactor(matchState.home); // 홈구장 = 양팀 공통
  const hasRISP=!!(matchState.bases[1]||matchState.bases[2]);
  const aTotal=matchState.score.away.reduce((a,b)=>a+b,0);
  const hTotal=matchState.score.home.reduce((a,b)=>a+b,0);
  const inning=matchState.inning||1;
  const scoreDiff=Math.abs(aTotal-hTotal);
  const tiebreakRunner=!!(matchState.bases[0]||matchState.bases[1]||matchState.bases[2])&&scoreDiff<=1;
  const isHighLeverage=inning>=7&&(scoreDiff<=3||hasRISP||tiebreakRunner);
  const _mcBat=1+(MENTAL_COACH_AMP[batTeam.mentalCoachLevel||0]||0); // P2-5 멘탈 코칭 증폭
  const _mcPit=1+(MENTAL_COACH_AMP[fldTeam.mentalCoachLevel||0]||0);

  // ── 수비력 (하프이닝 캐시 — 전환 페널티 포함 평균이 타석마다 재계산되던 것 방지) ──
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

  // ── 통합 타석 판정 (유효스탯+TTO/BABIP+인플레율 단일화 — simHalf/simHalfFull과 동일 엔진) ──
  const _r=resolvePA(batter,pitcher,{
    batConcept:batTeam.concept, fldConcept:fldTeam.concept,
    np:(pitcher.today&&pitcher.today.np)||0, hasRISP, isHighLeverage,
    batMentalAmp:_mcBat, pitMentalAmp:_mcPit, avgFielding, park:_park});
  const pHR=_r.pHR, pK=_r.pK, pBB=_r.pBB, babip=_r.babip, pError=_r.pError;
  const gbRate=_r.gbRate, xbhRate=_r.xbhRate, tripleRate=_r.tripleRate, doubleRate=_r.xbhRate-_r.tripleRate;
  const batSpeed=_r.batSpeed;

  // ── Stats references ──
  const bs=batter.ss||(initSeasonStats(batter),batter.ss);
  const ps=pitcher.ss||(initSeasonStats(pitcher),pitcher.ss);
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
  const ttoRoll=rnd();
  const _c1=pHR, _c2=_c1+pK, _c3=_c2+pBB;

  if(ttoRoll<_c1){
    // ── 홈런 ──
    const _bl=resolveBaserunning('HR',matchState.bases,batter,{});
    const runs=_bl.runs,_earnedRuns=_bl.earned;
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
    bs.bb++; ps.pbb++; bt.bb++; pt.bb++;
    const _bw=resolveBaserunning('BB',matchState.bases,batter,{});
    if(_bw.runs){
      matchState.score[scoreKey][ii]+=_bw.runs;bs.rbi+=_bw.runs;bt.rbi+=_bw.runs;
      ps.er+=_bw.earned;pt.er+=_bw.earned;
      addLog(`🚶 ${batter.name} 볼넷 (밀어내기!)`,'run');
    }else addLog(`🚶 ${batter.name} 볼넷`,'hit');
  }else{
    // ═══════ 인플레이 2차 판정 (BABIP + 수비) ═══════
    const ipRoll=rnd();
    if(ipRoll<pError){
      // ── 수비 에러 → 출루 (에러 기인 주자는 비자책점 처리) ──
      bs.ab++;bt.ab++;
      matchState.errors[fldKey]++;
      const _be=resolveBaserunning('ERROR',matchState.bases,batter,{});
      if(_be.runs){
        matchState.score[scoreKey][ii]+=_be.runs;bs.rbi+=_be.runs;bt.rbi+=_be.runs;
        ps.er+=_be.earned;pt.er+=_be.earned;
      }
      const _errPos=['SS','2B','3B','1B'][rand(0,3)];
      addLog(`⚠️ ${_errPos} 수비 에러! ${batter.name} 출루`,'hit');
      highlightDefender(_errPos);
    }else if(ipRoll<pError+babip){
      // ── BABIP 안타 → 타구 유형·주루 (엔진 위임) ──
      matchState.hits[scoreKey]++;
      const _bh=resolveBaserunning('HIT',matchState.bases,batter,
        {armPenalty, xbhRate:_r.xbhRate, tripleRate});
      bs.ab++;bs.h++; ps.ha++;
      bt.ab++;bt.h++; pt.h++;
      if(_bh.type!=='1B')bs.xbh++;
      if(_bh.runs){
        matchState.score[scoreKey][ii]+=_bh.runs;bs.rbi+=_bh.runs;bt.rbi+=_bh.runs;
        ps.er+=_bh.earned;pt.er+=_bh.earned;
      }
      const _hitLabel=_bh.type==='3B'?'🔵 %s 3루타!':_bh.type==='2B'?'🟡 %s 2루타!':'🟢 %s 안타!';
      const _hitTail=_bh.type==='1B'
        ? (_bh.runs?' '+_bh.runs+'점 득점!':' 출루')
        : (_bh.runs?' '+_bh.runs+'점!':' 진루');
      addLog(_hitLabel.replace('%s',batter.name)+_hitTail, _bh.runs?'run':'hit');
    }else{
      // ── 범타 (아웃) — 땅볼/플라이·병살·희생플라이 (엔진 위임) ──
      bs.ab++;bt.ab++;
      const _bo=resolveBaserunning('OUT',matchState.bases,batter,
        {outs:matchState.outs, gbRate, batSpeed,
         dpBase:fldTeam.concept==='defense'?0.14:0.09});
      matchState.outs+=_bo.outsAdded;
      if(_bo.runs){
        matchState.score[scoreKey][ii]+=_bo.runs;bs.rbi+=_bo.runs;bt.rbi+=_bo.runs;
        ps.er+=_bo.earned;pt.er+=_bo.earned;
      }
      if(_bo.type==='DP'){
        addLog(`✌️ ${batter.name} 병살타! 순식간에 2아웃${_bo.runs?' ('+_bo.runs+'점 허용)':''}`,'out');
        highlightDefender('SS');highlightDefender('2B');
      }else if(_bo.type==='GB'){
        const _gbTo=['SS','2B','3B','1B'][rand(0,3)];
        addLog(`❌ ${batter.name} 땅볼 아웃 (${_gbTo})`,'out');
        highlightDefender(_gbTo);
      }else{
        const _flyTo=['LF','CF','RF'][rand(0,2)];
        addLog(`❌ ${batter.name} ${_bo.isLine?'라인드라이브':'플라이'} 아웃 (${_flyTo})`,'out');
        highlightDefender(_flyTo);
        if(_bo.type==='SF')addLog(`✈️ ${batter.name} 희생플라이! ${_bo.sfRunner.name} 홈인`,'run');
      }
      // 도루는 TTO 판정 전에 독립적으로 처리됨 (위쪽 코드 참조)
    }
  }

  matchState.batterIdx[batKey]++;
  // 투구수: 타석당 실투구수 추정 — 시뮬 경로(match-sim `_simNP`)와 동일 공식으로 단위 정합.
  // (이전엔 타석당 +1이라 투구수 단위인 getMaxPitches(SP=stamina+40≈90~130)·_fatigueDebuff(50구~)와
  //  단위가 어긋나 관전 경기에서만 피로 보정·투구수 강판이 영구 미발동 → 완투 남발·불펜 미사용)
  const _isKorBB=ttoRoll>=_c1&&ttoRoll<_c3; // K(_c1~_c2) 또는 BB(_c2~_c3) — 볼카운트 소모가 큰 타석
  pt.np+=_isKorBB?rand(4,7):rand(2,4);
  // `_simNP`에도 미러링 — 경기 단위 투구수를 3경로가 같은 필드로 갖게 해 경기 후 처리(_aiPitcherRest)가
  // 경로와 무관하게 동작하게 한다. (관전 경로는 today.np를 쓰지만 AI 팀의 today는 갱신되지 않아 스테일)
  pitcher._simNP=pt.np;
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

  // 오늘의 시리즈는 matchState에서 가져온다 — 이 시점엔 G.gameNum이 이미 증가해
  // getCurrentSeries()가 시리즈 경계에서 '내일 대진표'를 반환하기 때문(자동 경로와의 스케줄 비대칭 원인).
  simulateOtherGames(s._seriesIdx);
  processPostGame();
  $('btnPlayMatch').disabled=false;$('btnPlayMatch').textContent=G.gameNum>=G.totalGames?'🏆 시즌 결과 보기':'▶ 다음 경기 시작';
  updateHeader();drawField();
  saveGame();
}

