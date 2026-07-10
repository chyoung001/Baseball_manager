// ===================== UTILS-SCOUT (Scouting & Info Filtering) =====================

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

// ═══════════════════════════════════════════════════════
// 드래프트 스카우팅 시스템
// ═══════════════════════════════════════════════════════

// 스카우트팀 레벨 기반 드래프트 OVR 퍼징 (시즌 초 1회 생성하여 고정)
function getScoutedOvr(p,scLv){
  const real=ovr(p);
  const fuzz=scLv>=90?0:scLv>=60?1:scLv>=30?4:8;
  return clamp(real+rand(-fuzz,fuzz),STAT_MIN,STAT_MAX);
}

// 스카우트팀 레벨 기반 드래프트 선수 정보 반환
function getDraftScoutInfo(p,scLv){
  const real=ovr(p);
  const info={name:p.name,pos:p.pos,age:p.age||18,isPitcher:p.isPitcher};

  // OVR
  if(scLv>=30) info.ovr=real;
  else info.ovrRange=[Math.max(1,real-8),Math.min(100,real+8)];

  // 스탯
  const stats=p.isPitcher?['stuff','control','velocity','movement','stamina','clutch']:['contact','power','eye','speed','fielding','arm'];
  if(scLv>=60){
    info.stats={};stats.forEach(s=>{info.stats[s]=p[s];});
  }else if(scLv>=30){
    info.stats={};stats.forEach(s=>{info.stats[s]=[Math.max(1,p[s]-5),Math.min(100,p[s]+5)];});
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
    const potCap=18+(pot*4.125);
    if(potCap-real>=25) info.sleeper=true;
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
