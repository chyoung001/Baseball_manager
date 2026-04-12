// ===================== HELPERS =====================
function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function pick(arr){return arr[rand(0,arr.length-1)];}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
// Box-Muller 정규분포 난수 (평균 mean, 표준편차 stdDev)
function randomGaussian(mean,stdDev){
  let u,v,s;
  do{u=Math.random()*2-1;v=Math.random()*2-1;s=u*u+v*v;}while(s>=1||s===0);
  const mul=Math.sqrt(-2*Math.log(s)/s);
  return mean+stdDev*u*mul;
}
// 정규분포 + clamp (정수)
function randGauss(mean,stdDev,lo,hi){return clamp(Math.round(randomGaussian(mean,stdDev)),lo,hi);}
function genName(){return pick(FN)+pick(LN);}
function genLatinName(){return pick(LATIN_FN)+' '+pick(LATIN_LN);}
function $(id){return document.getElementById(id);}
// 통화 표시: 소수점 2자리까지
function won(v){
  v=+((+v)||0).toFixed(2);
  if(v>=1) return (v%1===0?v.toFixed(0):v%0.1===0?v.toFixed(1):v.toFixed(2))+'억';
  if(v>0) return (v*10000).toFixed(0)>=1000 ? (v*10).toFixed(0)+'천만' : (v*10000).toFixed(0)+'만';
  if(v<0) return '-'+won(-v);
  return '0';
}
function starsHTML(pop){const s=Math.round(pop/20);let h='';for(let i=0;i<5;i++)h+=i<s?'★':'<span class="empty">★</span>';return'<span class="stars">'+h+'</span>';}
// 20-80 MLB 스케일: 80=역대급, 70=올스타, 60=잘함, 50=평균, 40=부족, 20=최하
function statColor(v){if(v>=70)return'#10b981';if(v>=55)return'#f59e0b';if(v>=40)return'#f97316';return'#ef4444';}
function statPct(v){return Math.round(((v-STAT_MIN)/(STAT_MAX-STAT_MIN))*100);} // 스탯→퍼센트 (바 너비용)
// 기존 시설(육성/코칭 등) 업그레이드 비용/효율
function upgradeEfficiency(lv){return lv<80?rand(3,6):rand(1,2);}
function upgradeCost(lv){if(lv<40)return 5;if(lv<60)return 10;if(lv<80)return 15;return 25;}
// 부서(스카우트/데이터분석) 업그레이드 비용/효율
function deptUpgradeEfficiency(lv){if(lv<30)return rand(3,6);if(lv<60)return rand(2,5);if(lv<80)return rand(2,4);return rand(1,2);}
function deptUpgradeCost(lv){if(lv<30)return 3;if(lv<60)return 6;if(lv<80)return 12;return 20;}

function ovrBatter(p){return Math.round((p.contact||0)*0.25+(p.power||0)*0.20+(p.eye||0)*0.15+(p.speed||0)*0.15+(p.fielding||0)*0.15+(p.arm||0)*0.10);}
function ovrPitcher(p){return Math.round((p.stuff||0)*0.25+(p.control||0)*0.20+(p.velocity||0)*0.15+(p.movement||0)*0.15+(p.stamina||0)*0.15+(p.clutch||0)*0.10);}
function ovr(p){return p.isPitcher?ovrPitcher(p):ovrBatter(p);}

// ---- POT → 최대 도달 가능 OVR 천장 ----
function maxOvrFromPot(pot){return Math.floor(30+(pot||10)*2.5);}

// ---- Scout Report (히든 스탯을 텍스트로 변환) ----
// 히든 스탯 7~20 스케일
function _hiddenGrade(v){
  if(v>=18)return{text:'최상급',cls:'s-elite'};
  if(v>=15)return{text:'우수',cls:'s-good'};
  if(v>=12)return{text:'양호',cls:'s-avg'};
  if(v>=9)return{text:'보통',cls:'s-low'};
  return{text:'부족',cls:'s-bad'};
}
function getScoutReport(p){
  // 드래프트 풀 신인이면 스카우트팀 레벨, 프로 선수면 분석팀 레벨 기준
  const isDraftRookie=Array.isArray(G.draftPool)&&G.draftPool.includes(p);
  const targetLv=isDraftRookie?(G.myTeam.scoutingLevel||0):(G.myTeam.analyticsLevel||0);
  const baseFuzz=targetLv>=60?1:targetLv>=30?2:4;
  // 드림즈(prospect): 스카우트 정확도 +50% (fuzz 절반)
  const fuzzAmt=G.myTeam.concept==='prospect'?Math.max(1,Math.ceil(baseFuzz*0.5)):baseFuzz;
  function grade(key){
    const raw=p[key]||10;
    const fuzzed=clamp(raw+rand(-fuzzAmt,fuzzAmt),1,20);
    return _hiddenGrade(fuzzed);
  }
  // 퍼징값을 1회만 계산하여 등급·텍스트 모두 동일 기준 사용
  function fuzzVal(key){const raw=p[key]||10;return clamp(raw+rand(-fuzzAmt,fuzzAmt),1,20);}
  const potV=fuzzVal('_potential');
  const durV=fuzzVal('_durability');
  const conV=fuzzVal('_consistency');
  const cltV=fuzzVal('_clutchHidden');
  const weV=fuzzVal('_workEthic');

  const pot=_hiddenGrade(potV);
  const dur=_hiddenGrade(durV);
  const con=_hiddenGrade(conV);
  const clt=_hiddenGrade(cltV);
  const we=_hiddenGrade(weV);

  const potCap=maxOvrFromPot(potV);
  const potText=potV>=17?`프랜차이즈 스타 자질. 최대 ${potCap} OVR 도달 가능.`
    :potV>=13?`올스타급 성장 가능. 최대 ${potCap} OVR까지 기대.`
    :potV>=10?`평균 주전급 한계. 최대 ${potCap} OVR.`
    :`성장 여지 제한적. 최대 ${potCap} OVR.`;

  const durText=durV>=15?'철인 체력. 풀시즌을 거뜬히 소화합니다.'
    :durV>=11?'일반적인 체력 수준입니다.'
    :durV>=7?'체력 관리에 주의가 필요합니다.'
    :'유리 몸. 부상 위험이 매우 높습니다.';

  const conText=conV>=15?'매 경기 안정적인 퍼포먼스를 보여줍니다.'
    :conV>=11?'대체로 일관된 플레이를 합니다.'
    :conV>=7?'컨디션에 따라 기복이 있는 편입니다. 슬럼프 주의.'
    :'롤러코스터. 장기 슬럼프에 빠질 위험이 높습니다.';

  const cltText=cltV>=15?'하이 레버리지에서 더 빛나는 승부사입니다.'
    :cltV>=11?'중요한 순간에도 흔들리지 않습니다.'
    :cltV>=7?'승부처에서 다소 위축됩니다.'
    :'중압감에 약합니다. 접전에서 기대하기 어렵습니다.';

  const weText=weV>=15?'모범적인 자기 관리. 빠르게 성장하며 노쇠화가 늦습니다.'
    :weV>=11?'성실한 훈련 태도입니다.'
    :weV>=7?'평범한 훈련 태도. 성장이 더딜 수 있습니다.'
    :'훈련 불성실. 성장이 매우 느리고 노쇠화가 빠릅니다.';

  return {pot,dur,con,clt,we,potText,durText,conText,cltText,weText};
}

// ---- Season Stats (per-player real game stats) ----
function initSeasonStats(p){
  p.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,     // batter
        ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0};  // pitcher (outs 정수 누적)
}
function ssAvg(p){const s=p.ss;return s&&s.ab>0?(s.h/s.ab):0;}
function ssOBP(p){const s=p.ss;return s&&(s.ab+s.bb)>0?((s.h+s.bb)/(s.ab+s.bb)):0;}
// outs 기반 이닝 계산 (부동소수점 방지, 구버전 ip 폴백)
function _ssOuts(s){return (s.outs||0)>0?s.outs:Math.round((s.ip||0)*3);}
function ssIP(p){const o=_ssOuts(p.ss||{});return Math.floor(o/3)+(o%3)/10;} // 6.1 = 6⅓이닝
function ssIPstr(p){const o=_ssOuts(p.ss||{});return Math.floor(o/3)+'.'+(o%3);}
function ssERA(p){const s=p.ss;const o=_ssOuts(s||{});return o>0?(s.er*27/o):99.99;}
function ssK9(p){const s=p.ss;const o=_ssOuts(s||{});return o>0?(s.pk*27/o):0;}
function ssWHIP(p){const s=p.ss;const o=_ssOuts(s||{});return o>0?((s.ha+s.pbb)*3/o):99.99;}

// ---- WAR approximation (for salary negotiation) ----
function approxWAR(p){
  if(p.isPitcher){
    const era=ssERA(p);const ip=_ssOuts(p.ss||{})/3;
    return Math.max(0,((4.50-era)*(ip/9)*0.3));
  }else{
    const avg=ssAvg(p);const obp=ssOBP(p);const hr=p.ss?p.ss.hr:0;
    return Math.max(0,((avg-0.250)*20+(obp-0.320)*15+hr*0.3));
  }
}

// ---- Investment helpers ----
function getPayroll(team){return +team.roster.reduce((s,p)=>s+(p.salary||0),0).toFixed(1);}

// 사치세/하드캡 (고정값)
function getLeagueAvgPayroll(){
  if(!G.teams||G.teams.length===0)return 80;
  return +((G.teams.reduce((s,t)=>s+getPayroll(t),0)/G.teams.length).toFixed(1));
}
function getLuxuryTaxLine(){return LUXURY_TAX_THRESHOLD;}
function getHardCap(){return HARD_CAP;}
function getLuxuryTax(team){const pay=getPayroll(team);return pay>LUXURY_TAX_THRESHOLD?+((pay-LUXURY_TAX_THRESHOLD)*LUXURY_TAX_RATE).toFixed(1):0;}
// ---- Trade Value (5단계 공식) ----
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
  const isProspect=st<=3;
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
  // 장기 염가 계약: 서비스 1~3년, 최저연봉, OVR 55+
  if(st>=1&&st<=3&&(p.salary||0)<=SALARY_MIN&&pOvr>=55){
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
// 드래프트 스카우팅 시스템
// ═══════════════════════════════════════════════════════

// 스카우트팀 레벨 기반 드래프트 OVR 퍼징 (시즌 초 1회 생성하여 고정)
function getScoutedOvr(p,scLv){
  const real=ovr(p);
  const fuzz=scLv>=90?0:scLv>=60?1:scLv>=30?4:8;
  return clamp(real+rand(-fuzz,fuzz),20,80);
}

// 스카우트팀 레벨 기반 드래프트 선수 정보 반환
function getDraftScoutInfo(p,scLv){
  const real=ovr(p);
  const info={name:p.name,pos:p.pos,age:p.age||18,isPitcher:p.isPitcher};

  // OVR
  if(scLv>=30) info.ovr=real;
  else info.ovrRange=[Math.max(20,real-8),Math.min(80,real+8)];

  // 스탯
  const stats=p.isPitcher?['stuff','control','velocity','movement','stamina','clutch']:['contact','power','eye','speed','fielding','arm'];
  if(scLv>=60){
    info.stats={};stats.forEach(s=>{info.stats[s]=p[s];});
  }else if(scLv>=30){
    info.stats={};stats.forEach(s=>{info.stats[s]=[Math.max(20,p[s]-5),Math.min(80,p[s]+5)];});
  }else{
    info.stats=null; // 🔒
  }

  // 잠재력
  const pot=p._potential||10;
  if(scLv>=80) info.pot=pot;
  else if(scLv>=60) info.potRange=[Math.max(7,pot-2),Math.min(20,pot+2)];
  else if(scLv>=30) info.potHint=pot>=15?'스타 재목':pot>=12?'1군 주전급':pot>=9?'백업 수준':'제한적';
  else info.potHint=null;

  // 프로의식 (_workEthic) — 스카우트팀 레벨에 연동
  const we=p._workEthic||10;
  if(scLv>=90) info.workEthic=we;
  else if(scLv>=70) info.workEthicRange=[Math.max(7,we-2),Math.min(20,we+2)];

  // 스카우트팀 Lv.90+: 스틸픽 특성 (실제 OVR과 스카우팅 OVR 괴리 감지)
  if(scLv>=90){
    const potCap=30+(pot*2.5);
    if(potCap-real>=15) info.sleeper=true;
  }

  return info;
}

// 데이터 분석팀 레벨 기반 프로 선수 히든 스탯 공개 범위
function getAnalyticsHiddenInfo(p,aLv){
  const info={};
  if(aLv>=90){
    info.durability=p._durability||10;
    info.consistency=p._consistency||10;
    info.clutchHidden=p._clutchHidden||10;
  }else if(aLv>=80){
    info.durability=p._durability||10;
    info.consistency=p._consistency||10;
  }else if(aLv>=60){
    info.durability=p._durability||10;
  }
  return info;
}

// ═══════════════════════════════════════════════════════
// 계약 협상 시스템
// ═══════════════════════════════════════════════════════

// 선수의 기대 계약 조건 (내부값)
function getExpectedContract(p){
  const pOvr=ovr(p);
  const salary=Math.max(1,Math.floor(_calcSalary(pOvr,p._serviceTime||0)));
  const years=_calcContractYears(pOvr);
  return {salary,years,totalValue:salary*years};
}

// 유저 제안 판정: 'accept' | 'reject'
function evaluateOffer(p,offerSalary,offerYears){
  const exp=getExpectedContract(p);
  const offerTotal=offerSalary*offerYears;
  const totalRatio=offerTotal/Math.max(1,exp.totalValue);
  const aavOk=offerSalary>=exp.salary*0.6;
  if(!aavOk)return 'reject';
  if(totalRatio>=1.0)return 'accept';
  if(totalRatio>=0.85)return rand(1,100)<=70?'accept':'reject';
  if(totalRatio>=0.7)return rand(1,100)<=30?'accept':'reject';
  return 'reject';
}

// FA 경쟁 페널티: 거절 시 AI가 빼앗을 확률
function _faSnatchProb(p){
  const o=ovr(p);
  if(o>=70)return 60;if(o>=65)return 50;if(o>=60)return 40;if(o>=55)return 30;return 20;
}

// 공통 협상 모달
// context: 'renewal'|'fa'|'scout'|'salary'
// onAccept(salary, years): 수락 시 콜백
// onFail(): 결렬 시 콜백
// onRejectFA(p): FA 거절 시 빼앗김 콜백 (fa context만)
let _negoState=null;

function showNegotiationModal(p, context, onAccept, onFail, extraData){
  const exp=getExpectedContract(p);
  const aLv=G.myTeam.analyticsLevel||0;
  // 데이터 분석팀 레벨에 따른 에이전트 요구 조건 힌트 정확도
  const hintSalary=aLv>=60?exp.salary:aLv>=30?Math.floor(exp.salary*(0.8+Math.random()*0.4)):Math.floor(exp.salary*(0.5+Math.random()));
  const hintYears=aLv>=60?exp.years:aLv>=30?clamp(exp.years+rand(-1,1),1,6):clamp(exp.years+rand(-2,2),1,6);

  _negoState={p,context,onAccept,onFail,extraData,attemptsLeft:3,exp};

  _renderNegotiationUI(hintSalary,hintYears);
}

function _renderNegotiationUI(hintSalary,hintYears){
  const s=_negoState;if(!s)return;
  const p=s.p,o=ovr(p);
  const st=p._serviceTime||0;
  const phase=st<=PRE_ARB_MAX_SERVICE?'프리아브':st<=ARB_MAX_SERVICE?'연봉조정':'FA자격';
  const phColor=st<=PRE_ARB_MAX_SERVICE?'#67e8f9':st<=ARB_MAX_SERVICE?'#f59e0b':'#10b981';
  const contextLabel=s.context==='renewal'?'재계약':s.context==='fa'?'FA 영입':s.context==='salary'?'연봉 협상':'계약';
  const war=approxWAR(p);

  // 능력치 상위 3개 미니바
  let topStats=[];
  if(p.isPitcher){
    topStats=[{l:'구위',v:p.stuff},{l:'제구',v:p.control},{l:'구속',v:p.velocity},{l:'무브',v:p.movement},{l:'체력',v:p.stamina},{l:'위기',v:p.clutch}];
  }else{
    topStats=[{l:'컨택',v:p.contact},{l:'파워',v:p.power},{l:'선구',v:p.eye},{l:'주력',v:p.speed},{l:'수비',v:p.fielding},{l:'어깨',v:p.arm}];
  }
  topStats.sort((a,b)=>b.v-a.v);
  const top3=topStats.slice(0,3);

  // 시즌 핵심 성적
  const ss=p.ss||{};
  let keyStatHTML='';
  if(p.isPitcher){
    const era=ssERA(p);
    const ipStr=ssIPstr(p);
    keyStatHTML=`<span>ERA <b style="color:${era<=3?'#10b981':era<=4.5?'#f59e0b':'#ef4444'};">${era.toFixed(2)}</b></span>
      <span>W-L <b>${ss.w||0}-${ss.l||0}</b></span><span>IP <b>${ipStr}</b></span>`;
  }else{
    const avg=ss.ab>0?(ss.h/ss.ab):0;
    keyStatHTML=`<span>AVG <b style="color:${avg>=.300?'#10b981':avg>=.250?'#f59e0b':'#ef4444'};">${avg.toFixed(3)}</b></span>
      <span>HR <b style="color:${(ss.hr||0)>=10?'#a855f7':'var(--text)'};">${ss.hr||0}</b></span><span>RBI <b>${ss.rbi||0}</b></span>`;
  }

  // 남은 협상 도트
  const dots=Array.from({length:3},(_, i)=>{
    if(i<s.attemptsLeft) return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);"></span>';
    return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#374151;"></span>';
  }).join('');

  $('modalTitle').textContent='';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <!-- 헤더: 컨텍스트 라벨 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:0.92rem;font-weight:700;color:var(--text);">📝 ${contextLabel} 협상</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:0.62rem;color:${s.attemptsLeft<=1?'#ef4444':'var(--text-dim)'};">남은 기회</span>
          <div style="display:flex;gap:3px;">${dots}</div>
        </div>
      </div>

      <!-- 선수 프로필 카드 -->
      <div style="background:linear-gradient(135deg,#1a1f35 0%,#0f1729 100%);border:1px solid ${statColor(o)}33;border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="position:relative;">
            <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.82rem;padding:5px 14px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
          </div>
          <div style="flex:1;">
            <div style="font-size:1rem;font-weight:700;color:var(--text);margin-bottom:2px;">${p.name}</div>
            <div style="display:flex;gap:8px;font-size:0.68rem;color:var(--text-dim);">
              <span>${p.age||22}세</span>
              <span style="color:${phColor};">${phase} (${st}yr)</span>
              <span>계약 ${p._contractYears||1}년</span>
            </div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:1.6rem;font-weight:800;color:${statColor(o)};line-height:1;font-family:'JetBrains Mono',monospace;">${o}</div>
            <div style="font-size:0.55rem;color:var(--text-dim);margin-top:1px;">OVR</div>
          </div>
        </div>

        <!-- 상위 능력치 미니바 -->
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          ${top3.map(s=>`<div style="flex:1;background:#111827;border-radius:6px;padding:5px 8px;">
            <div style="display:flex;justify-content:space-between;font-size:0.6rem;margin-bottom:3px;">
              <span style="color:var(--text-dim);">${s.l}</span>
              <span style="color:${statColor(s.v)};font-weight:700;">${s.v}</span>
            </div>
            <div style="height:3px;background:#1f2937;border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${statPct(s.v)}%;background:${statColor(s.v)};border-radius:2px;"></div>
            </div>
          </div>`).join('')}
        </div>

        <!-- 시즌 성적 + WAR -->
        <div style="display:flex;align-items:center;gap:12px;font-size:0.72rem;color:var(--text-dim);padding:6px 8px;background:#111827;border-radius:6px;">
          ${keyStatHTML}
          <span style="margin-left:auto;color:${war>=3?'#10b981':war>=1.5?'#f59e0b':'var(--text-dim)'};">WAR <b>${war.toFixed(1)}</b></span>
        </div>
      </div>

      <!-- 협상 테이블: 에이전트 vs 나 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <!-- 에이전트 요구 -->
        <div style="background:#111827;border:1px solid #f59e0b33;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:0.62rem;color:#f59e0b;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">에이전트 요구</div>
          <div style="font-size:1.3rem;font-weight:800;color:#f59e0b;font-family:'JetBrains Mono',monospace;">${won(hintSalary)}</div>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px;">${hintYears}년 · 총 ${won(hintSalary*hintYears)}</div>
        </div>

        <!-- 나의 제안 -->
        <div style="background:#111827;border:1px solid #3b82f633;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:0.62rem;color:#3b82f6;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">나의 제안</div>
          <div style="display:flex;gap:6px;justify-content:center;align-items:center;">
            <input type="number" id="negoSalary" value="${hintSalary}" min="0.3" max="50" step="0.5"
              style="width:70px;padding:4px 6px;background:#0a0e1a;border:1px solid #3b82f644;border-radius:6px;color:#3b82f6;font-size:1.1rem;font-weight:800;font-family:'JetBrains Mono',monospace;text-align:center;"
              oninput="_updateNegoTotal()">
            <span style="color:var(--text-dim);font-size:0.72rem;">억</span>
          </div>
          <div style="display:flex;gap:6px;justify-content:center;align-items:center;margin-top:6px;">
            <select id="negoYears" style="padding:3px 8px;background:#0a0e1a;border:1px solid #3b82f644;border-radius:6px;color:#3b82f6;font-size:0.82rem;font-weight:700;text-align:center;cursor:pointer;"
              onchange="_updateNegoTotal()">
              ${[1,2,3,4,5,6].map(y=>`<option value="${y}" ${y===hintYears?'selected':''}>${y}년</option>`).join('')}
            </select>
            <span style="font-size:0.68rem;color:var(--text-dim);" id="negoTotalDisp">총 ${won(hintSalary*hintYears)}</span>
          </div>
        </div>
      </div>

      <!-- 제안 비교 게이지 -->
      <div style="background:#111827;border-radius:8px;padding:10px 12px;margin-bottom:12px;" id="negoGaugeWrap">
        <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-dim);margin-bottom:4px;">
          <span>저평가</span><span>적정</span><span>프리미엄</span>
        </div>
        <div style="height:6px;background:#1f2937;border-radius:3px;position:relative;overflow:visible;">
          <div style="position:absolute;left:0;top:0;height:100%;width:100%;border-radius:3px;background:linear-gradient(to right,#ef4444,#f59e0b 50%,#10b981);opacity:0.3;"></div>
          <div id="negoGaugeMarker" style="position:absolute;top:-3px;width:12px;height:12px;background:var(--accent);border-radius:50%;border:2px solid #fff;transition:left 0.3s;left:50%;transform:translateX(-50%);"></div>
        </div>
        <div style="text-align:center;margin-top:6px;font-size:0.68rem;color:var(--text-dim);" id="negoRatioDisp">제안 비율: 100%</div>
      </div>

      <!-- 결과 영역 -->
      <div id="negoResult" style="min-height:36px;margin-bottom:10px;"></div>

      <!-- 버튼 -->
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" id="negoSubmitBtn" onclick="_submitNegotiation()" style="flex:2;padding:10px;font-size:0.85rem;font-weight:700;">제안하기</button>
        <button class="btn btn-secondary" onclick="_cancelNegotiation()" style="flex:1;padding:10px;">포기</button>
      </div>
    </div>`;
  $('seasonModal').classList.add('active');
  _updateNegoTotal();
}

function _updateNegoTotal(){
  const sal=parseFloat($('negoSalary').value)||0;
  const yrs=parseInt($('negoYears').value)||1;
  const total=sal*yrs;
  const disp=$('negoTotalDisp');if(disp) disp.textContent='총 '+won(total);

  // 게이지 업데이트
  const s=_negoState;if(!s)return;
  const expTotal=Math.max(1,s.exp.totalValue);
  const ratio=total/expTotal;
  const pct=Math.max(0,Math.min(100,ratio*50));
  const marker=$('negoGaugeMarker');if(marker) marker.style.left=pct+'%';
  const ratioDisp=$('negoRatioDisp');
  if(ratioDisp){
    const rpct=Math.round(ratio*100);
    const rColor=rpct>=100?'#10b981':rpct>=85?'#f59e0b':'#ef4444';
    ratioDisp.innerHTML='제안 비율: <b style="color:'+rColor+';">'+rpct+'%</b>';
  }
}

function _submitNegotiation(){
  const s=_negoState;if(!s)return;
  const sal=parseFloat($('negoSalary').value)||0;
  const yrs=parseInt($('negoYears').value)||1;

  if(sal<0.3){$('negoResult').innerHTML='<div style="color:#ef4444;font-size:0.72rem;padding:8px;background:#ef444411;border-radius:6px;">최소 연봉은 0.3억입니다.</div>';return;}

  const result=evaluateOffer(s.p,sal,yrs);
  s.attemptsLeft--;

  if(result==='accept'){
    $('negoResult').innerHTML=`<div style="text-align:center;padding:12px;background:rgba(16,185,129,0.08);border:1px solid #10b98133;border-radius:8px;">
      <div style="font-size:1.1rem;font-weight:800;color:#10b981;margin-bottom:4px;">계약 체결!</div>
      <div style="font-size:0.75rem;color:var(--text-dim);">${won(sal)} × ${yrs}년 (총액 ${won(sal*yrs)})</div>
    </div>`;
    $('negoSubmitBtn').disabled=true;
    $('negoSubmitBtn').style.opacity='0.4';
    setTimeout(()=>{
      $('seasonModal').classList.remove('active');
      s.onAccept(sal,yrs);
      _negoState=null;
    },1000);
  } else {
    // FA 경쟁 페널티
    if(s.context==='fa' && rand(1,100)<=_faSnatchProb(s.p)){
      $('negoResult').innerHTML=`<div style="text-align:center;padding:12px;background:rgba(239,68,68,0.08);border:1px solid #ef444433;border-radius:8px;">
        <div style="font-size:1rem;font-weight:800;color:#ef4444;margin-bottom:4px;">선수 이탈</div>
        <div style="font-size:0.72rem;color:var(--text-dim);">다른 구단이 더 좋은 조건을 제시했습니다.</div>
      </div>`;
      $('negoSubmitBtn').disabled=true;
      $('negoSubmitBtn').style.opacity='0.4';
      setTimeout(()=>{
        $('seasonModal').classList.remove('active');
        if(s.onFail)s.onFail('snatched');
        _negoState=null;
      },1200);
      return;
    }

    if(s.attemptsLeft<=0){
      $('negoResult').innerHTML=`<div style="text-align:center;padding:12px;background:rgba(239,68,68,0.08);border:1px solid #ef444433;border-radius:8px;">
        <div style="font-size:1rem;font-weight:800;color:#ef4444;margin-bottom:4px;">협상 결렬</div>
        <div style="font-size:0.72rem;color:var(--text-dim);">선수 측이 협상 테이블을 떠났습니다.</div>
      </div>`;
      $('negoSubmitBtn').disabled=true;
      $('negoSubmitBtn').style.opacity='0.4';
      setTimeout(()=>{
        $('seasonModal').classList.remove('active');
        if(s.onFail)s.onFail('exhausted');
        _negoState=null;
      },1200);
    } else {
      const exp=s.exp;
      const hint85=won(Math.floor(exp.totalValue*0.85));
      // 남은 기회 도트 업데이트
      const dotsHTML=Array.from({length:3},(_,i)=>{
        if(i<s.attemptsLeft) return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);"></span>';
        return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#374151;"></span>';
      }).join('');

      $('negoResult').innerHTML=`<div style="padding:10px;background:rgba(245,158,11,0.06);border:1px solid #f59e0b33;border-radius:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:0.78rem;font-weight:700;color:#f59e0b;">거절</span>
          <div style="display:flex;gap:3px;">${dotsHTML}</div>
        </div>
        <div style="font-size:0.68rem;color:var(--text-dim);">💬 "총액 ${hint85} 이상은 되어야 고려하겠습니다."</div>
      </div>`;
    }
  }
}

function _cancelNegotiation(){
  const s=_negoState;
  $('seasonModal').classList.remove('active');
  if(s&&s.onFail)s.onFail('cancel');
  _negoState=null;
}
