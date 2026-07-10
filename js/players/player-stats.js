// ===================== PLAYER STATS (Stat Distribution & Concept Engine) =====================

// ═══════════════════════════════════════════════════════
// 2단계: 메인 스탯 + 잠재력(POT) 생성
// ═══════════════════════════════════════════════════════

// 등급별 타겟 OVR을 평균으로 스탯 생성 (정규분포)
function _genStatFromOvr(targetOvr, offset){
  return randGauss(targetOvr+(offset||0), 10, STAT_MIN, STAT_MAX);
}

// 포지션 가중치: 포수/유격수는 타격 스탯 -5 페널티 (수비 부담 반영)
function _posOffensePenalty(pos){
  if(pos==='C'||pos==='SS') return -5;
  return 0;
}

// 에이징 커브 잠재력: 23세 이하 높은 POT, 36세+ POT 캡
// OVR 기반 최소 잠재력: 이미 고능력을 증명한 선수는 잠재력 하한 보장
function _agingPotential(age, basePot, currentOvr){
  // OVR 기반 최소 잠재력 (능력이 증명된 선수)
  const ovrFloor=currentOvr>=84?14 : currentOvr>=75?12 : currentOvr>=67?10 : 7;

  let pot;
  if(age<=23)      pot=clamp(basePot+rand(1,3), 7, 20);
  else if(age<=29) pot=clamp(basePot-rand(0,1), 7, 20);
  else if(age<=35) pot=clamp(basePot-rand(1,3), 7, 15);
  else {
    const ovrLevel=Math.round((currentOvr-1)/9.9);
    pot=clamp(Math.min(basePot, ovrLevel+rand(0,2)), 7, 10);
  }

  return Math.max(pot, ovrFloor);
}

// 에이징 피지컬 패널티 (speed, velocity)
function _agingStatPenalty(age){
  if(age<=27) return 0;
  if(age<=30) return rand(0,2);
  if(age<=33) return rand(1,4);
  if(age<=36) return rand(2,6);
  return rand(4,8);
}

// ═══════════════════════════════════════════════════════
// 4단계: 8개 구단 팀 컬러 보정 (Flat Point)
// ═══════════════════════════════════════════════════════

function _applyConceptBatter(p, concept){
  if(concept==='power_hit')    { p.contact=clamp(p.contact-2,STAT_MIN,STAT_MAX); p.eye=clamp(p.eye-2,STAT_MIN,STAT_MAX); }
  if(concept==='speed')        { p.speed=clamp(p.speed+4,STAT_MIN,STAT_MAX); p.contact=clamp(p.contact+4,STAT_MIN,STAT_MAX);
                                  p.power=clamp(p.power-2,STAT_MIN,STAT_MAX); p.eye=clamp(p.eye-2,STAT_MIN,STAT_MAX);
                                  p.fielding=clamp(p.fielding+4,STAT_MIN,STAT_MAX); }
  if(concept==='sabermetrics') { p.eye=clamp(p.eye+4,STAT_MIN,STAT_MAX); p.power=clamp(p.power+2,STAT_MIN,STAT_MAX);
                                  p.contact=clamp(p.contact-2,STAT_MIN,STAT_MAX); p.speed=clamp(p.speed-2,STAT_MIN,STAT_MAX); }
  if(concept==='contact_hit')  { p.contact=clamp(p.contact+4,STAT_MIN,STAT_MAX); p.eye=clamp(p.eye+2,STAT_MIN,STAT_MAX);
                                  p.power=clamp(p.power-2,STAT_MIN,STAT_MAX); }
  if(concept==='defense')      { p.power=clamp(p.power-2,STAT_MIN,STAT_MAX); p.contact=clamp(p.contact-2,STAT_MIN,STAT_MAX);
                                  p.fielding=clamp(p.fielding+4,STAT_MIN,STAT_MAX); p.arm=clamp(p.arm+4,STAT_MIN,STAT_MAX); }
}

function _applyConceptPitcher(p, concept, role){
  if(concept==='power_hit'){
    if(role==='SP'){ p.stuff=clamp(p.stuff+3,9,100); p.stamina=clamp(p.stamina+4,STAT_MIN,STAT_MAX); }
  }
  if(concept==='bullpen'){
    if(role==='SP'){ p.stuff=clamp(p.stuff-2,9,100); p.control=clamp(p.control-2,STAT_MIN,STAT_MAX); }
    else { p.stuff=clamp(p.stuff+4,9,100); p.clutch=clamp(p.clutch+4,STAT_MIN,STAT_MAX); }
  }
  if(concept==='defense'){ p.movement=clamp(p.movement+3,STAT_MIN,STAT_MAX); }
}

// ── 드래프트 OVR 강제 조정 (스탯을 타겟 OVR에 맞춤) ──
function _forceDraftOvr(p, targetOvr){
  const stats=p.isPitcher
    ? ['stuff','control','velocity','movement','stamina','clutch']
    : ['contact','power','eye','speed','fielding','arm'];
  // 먼저 모든 스탯을 낮은 기본값으로
  stats.forEach(s=>{p[s]=clamp(rand(1,14),STAT_MIN,STAT_MAX);});
  // 타겟 OVR까지 조정
  let att=0;
  while(Math.abs(ovrRaw(p)-targetOvr)>2 && att<30){
    const diff=targetOvr-ovrRaw(p);
    const s=pick(stats);
    p[s]=clamp(p[s]+Math.round(diff*0.5),STAT_MIN,STAT_MAX);
    att++;
  }
}
