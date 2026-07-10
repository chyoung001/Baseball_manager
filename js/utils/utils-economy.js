// ===================== UTILS-ECONOMY (Economy & Trade Value Engine) =====================

// ── 시설/육성 업그레이드 비용/효율 ──
function upgradeEfficiency(lv){return lv<80?rand(3,6):rand(1,2);}
function upgradeCost(lv){if(lv<40)return 5;if(lv<60)return 10;if(lv<80)return 15;return 25;}
// 부서(스카우트/데이터분석) 업그레이드 비용/효율
function deptUpgradeEfficiency(lv){if(lv<30)return rand(3,6);if(lv<60)return rand(2,5);if(lv<80)return rand(2,4);return rand(1,2);}
function deptUpgradeCost(lv){if(lv<30)return 3;if(lv<60)return 6;if(lv<80)return 12;return 20;}

// ── 구단 재정 ──
function getPayroll(team){return +team.roster.reduce((s,p)=>s+(p.salary||0),0).toFixed(1);}

// 사치세/하드캡 (고정값)
function getLeagueAvgPayroll(){
  if(!G.teams||G.teams.length===0)return 80;
  return +((G.teams.reduce((s,t)=>s+getPayroll(t),0)/G.teams.length).toFixed(1));
}
function getLuxuryTaxLine(){return LUXURY_TAX_THRESHOLD;}
function getHardCap(){return HARD_CAP;}
function getLuxuryTax(team){const pay=getPayroll(team);return pay>LUXURY_TAX_THRESHOLD?+((pay-LUXURY_TAX_THRESHOLD)*LUXURY_TAX_RATE).toFixed(1):0;}

// ── 코칭/훈련 ──
function getCoachBonus(team,stat){
  const ct=COACH_TYPES.find(c=>c.bonusStat===stat);
  if(!ct||!team.coachStaff)return 0;
  const lv=team.coachStaff[ct.key]||0;
  return stat==='condition'?lv*3:lv*2;
}

// 훈련 효율 배율: 1.0 ~ 1.5 (코치레벨 + 스태프레벨 기반)
// 스탯 → 코치 매핑 (power→batting, arm→defense, velocity→pitching, clutch→stamina)
const _STAT_COACH_MAP={contact:'batting',power:'batting',eye:'eye',speed:'speed',fielding:'defense',arm:'defense',
  stuff:'pitching',control:'control',velocity:'pitching',movement:'movement',stamina:'stamina',clutch:'stamina',condition:'medical'};
function getTrainingMultiplier(team,stat){
  const coachKey=_STAT_COACH_MAP[stat];
  const coachLv=team.coachLevel?Math.floor(team.coachLevel/20):0;
  const staffLv=(coachKey&&team.coachStaff)?team.coachStaff[coachKey]||0:0;
  return 1+(coachLv*0.05)+(staffLv*0.05);
}

// ── 연간 고정 지출 계산 ──
function calcAnnualUpkeep(team){
  const cs=team.coachStaff||{};
  const coachTotal=Object.values(cs).reduce((s,v)=>s+(v||0),0);
  const staffCost=Math.floor(coachTotal*0.5);
  const stadiumCost=Math.floor(Math.pow(team.stadiumLevel||0,2)*0.5);
  const facilityCost=Math.floor(((team.medicalLevel||0)+(team.devLevel||0)+(team.scoutingLevel||0)+(team.analyticsLevel||0))*0.02);
  const farmCost=10;
  return {staffCost,stadiumCost,facilityCost,farmCost,total:staffCost+stadiumCost+facilityCost+farmCost};
}

// 사용 가능 자본 = 총 자본 - 고정지출 - 선수 연봉
function getAvailableBudget(team){
  return Math.floor((team.budget||0)-calcAnnualUpkeep(team).total-getPayroll(team));
}
// 지출 가능 여부 체크 (사용 가능 자본이 음수가 되면 차단)
function canSpend(team, amount){
  return getAvailableBudget(team) >= amount;
}

// ═══════════════════════════════════════════════════════
// Trade Value (5단계 공식)
// ═══════════════════════════════════════════════════════
function calcTradeValue(p){
  // 1단계: 포지션 보정 기본 가치
  const posW=POS_WEIGHT[p.pos]||1.0;
  const ca=ovr(p);
  const baseValue=ca*posW;

  // 2단계: 나이/잠재력 반영 미래 가치
  const sp=p._seasonsPlayed||0;
  const paScaled=(p._potential||10)*4; // 1-20 → 4-80
  let skillValue;
  if(sp<=3)      skillValue=ca*0.3+paScaled*0.7;       // 유망주
  else if(sp<=8) skillValue=ca*0.8+paScaled*0.2;       // 전성기
  else           skillValue=ca*Math.max(0.2,1-(sp-8)/12); // 에이징

  // 3단계: 리스크 페널티 (부상 빈도)
  const injProne=20-(p._durability||10);
  const riskMod=Math.max(0.5,1.0-injProne/40);

  // 4단계: 프로의식 가치 반영 (성장 기대치 + 에이징 리스크)
  const we=p._workEthic||10;
  const weBase=1.0+((we-10)*0.03); // 0.91~1.30
  const ethicTradeMod=sp<=3?1.0+((we-10)*0.03*1.5):weBase; // 유망주 1.5배 증폭

  // 5단계: 꾸준함 가치 반영 (신뢰도 리스크)
  const cs=p._consistency||10;
  const csBase=1.0+((cs-10)*0.015); // 0.955~1.15
  const consTradeMod=sp>=4?1.0+((cs-10)*0.015*1.5):csBase; // 전성기/베테랑 1.5배 증폭

  // PlayerValue = BaseValue × SkillValue/CA × RiskMod × EthicMod × ConsMod
  const playerValue=baseValue*(skillValue/Math.max(1,ca))*riskMod*ethicTradeMod*consTradeMod;

  // 6단계: 잉여 가치 (연봉 대비 효율)
  const expectedSalary=Math.max(1,playerValue*0.15);
  const avgSalary=Math.max(1,getLeagueAvgPayroll()/(G.teams.length>0?G.teams[0].roster.length||39:39));
  const surplusPenalty=((p.salary||0)-expectedSalary)/avgSalary*10;

  return Math.round(playerValue-surplusPenalty);
}

// AI 컨텍스트 가중치 (고도화)
function calcTradeValueForAI(p,aiTeam){
  let tv=calcTradeValue(p);
  const sorted=[...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
  const rank=sorted.indexOf(aiTeam)+1;
  const sp=p._seasonsPlayed||0;
  const pa=p._potential||10;
  const pOvr=ovr(p);
  const st=p._serviceTime||0;

  // ── 1단계: 윈나우/리빌딩 기본 컨텍스트 ──
  if(rank<=3){
    if(pOvr>=55) tv=Math.round(tv*TRADE_CONTENDER_BONUS);
  }else if(rank>=6){
    if(sp<=3&&pa>=14) tv=Math.round(tv*TRADE_REBUILD_BONUS);
  }

  // ── 2단계: 포지션 뎁스 중복도 평가 ──
  const activeRoster=aiTeam.roster.filter(r=>(r.status||'active')==='active');
  const samePos=activeRoster.filter(r=>r.pos===p.pos&&r!==p);
  const hasBetterStarter=samePos.some(r=>ovr(r)>pOvr);
  const isProspect=st<=PRE_ARB_MAX_SERVICE;
  if(hasBetterStarter&&!isProspect){
    // 이미 더 좋은 주전이 있으면 30~50% 삭감
    tv=Math.round(tv*(0.5+Math.random()*0.2));
  }

  // ── 3단계: 계약 기간 및 렌탈 프리미엄 ──
  const contractLeft=p._contractYears||1;
  if(contractLeft<=1&&st>=FA_SERVICE_TIME_THRESHOLD){
    // FA 1년 남은 렌탈: 리빌딩은 0.4배, 윈나우는 유지
    if(rank>=6) tv=Math.round(tv*0.4);
  }
  // 장기 염가 계약: 서비스 1~PRE_ARB년, 최저연봉, OVR 55+
  if(st>=1&&st<=PRE_ARB_MAX_SERVICE&&(p.salary||0)<=SALARY_MIN&&pOvr>=55){
    tv=Math.round(tv*1.5);
  }

  // ── 4단계: 샐러리 덤프 ──
  const aiBudget=getAvailableBudget(aiTeam);
  if(aiBudget<100&&(p.salary||0)>=30&&pOvr<50){
    // 예산 부족 + 고연봉 저성과 → 마이너스 가치 (먹튀)
    tv=Math.round(-Math.abs(p.salary||0)*2);
  }

  // ── 5단계: 최근 성적 프리미엄 (Recency Bias) ──
  const war=approxWAR(p);
  const expectedWar=pOvr>=65?3:pOvr>=55?1.5:pOvr>=45?0.5:0;
  if(war>expectedWar+1.5){
    // OVR 대비 시즌 성적이 뛰어남 → 15~20% 프리미엄
    tv=Math.round(tv*(1.15+Math.random()*0.05));
  }

  // ── 6단계: 프랜차이즈 스타 언터처블 프리미엄 ──
  // AI 소속 선수가 프랜차이즈 스타면 팬 반발 의식하여 2배 프리미엄
  const isOnAiTeam=aiTeam.roster.includes(p);
  if(isOnAiTeam&&(p._teamTenure||0)>=8&&pOvr>=65){
    tv=Math.round(tv*2.0);
  }

  return tv;
}
