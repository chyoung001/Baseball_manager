// ===================== MATCH SIM (간이 시뮬 — AI 리그 경기 / 내 팀 자동 진행) =====================

// AI 팀 IL 카운트다운 — processPostGame(내 팀 전용, match-postgame.js)의 AI 대응.
// 복귀는 2군(futures)로 되돌려 1군 정원 초과를 막고, rehabGamesLeft=0으로 두어
// _aiMaintainLineup이 같은 날 즉시 재콜업할 수 있게 한다(AI엔 재활 감산 경로가 없음).
function _aiILCountdown(t){
  t.roster.filter(p=>p.status==='il').forEach(p=>{
    if((p.ilGamesLeft||0)>0) p.ilGamesLeft--;
    if((p.ilGamesLeft||0)<=0){ p.status='futures'; p.isOnIL=false; p.rehabGamesLeft=0; }
  });
}
// AI 팀 투수 경기 후 처리 (컨디션 · 연투) — endMatch/_simMyGame이 내 팀에만 하던 것의 AI 대응.
// 이게 없으면 AI 투수는 condition이 생성 시 초깃값에 영구 고정되고 `_consecutiveDaysPitched`가 항상 0이라
//  ① `_pickReliever`의 필터 2종(3연투 금지 · 컨디션 20 이상)이 AI에겐 완전 사문화되고
//  ② resolvePA의 condFactor(=condition/100)가 비대칭이 된다(내 팀만 등판/휴식에 따라 변동).
// 투구수는 `_simNP`를 단일 소스로 쓴다 — 3경로 모두 경기 시작 시 0으로 리셋하고 타석마다 누적한다.
// (부상 롤은 내 팀 전용 유지 — AI 부상 도입은 별도 밸런스 사안)
function _aiPitcherRest(t){
  if(!t||t===G.myTeam)return;
  getPitchers(t).filter(p=>p.role!=='overseas'&&(p.status||'active')==='active').forEach(p=>{
    const np=p._simNP||0;
    const didPitch=!!p._pitchedThisGame||np>0;
    if(didPitch){
      const npRatio=np/Math.max(1,getMaxPitches(p));
      let condDrop=npRatio<=0.5?rand(5,10):npRatio<=1.0?rand(10,20):rand(20,30);
      p._consecutiveDaysPitched=(p._consecutiveDaysPitched||0)+1;
      if(p._consecutiveDaysPitched>=3) condDrop+=15;
      else if(p._consecutiveDaysPitched>=2) condDrop+=5;
      p.condition=clamp((p.condition||100)-condDrop,0,100);
    }else{
      p.condition=clamp((p.condition||100)+15+_restRecoveryBonus(p),0,100);
      p._consecutiveDaysPitched=0;
    }
  });
}

// `todayOpp` = 오늘 내 팀과 맞붙은 상대. 호출부가 명시적으로 넘긴다.
// 이전엔 내부에서 getOpponent()를 호출했는데, 관전 경로(endMatch)는 `G.gameNum++` 뒤에,
// 자동 경로(_simMyGame)는 앞에 이 함수를 부르기 때문에 시리즈 경계(3경기 중 1회)에서
// 관전 경로만 '내일 상대'를 제외해버렸다 — 그 결과 오늘 상대가 2경기(내 경기+AI 경기),
// 내일 상대가 0경기를 치르는 스케줄 왜곡이 발생했다.
function simulateOtherGames(todayOpp){
  const opp=todayOpp||getOpponent(); // 미지정 시 기존 동작(구세이브·외부 호출 호환)
  // AI IL 카운트다운 + 라인업 유지 — 내 팀 제외 전 구단, 오늘 상대 포함(다음 경기 대비)
  G.teams.forEach(t=>{if(t!==G.myTeam){_aiILCountdown(t);_aiMaintainLineup(t);}});
  const teams=G.teams.filter(t=>t!==G.myTeam&&t!==opp);
  for(let i=0;i<teams.length;i+=2){
    if(i+1<teams.length) _simAIGame(teams[i],teams[i+1]);
  }
  // 오늘 경기를 마친 전 AI 구단(오늘 내 상대 포함)의 투수 피로 정산
  G.teams.forEach(t=>{if(t!==G.myTeam)_aiPitcherRest(t);});
}

// 두 AI팀 간 간이 시뮬 (선수별 기록 누적) — teamA=Home, teamB=Away
function _simAIGame(teamA,teamB){
  const batA=getStartingBatters(teamA), batB=getStartingBatters(teamB);
  const spA=getRotation(teamA), spB=getRotation(teamB);
  const pitA=spA.length>0?spA[teamA.rotationIdx%spA.length]:null;
  const pitB=spB.length>0?spB[teamB.rotationIdx%spB.length]:null;
  // 현재/마지막 투수 — 경기 단위로 유지한다. 이전엔 `curPitA/B` 선언이 이닝 for 루프 안에 있어
  // 매 이닝 선발로 되돌아갔고(릴리버는 1이닝 초과 불가), 불펜 소진 시 탈진한 선발이 마운드에 복귀했다.
  let curPitA=pitA, curPitB=pitB;
  let lastPitA=pitA, lastPitB=pitB;
  let runsA=0,runsB=0;
  const _boA={i:0},_boB={i:0}; // 게임 단위 타순 연속
  const spAOutsBefore=pitA&&pitA.ss?(pitA.ss.outs||0):0;
  const spBOutsBefore=pitB&&pitB.ss?(pitB.ss.outs||0):0;

  // 체력 & NP 세팅 (`_simERBase` = 당일 자책 산출 기준선 — 시즌 누적 ss.er에서 차감해 오늘 실점을 얻는다)
  [teamA,teamB].forEach(t=>getPitchers(t).forEach(p=>{
    p.currentStamina=100; // 경기 시작=풀(%). NP식·시즌 리셋과 동일 스케일
    p._simNP=0;p._pitchedThisGame=false;p._simERBase=(p.ss&&p.ss.er)||0;
  }));
  // 이닝 선두 강판 판정 — 당일 실점을 실제로 전달 (이전엔 0 고정이라 '대량 실점 조기 강판' 규칙이 사문화)
  const _todayER=p=>p?(((p.ss&&p.ss.er)||0)-(p._simERBase||0)):0;

  // 한 하프이닝 TTO+BABIP 간이 시뮬 (공격팀 vs 수비팀) — simulatePlay 공식 통일
  // walkoffTarget>0: 끝내기 상황, runs>=walkoffTarget이면 즉시 종료
  // `inning`/`lead`는 고레버리지 판정용 — 관전 경로(match-flow)와 동일 공식을 쓰기 위해 받는다.
  // `lead`는 **수비(투수)팀 기준** 점수차 (simHalfFull·_pickReliever와 동일 기준으로 통일).
  function simHalf(batTeam,batters,pitcher,fldTeam,inning,lead,walkoffTarget,ord){
    ord=ord||{i:0}; // 타순 연속 (게임 단위 유지 — 이닝마다 1번부터 리셋 금지)
    let outs=0,runs=0,pa=0;
    if(!pitcher||batters.length===0)return rand(0,3);
    const _pf=getParkFactor(teamA); // 홈구장(teamA) 파크팩터 — 양팀 공통
    // 팀 컨셉 보너스는 resolvePA가 ctx.batConcept/fldConcept에서 단일 계산
    // P2-5 멘탈 코칭 증폭 — 관전 경로에만 전달되던 것을 시뮬에도 배선(투자한 시설이 자동 진행에서 무효였다)
    const _mcBat=1+(MENTAL_COACH_AMP[batTeam.mentalCoachLevel||0]||0);
    const _mcPit=1+(MENTAL_COACH_AMP[fldTeam.mentalCoachLevel||0]||0);

    // 수비력 평균 (전환 페널티 반영)
    const fldStarters=fldTeam?getStartingBatters(fldTeam):[];
    const avgFld=fldStarters.length>0?fldStarters.reduce((s,p)=>s+effFielding(p),0)/fldStarters.length:50;

    // 주루 상태 간이 추적
    let bases=[null,null,null];

    while(outs<3&&pa<50){
      const b=batters[ord.i%batters.length];ord.i++;pa++;
      const bs=b.ss||(initSeasonStats(b),b.ss);
      const ps=pitcher.ss||(initSeasonStats(pitcher),pitcher.ss);

      // ── 통합 타석 판정 (관전·자동과 동일 resolvePA) ──
      // 고레버리지 판정은 관전 경로(match-flow)와 동일 공식. 진행 중 득점을 반영해 lead를 갱신한다.
      const _hasRISP=!!(bases[1]||bases[2]);
      const _diff=Math.abs((lead||0)-runs); // 공격팀 득점만큼 수비팀 리드가 감소
      const _tieRunner=!!(bases[0]||bases[1]||bases[2])&&_diff<=1;
      const _hiLev=(inning||1)>=7&&(_diff<=3||_hasRISP||_tieRunner);
      const _r=resolvePA(b,pitcher,{batConcept:batTeam.concept, fldConcept:fldTeam.concept,
        np:pitcher._simNP||0, hasRISP:_hasRISP, isHighLeverage:_hiLev,
        batMentalAmp:_mcBat, pitMentalAmp:_mcPit, avgFielding:avgFld, park:_pf});
      const adjPow=_r.adjPower; // 주루 인플레율(xbh) 재계산 호환
      const _rr=Math.random();
      const result = _rr<_r.pHR?'HR' : _rr<_r.pHR+_r.pK?'K' : _rr<_r.pHR+_r.pK+_r.pBB?'BB'
        : (function(){const ip=Math.random();return ip<_r.pError?'ERROR':ip<_r.pError+_r.babip?'HIT':'OUT';})();

      if(result==='HR'){
        bs.ab++;bs.h++;bs.hr++;ps.ha++;ps.phr++;
        let r=1;bases.forEach((bb,i)=>{if(bb){r++;bases[i]=null;}});
        bs.rbi+=r;ps.er+=r;runs+=r;
      }else if(result==='K'){
        bs.ab++;bs.k++;ps.pk++;outs++;ps.outs=(ps.outs||0)+1;
      }else if(result==='BB'){
        bs.bb++;ps.pbb++;
        if(bases[2]&&bases[1]&&bases[0]){runs++;bs.rbi++;ps.er++;}
        if(bases[1]&&bases[0])bases[2]=bases[1];
        if(bases[0])bases[1]=bases[0];
        bases[0]=b;
      }else if(result==='HIT'||result==='ERROR'){
        bs.ab++;
        if(result==='HIT'){bs.h++;ps.ha++;}
        const xbhChance=clamp(0.20+(adjPow-50)/330,0.10,0.40);
        const tripleChance=(statEff(b,'speed'))>75?0.025:(statEff(b,'speed'))>51?0.012:0.004;
        const hitRoll=Math.random();
        if(hitRoll<tripleChance){
          bs.xbh++;let r=0;bases.forEach((bb,i)=>{if(bb){r++;bases[i]=null;}});
          bases[2]=b;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }else if(hitRoll<xbhChance){
          bs.xbh++;let r=0;
          if(bases[2]){r++;bases[2]=null;}
          if(bases[1]){r++;bases[1]=null;}
          if(bases[0]){const _r0s=(statEff(bases[0],'speed'));if(_r0s>55&&Math.random()*100<_r0s*0.55){r++;bases[0]=null;}else{bases[2]=bases[0];bases[0]=null;}}
          bases[1]=b;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }else{
          let r=0;
          if(bases[2]){r++;bases[2]=null;}
          if(bases[1]){const _r1s=(statEff(bases[1],'speed'));if(Math.random()*100<Math.min(75,_r1s*1.5)){r++;bases[1]=null;}else if(!bases[2]){bases[2]=bases[1];bases[1]=null;}}
          if(bases[0]){if(!bases[1])bases[1]=bases[0];else bases[1]=bases[0];bases[0]=null;}
          bases[0]=b;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }
        if((statEff(b,'speed'))>67&&bases[0]===b&&!bases[1]&&Math.random()<0.12)bs.sb++;
      }else{
        // 범타 아웃 — 땅볼/DP 판정
        bs.ab++;
        const gbRate=_r.gbRate; // 컨셉 gbAdj 포함 — 관전 경로와 병살·땅볼 분포 통일
        if(Math.random()<gbRate){
          const baseDpChance=fldTeam.concept==='defense'?0.14:0.09;
          const speedDpMod=(statEff(b,'speed'))<=42?1.4:(statEff(b,'speed'))>=75?0.6:1.0;
          if(outs<2&&bases[0]&&Math.random()<baseDpChance*speedDpMod){
            let dpRuns=0;
            if(outs===0&&bases[2]){dpRuns++;bases[2]=null;}
            if(bases[1]&&!bases[2]){bases[2]=bases[1];bases[1]=null;}
            bases[0]=null;outs+=2;ps.outs=(ps.outs||0)+2;
            if(dpRuns){ps.er+=dpRuns;runs+=dpRuns;}
          }else{outs++;ps.outs=(ps.outs||0)+1;}
        }else{outs++;ps.outs=(ps.outs||0)+1;}
      }
      pitcher._simNP=(pitcher._simNP||0)+((result==='K'||result==='BB')?rand(4,7):rand(2,4)); // PA당 투구수 추정 — maxNp(투구수)와 단위 정합(간이 경로 강판·피로)
      pitcher.currentStamina=Math.max(0,Math.round(100*(1-pitcher._simNP/getMaxPitches(pitcher))));
      if(walkoffTarget>0&&runs>=walkoffTarget) break;
    }
    return runs;
  }

  // 9이닝 시뮬 (Away=teamB 선공, Home=teamA 후공)
  for(let inn=1;inn<=9;inn++){
    // NP·당일 실점 기반 강판 판정 (shouldHookPitcher 통합)
    if(shouldHookPitcher(curPitA,inn,_todayER(curPitA),teamA.concept)){
      const pickA=_pickReliever(teamA,inn,runsA-runsB);
      if(pickA){curPitA=pickA;lastPitA=pickA;}
    }
    if(shouldHookPitcher(curPitB,inn,_todayER(curPitB),teamB.concept)){
      const pickB=_pickReliever(teamB,inn,runsB-runsA);
      if(pickB){curPitB=pickB;lastPitB=pickB;}
    }
    runsB+=simHalf(teamB,batB,curPitA,teamA,inn,runsA-runsB,0,_boB);
    if(inn===9&&runsA>runsB) break;
    const wotA=inn>=9?(runsB-runsA+1):0;
    runsA+=simHalf(teamA,batA,curPitB,teamB,inn,runsB-runsA,wotA,_boA);
    if(inn>=9&&runsA>runsB) break;
  }

  // 연장전 (10~12회)
  if(runsA===runsB){
    for(let inn=10;inn<=12;inn++){
      if(shouldHookPitcher(curPitA,inn,_todayER(curPitA),teamA.concept)){
        const pickA=_pickReliever(teamA,inn,runsA-runsB);
        if(pickA){curPitA=pickA;lastPitA=pickA;}
      }
      if(shouldHookPitcher(curPitB,inn,_todayER(curPitB),teamB.concept)){
        const pickB=_pickReliever(teamB,inn,runsB-runsA);
        if(pickB){curPitB=pickB;lastPitB=pickB;}
      }
      runsB+=simHalf(teamB,batB,curPitA,teamA,inn,runsA-runsB,0,_boB);
      if(runsA>runsB) break;
      const wotA=runsB-runsA+1;
      runsA+=simHalf(teamA,batA,curPitB,teamB,inn,runsB-runsA,wotA,_boA);
      if(runsA!==runsB) break;
    }
  }
  // 12회까지 동점 → 랜덤 승패 (KBO 무승부 방지)
  if(runsA===runsB){if(Math.random()<0.5)runsA++;else runsB++;}

  // 승패 기록
  const aWin=runsA>runsB;
  if(aWin){teamA.wins++;teamB.losses++;_recordResult(teamA,true);_recordResult(teamB,false);}
  else{teamB.wins++;teamA.losses++;_recordResult(teamB,true);_recordResult(teamA,false);}
  teamA.rs+=runsA;teamA.ra+=runsB;teamB.rs+=runsB;teamB.ra+=runsA;
  if(aWin)teamA.popularity=clamp(teamA.popularity+rand(0,2),0,100);
  else teamB.popularity=clamp(teamB.popularity+rand(0,2),0,100);

  // 투수 GP 기록 — 선발 + 실제 등판한 전 불펜(`_pitchedThisGame` 마킹 && 실투구 발생).
  // 이전엔 '마지막 투수'만 가산해 중간 계투가 IP는 쌓이는데 GP 0으로 남았다
  // (관전 경로의 relieversUsed 전원 가산과 동일 기준으로 정합).
  // `_simNP>0` 조건은 9회 초 교체 예약 후 홈팀 승리로 말공격이 생략돼 실제 등판하지 않은 투수를 제외.
  if(pitA&&pitA.ss)pitA.ss.gp++;
  if(pitB&&pitB.ss)pitB.ss.gp++;
  [teamA,teamB].forEach(t=>getBullpen(t).forEach(p=>{if(p._pitchedThisGame&&(p._simNP||0)>0&&p.ss)p.ss.gp++;}));

  // W/L 기록 (선발 5이닝=15아웃 조건)
  const spAOuts=pitA&&pitA.ss?(pitA.ss.outs||0)-spAOutsBefore:0;
  const spBOuts=pitB&&pitB.ss?(pitB.ss.outs||0)-spBOutsBefore:0;
  if(aWin){
    // 승리 투수 (A팀)
    if(pitA&&pitA.ss&&spAOuts>=SP_WIN_MIN_OUTS)pitA.ss.w++;
    else if(lastPitA&&lastPitA!==pitA&&lastPitA.ss)lastPitA.ss.w++;
    else if(pitA&&pitA.ss)pitA.ss.w++;
    // 패배 투수 (B팀): 선발 5이닝 미만 → SP, 5이닝+ → 마지막 릴리버
    if(spBOuts<SP_WIN_MIN_OUTS){
      if(pitB&&pitB.ss)pitB.ss.l++;
    }else{
      if(lastPitB&&lastPitB!==pitB&&lastPitB.ss)lastPitB.ss.l++;
      else if(pitB&&pitB.ss)pitB.ss.l++;
    }
  }else{
    // 승리 투수 (B팀)
    if(pitB&&pitB.ss&&spBOuts>=SP_WIN_MIN_OUTS)pitB.ss.w++;
    else if(lastPitB&&lastPitB!==pitB&&lastPitB.ss)lastPitB.ss.w++;
    else if(pitB&&pitB.ss)pitB.ss.w++;
    // 패배 투수 (A팀): 선발 5이닝 미만 → SP, 5이닝+ → 마지막 릴리버
    if(spAOuts<SP_WIN_MIN_OUTS){
      if(pitA&&pitA.ss)pitA.ss.l++;
    }else{
      if(lastPitA&&lastPitA!==pitA&&lastPitA.ss)lastPitA.ss.l++;
      else if(pitA&&pitA.ss)pitA.ss.l++;
    }
  }
  // SV: 승리팀 마지막 투수 (선발이 아니고, 실제 등판했고, 최종 점수차 3점 이하)
  const _margin=Math.abs(runsA-runsB);
  const _threw=p=>!!p&&(p._simNP||0)>0; // 교체 예약만 되고 등판 전 경기 종료된 투수 배제
  if(aWin&&lastPitA&&lastPitA!==pitA&&lastPitA.ss&&_threw(lastPitA)&&_margin<=3)lastPitA.ss.sv++;
  if(!aWin&&lastPitB&&lastPitB!==pitB&&lastPitB.ss&&_threw(lastPitB)&&_margin<=3)lastPitB.ss.sv++;
}

// ===================== AUTO-SIM (빠른 진행) =====================
// 내 팀 경기 1게임 즉시 시뮬 (애니메이션 없음)
function _simMyGame(){
  // 페이즈/게임 수 체크 (startMatch와 동일 조건)
  const playablePhases=['first_half','second_half'];
  if(!playablePhases.includes(G.phase))return false;
  if(G.phase==='first_half'&&G.gameNum>=FIRST_HALF_END)return false;
  if(G.gameNum>=TOTAL_REGULAR)return false;

  // 로스터 검증 (최소 로스터 미달이면 중단)
  const rosterCheck=validateActiveRoster(G.myTeam);
  if(!rosterCheck.ok)return false;

  const opp=getOpponent();
  const isHome=isMyTeamHome();
  const homeTeam=isHome?G.myTeam:opp;
  const awayTeam=isHome?opp:G.myTeam;

  // 체력 & NP 세팅 (`_simERBase` = 당일 자책 산출 기준선 — 시즌 누적 ss.er에서 차감해 오늘 실점을 얻는다)
  [homeTeam,awayTeam].forEach(t=>getPitchers(t).forEach(p=>{
    p.currentStamina=100; // 경기 시작=풀(%). NP식·시즌 리셋과 동일 스케일
    p._simNP=0;p._pitchedThisGame=false;p._simERBase=(p.ss&&p.ss.er)||0;
  }));

  // 선발 투수
  const homeSP=getStartingPitcher(homeTeam);
  const awaySP=getStartingPitcher(awayTeam);
  // null 투수 시 simHalfFull 내부의 rand(0,4) 폴백으로 처리됨

  const _boHome={i:0},_boAway={i:0}; // 게임 단위 타순 연속 (컨셉 보너스는 resolvePA가 ctx에서 단일 계산)

  // 각 팀 TTO+BABIP 간이 시뮬 — simulatePlay 공식 통일 + 체력 소모 + 끝내기
  // `pitRef`({p:현재투수, last:마지막투수})로 교체를 호출부에 전파한다. 이전엔 지역 `pitcher`만 바뀌어
  // 다음 하프이닝이 강판된 투수로 되돌아가고, W/L·SV·GP도 실제 마지막 투수와 어긋났다.
  // `inning`/`lead`도 실값을 받는다 — 이전엔 7/0 하드코딩이라 bullpen 컨셉 팀(이닝≥6 조건)이
  // 1번 타자부터 참이 되어 자동 진행 시 선발이 매 하프이닝 즉시 강판(선발 0이닝)됐다.
  function simHalfFull(batTeam,pitcherTeam,inning,lead,pitRef,walkoffTarget,ord){
    ord=ord||{i:0}; // 타순 연속 (게임 단위 유지)
    const batters=getStartingBatters(batTeam);
    let pitcher=pitRef.p;
    if(!pitcher||batters.length===0)return rand(0,4);
    const _pf=getParkFactor(homeTeam); // 홈구장 파크팩터 — 양팀 공통
    const fldStarters=getStartingBatters(pitcherTeam);
    const avgFld=fldStarters.length>0?fldStarters.reduce((s,p)=>s+effFielding(p),0)/fldStarters.length:50;
    // P2-5 멘탈 코칭 증폭 — 관전 경로에만 전달되던 것을 시뮬에도 배선
    const _mcBat=1+(MENTAL_COACH_AMP[batTeam.mentalCoachLevel||0]||0);
    const _mcPit=1+(MENTAL_COACH_AMP[pitcherTeam.mentalCoachLevel||0]||0);

    // 주루 상태 간이 추적
    let bases=[null,null,null];
    let outs=0,runs=0,pa=0;
    while(outs<3&&pa<50){
      // NP·당일 실점 기반 불펜 교체 (shouldHookPitcher 통합) — 교체 시 pitRef로 호출부에 전파
      const _curER=((pitcher.ss&&pitcher.ss.er)||0)-(pitcher._simERBase||0);
      if(shouldHookPitcher(pitcher,inning,_curER,pitcherTeam.concept)){
        const emgPick=_pickReliever(pitcherTeam,inning,lead);
        if(emgPick){pitcher=emgPick;pitcher._simNP=0;pitRef.p=pitcher;pitRef.last=pitcher;}
      }
      const b=batters[ord.i%batters.length];ord.i++;pa++;
      const bs=b.ss||(initSeasonStats(b),b.ss);
      const ps=pitcher.ss||(initSeasonStats(pitcher),pitcher.ss);

      // ── 통합 타석 판정 (관전·AI와 동일 resolvePA) ──
      // 컨셉 보너스(불펜 포함)는 resolvePA가 컨셉에서 단일 계산. 고레버리지 판정도 관전과 동일 공식.
      const _hasRISP=!!(bases[1]||bases[2]);
      const _diff=Math.abs((lead||0)-runs); // 공격팀 득점만큼 수비팀 리드가 감소
      const _tieRunner=!!(bases[0]||bases[1]||bases[2])&&_diff<=1;
      const _hiLev=(inning||1)>=7&&(_diff<=3||_hasRISP||_tieRunner);
      const _r=resolvePA(b,pitcher,{batConcept:batTeam.concept, fldConcept:pitcherTeam.concept,
        np:pitcher._simNP||0, hasRISP:_hasRISP, isHighLeverage:_hiLev,
        batMentalAmp:_mcBat, pitMentalAmp:_mcPit, avgFielding:avgFld, park:_pf});
      const adjPow=_r.adjPower; // 주루 인플레율(xbh) 재계산 호환
      const _rr=Math.random();
      const result = _rr<_r.pHR?'HR' : _rr<_r.pHR+_r.pK?'K' : _rr<_r.pHR+_r.pK+_r.pBB?'BB'
        : (function(){const ip=Math.random();return ip<_r.pError?'ERROR':ip<_r.pError+_r.babip?'HIT':'OUT';})();

      if(result==='HR'){
        bs.ab++;bs.h++;bs.hr++;ps.ha++;ps.phr++;
        let r=1;bases.forEach((bb,i)=>{if(bb){r++;bases[i]=null;}});
        bs.rbi+=r;ps.er+=r;runs+=r;
      }else if(result==='K'){
        bs.ab++;bs.k++;ps.pk++;outs++;ps.outs=(ps.outs||0)+1;
      }else if(result==='BB'){
        bs.bb++;ps.pbb++;
        if(bases[2]&&bases[1]&&bases[0]){runs++;bs.rbi++;ps.er++;}
        if(bases[1]&&bases[0])bases[2]=bases[1];
        if(bases[0])bases[1]=bases[0];
        bases[0]=b;
      }else if(result==='HIT'||result==='ERROR'){
        bs.ab++;
        if(result==='HIT'){bs.h++;ps.ha++;}
        const xbhChance=clamp(0.20+(adjPow-50)/330,0.10,0.40);
        const tripleChance=(statEff(b,'speed'))>75?0.025:(statEff(b,'speed'))>51?0.012:0.004;
        const hitRoll=Math.random();
        if(hitRoll<tripleChance){
          bs.xbh++;let r=0;bases.forEach((bb,i)=>{if(bb){r++;bases[i]=null;}});
          bases[2]=b;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }else if(hitRoll<xbhChance){
          bs.xbh++;let r=0;
          if(bases[2]){r++;bases[2]=null;}
          if(bases[1]){r++;bases[1]=null;}
          if(bases[0]){const _r0s=(statEff(bases[0],'speed'));if(_r0s>55&&Math.random()*100<_r0s*0.55){r++;bases[0]=null;}else{bases[2]=bases[0];bases[0]=null;}}
          bases[1]=b;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }else{
          let r=0;
          if(bases[2]){r++;bases[2]=null;}
          if(bases[1]){const _r1s=(statEff(bases[1],'speed'));if(Math.random()*100<Math.min(75,_r1s*1.5)){r++;bases[1]=null;}else if(!bases[2]){bases[2]=bases[1];bases[1]=null;}}
          if(bases[0]){if(!bases[1])bases[1]=bases[0];else bases[1]=bases[0];bases[0]=null;}
          bases[0]=b;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }
        if((statEff(b,'speed'))>67&&bases[0]===b&&!bases[1]&&Math.random()<0.12)bs.sb++;
      }else{
        // 범타 아웃 — 땅볼/DP 판정
        bs.ab++;
        const gbRate=_r.gbRate; // 컨셉 gbAdj 포함 — 관전 경로와 병살·땅볼 분포 통일
        if(Math.random()<gbRate){
          const baseDpChance=pitcherTeam.concept==='defense'?0.14:0.09;
          const speedDpMod=(statEff(b,'speed'))<=42?1.4:(statEff(b,'speed'))>=75?0.6:1.0;
          if(outs<2&&bases[0]&&Math.random()<baseDpChance*speedDpMod){
            let dpRuns=0;
            if(outs===0&&bases[2]){dpRuns++;bases[2]=null;}
            if(bases[1]&&!bases[2]){bases[2]=bases[1];bases[1]=null;}
            bases[0]=null;outs+=2;ps.outs=(ps.outs||0)+2;
            if(dpRuns){ps.er+=dpRuns;runs+=dpRuns;}
          }else{outs++;ps.outs=(ps.outs||0)+1;}
        }else{outs++;ps.outs=(ps.outs||0)+1;}
      }
      pitcher._simNP=(pitcher._simNP||0)+((result==='K'||result==='BB')?rand(4,7):rand(2,4)); // PA당 투구수 추정 — maxNp(투구수)와 단위 정합(간이 경로 강판·피로)
      pitcher.currentStamina=Math.max(0,Math.round(100*(1-pitcher._simNP/getMaxPitches(pitcher))));
      if(walkoffTarget>0&&runs>=walkoffTarget) break;
    }
    return runs;
  }

  const homeOutsBefore=homeSP&&homeSP.ss?(homeSP.ss.outs||0):0;
  const awayOutsBefore=awaySP&&awaySP.ss?(awaySP.ss.outs||0):0;
  // 투수 참조({p:현재, last:마지막}) — simHalfFull의 이닝 중 교체가 여기로 전파된다
  const pitHome={p:homeSP,last:homeSP}, pitAway={p:awaySP,last:awaySP};
  let runsHome=0,runsAway=0;
  // 이닝 선두 강판 판정 — 당일 실점(시즌 누적 − 경기 시작 기준선)을 실제로 전달
  const _todayER=p=>p?(((p.ss&&p.ss.er)||0)-(p._simERBase||0)):0;
  const _hook=(ref,inn,lead,team)=>{
    if(shouldHookPitcher(ref.p,inn,_todayER(ref.p),team.concept)){
      const pick=_pickReliever(team,inn,lead);
      if(pick){ref.p=pick;ref.last=pick;}
    }
  };

  // 9이닝 시뮬 (Away 선공, Home 후공) — shouldHookPitcher 통합
  for(let inn=1;inn<=9;inn++){
    _hook(pitHome,inn,runsHome-runsAway,homeTeam);
    _hook(pitAway,inn,runsAway-runsHome,awayTeam);
    runsAway+=simHalfFull(awayTeam,homeTeam,inn,runsHome-runsAway,pitHome,0,_boAway);
    if(inn===9&&runsHome>runsAway) break;
    const wot=inn>=9?(runsAway-runsHome+1):0;
    runsHome+=simHalfFull(homeTeam,awayTeam,inn,runsAway-runsHome,pitAway,wot,_boHome);
    if(inn>=9&&runsHome>runsAway) break;
  }

  // 연장전 (10~12회)
  if(runsHome===runsAway){
    for(let inn=10;inn<=12;inn++){
      _hook(pitHome,inn,runsHome-runsAway,homeTeam);
      _hook(pitAway,inn,runsAway-runsHome,awayTeam);
      runsAway+=simHalfFull(awayTeam,homeTeam,inn,runsHome-runsAway,pitHome,0,_boAway);
      if(runsHome>runsAway) break;
      const wot=runsAway-runsHome+1;
      runsHome+=simHalfFull(homeTeam,awayTeam,inn,runsAway-runsHome,pitAway,wot,_boHome);
      if(runsHome!==runsAway) break;
    }
  }
  if(runsHome===runsAway){if(Math.random()<0.5)runsHome++;else runsAway++;}

  // 승패 기록
  const homeWin=runsHome>runsAway;
  if(homeWin){homeTeam.wins++;awayTeam.losses++;_recordResult(homeTeam,true);_recordResult(awayTeam,false);}
  else{awayTeam.wins++;homeTeam.losses++;_recordResult(awayTeam,true);_recordResult(homeTeam,false);}
  homeTeam.rs+=runsHome;homeTeam.ra+=runsAway;awayTeam.rs+=runsAway;awayTeam.ra+=runsHome;

  const myWon=(homeTeam===G.myTeam&&homeWin)||(awayTeam===G.myTeam&&!homeWin);
  if(myWon)G.myTeam.popularity=clamp(G.myTeam.popularity+rand(1,3),0,100);
  else G.myTeam.popularity=clamp(G.myTeam.popularity-rand(0,2),0,100);
  G.myTeam.roster.forEach(p=>{if((p.popularity||0)>=30)p.popularity=clamp(p.popularity+rand(0,1),0,100);});

  // 투수 W/L/GP (선발 5이닝=15아웃 조건 + 불펜 연동)
  const homeGameOuts=homeSP&&homeSP.ss?(homeSP.ss.outs||0)-homeOutsBefore:0;
  const awayGameOuts=awaySP&&awaySP.ss?(awaySP.ss.outs||0)-awayOutsBefore:0;
  // GP: 선발 + 실제 등판한 전 불펜(`_pitchedThisGame` && 실투구 발생) — _simAIGame과 동일 기준
  if(homeSP&&homeSP.ss)homeSP.ss.gp++;
  if(awaySP&&awaySP.ss)awaySP.ss.gp++;
  [homeTeam,awayTeam].forEach(t=>getBullpen(t).forEach(p=>{if(p._pitchedThisGame&&(p._simNP||0)>0&&p.ss)p.ss.gp++;}));
  // 마지막 등판 투수 — simHalfFull의 이닝 중 교체까지 반영된 실제 최종 투수 (이전엔 스테일)
  const lastPitHome=pitHome.last, lastPitAway=pitAway.last;
  if(homeWin){
    if(homeSP&&homeSP.ss&&homeGameOuts>=SP_WIN_MIN_OUTS)homeSP.ss.w++;
    else if(lastPitHome&&lastPitHome!==homeSP&&lastPitHome.ss)lastPitHome.ss.w++;
    else if(homeSP&&homeSP.ss)homeSP.ss.w++;
    // 패배 투수: SP가 5이닝 미만이면 SP에게 L, 아니면 마지막 구원투수에게 L
    if(awayGameOuts<SP_WIN_MIN_OUTS){
      if(awaySP&&awaySP.ss)awaySP.ss.l++;
    }else{
      if(lastPitAway&&lastPitAway!==awaySP&&lastPitAway.ss)lastPitAway.ss.l++;
      else if(awaySP&&awaySP.ss)awaySP.ss.l++;
    }
  }else{
    if(awaySP&&awaySP.ss&&awayGameOuts>=SP_WIN_MIN_OUTS)awaySP.ss.w++;
    else if(lastPitAway&&lastPitAway!==awaySP&&lastPitAway.ss)lastPitAway.ss.w++;
    else if(awaySP&&awaySP.ss)awaySP.ss.w++;
    // 패배 투수: SP가 5이닝 미만이면 SP에게 L, 아니면 마지막 구원투수에게 L
    if(homeGameOuts<SP_WIN_MIN_OUTS){
      if(homeSP&&homeSP.ss)homeSP.ss.l++;
    }else{
      if(lastPitHome&&lastPitHome!==homeSP&&lastPitHome.ss)lastPitHome.ss.l++;
      else if(homeSP&&homeSP.ss)homeSP.ss.l++;
    }
  }
  // SV: 승리팀 마지막 투수 (선발이 아니고, 실제 등판했고, 최종 점수차 3점 이하)
  const _myMargin=Math.abs(runsHome-runsAway);
  const _threw=p=>!!p&&(p._simNP||0)>0; // 교체 예약만 되고 등판 전 경기 종료된 투수 배제
  if(homeWin&&lastPitHome&&lastPitHome!==homeSP&&lastPitHome.ss&&_threw(lastPitHome)&&_myMargin>=1&&_myMargin<=3)lastPitHome.ss.sv++;
  if(!homeWin&&lastPitAway&&lastPitAway!==awaySP&&lastPitAway.ss&&_threw(lastPitAway)&&_myMargin>=1&&_myMargin<=3)lastPitAway.ss.sv++;

  // 선발 로테이션 전진
  G.teams.forEach(t=>{const r=getRotation(t).length;if(r>0)t.rotationIdx=(t.rotationIdx+1)%r;});

  // 훈련 쿨타임 감소
  if((G.trainingCooldown||0)>0) G.trainingCooldown--;

  _accrueServiceDay(); // 부상 롤 이전 — 오늘 출전분 크레딧 보장 (간이 시뮬 경로)

  // 컨디션 감소 (내 팀)
  const medReduction=Math.floor((G.myTeam.medicalLevel||0)/20);
  const dropMin=Math.max(1,2-medReduction),dropMax=Math.max(dropMin,5-medReduction);
  getStartingBatters(G.myTeam).forEach(p=>{
    const dur=hiddenEff(p,'_durability');
    const durMod=Math.round((dur-50)/15);
    p.condition=clamp(p.condition-rand(Math.max(1,dropMin-durMod),Math.max(1,dropMax-durMod)),30,100);
    const _injMult=(p._recentILReturn||0)>0?1.5:1.0; // 복귀 직후 재부상 위험 (실경기와 동일)
    if(p.condition<55&&rand(1,300)<=Math.round(_injuryThreshold(dur)*_injMult)){const _inj=rollInjuryDuration();p.status='il';p.isOnIL=true;p.ilGamesLeft=_inj.games;}
    if((p._recentILReturn||0)>0) p._recentILReturn--;
    if((p._slumpGames||0)>0) p._slumpGames--;
    else{const _sg=_rollSlumpOnset(p,G.myTeam);if(_sg>0)p._slumpGames=_sg;} // 실경기와 동일 공식으로 통일
  });
  getBenchBatters(G.myTeam).forEach(p=>{
    p.condition=clamp(p.condition+rand(1,3),30,100);
    if((p._slumpGames||0)>0) p._slumpGames--;
  });
  // 투수 컨디션/연투 관리 (endMatch와 동일한 NP 기반 시스템)
  const pitchedToday=new Set();
  pitchedToday.add(homeSP);pitchedToday.add(awaySP);
  G.myTeam.roster.filter(p=>p.isPitcher&&p.role!=='overseas'&&(p.status||'active')==='active').forEach(p=>{
    const dur=hiddenEff(p,'_durability');
    const didPitch=pitchedToday.has(p)||(p._simNP>0);
    if(didPitch){
      const np=p._simNP||0;
      const maxNp=getMaxPitches(p);
      const npRatio=np/Math.max(1,maxNp);
      let condDrop=npRatio<=0.5?rand(5,10):npRatio<=1.0?rand(10,20):rand(20,30);
      p._consecutiveDaysPitched=(p._consecutiveDaysPitched||0)+1;
      if(p._consecutiveDaysPitched>=3) condDrop+=15;
      else if(p._consecutiveDaysPitched>=2) condDrop+=5;
      p.condition=clamp((p.condition||100)-condDrop,0,100);
    }else{
      p.condition=clamp((p.condition||100)+15+_restRecoveryBonus(p),0,100);
      p._consecutiveDaysPitched=0;
    }
    const _pitInjMult=(p._recentILReturn||0)>0?1.5:1.0; // 복귀 직후 재부상 위험 (실경기와 동일)
    if(p.condition<40&&rand(1,400)<=Math.round(_injuryThreshold(dur)*_pitInjMult)){const _inj=rollInjuryDuration();p.status='il';p.isOnIL=true;p.ilGamesLeft=_inj.games;}
    if((p._recentILReturn||0)>0) p._recentILReturn--;
  });

  // 해외연수 복귀
  G.myTeam.roster.forEach(p=>{
    if(p.role==='overseas'&&p.overseasUntil!==null&&G.gameNum>=p.overseasUntil){
      const boost=rand(OVERSEAS_BOOST_MIN,OVERSEAS_BOOST_MAX);
      if(p.isPitcher){const s=pick(['stuff','control','velocity','movement']);p[s]=clamp((p[s]||0)+boost,STAT_MIN,STAT_MAX);}
      else{const s=pick(['contact','power','eye','speed']);p[s]=clamp((p[s]||0)+boost,STAT_MIN,STAT_MAX);}
      p.role=p.prevRole||(p.isPitcher?'bullpen':'bench');
      p.overseasUntil=null;p.prevRole=null;
    }
  });

  // 팬 이벤트 수익 정산
  if(G.myTeam.eventRevenue>0){G.myTeam.budget+=G.myTeam.eventRevenue;G.myTeam.eventRevenue=0;}
  G.fanEventUsedThisGame=false;

  simulateOtherGames(opp); // 오늘 상대 명시 (여기선 G.gameNum 증가 전이라 값은 동일하나 의도를 고정)
  processPostGame();
  G.gameNum++;

  return myWon;
}
