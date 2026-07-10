// ===================== UTILS-SCOUT (Scouting & Info Filtering) =====================

// ---- Scout Report (히든 스탯을 텍스트로 변환) ----
// 히든 스탯 1~100 스케일 (50=평균)
function _hiddenGrade(v){
  if(v>=90)return{text:'최상급',cls:'s-elite'};
  if(v>=75)return{text:'우수',cls:'s-good'};
  if(v>=60)return{text:'양호',cls:'s-avg'};
  if(v>=45)return{text:'보통',cls:'s-low'};
  return{text:'부족',cls:'s-bad'};
}
function getScoutReport(p){
  // 드래프트 풀 신인이면 스카우트팀 레벨, 프로 선수면 분석팀 레벨 기준
  const isDraftRookie=Array.isArray(G.draftPool)&&G.draftPool.includes(p);
  const targetLv=isDraftRookie?(G.myTeam.scoutingLevel||0):(G.myTeam.analyticsLevel||0);
  const baseFuzz=targetLv>=60?5:targetLv>=30?10:20;
  // 드림즈(prospect): 스카우트 정확도 +50% (fuzz 절반)
  const fuzzAmt=G.myTeam.concept==='prospect'?Math.max(5,Math.ceil(baseFuzz*0.5)):baseFuzz;
  // 퍼징값을 1회만 계산하여 등급·텍스트 모두 동일 기준 사용
  function fuzzVal(key){const raw=p[key]||50;return clamp(raw+rand(-fuzzAmt,fuzzAmt),1,100);}
  const potV=fuzzVal('_potential');
  const durV=fuzzVal('_durability');
  const conV=fuzzVal('_consistency');
  const cltV=fuzzVal('_clutchHidden');
  const weV=fuzzVal('_workEthic');
  const verV=fuzzVal('_versatility');
  const ambV=fuzzVal('_ambition');
  const loyV=fuzzVal('_loyalty');
  const temV=fuzzVal('_temperament');
  const extV=p.isPitcher?fuzzVal('_recovery'):fuzzVal('_pullTendency');

  const pot=_hiddenGrade(potV);
  const dur=_hiddenGrade(durV);
  const con=_hiddenGrade(conV);
  const clt=_hiddenGrade(cltV);
  const we=_hiddenGrade(weV);
  const ver=_hiddenGrade(verV);
  const amb=_hiddenGrade(ambV);
  const loy=_hiddenGrade(loyV);
  const tem=_hiddenGrade(temV);
  const ext=_hiddenGrade(extV);

  const potCap=maxOvrFromPot(potV);
  const potText=potV>=85?`프랜차이즈 스타 자질. 최대 ${potCap} OVR 도달 가능.`
    :potV>=65?`올스타급 성장 가능. 최대 ${potCap} OVR까지 기대.`
    :potV>=50?`평균 주전급 한계. 최대 ${potCap} OVR.`
    :`성장 여지 제한적. 최대 ${potCap} OVR.`;

  const durText=durV>=75?'철인 체력. 풀시즌을 거뜬히 소화합니다.'
    :durV>=55?'일반적인 체력 수준입니다.'
    :durV>=35?'체력 관리에 주의가 필요합니다.'
    :'유리 몸. 부상 위험이 매우 높습니다.';

  const conText=conV>=75?'매 경기 안정적인 퍼포먼스를 보여줍니다.'
    :conV>=55?'대체로 일관된 플레이를 합니다.'
    :conV>=35?'컨디션에 따라 기복이 있는 편입니다. 슬럼프 주의.'
    :'롤러코스터. 장기 슬럼프에 빠질 위험이 높습니다.';

  const cltText=cltV>=75?'하이 레버리지에서 더 빛나는 승부사입니다.'
    :cltV>=55?'중요한 순간에도 흔들리지 않습니다.'
    :cltV>=35?'승부처에서 다소 위축됩니다.'
    :'중압감에 약합니다. 접전에서 기대하기 어렵습니다.';

  const weText=weV>=75?'모범적인 자기 관리. 빠르게 성장하며 노쇠화가 늦습니다.'
    :weV>=55?'성실한 훈련 태도입니다.'
    :weV>=35?'평범한 훈련 태도. 성장이 더딜 수 있습니다.'
    :'훈련 불성실. 성장이 매우 느리고 노쇠화가 빠릅니다.';

  const verText=verV>=75?'멀티 포지션을 소화하는 유틸리티 자원입니다.'
    :verV>=55?'포지션·보직 전환 적응이 빠른 편입니다.'
    :verV>=35?'보직 변경에 적응 시간이 필요합니다.'
    :'한 자리 전문. 전환 기용은 무리입니다.';

  const ambText=ambV>=75?'큰 무대와 큰 계약을 원합니다. 성장 욕심이 강하지만 요구도 공격적입니다.'
    :ambV>=55?'목표 의식이 뚜렷한 선수입니다.'
    :ambV>=35?'현재 위치에 대체로 만족합니다.'
    :'승부욕이 부족하다는 평가가 있습니다.';

  const loyText=loyV>=75?'팀에 대한 애착이 강합니다. 잔류 협상에 우호적입니다.'
    :loyV>=55?'구단과의 관계를 중시합니다.'
    :loyV>=35?'조건이 맞으면 이적을 고려할 선수입니다.'
    :'철저한 비즈니스 관계. 더 좋은 조건이면 떠납니다.';

  const temText=temV>=75?'벤치·강등도 묵묵히 받아들이는 인내심의 소유자입니다.'
    :temV>=55?'대체로 차분하게 협상에 임합니다.'
    :temV>=35?'대우가 나쁘면 불만이 쌓이는 타입입니다.'
    :'다혈질. 협상 결렬·강등에 즉각 반발합니다.';

  const extText=p.isPitcher
    ?(extV>=75?'회복이 매우 빠릅니다. 연투에 최적화된 어깨입니다.'
      :extV>=55?'평균적인 회복 속도입니다.'
      :extV>=35?'등판 간격 관리가 필요합니다.'
      :'회복이 느립니다. 연투 시 급격히 무너집니다.')
    :(extV>=75?'극단적 당김 타자. 시프트에 취약할 수 있습니다.'
      :extV>=55?'당겨치는 성향이 있습니다.'
      :extV>=35?'전 방향으로 고르게 타구를 보냅니다.'
      :'밀어치기에 능합니다. 시프트 파괴형 타자입니다.');

  return {pot,dur,con,clt,we,ver,amb,loy,tem,ext,potText,durText,conText,cltText,weText,verText,ambText,loyText,temText,extText};
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

  // 잠재력 (1~100 스케일)
  const pot=p._potential||50;
  if(scLv>=80) info.pot=pot;
  else if(scLv>=60) info.potRange=[Math.max(35,pot-10),Math.min(100,pot+10)];
  else if(scLv>=30) info.potHint=pot>=75?'스타 재목':pot>=60?'1군 주전급':pot>=45?'백업 수준':'제한적';
  else info.potHint=null;

  // 프로의식 (_workEthic) — 스카우트팀 레벨에 연동
  const we=p._workEthic||50;
  if(scLv>=90) info.workEthic=we;
  else if(scLv>=70) info.workEthicRange=[Math.max(35,we-10),Math.min(100,we+10)];

  // 스카우트팀 Lv.90+: 스틸픽 특성 (실제 OVR과 스카우팅 OVR 괴리 감지)
  if(scLv>=90){
    if(maxOvrFromPot(pot)-ovrRaw(p)>=25) info.sleeper=true; // 절대 raw 기준 (상대 OVR 혼용 금지)
  }

  return info;
}

// 데이터 분석팀 레벨 기반 프로 선수 히든 스탯 공개 범위
function getAnalyticsHiddenInfo(p,aLv){
  const info={};
  if(aLv>=90){
    info.durability=p._durability||50;
    info.consistency=p._consistency||50;
    info.clutchHidden=p._clutchHidden||50;
  }else if(aLv>=80){
    info.durability=p._durability||50;
    info.consistency=p._consistency||50;
  }else if(aLv>=60){
    info.durability=p._durability||50;
  }
  return info;
}
