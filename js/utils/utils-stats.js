// ===================== UTILS-STATS (Sabermetrics & OVR Engine) =====================
// ═══════════════════════════════════════════════════════
// P3-1: 3-Tier 스탯 계층 (설계: 스탯 페이지 "3-Tier 스탯 시스템")
// Tier1 Raw → Tier2 Roster(팀 맥락) → Tier3 Effective(매치엔진 전용)
// 시스템별 입력: OVR·TV·성장/노화 = Tier1 / UI 표시·AI 라인업 = Tier2 / 매치엔진 확률 = Tier3
// 상황 보정(파크팩터·클러치·라이벌·PS)은 Tier에 섞지 않고 확률 변환 후 곱셈 (P4)
// ═══════════════════════════════════════════════════════

// Tier 1 — Raw: 순수 내재 능력 (1~100). 성장/노화/훈련만 작용. 폴백 50=리그 평균.
function statRaw(p,key){const v=p[key];return (v===undefined||v===null)?50:v;}

// Tier 2 — Roster: Tier1 + 팀 DNA + 시즌 포커스. 트레이드 시 재계산되는 "팀에서의 폼".
// TODO P6(팀 컨셉): DNA/포커스 가산 + 1~100 초과분 50% 연관 스탯 분산 룰. 현재 pass-through.
function statRoster(p,key){return statRaw(p,key);}

// 특성 보정 (P3-2) — 카탈로그는 players/player-traits.js(TRAITS). 런타임 호출이라 로드 순서 무관.
// 스택 상한(설계): 인공 특성 동일 스탯 합 최대 +10, 자연+인공 합 최대 +12 — 초과분 생략.
function _traitBonus(p,key){
  const ts=p._traits;
  if(!Array.isArray(ts)||ts.length===0)return 0;
  if(typeof TRAITS==='undefined')return 0; // 카탈로그 로드 전 (부팅 극초기 방어)
  let nat=0,art=0;
  for(let i=0;i<ts.length;i++){
    const t=TRAITS[ts[i].id];
    if(!t)continue;
    const v=t.fx[key];
    if(!v)continue;
    if(ts[i].slot===1)nat+=v;else art+=v;
  }
  if(art>10)art=10;
  let total=nat+art;
  if(total>12)total=12;
  return total;
}

// 히든 스탯 런타임 유효값 — 특성 보정 반영 (부상·슬럼프·클러치·협상·성장 등 소비처 전용).
// 표시·OVR·TV·스카우트는 raw(statRaw) 유지 (설계: 특성은 Tier3 전용).
function hiddenEff(p,key){return clamp(statRaw(p,key)+_traitBonus(p,key),1,100);}

// Tier 3 소프트캡 125: 초과분 log₁₀(1+over) 압축 — 경계 연속·순단조 보장
// (설계 예시 130→125.7은 log₁₀(over) 기준값. 그 식은 125~126 구간이 전부 125로 붕괴하는
//  평탄부가 생겨 1+over로 보정 — 130→125.78로 편차 +0.08, 압축 취지 동일)
function _tier3Compress(v){return v>125?125+Math.log10(1+(v-125)):v;}

// Tier 3 — Effective: Tier2 + 특성. 매치엔진 확률 산출 전용, UI 비노출.
// 사기/컨디션·피로 배율은 엔진에서 곱셈 1회 적용 (기존 condFactor/stamFactor 유지).
function statEff(p,key){return _tier3Compress(statRoster(p,key)+_traitBonus(p,key));}

// 부상 위험 곡선 (내구성 1~100 → 0~19.8) — 단일 소스.
// 부상 롤(match-flow._injuryThreshold, 최소 2 플로어)과 트레이드 가치 리스크가 공유.
function injuryRisk(dur){return (100-(dur||50))/5;}
// ── P2-1 OVR 엔진: 역할별 가중 raw + 포지션 그룹별 Z-score 상대평가 ──
// ovrRaw(p)  = 절대 점수 (역할별 가중 평균, 1~100). 생성·성장캡·에이징 등 "물리적 스탯" 맥락 전용.
// ovr(p)     = 상대 OVR (1군 리그 분포 대비 Z-score, 50=리그평균·σ=15) + 다재다능 세금. 표시·연봉·FA·트레이드 평가 등 "가치" 맥락 전용.

// 역할별 가중치 (포지션이 요구하는 툴 반영, 각 합=1)
const _OVR_BAT_W={
  C:   {contact:0.20,power:0.15,eye:0.10,speed:0.05,fielding:0.25,arm:0.25},
  MIF: {contact:0.20,power:0.12,eye:0.13,speed:0.20,fielding:0.22,arm:0.13}, // 2B/SS
  CIF: {contact:0.24,power:0.24,eye:0.14,speed:0.08,fielding:0.16,arm:0.14}, // 1B/3B
  OF:  {contact:0.21,power:0.17,eye:0.13,speed:0.16,fielding:0.19,arm:0.14}, // LF/CF/RF
  DH:  {contact:0.30,power:0.30,eye:0.20,speed:0.10,fielding:0.05,arm:0.05},
};
const _OVR_PIT_W={
  SP: {stuff:0.22,control:0.20,velocity:0.13,movement:0.15,stamina:0.20,clutch:0.10},
  CP: {stuff:0.28,control:0.18,velocity:0.18,movement:0.14,stamina:0.04,clutch:0.18},
  SU: {stuff:0.26,control:0.18,velocity:0.16,movement:0.14,stamina:0.08,clutch:0.18},
  MR: {stuff:0.24,control:0.20,velocity:0.14,movement:0.16,stamina:0.12,clutch:0.14},
  LR: {stuff:0.20,control:0.20,velocity:0.12,movement:0.16,stamina:0.22,clutch:0.10},
};
const _OVR_BAT_KEY={C:'C','2B':'MIF',SS:'MIF','1B':'CIF','3B':'CIF',DH:'DH',LF:'OF',CF:'OF',RF:'OF'};
function _ovrWeights(p){
  if(p.isPitcher) return _OVR_PIT_W[p.pos]||_OVR_PIT_W.MR;
  return _OVR_BAT_W[_OVR_BAT_KEY[p.pos]||'OF'];
}
function ovrRaw(p){
  const w=_ovrWeights(p);
  let s=0; for(const k in w) s+=(p[k]||0)*w[k];
  return Math.round(s);
}

// Z-score 보정 그룹 (표본 확보 위해 병합: DH는 CIF와, 불펜 전보직은 RP로)
function _ovrCalibGroup(p){
  if(p.isPitcher) return p.pos==='SP'?'SP':'RP';
  const g=_OVR_BAT_KEY[p.pos]||'OF';
  return g==='DH'?'CIF':g;
}
// 리그 보정치 캐시 (1군 active 기준 — "1군 리그 평균 대비" 상대평가). gameNum/로스터 변동 시 재계산.
let _ovrCalibCache=null, _ovrCalibKey='';
// 캐시 강제 무효화 — 키(시즌:경기:인원합)가 못 보는 리그 전체 스탯 변동(세이브 로드·마이그레이션) 시 호출
function invalidateOvrCalib(){_ovrCalibCache=null;_ovrCalibKey='';}
function _getOvrCalib(){
  if(typeof G==='undefined'||!G.teams||G.teams.length===0) return null;
  const key=G.season+':'+G.gameNum+':'+G.teams.reduce((s,t)=>s+(t.roster?t.roster.length:0),0);
  if(_ovrCalibCache&&_ovrCalibKey===key) return _ovrCalibCache;
  const acc={};
  G.teams.forEach(t=>(t.roster||[]).forEach(p=>{
    if((p.status||'active')!=='active') return;
    const g=_ovrCalibGroup(p);
    (acc[g]=acc[g]||[]).push(ovrRaw(p));
  }));
  const calib={};
  for(const g in acc){
    const a=acc[g]; if(a.length<4) continue; // 표본 부족 그룹은 raw 폴백
    const m=a.reduce((s,x)=>s+x,0)/a.length;
    const sd=Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/a.length);
    calib[g]={mean:m,std:Math.max(6,sd)}; // std 하한 6 (0-분산 방어)
  }
  _ovrCalibCache=calib; _ovrCalibKey=key;
  return calib;
}
function ovr(p){
  const raw=ovrRaw(p);
  let v=raw;
  const c=_getOvrCalib();
  if(c){
    const cg=c[_ovrCalibGroup(p)];
    if(cg) v=50+(raw-cg.mean)/cg.std*15; // 50=리그평균, σ=15 (70+=엘리트, 84+=S급 ≈ 상위 1%)
  }
  // 다재다능 세금: 서브 포지션 1개 −1 / 2개+ −2 (서브포지션 시스템 도입 전까지 _subPos 미설정 → 0)
  const subs=Array.isArray(p._subPos)?p._subPos.length:0;
  if(subs>0) v-=(subs>=2?2:1);
  return clamp(Math.round(v),STAT_MIN,STAT_MAX);
}
function ovrBatter(p){return ovr(p);}
function ovrPitcher(p){return ovr(p);}

// ---- POT → 최대 도달 가능 OVR 천장 (POT 1~100 스케일: 50→59, 100→100) ----
function maxOvrFromPot(pot){return Math.floor(18+(pot||50)*0.825);}

// ---- Season Stats (per-player real game stats) ----
function initSeasonStats(p){
  p.ss={ab:0,h:0,hr:0,xbh:0,rbi:0,bb:0,k:0,sb:0,     // batter
        ip:0,outs:0,er:0,pk:0,pbb:0,w:0,l:0,sv:0,ha:0,gp:0,phr:0};  // pitcher (outs 정수 누적, phr=피홈런 for FIP)
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

// ---- Sabermetrics (P3): SLG/OPS/wOBA/wRC+/FIP/WAR ----
// 2B/3B 미분리(xbh=장타 합)라 TB·wOBA는 장타 평균 가중으로 근사. phr=피홈런(FIP용).
function _ssSingles(s){return Math.max(0,(s.h||0)-(s.xbh||0)-(s.hr||0));}
function ssSLG(p){const s=p.ss;if(!s||!((s.ab||0)>0))return 0;
  const tb=_ssSingles(s)+2.3*(s.xbh||0)+4*(s.hr||0); return tb/s.ab;} // 장타 평균 2.3루타 근사
function ssOPS(p){return ssOBP(p)+ssSLG(p);}
function ssWOBA(p){const s=p.ss;if(!s)return 0;const pa=(s.ab||0)+(s.bb||0);if(pa<=0)return 0;
  return (0.69*(s.bb||0)+0.89*_ssSingles(s)+1.35*(s.xbh||0)+2.10*(s.hr||0))/pa;} // 장타 가중 1.35 근사
const FIP_CONSTANT=3.10; // ERA 스케일 정렬 상수 (MLB 근사)
function ssFIP(p){const s=p.ss;const o=_ssOuts(s||{});if(o<=0)return 99.99;const ip=o/3;
  return +(((13*(s.phr||0)+3*(s.pbb||0)-2*(s.pk||0))/ip)+FIP_CONSTANT).toFixed(2);}
// 리그 평균 wOBA (활성 타자·PA≥10) — wRC+/WAR 기준선. 시상·리더보드에서만 호출되어 매번 산출.
function _leagueWOBA(){
  if(typeof G==='undefined'||!G.teams)return 0.315;
  let num=0,den=0;
  G.teams.forEach(t=>(t.roster||[]).forEach(p=>{
    if(p.isPitcher||!p.ss)return;const pa=(p.ss.ab||0)+(p.ss.bb||0);
    if(pa<10)return;num+=ssWOBA(p)*pa;den+=pa;}));
  return den>0?num/den:0.315;}
function ssWRCplus(p){const lg=_leagueWOBA();return lg>0?Math.round((ssWOBA(p)/lg)*100):100;} // 100=리그평균
// WAR — 타자(wOBA 대비 리그평균 + 포지션 보정)·투수(FIP 대비 대체수준). 공통 스케일(시상 랭킹).
const _WAR_POS_ADJ={C:9,SS:7,'2B':3,CF:3,'3B':2,DH:-15,'1B':-9,LF:-7,RF:-7};
function warBatter(p){const s=p.ss;if(!s)return 0;const pa=(s.ab||0)+(s.bb||0);if(pa<=0)return 0;
  const wraa=(ssWOBA(p)-_leagueWOBA())/1.20*pa;              // wOBA 대비 득점 기여
  const pos=(_WAR_POS_ADJ[p.pos]||0)*pa/600;                 // 포지션 조정(풀시즌 600PA 기준)
  return +((wraa+pa*0.028+pos)/9).toFixed(1);}               // 대체수준 +0.028R/PA, RPW 9
function warPitcher(p){const o=_ssOuts(p.ss||{});if(o<=0)return 0;const ip=o/3;
  return +(((5.00-ssFIP(p))*ip/9)/9).toFixed(1);}            // 대체 FIP 5.00, /9이닝, RPW 9
function warSaber(p){return p.isPitcher?warPitcher(p):warBatter(p);} // 시상용 정식 WAR (approxWAR는 연봉 전용 유지)

// ---- 규정타석/규정이닝 최소 기준 (비율 스탯 랭킹용) ----
function getMinPA(ratio){return Math.max(1,Math.floor((G.gameNum||1)*QUALIFY_PA_PER_GAME*ratio));}
function getMinOuts(ratio){return Math.max(1,Math.floor((G.gameNum||1)*QUALIFY_OUTS_PER_GAME*ratio));}
function qualifyBatter(p,ratio){const s=p.ss;return s&&((s.ab||0)+(s.bb||0))>=getMinPA(ratio);}
function qualifyPitcher(p,ratio){const s=p.ss;return s&&(s.outs||0)>=getMinOuts(ratio);}

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
