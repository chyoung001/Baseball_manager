// ===================== MATCH FLOW (게임 루프 / 규칙 / 시뮬) =====================
// 게임 진행 흐름: startMatch → simulatePlay → endMatch, AI 시뮬, 포스트게임 처리
// 의존: match-state.js, match-engine.js, match-ui.js, helpers.js, state.js, constants.js

function getOpponent(){
  const o=G.teams.filter(t=>t!==G.myTeam);
  return o[G.gameNum%o.length];
}

function getStartingPitcher(team){
  const rot=getRotation(team);
  if(rot.length===0)return getPitchers(team)[0];
  return rot[team.rotationIdx%rot.length];
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
  // 확대 엔트리 알림 (페이즈 변경 없이 toast만)
  if(G.phase==='second_half'&&G.gameNum===EXPANDED_ENTRY_START){
    showToast('📋 9월 확대 엔트리! 1군 최대 32명');
  }
  // ── 최소 로스터 규정 체크 ──
  const rosterCheck=validateActiveRoster(G.myTeam);
  if(!rosterCheck.ok){
    const msg='⚠️ 경기를 시작할 수 없습니다!\n\n최소 로스터 규정 위반:\n• '+rosterCheck.violations.join('\n• ')+'\n\n로스터 탭에서 2군 선수를 콜업하세요.';
    alert(msg);
    switchTab('roster');
    return;
  }
  G.matchInProgress=true;G.trainedBatter=false;G.trainedPitcher=false;
  $('btnPlayMatch').disabled=true;$('btnPlayMatch').textContent='경기 진행 중...';$('playLog').innerHTML='';

  // 팬 이벤트 사기 부스트 적용
  if(G.myTeam.moralBoost>0){
    G.myTeam.roster.filter(p=>p.role!=='overseas').forEach(p=>p.condition=clamp(p.condition+G.myTeam.moralBoost,30,100));
    addLog(`🎉 팬 이벤트 효과! 선수단 컨디션 +${G.myTeam.moralBoost}`,'hit');
    G.myTeam.moralBoost=0;
  }

  const opp=getOpponent();const isHome=G.gameNum%2===0;
  const homeTeam=isHome?G.myTeam:opp;const awayTeam=isHome?opp:G.myTeam;

  // Reset stamina for game
  // 이글스(bullpen) 불펜 투수는 체력 회복 +20%
  [homeTeam,awayTeam].forEach(t=>getPitchers(t).forEach(p=>{
    const base=p.stamina+rand(0,10);
    const bonus=(t.concept==='bullpen'&&p.role==='bullpen')?Math.round(base*0.2):0;
    p.currentStamina=Math.min(100,base+bonus);
  }));

  const homeSP=getStartingPitcher(homeTeam);
  const awaySP=getStartingPitcher(awayTeam);

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

  // ── 불펜 등판 로직 (CP/SU/MR/LR 역할별) ──
  const isBullpenTeam=fldTeam.concept==='bullpen';
  const staminaThreshold=isBullpenTeam?40:15;
  const earlyBullpen=isBullpenTeam&&matchState.inning>=6&&pitcher.role==='rotation';
  if(pitcher.currentStamina<=staminaThreshold||earlyBullpen){
    const bp=getBullpen(fldTeam).filter(p=>p.currentStamina>25&&(p.condition||100)>=50&&!matchState.relieversUsed[fldKey].includes(p));
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
        addLog(`${logTag} ${isBullpenTeam?'[이글스] ':''}${pick_p.name} 등판!`,'pitching');
      }
    }
  }

  // === TTO + BABIP 기반 타석 판정 (84경기 최적화) ===

  // ── [1] 팀 컨셉 보너스 ──
  let batBonus=0,pitchBonus=0;
  if(batTeam.concept==='contact_hit') batBonus+=4;
  if(batTeam.concept==='speed')       batBonus+=3;
  if(batTeam.concept==='sabermetrics')batBonus+=3;
  if(fldTeam.concept==='power_hit')   pitchBonus+=5;
  if(fldTeam.concept==='defense')     pitchBonus+=4;
  if(fldTeam.concept==='pitching')    pitchBonus+=4;
  if(fldTeam.concept==='bullpen'&&pitcher.role==='bullpen') pitchBonus+=5;

  // ── [2] 투수 피로도 (스태미나 + 투구수 커브) ──
  const fatigue=_fatigueDebuff((pitcher.today&&pitcher.today.np)||0);
  const stamFactor=pitcher.currentStamina<=5?0.40:pitcher.currentStamina<25?0.75:pitcher.currentStamina<50?0.88:1.0;
  const condFactor=Math.min(1.0,(pitcher.condition||100)/100);
  const adjVelocity=Math.max(20,(pitcher.velocity||50)+fatigue.vel);
  const velMult=1+adjVelocity/400;

  // ── [3] 실시간 부상 확률 ──
  if((pitcher.condition||100)<100&&pitcher.status!=='il'){
    const injuryChance=(100-(pitcher.condition||100))*0.0005;
    if(Math.random()<injuryChance){
      pitcher.status='il';pitcher.isOnIL=true;pitcher.ilGamesLeft=rand(5,15);
      addLog(`🤕 ${pitcher.name} 투구 중 부상 발생! IL ${pitcher.ilGamesLeft}경기`,'out');
      showToast(`🤕 ${pitcher.name} 마운드에서 부상!`);
      const bpEmg=getBullpen(fldTeam).filter(p=>p.currentStamina>15&&(p.condition||100)>=30&&!matchState.relieversUsed[fldKey].includes(p));
      if(bpEmg.length>0){
        pitcher=bpEmg[0];matchState.currentPitcher[fldKey]=pitcher;matchState.relieversUsed[fldKey].push(pitcher);
        addLog(`🔄 긴급 교체! ${pitcher.name} 등판`,'pitching');
      }
    }
  }

  // ── [4] 히든 스탯 반영 ──
  const hasRISP=!!(matchState.bases[1]||matchState.bases[2]);
  const clutchAdd=hasRISP?((pitcher.clutch||50)*0.05):0;
  const batCon=batter._consistency||10;
  const batInSlump=(batter._slumpGames||0)>0;
  const batSwingBase=20-batCon;
  const batSwing=batInSlump?rand(-batSwingBase,Math.floor(batSwingBase*0.3)):rand(-batSwingBase,batSwingBase);
  const pitCon=pitcher._consistency||10;
  const pitSwing=rand(-(20-pitCon),20-pitCon);
  const aTotal=matchState.score.away.reduce((a,b)=>a+b,0);
  const hTotal=matchState.score.home.reduce((a,b)=>a+b,0);
  const inning=matchState.inning||1;
  const scoreDiff=Math.abs(aTotal-hTotal);
  const hasRunnersInScoring=!!(matchState.bases[1]||matchState.bases[2]);
  const tiebreakRunner=!!(matchState.bases[0]||matchState.bases[1]||matchState.bases[2])&&scoreDiff<=1;
  const isHighLeverage=inning>=7&&(scoreDiff<=3||hasRunnersInScoring||tiebreakRunner);
  const batBigGame=isHighLeverage?((batter._clutchHidden||10)-10)*0.6:0;
  const pitBigGame=isHighLeverage?((pitcher._clutchHidden||10)-10)*0.6:0;

  // ── [5] 유효 투수 스탯 (피로도 커브 반영) ──
  const effStuff=((pitcher.stuff||50)+pitchBonus+clutchAdd+pitSwing+pitBigGame)*velMult*stamFactor*condFactor;
  const effControl=((pitcher.control||50)+fatigue.ctrl+pitchBonus*0.5+clutchAdd*0.6+pitSwing*0.5+pitBigGame*0.5)*stamFactor*condFactor;
  const effMovement=((pitcher.movement||50)+fatigue.mov+pitchBonus*0.3+pitSwing*0.3)*velMult*stamFactor;

  // ── [6] 유효 타자 스탯 ──
  const isSlumping=(batter.condition||100)<SLUMP_CONDITION_THRESHOLD;
  const slumpDebuff=isSlumping?SLUMP_DEBUFF:0;
  const rehabDebuff=(batter.rehabGamesLeft||0)>0?REHAB_DEBUFF:0;
  const totalDebuff=slumpDebuff+rehabDebuff;
  const adjContact=(batter.contact||50)+batBonus-totalDebuff+batSwing+batBigGame;
  const adjPower=(batter.power||50)+batBonus*0.5-totalDebuff*0.8+batSwing*0.5+batBigGame*0.5;
  const adjEye=(batter.eye||50)+batBonus*0.3+batSwing*0.3;
  const batSpeed=(batter.speed||50);

  // ── [7] 수비력 ──
  const fldStarters=getStartingBatters(fldTeam);
  const avgFielding=fldStarters.length>0?fldStarters.reduce((s,p)=>s+(p.fielding||50),0)/fldStarters.length:50;
  const avgArm=fldStarters.length>0?fldStarters.reduce((s,p)=>s+(p.arm||50),0)/fldStarters.length:50;
  const armPenalty=Math.max(0.4,1-avgArm/200);

  // ── [8] 동적 회귀 보정 ──
  const regression=_calcRegression(batter,pitcher);

  // ── [9] TTO 확률 계산 (HR → K → BB → InPlay) ──
  const pHR=clamp(TTO_BASE_HR+(adjPower-effMovement)/100*0.16, 0.005, 0.12);
  const pK =clamp(TTO_BASE_K +(effStuff-adjContact)/100*0.15, 0.04, 0.35);
  const pBB=clamp(TTO_BASE_BB+(adjEye-effControl)/100*0.12, 0.02, 0.18);

  // ── [10] BABIP (인플레이 안타 확률) ──
  const contactMod=1+(adjContact-50)/200;
  const defMod=1-(avgFielding-50)/250;
  const babip=clamp(TTO_BASE_BABIP*contactMod*defMod*regression.hitMod*regression.erMod, 0.180, 0.450);

  // ── [11] 인플레이 세부 확률 ──
  const pError=clamp(0.02-(avgFielding-50)/2000, 0.005, 0.04);
  let gbAdj=0;
  if(fldTeam.concept==='defense') gbAdj+=0.05;
  if(batTeam.concept==='power_hit') gbAdj-=0.05;
  const gbRate=clamp(0.45+(effMovement-adjPower)/200+gbAdj, 0.30, 0.65);
  const xbhRate=clamp(0.20+(adjPower-50)/200, 0.10, 0.40);
  const tripleRate=batSpeed>65?0.06:batSpeed>50?0.03:0.01;
  const doubleRate=xbhRate-tripleRate;

  // ── Stats references ──
  const bs=batter.ss||(batter.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});
  const ps=pitcher.ss||(pitcher.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});
  const bt=batter.today||(batter.today={ab:0,h:0,hr:0,rbi:0,bb:0,k:0,r:0});
  const pt=pitcher.today||(pitcher.today={ip:0,outs:0,h:0,er:0,bb:0,k:0,np:0});

  // ═══════ TTO 1차 판정 ═══════
  const ttoRoll=Math.random();
  const _c1=pHR, _c2=_c1+pK, _c3=_c2+pBB;

  if(ttoRoll<_c1){
    // ── 홈런 ──
    let runs=1;matchState.bases.forEach((b,i)=>{if(b){runs++;matchState.bases[i]=null;}});
    matchState.score[scoreKey][ii]+=runs;matchState.hits[scoreKey]++;
    bs.ab++;bs.h++;bs.hr++;bs.rbi+=runs; ps.ha++; ps.er+=runs;
    bt.ab++;bt.h++;bt.hr++;bt.rbi+=runs; pt.h++; pt.er+=runs;
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
    if(matchState.bases[0]&&matchState.bases[1]&&matchState.bases[2]){
      matchState.score[scoreKey][ii]++;bs.rbi++;ps.er++;bt.rbi++;pt.er++;
      matchState.bases[2]=matchState.bases[1];
      matchState.bases[1]=matchState.bases[0];
      matchState.bases[0]=batter.name;
      addLog(`🚶 ${batter.name} 볼넷 (밀어내기!)`,'run');
    }else{
      if(matchState.bases[1]&&matchState.bases[0])matchState.bases[2]=matchState.bases[1];
      if(matchState.bases[0])matchState.bases[1]=matchState.bases[0];
      matchState.bases[0]=batter.name;addLog(`🚶 ${batter.name} 볼넷`,'hit');
    }
  }else{
    // ═══════ 인플레이 2차 판정 (BABIP + 수비) ═══════
    const ipRoll=Math.random();
    if(ipRoll<pError){
      // ── 수비 에러 → 출루 ──
      bs.ab++;bt.ab++;
      matchState.errors[fldKey]++;
      if(matchState.bases[2]){matchState.score[scoreKey][ii]++;bs.rbi++;ps.er++;bt.rbi++;pt.er++;matchState.bases[2]=null;}
      if(matchState.bases[1]){matchState.bases[2]=matchState.bases[1];matchState.bases[1]=null;}
      if(matchState.bases[0]){matchState.bases[1]=matchState.bases[0];matchState.bases[0]=null;}
      matchState.bases[0]=batter.name;
      const _errPos=['SS','2B','3B','1B'][rand(0,3)];
      addLog(`⚠️ ${_errPos} 수비 에러! ${batter.name} 출루`,'hit');
      highlightDefender(_errPos);
    }else if(ipRoll<pError+babip){
      // ── BABIP 안타 → 타구 유형 판정 ──
      matchState.hits[scoreKey]++;
      const hitRoll=Math.random();
      if(hitRoll<tripleRate){
        // ── 3루타 ──
        bs.ab++;bs.h++;bs.xbh++; ps.ha++;
        bt.ab++;bt.h++; pt.h++;
        let r=0;matchState.bases.forEach((b,i)=>{if(b){r++;matchState.bases[i]=null;}});
        matchState.bases[2]=batter.name;matchState.score[scoreKey][ii]+=r;bs.rbi+=r;if(r){ps.er+=r;bt.rbi+=r;pt.er+=r;}
        addLog(`🔵 ${batter.name} 3루타!${r?' '+r+'점!':' 진루'}`,r?'run':'hit');
      }else if(hitRoll<tripleRate+doubleRate){
        // ── 2루타 ──
        bs.ab++;bs.h++;bs.xbh++; ps.ha++;
        bt.ab++;bt.h++; pt.h++;
        let r=0;
        if(matchState.bases[2]){r++;matchState.bases[2]=null;}
        if(matchState.bases[1]){r++;matchState.bases[1]=null;}
        if(matchState.bases[0]){
          if(batSpeed>60&&Math.random()*100<batSpeed*armPenalty*0.5){r++;matchState.bases[0]=null;}
          else{matchState.bases[2]=matchState.bases[0];matchState.bases[0]=null;}
        }
        matchState.bases[1]=batter.name;matchState.score[scoreKey][ii]+=r;bs.rbi+=r;if(r){ps.er+=r;bt.rbi+=r;pt.er+=r;}
        addLog(`🟡 ${batter.name} 2루타!${r?' '+r+'점!':' 진루'}`,r?'run':'hit');
      }else{
        // ── 단타 ──
        bs.ab++;bs.h++; ps.ha++;
        bt.ab++;bt.h++; pt.h++;
        let r=0;
        if(matchState.bases[2]){r++;matchState.bases[2]=null;}
        if(matchState.bases[1]){
          if(Math.random()*100<batSpeed*armPenalty*1.5){r++;matchState.bases[1]=null;}
          else if(!matchState.bases[2]){matchState.bases[2]=matchState.bases[1];matchState.bases[1]=null;}
        }
        if(matchState.bases[0]){
          if(batSpeed>65&&Math.random()*100<batSpeed*armPenalty*0.35&&!matchState.bases[2]){
            matchState.bases[2]=matchState.bases[0];
          }else{
            matchState.bases[1]=matchState.bases[0];
          }
          matchState.bases[0]=null;
        }
        matchState.bases[0]=batter.name;matchState.score[scoreKey][ii]+=r;bs.rbi+=r;if(r){ps.er+=r;bt.rbi+=r;pt.er+=r;}
        addLog(`🟢 ${batter.name} 안타!${r?' '+r+'점 득점!':' 출루'}`,r?'run':'hit');
      }
    }else{
      // ── 범타 (아웃) — 땅볼/플라이 판정 ──
      bs.ab++;bt.ab++;
      const outRoll=Math.random();
      if(outRoll<gbRate){
        // ── 땅볼 → 병살타 체크 (타자 Speed ≤45이면 DP 확률 1.4배) ──
        const baseDpChance=fldTeam.concept==='defense'?0.22:0.17;
        const speedDpMod=batSpeed<=45?1.4:batSpeed>=65?0.6:1.0;
        if(matchState.outs<2&&matchState.bases[0]&&Math.random()<baseDpChance*speedDpMod){
          let dpRuns=0;
          if(matchState.outs===0&&matchState.bases[2]){dpRuns++;matchState.bases[2]=null;}
          if(matchState.bases[1]&&!matchState.bases[2]){matchState.bases[2]=matchState.bases[1];matchState.bases[1]=null;}
          matchState.bases[0]=null;
          matchState.outs+=2;
          if(dpRuns){matchState.score[scoreKey][ii]+=dpRuns;ps.er+=dpRuns;pt.er+=dpRuns;}
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
      }
      // ── 도루 시도 ──
      const catcher=fldTeam.roster.find(p=>p.pos==='C'&&(p.status||'active')==='active'&&p.role==='starting');
      const catchArm=catcher?(catcher.arm||50):50;
      const catchFactor=Math.max(0.40,1-catchArm/200);
      const stealMult=batTeam.concept==='speed'?0.55:batTeam.concept==='sabermetrics'?0.22:0.38;
      const stealChance=batSpeed*stealMult*catchFactor;
      if(matchState.bases[0]&&!matchState.bases[1]&&matchState.outs<3){
        const stealRoll=rand(1,100);
        if(stealRoll<=stealChance){
          matchState.bases[1]=matchState.bases[0];matchState.bases[0]=null;
          bs.sb++;
          addLog(`💨 ${batTeam.concept==='speed'?'[발야구] ':''}도루 성공!`,'hit');
        }else if(stealRoll<=stealChance*1.6){
          matchState.bases[0]=null;matchState.outs++;
          addLog('🚫 도루 실패! 포수의 정확한 송구에 아웃','out');
          highlightDefender('C');
        }
      }
      if(matchState.bases[1]&&!matchState.bases[2]&&matchState.outs<3){
        const steal3Chance=stealChance*0.4;
        const steal3Roll=rand(1,100);
        if(steal3Roll<=steal3Chance){
          matchState.bases[2]=matchState.bases[1];matchState.bases[1]=null;
          bs.sb++;
          addLog(`💨 ${batTeam.concept==='speed'?'[발야구] ':''}2루→3루 도루 성공!`,'hit');
        }else if(steal3Roll<=steal3Chance*1.6){
          matchState.bases[1]=null;matchState.outs++;
          addLog('🚫 3루 도루 실패! 포수 송구에 아웃','out');
          highlightDefender('C');
        }
      }
    }
  }

  matchState.batterIdx[batKey]++;
  matchState.pitchCount[fldKey]++;
  pitcher.currentStamina=clamp(pitcher.currentStamina-rand(3,7),0,100);
  pt.np++; // 투구수 증가
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
      if(spP&&spP.ss&&spGameOuts>=15)spP.ss.w++;
      else if(lastP&&lastP!==spP&&lastP.ss)lastP.ss.w++;
      else if(spP&&spP.ss)spP.ss.w++;
    }else{
      // 패배 투수: 선발 5이닝 미만 → SP에게 L, 5이닝+ → 마지막 릴리버에게 L
      if(spGameOuts<15){
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
  G.teams.forEach(t=>{t.rotationIdx=(t.rotationIdx+1)%Math.max(1,getRotation(t).length);});

  if(isWin)G.myTeam.popularity=clamp(G.myTeam.popularity+rand(1,3),0,100);
  else G.myTeam.popularity=clamp(G.myTeam.popularity-rand(0,2),0,100);
  G.myTeam.roster.forEach(p=>{if(ovr(p)>=62)p.popularity=clamp(p.popularity+rand(0,2),0,100);});
  // 의료 시설 레벨에 따라 컨디션 저하 감소
  const medReduction=Math.floor((G.myTeam.medicalLevel||0)/20);
  const dropMin=Math.max(1,2-medReduction),dropMax=Math.max(dropMin,5-medReduction);
  // _durability 히든 스탯 반영 (1~20): 점진적 컨디션 보정 + 부상 확률
  getStartingBatters(G.myTeam).forEach(p=>{
    const dur=p._durability||10;
    const durMod=Math.round((dur-10)/3); // -3~+3: 높으면 하락 감소, 낮으면 추가 하락
    p.condition=clamp(p.condition-rand(Math.max(1,dropMin-durMod),Math.max(1,dropMax-durMod)),30,100);
    // 부상: 내구성에 비례한 점진적 확률 (dur=20→0%, dur=10→3%, dur=7→4%)
    if(p.condition<55 && rand(1,300)<=(20-dur)){
      p.status='il';p.isOnIL=true;p.ilGamesLeft=rand(5,15);
      addLog(`🤕 ${p.name} 부상 발생! IL ${p.ilGamesLeft}경기`,'out');
      showToast(`🤕 ${p.name} 경기 중 부상! IL 등재`);
    }
    // 꾸준함 슬럼프 발동/해제
    if((p._slumpGames||0)>0){ p._slumpGames--; }
    else if((p._consistency||10)<10 && rand(1,100)<=(12-(p._consistency||10))){
      p._slumpGames=rand(3,7);
      addLog(`📉 ${p.name} 슬럼프 돌입! (${p._slumpGames}경기)`,'out');
    }
  });
  getBenchBatters(G.myTeam).forEach(p=>{
    p.condition=clamp(p.condition+rand(1,3),30,100);
    if((p._slumpGames||0)>0) p._slumpGames--;
  });
  // ── 투수 체력 소모 시스템 (투구수 + 연투 페널티) ──
  // 등판 투수 목록 수집
  const _pitchedSet=new Set();
  [s.startingPitcher.home,s.startingPitcher.away,s.currentPitcher.home,s.currentPitcher.away].forEach(p=>{if(p)_pitchedSet.add(p);});
  (s.relieversUsed.home||[]).forEach(p=>_pitchedSet.add(p));
  (s.relieversUsed.away||[]).forEach(p=>_pitchedSet.add(p));

  G.myTeam.roster.filter(p=>p.isPitcher&&p.role!=='overseas'&&(p.status||'active')==='active').forEach(p=>{
    const dur=p._durability||10;
    const didPitch=_pitchedSet.has(p);

    if(didPitch){
      // 투구수 기반 컨디션 차감
      const np=(p.today&&p.today.np)||0;
      let condDrop=Math.round(np/2.5);
      // 연투 페널티: _recentGames 배열로 추적
      if(!p._recentGames)p._recentGames=[];
      const consecutive=p._recentGames.filter(g=>g>=G.gameNum-2).length; // 최근 2경기 내 등판 횟수
      if(consecutive>=2) condDrop+=25; // 3연투
      else if(consecutive>=1) condDrop+=10; // 2연투
      p._recentGames.push(G.gameNum);
      if(p._recentGames.length>5)p._recentGames.shift(); // 최근 5경기만 유지
      p.condition=clamp((p.condition||100)-condDrop,0,100);
      p.currentStamina=clamp(p.currentStamina+rand(3,8),0,100); // 등판 투수: 소폭 스태미나 회복
    }else{
      // 미등판 투수: 정상 회복
      p.currentStamina=clamp(p.currentStamina+rand(15,30),0,100);
      p.condition=clamp((p.condition||100)-rand(Math.max(0,1-medReduction),Math.max(1,3-medReduction)),0,100);
      // 연투 기록 정리 (미등판이므로 휴식)
    }
    // 투수 부상: condition 낮을수록 확률 증가
    if(p.condition<50 && rand(1,300)<=(20-dur)){
      p.status='il';p.isOnIL=true;p.ilGamesLeft=rand(5,15);
      addLog(`🤕 ${p.name} 부상 발생! IL ${p.ilGamesLeft}경기`,'out');
      showToast(`🤕 ${p.name} 부상! IL 등재`);
    }
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
      if(p.isPitcher){const s=pick(['stuff','control','velocity','movement']);p[s]=clamp((p[s]||0)+boost,20,80);}
      else{const s=pick(['contact','power','eye','speed']);p[s]=clamp((p[s]||0)+boost,20,80);}
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
      p.status='futures'; p.isOnIL=false; p.cooldown=IL_COOLDOWN_ON_RETURN; p.rehabGamesLeft=3;
      addLog(`🏥 ${p.name} IL 복귀! 2군 재활 3경기`,'hit');
      showToast(`🏥 ${p.name} IL 복귀 — 2군 재활 중`);
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
}

function simulateOtherGames(){
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
  const spAOutsBefore=pitA&&pitA.ss?(pitA.ss.outs||0):0;
  const spBOutsBefore=pitB&&pitB.ss?(pitB.ss.outs||0):0;

  // 체력 세팅 (startMatch, _simMyGame와 동일)
  [teamA,teamB].forEach(t=>getPitchers(t).forEach(p=>{
    const base=p.stamina+rand(0,10);
    const bonus=(t.concept==='bullpen'&&p.role==='bullpen')?Math.round(base*0.2):0;
    p.currentStamina=Math.min(100,base+bonus);
  }));

  // 한 하프이닝 TTO+BABIP 간이 시뮬 (공격팀 vs 수비팀) — simulatePlay 공식 통일
  // walkoffTarget>0: 끝내기 상황, runs>=walkoffTarget이면 즉시 종료
  function simHalf(batTeam,batters,pitcher,fldTeam,walkoffTarget){
    let outs=0,runs=0,idx=0;
    if(!pitcher||batters.length===0)return rand(0,3);

    // 팀 컨셉 보너스
    let batBonus=0,pitBonus=0;
    if(batTeam.concept==='contact_hit')batBonus+=4;
    if(batTeam.concept==='speed')batBonus+=3;
    if(batTeam.concept==='sabermetrics')batBonus+=3;
    if(fldTeam.concept==='power_hit')pitBonus+=5;
    if(fldTeam.concept==='defense')pitBonus+=4;
    if(fldTeam.concept==='pitching')pitBonus+=4;
    if(fldTeam.concept==='bullpen'&&pitcher.role==='bullpen')pitBonus+=5;

    // 수비력 평균
    const fldStarters=fldTeam?getStartingBatters(fldTeam):[];
    const avgFld=fldStarters.length>0?fldStarters.reduce((s,p)=>s+(p.fielding||50),0)/fldStarters.length:50;

    // 주루 상태 간이 추적
    let bases=[null,null,null];

    while(outs<3&&idx<50){
      const b=batters[idx%batters.length];idx++;
      const bs=b.ss||(b.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});
      const ps=pitcher.ss||(pitcher.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});

      // 슬럼프 보정
      const isSlumping=(b.condition||100)<SLUMP_CONDITION_THRESHOLD;
      const slumpDebuff=isSlumping?SLUMP_DEBUFF:0;
      const adjCon=clamp((b.contact||50)+batBonus-slumpDebuff,10,90);
      const adjPow=clamp((b.power||50)+batBonus*0.5-slumpDebuff*0.8,10,90);
      const adjEye=clamp((b.eye||50)+batBonus*0.3,10,90);

      // 투수 유효 스탯 (체력 기반 피로도)
      const stamF=pitcher.currentStamina<=5?0.40:pitcher.currentStamina<25?0.75:pitcher.currentStamina<50?0.88:1.0;
      const velMult=1+((pitcher.velocity||50)/400);
      const effStuff=((pitcher.stuff||50)+pitBonus)*velMult*stamF;
      const effControl=((pitcher.control||50)+pitBonus*0.5)*stamF;
      const effMovement=((pitcher.movement||50)+pitBonus*0.3)*velMult*stamF;

      // 동적 회귀 + TTO 판정
      const reg=_calcRegression(b,pitcher);
      const result=_ttoSimAB(adjPow,adjCon,adjEye,effStuff,effControl,effMovement,avgFld,reg.hitMod*reg.erMod);

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
        bases[0]=b.name;
      }else if(result==='HIT'||result==='ERROR'){
        bs.ab++;
        if(result==='HIT'){bs.h++;ps.ha++;}
        const xbhChance=clamp(0.20+(adjPow-50)/200,0.10,0.40);
        const tripleChance=(b.speed||50)>65?0.06:(b.speed||50)>50?0.03:0.01;
        const hitRoll=Math.random();
        if(hitRoll<tripleChance){
          bs.xbh++;let r=0;bases.forEach((bb,i)=>{if(bb){r++;bases[i]=null;}});
          bases[2]=b.name;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }else if(hitRoll<xbhChance){
          bs.xbh++;let r=0;
          if(bases[2]){r++;bases[2]=null;}
          if(bases[1]){r++;bases[1]=null;}
          if(bases[0]){if((b.speed||50)>60&&Math.random()<0.35){r++;bases[0]=null;}else{bases[2]=bases[0];bases[0]=null;}}
          bases[1]=b.name;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }else{
          let r=0;
          if(bases[2]){r++;bases[2]=null;}
          if(bases[1]){if(Math.random()<0.45){r++;bases[1]=null;}else if(!bases[2]){bases[2]=bases[1];bases[1]=null;}}
          if(bases[0]){bases[1]=bases[0];bases[0]=null;}
          bases[0]=b.name;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }
        if((b.speed||50)>60&&bases[0]===b.name&&!bases[1]&&Math.random()<0.12)bs.sb++;
      }else{
        // 범타 아웃 — 땅볼/DP 판정
        bs.ab++;
        const gbRate=clamp(0.45+(effMovement-adjPow)/200,0.30,0.65);
        if(Math.random()<gbRate){
          const baseDpChance=fldTeam.concept==='defense'?0.22:0.17;
          const speedDpMod=(b.speed||50)<=45?1.4:(b.speed||50)>=65?0.6:1.0;
          if(outs<2&&bases[0]&&Math.random()<baseDpChance*speedDpMod){
            let dpRuns=0;
            if(outs===0&&bases[2]){dpRuns++;bases[2]=null;}
            if(bases[1]&&!bases[2]){bases[2]=bases[1];bases[1]=null;}
            bases[0]=null;outs+=2;ps.outs=(ps.outs||0)+2;
            if(dpRuns){ps.er+=dpRuns;runs+=dpRuns;}
          }else{outs++;ps.outs=(ps.outs||0)+1;}
        }else{outs++;ps.outs=(ps.outs||0)+1;}
      }
      pitcher.currentStamina=clamp(pitcher.currentStamina-rand(3,6),0,100);
      if(walkoffTarget>0&&runs>=walkoffTarget) break;
    }
    return runs;
  }

  // 9이닝 시뮬 (Away=teamB 선공, Home=teamA 후공)
  for(let inn=1;inn<=9;inn++){
    let curPitA=pitA, curPitB=pitB;
    if(inn>=7){
      const pickA=_pickReliever(teamA,inn,runsA-runsB);
      if(pickA){curPitA=pickA;lastPitA=pickA;}
      const pickB=_pickReliever(teamB,inn,runsB-runsA);
      if(pickB){curPitB=pickB;lastPitB=pickB;}
    }
    runsB+=simHalf(teamB,batB,curPitA,teamA,0);
    if(inn===9&&runsA>runsB) break;
    const wotA=inn>=9?(runsB-runsA+1):0;
    runsA+=simHalf(teamA,batA,curPitB,teamB,wotA);
    if(inn>=9&&runsA>runsB) break;
  }

  // 연장전 (10~12회)
  if(runsA===runsB){
    for(let inn=10;inn<=12;inn++){
      let curPitA=pitA, curPitB=pitB;
      const pickA=_pickReliever(teamA,inn,runsA-runsB);
      if(pickA){curPitA=pickA;lastPitA=pickA;}
      const pickB=_pickReliever(teamB,inn,runsB-runsA);
      if(pickB){curPitB=pickB;lastPitB=pickB;}
      runsB+=simHalf(teamB,batB,curPitA,teamA,0);
      if(runsA>runsB) break;
      const wotA=runsB-runsA+1;
      runsA+=simHalf(teamA,batA,curPitB,teamB,wotA);
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
    if(pitA&&pitA.ss&&spAOuts>=15)pitA.ss.w++;
    else if(lastPitA&&lastPitA!==pitA&&lastPitA.ss)lastPitA.ss.w++;
    else if(pitA&&pitA.ss)pitA.ss.w++;
    // 패배 투수 (B팀): 선발 5이닝 미만 → SP, 5이닝+ → 마지막 릴리버
    if(spBOuts<15){
      if(pitB&&pitB.ss)pitB.ss.l++;
    }else{
      if(lastPitB&&lastPitB!==pitB&&lastPitB.ss)lastPitB.ss.l++;
      else if(pitB&&pitB.ss)pitB.ss.l++;
    }
  }else{
    // 승리 투수 (B팀)
    if(pitB&&pitB.ss&&spBOuts>=15)pitB.ss.w++;
    else if(lastPitB&&lastPitB!==pitB&&lastPitB.ss)lastPitB.ss.w++;
    else if(pitB&&pitB.ss)pitB.ss.w++;
    // 패배 투수 (A팀): 선발 5이닝 미만 → SP, 5이닝+ → 마지막 릴리버
    if(spAOuts<15){
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
  const isHome=G.gameNum%2===0;
  const homeTeam=isHome?G.myTeam:opp;
  const awayTeam=isHome?opp:G.myTeam;

  // 체력 세팅
  [homeTeam,awayTeam].forEach(t=>getPitchers(t).forEach(p=>{
    const base=p.stamina+rand(0,10);
    const bonus=(t.concept==='bullpen'&&p.role==='bullpen')?Math.round(base*0.2):0;
    p.currentStamina=Math.min(100,base+bonus);
  }));

  // 선발 투수
  const homeSP=getStartingPitcher(homeTeam);
  const awaySP=getStartingPitcher(awayTeam);

  // 컨셉 보정 (startMatch와 동일)
  let batBonusHome=0,pitBonusHome=0,batBonusAway=0,pitBonusAway=0;
  if(homeTeam.concept==='contact_hit')batBonusHome+=4;
  if(homeTeam.concept==='speed')batBonusHome+=3;
  if(homeTeam.concept==='sabermetrics')batBonusHome+=3;
  if(awayTeam.concept==='contact_hit')batBonusAway+=4;
  if(awayTeam.concept==='speed')batBonusAway+=3;
  if(awayTeam.concept==='sabermetrics')batBonusAway+=3;
  if(homeTeam.concept==='power_hit')pitBonusHome+=5;
  if(homeTeam.concept==='defense')pitBonusHome+=4;
  if(homeTeam.concept==='pitching')pitBonusHome+=4;
  if(awayTeam.concept==='power_hit')pitBonusAway+=5;
  if(awayTeam.concept==='defense')pitBonusAway+=4;
  if(awayTeam.concept==='pitching')pitBonusAway+=4;

  // 각 팀 TTO+BABIP 간이 시뮬 — simulatePlay 공식 통일 + 체력 소모 + 끝내기
  function simHalfFull(batTeam,pitcherTeam,batBonus,pitBonus,curPitcher,walkoffTarget){
    const batters=getStartingBatters(batTeam);
    let pitcher=curPitcher;
    if(!pitcher||batters.length===0)return rand(0,4);
    const fldStarters=getStartingBatters(pitcherTeam);
    const avgFld=fldStarters.length>0?fldStarters.reduce((s,p)=>s+(p.fielding||50),0)/fldStarters.length:50;

    // 주루 상태 간이 추적
    let bases=[null,null,null];
    let outs=0,runs=0,idx=0;
    while(outs<3&&idx<50){
      // 불펜 교체: 체력 25 이하 → 보직 우선순위 기반 교체 (roster 순서 = 보직 내 우선순위)
      if(pitcher.currentStamina<=25){
        const emgPick=_pickReliever(pitcherTeam,7,0);
        if(emgPick) pitcher=emgPick;
      }
      const b=batters[idx%batters.length];idx++;
      const bs=b.ss||(b.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});
      const ps=pitcher.ss||(pitcher.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0});

      // 슬럼프/재활 보정
      const isSlumping=(b.condition||100)<SLUMP_CONDITION_THRESHOLD;
      const slumpDebuff=isSlumping?SLUMP_DEBUFF:0;
      const rehabDebuff=(b.rehabGamesLeft||0)>0?REHAB_DEBUFF:0;
      const totalDebuff=slumpDebuff+rehabDebuff;
      const adjCon=clamp((b.contact||50)+batBonus-totalDebuff,10,90);
      const adjPow=clamp((b.power||50)+batBonus*0.5-totalDebuff*0.8,10,90);
      const adjEye=clamp((b.eye||50)+batBonus*0.3,10,90);

      // 투수 유효 스탯 (불펜 컨셉 보너스 포함)
      const bpBonus=(pitcherTeam.concept==='bullpen'&&pitcher.role==='bullpen')?5:0;
      const stamF=pitcher.currentStamina<=5?0.40:pitcher.currentStamina<25?0.75:pitcher.currentStamina<50?0.88:1.0;
      const velMult=1+((pitcher.velocity||50)/400);
      const effStuff=((pitcher.stuff||50)+pitBonus+bpBonus)*velMult*stamF;
      const effControl=((pitcher.control||50)+(pitBonus+bpBonus)*0.5)*stamF;
      const effMovement=((pitcher.movement||50)+(pitBonus+bpBonus)*0.3)*velMult*stamF;

      // 동적 회귀 + TTO 판정
      const reg=_calcRegression(b,pitcher);
      const result=_ttoSimAB(adjPow,adjCon,adjEye,effStuff,effControl,effMovement,avgFld,reg.hitMod*reg.erMod);

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
        bases[0]=b.name;
      }else if(result==='HIT'||result==='ERROR'){
        bs.ab++;
        if(result==='HIT'){bs.h++;ps.ha++;}
        const xbhChance=clamp(0.20+(adjPow-50)/200,0.10,0.40);
        const tripleChance=(b.speed||50)>65?0.06:(b.speed||50)>50?0.03:0.01;
        const hitRoll=Math.random();
        if(hitRoll<tripleChance){
          bs.xbh++;let r=0;bases.forEach((bb,i)=>{if(bb){r++;bases[i]=null;}});
          bases[2]=b.name;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }else if(hitRoll<xbhChance){
          bs.xbh++;let r=0;
          if(bases[2]){r++;bases[2]=null;}
          if(bases[1]){r++;bases[1]=null;}
          if(bases[0]){if((b.speed||50)>60&&Math.random()<0.35){r++;bases[0]=null;}else{bases[2]=bases[0];bases[0]=null;}}
          bases[1]=b.name;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }else{
          let r=0;
          if(bases[2]){r++;bases[2]=null;}
          if(bases[1]){if(Math.random()<0.45){r++;bases[1]=null;}else if(!bases[2]){bases[2]=bases[1];bases[1]=null;}}
          if(bases[0]){bases[1]=bases[0];bases[0]=null;}
          bases[0]=b.name;bs.rbi+=r;if(r)ps.er+=r;runs+=r;
        }
        if((b.speed||50)>60&&bases[0]===b.name&&!bases[1]&&Math.random()<0.12)bs.sb++;
      }else{
        // 범타 아웃 — 땅볼/DP 판정
        bs.ab++;
        const gbRate=clamp(0.45+(effMovement-adjPow)/200,0.30,0.65);
        if(Math.random()<gbRate){
          const baseDpChance=pitcherTeam.concept==='defense'?0.22:0.17;
          const speedDpMod=(b.speed||50)<=45?1.4:(b.speed||50)>=65?0.6:1.0;
          if(outs<2&&bases[0]&&Math.random()<baseDpChance*speedDpMod){
            let dpRuns=0;
            if(outs===0&&bases[2]){dpRuns++;bases[2]=null;}
            if(bases[1]&&!bases[2]){bases[2]=bases[1];bases[1]=null;}
            bases[0]=null;outs+=2;ps.outs=(ps.outs||0)+2;
            if(dpRuns){ps.er+=dpRuns;runs+=dpRuns;}
          }else{outs++;ps.outs=(ps.outs||0)+1;}
        }else{outs++;ps.outs=(ps.outs||0)+1;}
      }
      pitcher.currentStamina=clamp(pitcher.currentStamina-rand(3,6),0,100);
      if(walkoffTarget>0&&runs>=walkoffTarget) break;
    }
    return runs;
  }

  const homeOutsBefore=homeSP&&homeSP.ss?(homeSP.ss.outs||0):0;
  const awayOutsBefore=awaySP&&awaySP.ss?(awaySP.ss.outs||0):0;
  let curPitHome=homeSP, curPitAway=awaySP;
  let lastPitHome=homeSP, lastPitAway=awaySP;
  let runsHome=0,runsAway=0;

  // 9이닝 시뮬 (Away 선공, Home 후공) — 7회+ 보직 우선순위 불펜 교체 + 끝내기
  for(let inn=1;inn<=9;inn++){
    if(inn>=7){
      const pickH=_pickReliever(homeTeam,inn,runsHome-runsAway);
      if(pickH){curPitHome=pickH;lastPitHome=pickH;}
      const pickA=_pickReliever(awayTeam,inn,runsAway-runsHome);
      if(pickA){curPitAway=pickA;lastPitAway=pickA;}
    }
    runsAway+=simHalfFull(awayTeam,homeTeam,batBonusAway,pitBonusHome,curPitHome,0);
    if(inn===9&&runsHome>runsAway) break;
    const wot=inn>=9?(runsAway-runsHome+1):0;
    runsHome+=simHalfFull(homeTeam,awayTeam,batBonusHome,pitBonusAway,curPitAway,wot);
    if(inn>=9&&runsHome>runsAway) break;
  }

  // 연장전 (10~12회)
  if(runsHome===runsAway){
    for(let inn=10;inn<=12;inn++){
      const pickH=_pickReliever(homeTeam,inn,runsHome-runsAway);
      if(pickH){curPitHome=pickH;lastPitHome=pickH;}
      const pickA=_pickReliever(awayTeam,inn,runsAway-runsHome);
      if(pickA){curPitAway=pickA;lastPitAway=pickA;}
      runsAway+=simHalfFull(awayTeam,homeTeam,batBonusAway,pitBonusHome,curPitHome,0);
      if(runsHome>runsAway) break;
      const wot=runsAway-runsHome+1;
      runsHome+=simHalfFull(homeTeam,awayTeam,batBonusHome,pitBonusAway,curPitAway,wot);
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
    if(homeSP&&homeSP.ss&&homeGameOuts>=15)homeSP.ss.w++;
    else if(lastPitHome&&lastPitHome!==homeSP&&lastPitHome.ss)lastPitHome.ss.w++;
    else if(homeSP&&homeSP.ss)homeSP.ss.w++;
    // 패배 투수: SP가 5이닝 미만이면 SP에게 L, 아니면 마지막 구원투수에게 L
    if(awayGameOuts<15){
      if(awaySP&&awaySP.ss)awaySP.ss.l++;
    }else{
      if(lastPitAway&&lastPitAway!==awaySP&&lastPitAway.ss)lastPitAway.ss.l++;
      else if(awaySP&&awaySP.ss)awaySP.ss.l++;
    }
  }else{
    if(awaySP&&awaySP.ss&&awayGameOuts>=15)awaySP.ss.w++;
    else if(lastPitAway&&lastPitAway!==awaySP&&lastPitAway.ss)lastPitAway.ss.w++;
    else if(awaySP&&awaySP.ss)awaySP.ss.w++;
    // 패배 투수: SP가 5이닝 미만이면 SP에게 L, 아니면 마지막 구원투수에게 L
    if(homeGameOuts<15){
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
  G.teams.forEach(t=>{t.rotationIdx=(t.rotationIdx+1)%Math.max(1,getRotation(t).length);});

  // 컨디션 감소 (내 팀)
  const medReduction=Math.floor((G.myTeam.medicalLevel||0)/20);
  const dropMin=Math.max(1,2-medReduction),dropMax=Math.max(dropMin,5-medReduction);
  getStartingBatters(G.myTeam).forEach(p=>{
    const dur=p._durability||10;
    const durMod=Math.round((dur-10)/3);
    p.condition=clamp(p.condition-rand(Math.max(1,dropMin-durMod),Math.max(1,dropMax-durMod)),30,100);
    if(p.condition<55&&rand(1,300)<=(20-dur)){p.status='il';p.isOnIL=true;p.ilGamesLeft=rand(5,15);}
    if((p._slumpGames||0)>0) p._slumpGames--;
    else if((p._consistency||10)<10&&rand(1,100)<=(12-(p._consistency||10))){p._slumpGames=rand(3,7);}
  });
  getBenchBatters(G.myTeam).forEach(p=>{
    p.condition=clamp(p.condition+rand(1,3),30,100);
    if((p._slumpGames||0)>0) p._slumpGames--;
  });
  // 투수 체력 회복: 등판 투수(SP/불펜)는 소폭만 회복, 미등판 투수는 정상 회복
  const pitchedToday=new Set();
  pitchedToday.add(homeSP);pitchedToday.add(awaySP);
  G.myTeam.roster.filter(p=>p.isPitcher&&p.role!=='overseas'&&(p.status||'active')==='active').forEach(p=>{
    const dur=p._durability||10;
    const durMod=Math.round((dur-10)/3);
    const didPitch=pitchedToday.has(p)||(p.currentStamina<(p.stamina||50));
    p.currentStamina=clamp(p.currentStamina+(didPitch?rand(3,8):rand(15,30)),0,100);
    p.condition=clamp(p.condition-rand(Math.max(0,1-medReduction-durMod),Math.max(1,4-medReduction-durMod)),30,100);
    if(p.condition<50&&rand(1,300)<=(20-dur)){p.status='il';p.isOnIL=true;p.ilGamesLeft=rand(5,15);}
  });

  // 해외연수 복귀
  G.myTeam.roster.forEach(p=>{
    if(p.role==='overseas'&&p.overseasUntil!==null&&G.gameNum>=p.overseasUntil){
      const boost=rand(OVERSEAS_BOOST_MIN,OVERSEAS_BOOST_MAX);
      if(p.isPitcher){const s=pick(['stuff','control','velocity','movement']);p[s]=clamp((p[s]||0)+boost,20,80);}
      else{const s=pick(['contact','power','eye','speed']);p[s]=clamp((p[s]||0)+boost,20,80);}
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
