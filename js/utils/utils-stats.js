// ===================== UTILS-STATS (Sabermetrics & OVR Engine) =====================
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

// ---- POT → 최대 도달 가능 OVR 천장 ----
function maxOvrFromPot(pot){return Math.floor(18+(pot||10)*4.125);}

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
