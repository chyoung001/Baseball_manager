// ===================== MATCH SIM (간이 시뮬 — AI 리그 경기 / 내 팀 자동 진행) =====================

function simulateOtherGames(){
  // AI 라인업 유지 (부상 이탈 보충) — 내 팀 제외 전 구단, 오늘 상대 포함(다음 경기 대비)
  G.teams.forEach(t=>{if(t!==G.myTeam)_aiMaintainLineup(t);});
  const teams=G.teams.filter(t=>t!==G.myTeam&&t!==getOpponent());
  for(let i=0;i<teams.length;i+=2){
    if(i+1<teams.length) _simAIGame(teams[i],teams[i+1]);
  }
}

// 두 AI팀 간 간이 시뮬 (선수별 기록 누적) — teamA=Home, teamB=Away
function _simAIGame(teamA,teamB){
  const batA=getStartingBatters(teamA), batB=getStartingBatters(teamB);
  const spA=getRotation(teamA), spB=getRotation(teamB);
  const pitA=spA.length>0?spA[teamA.rotationIdx%spA.length]:null;
  const pitB=spB.length>0?spB[teamB.rotationIdx%spB.length]:null;
  let lastPitA=pitA, lastPitB=pitB;
  let runsA=0,runsB=0;
  const _boA={i:0},_boB={i:0}; // 게임 단위 타순 연속
  const spAOutsBefore=pitA&&pitA.ss?(pitA.ss.outs||0):0;
  const spBOutsBefore=pitB&&pitB.ss?(pitB.ss.outs||0):0;

  // 체력 & NP 세팅
  [teamA,teamB].forEach(t=>getPitchers(t).forEach(p=>{
    const base=statEff(p,'stamina')+rand(0,10); // Tier3 — 투구 한계(getMaxPitches)와 동일 티어
    const bonus=(t.concept==='bullpen'&&p.role==='bullpen')?Math.round(base*0.2):0;
    p.currentStamina=Math.min(100,base+bonus);
    p._simNP=0;p._pitchedThisGame=false;
  }));

  // 한 하프이닝 TTO+BABIP 간이 시뮬 (공격팀 vs 수비팀) — simulatePlay 공식 통일
  // walkoffTarget>0: 끝내기 상황, runs>=walkoffTarget이면 즉시 종료
  function simHalf(batTeam,batters,pitcher,fldTeam,walkoffTarget,ord){
    ord=ord||{i:0}; // 타순 연속 (게임 단위 유지 — 이닝마다 1번부터 리셋 금지)
    let outs=0,runs=0,pa=0;
    if(!pitcher||batters.length===0)return rand(0,3);

    // 팀 컨셉 보너스
    let batBonus=0,pitBonus=0;
    if(batTeam.concept==='contact_hit')batBonus+=4;
    if(batTeam.concept==='speed')batBonus+=3;
    if(batTeam.concept==='sabermetrics')batBonus+=3;
    if(batTeam.concept==='prospect')batBonus+=2;
    if(fldTeam.concept==='power_hit')pitBonus+=5;
    if(fldTeam.concept==='defense')pitBonus+=4;
    if(fldTeam.concept==='pitching')pitBonus+=4;
    if(fldTeam.concept==='bullpen'&&pitcher.role==='bullpen')pitBonus+=5;

    // 수비력 평균 (전환 페널티 반영)
    const fldStarters=fldTeam?getStartingBatters(fldTeam):[];
    const avgFld=fldStarters.length>0?fldStarters.reduce((s,p)=>s+effFielding(p),0)/fldStarters.length:50;

    // 주루 상태 간이 추적
    let bases=[null,null,null];

    while(outs<3&&pa<50){
      const b=batters[ord.i%batters.length];ord.i++;pa++;
      const bs=b.ss||(b.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});
      const ps=pitcher.ss||(pitcher.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});

      // 슬럼프 보정
      const isSlumping=(b.condition||100)<SLUMP_CONDITION_THRESHOLD;
      const slumpDebuff=isSlumping?SLUMP_DEBUFF:0;
      // 상한 미적용 — Tier3 소프트캡(125)은 statEff가 관리, 실경기 경로와 동일 (구 clamp 100은 특성 보정 차단)
      const adjCon=Math.max(1,statEff(b,'contact')+batBonus-slumpDebuff);
      const adjPow=Math.max(1,statEff(b,'power')+batBonus*0.5-slumpDebuff*0.8);
      const adjEye=Math.max(1,statEff(b,'eye')+batBonus*0.3);

      // 투수 유효 스탯 (체력 기반 피로도)
      const stamF=pitcher.currentStamina<=5?0.40:pitcher.currentStamina<25?0.75:pitcher.currentStamina<50?0.88:1.0;
      const velMult=1+((statEff(pitcher,'velocity'))/400);
      const effStuff=((statEff(pitcher,'stuff'))+pitBonus)*velMult*stamF;
      const effControl=((statEff(pitcher,'control'))+pitBonus*0.5)*stamF;
      const effMovement=((statEff(pitcher,'movement'))+pitBonus*0.3)*velMult*stamF;

      // 동적 회귀 + TTO 판정
      const reg=_calcRegression(b,pitcher);
      const result=_ttoSimAB(adjPow,adjCon,adjEye,effStuff,effControl,effMovement,avgFld,reg.hitMod);

      if(result==='HR'){
        bs.ab++;bs.h++;bs.hr++;ps.ha++;
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
        const gbRate=clamp(0.45+(effMovement-adjPow)/330,0.30,0.65);
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
      pitcher._simNP=(pitcher._simNP||0)+1;
      pitcher.currentStamina=Math.max(0,Math.round(100*(1-pitcher._simNP/getMaxPitches(pitcher))));
      if(walkoffTarget>0&&runs>=walkoffTarget) break;
    }
    return runs;
  }

  // 9이닝 시뮬 (Away=teamB 선공, Home=teamA 후공)
  for(let inn=1;inn<=9;inn++){
    let curPitA=pitA, curPitB=pitB;
    // NP 기반 강판 판정 (shouldHookPitcher 통합)
    if(shouldHookPitcher(curPitA,inn,0,teamA.concept)){
      const pickA=_pickReliever(teamA,inn,runsA-runsB);
      if(pickA){curPitA=pickA;lastPitA=pickA;}
    }
    if(shouldHookPitcher(curPitB,inn,0,teamB.concept)){
      const pickB=_pickReliever(teamB,inn,runsB-runsA);
      if(pickB){curPitB=pickB;lastPitB=pickB;}
    }
    runsB+=simHalf(teamB,batB,curPitA,teamA,0,_boB);
    if(inn===9&&runsA>runsB) break;
    const wotA=inn>=9?(runsB-runsA+1):0;
    runsA+=simHalf(teamA,batA,curPitB,teamB,wotA,_boA);
    if(inn>=9&&runsA>runsB) break;
  }

  // 연장전 (10~12회)
  if(runsA===runsB){
    for(let inn=10;inn<=12;inn++){
      let curPitA=pitA, curPitB=pitB;
      if(shouldHookPitcher(curPitA,inn,0,teamA.concept)){
        const pickA=_pickReliever(teamA,inn,runsA-runsB);
        if(pickA){curPitA=pickA;lastPitA=pickA;}
      }
      if(shouldHookPitcher(curPitB,inn,0,teamB.concept)){
        const pickB=_pickReliever(teamB,inn,runsB-runsA);
        if(pickB){curPitB=pickB;lastPitB=pickB;}
      }
      runsB+=simHalf(teamB,batB,curPitA,teamA,0,_boB);
      if(runsA>runsB) break;
      const wotA=runsB-runsA+1;
      runsA+=simHalf(teamA,batA,curPitB,teamB,wotA,_boA);
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

  // 투수 GP 기록
  if(pitA&&pitA.ss)pitA.ss.gp++;
  if(pitB&&pitB.ss)pitB.ss.gp++;
  if(lastPitA&&lastPitA!==pitA&&lastPitA.ss)lastPitA.ss.gp++;
  if(lastPitB&&lastPitB!==pitB&&lastPitB.ss)lastPitB.ss.gp++;

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
  // SV: 승리팀 마지막 투수 (선발이 아니고, 최종 점수차 3점 이하)
  const _margin=Math.abs(runsA-runsB);
  if(aWin&&lastPitA&&lastPitA!==pitA&&lastPitA.ss&&_margin<=3)lastPitA.ss.sv++;
  if(!aWin&&lastPitB&&lastPitB!==pitB&&lastPitB.ss&&_margin<=3)lastPitB.ss.sv++;
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

  // 체력 & NP 세팅
  [homeTeam,awayTeam].forEach(t=>getPitchers(t).forEach(p=>{
    const base=statEff(p,'stamina')+rand(0,10); // Tier3 — 투구 한계(getMaxPitches)와 동일 티어
    const bonus=(t.concept==='bullpen'&&p.role==='bullpen')?Math.round(base*0.2):0;
    p.currentStamina=Math.min(100,base+bonus);
    p._simNP=0;p._pitchedThisGame=false;
  }));

  // 선발 투수
  const homeSP=getStartingPitcher(homeTeam);
  const awaySP=getStartingPitcher(awayTeam);
  // null 투수 시 simHalfFull 내부의 rand(0,4) 폴백으로 처리됨

  // 컨셉 보정 (startMatch와 동일)
  let batBonusHome=0,pitBonusHome=0,batBonusAway=0,pitBonusAway=0;
  if(homeTeam.concept==='contact_hit')batBonusHome+=4;
  if(homeTeam.concept==='speed')batBonusHome+=3;
  if(homeTeam.concept==='sabermetrics')batBonusHome+=3;
  if(homeTeam.concept==='prospect')batBonusHome+=2;
  if(awayTeam.concept==='contact_hit')batBonusAway+=4;
  if(awayTeam.concept==='speed')batBonusAway+=3;
  if(awayTeam.concept==='sabermetrics')batBonusAway+=3;
  if(awayTeam.concept==='prospect')batBonusAway+=2;
  if(homeTeam.concept==='power_hit')pitBonusHome+=5;
  if(homeTeam.concept==='defense')pitBonusHome+=4;
  if(homeTeam.concept==='pitching')pitBonusHome+=4;
  if(awayTeam.concept==='power_hit')pitBonusAway+=5;
  if(awayTeam.concept==='defense')pitBonusAway+=4;
  if(awayTeam.concept==='pitching')pitBonusAway+=4;

  const _boHome={i:0},_boAway={i:0}; // 게임 단위 타순 연속

  // 각 팀 TTO+BABIP 간이 시뮬 — simulatePlay 공식 통일 + 체력 소모 + 끝내기
  function simHalfFull(batTeam,pitcherTeam,batBonus,pitBonus,curPitcher,walkoffTarget,ord){
    ord=ord||{i:0}; // 타순 연속 (게임 단위 유지)
    const batters=getStartingBatters(batTeam);
    let pitcher=curPitcher;
    if(!pitcher||batters.length===0)return rand(0,4);
    const fldStarters=getStartingBatters(pitcherTeam);
    const avgFld=fldStarters.length>0?fldStarters.reduce((s,p)=>s+effFielding(p),0)/fldStarters.length:50;

    // 주루 상태 간이 추적
    let bases=[null,null,null];
    let outs=0,runs=0,pa=0;
    while(outs<3&&pa<50){
      // NP 기반 불펜 교체 (shouldHookPitcher 통합)
      if(shouldHookPitcher(pitcher,7,0,pitcherTeam.concept)){
        const emgPick=_pickReliever(pitcherTeam,7,0);
        if(emgPick){pitcher=emgPick;pitcher._simNP=0;}
      }
      const b=batters[ord.i%batters.length];ord.i++;pa++;
      const bs=b.ss||(b.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});
      const ps=pitcher.ss||(pitcher.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});

      // 슬럼프/재활 보정
      const isSlumping=(b.condition||100)<SLUMP_CONDITION_THRESHOLD;
      const slumpDebuff=isSlumping?SLUMP_DEBUFF:0;
      const rehabDebuff=(b.rehabGamesLeft||0)>0?REHAB_DEBUFF:0;
      const totalDebuff=slumpDebuff+rehabDebuff;
      // 상한 미적용 — Tier3 소프트캡(125)은 statEff가 관리 (실경기 경로와 동일)
      const adjCon=Math.max(1,statEff(b,'contact')+batBonus-totalDebuff);
      const adjPow=Math.max(1,statEff(b,'power')+batBonus*0.5-totalDebuff*0.8);
      const adjEye=Math.max(1,statEff(b,'eye')+batBonus*0.3);

      // 투수 유효 스탯 (불펜 컨셉 보너스 포함)
      const bpBonus=(pitcherTeam.concept==='bullpen'&&pitcher.role==='bullpen')?5:0;
      const stamF=pitcher.currentStamina<=5?0.40:pitcher.currentStamina<25?0.75:pitcher.currentStamina<50?0.88:1.0;
      const velMult=1+((statEff(pitcher,'velocity'))/400);
      const effStuff=((statEff(pitcher,'stuff'))+pitBonus+bpBonus)*velMult*stamF;
      const effControl=((statEff(pitcher,'control'))+(pitBonus+bpBonus)*0.5)*stamF;
      const effMovement=((statEff(pitcher,'movement'))+(pitBonus+bpBonus)*0.3)*velMult*stamF;

      // 동적 회귀 + TTO 판정
      const reg=_calcRegression(b,pitcher);
      const result=_ttoSimAB(adjPow,adjCon,adjEye,effStuff,effControl,effMovement,avgFld,reg.hitMod);

      if(result==='HR'){
        bs.ab++;bs.h++;bs.hr++;ps.ha++;
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
        const gbRate=clamp(0.45+(effMovement-adjPow)/330,0.30,0.65);
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
      pitcher._simNP=(pitcher._simNP||0)+1;
      pitcher.currentStamina=Math.max(0,Math.round(100*(1-pitcher._simNP/getMaxPitches(pitcher))));
      if(walkoffTarget>0&&runs>=walkoffTarget) break;
    }
    return runs;
  }

  const homeOutsBefore=homeSP&&homeSP.ss?(homeSP.ss.outs||0):0;
  const awayOutsBefore=awaySP&&awaySP.ss?(awaySP.ss.outs||0):0;
  let curPitHome=homeSP, curPitAway=awaySP;
  let lastPitHome=homeSP, lastPitAway=awaySP;
  let runsHome=0,runsAway=0;

  // 9이닝 시뮬 (Away 선공, Home 후공) — shouldHookPitcher 통합
  for(let inn=1;inn<=9;inn++){
    if(shouldHookPitcher(curPitHome,inn,0,homeTeam.concept)){
      const pickH=_pickReliever(homeTeam,inn,runsHome-runsAway);
      if(pickH){curPitHome=pickH;lastPitHome=pickH;}
    }
    if(shouldHookPitcher(curPitAway,inn,0,awayTeam.concept)){
      const pickA=_pickReliever(awayTeam,inn,runsAway-runsHome);
      if(pickA){curPitAway=pickA;lastPitAway=pickA;}
    }
    runsAway+=simHalfFull(awayTeam,homeTeam,batBonusAway,pitBonusHome,curPitHome,0,_boAway);
    if(inn===9&&runsHome>runsAway) break;
    const wot=inn>=9?(runsAway-runsHome+1):0;
    runsHome+=simHalfFull(homeTeam,awayTeam,batBonusHome,pitBonusAway,curPitAway,wot,_boHome);
    if(inn>=9&&runsHome>runsAway) break;
  }

  // 연장전 (10~12회)
  if(runsHome===runsAway){
    for(let inn=10;inn<=12;inn++){
      if(shouldHookPitcher(curPitHome,inn,0,homeTeam.concept)){
        const pickH=_pickReliever(homeTeam,inn,runsHome-runsAway);
        if(pickH){curPitHome=pickH;lastPitHome=pickH;}
      }
      if(shouldHookPitcher(curPitAway,inn,0,awayTeam.concept)){
        const pickA=_pickReliever(awayTeam,inn,runsAway-runsHome);
        if(pickA){curPitAway=pickA;lastPitAway=pickA;}
      }
      runsAway+=simHalfFull(awayTeam,homeTeam,batBonusAway,pitBonusHome,curPitHome,0,_boAway);
      if(runsHome>runsAway) break;
      const wot=runsAway-runsHome+1;
      runsHome+=simHalfFull(homeTeam,awayTeam,batBonusHome,pitBonusAway,curPitAway,wot,_boHome);
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
  if(homeSP&&homeSP.ss)homeSP.ss.gp++;
  if(awaySP&&awaySP.ss)awaySP.ss.gp++;
  if(lastPitHome&&lastPitHome!==homeSP&&lastPitHome.ss)lastPitHome.ss.gp++;
  if(lastPitAway&&lastPitAway!==awaySP&&lastPitAway.ss)lastPitAway.ss.gp++;
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
  const _myMargin=Math.abs(runsHome-runsAway);
  if(homeWin&&lastPitHome&&lastPitHome!==homeSP&&lastPitHome.ss&&_myMargin>=1&&_myMargin<=3)lastPitHome.ss.sv++;
  if(!homeWin&&lastPitAway&&lastPitAway!==awaySP&&lastPitAway.ss&&_myMargin>=1&&_myMargin<=3)lastPitAway.ss.sv++;

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
    if(p.condition<55&&rand(1,300)<=Math.round(_injuryThreshold(dur)*_injMult)){p.status='il';p.isOnIL=true;p.ilGamesLeft=rand(5,15);}
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
    if(p.condition<40&&rand(1,400)<=Math.round(_injuryThreshold(dur)*_pitInjMult)){p.status='il';p.isOnIL=true;p.ilGamesLeft=rand(5,15);}
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

  simulateOtherGames();
  processPostGame();
  G.gameNum++;

  // 9월 확대 엔트리
  if(G.phase==='second_half'&&G.gameNum===EXPANDED_ENTRY_START){
    showToast('📋 9월 확대 엔트리! 1군 최대 32명');
  }

  return myWon;
}
