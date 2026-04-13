// ===================== UTILS-STATS (Sabermetrics & OVR Engine) =====================
function ovrBatter(p){return Math.round((p.contact||0)*0.25+(p.power||0)*0.20+(p.eye||0)*0.15+(p.speed||0)*0.15+(p.fielding||0)*0.15+(p.arm||0)*0.10);}
function ovrPitcher(p){return Math.round((p.stuff||0)*0.25+(p.control||0)*0.20+(p.velocity||0)*0.15+(p.movement||0)*0.15+(p.stamina||0)*0.15+(p.clutch||0)*0.10);}
function ovr(p){return p.isPitcher?ovrPitcher(p):ovrBatter(p);}

// ---- POT → 최대 도달 가능 OVR 천장 ----
function maxOvrFromPot(pot){return Math.floor(30+(pot||10)*2.5);}

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
