// ===================== PLAYER GENERATION (5-Step KBO Realistic System) =====================

// ═══════════════════════════════════════════════════════
// 1단계: 등급(Grade) 확률 분포 + 나이 생성
// ═══════════════════════════════════════════════════════

// 등급 뽑기: S(2%), A(13%), B(35%), C(35%), D(15%)
function _rollGrade(){
  const r=rand(1,100);
  if(r<=2)  return 'S';   // 2%
  if(r<=15) return 'A';   // 13%
  if(r<=50) return 'B';   // 35%
  if(r<=85) return 'C';   // 35%
  return 'D';              // 15%
}

// 등급별 OVR 범위
const GRADE_OVR={S:[70,80],A:[60,69],B:[50,59],C:[40,49],D:[25,39]};

// 등급별 나이 생성
function _gradeAge(grade){
  if(grade==='S') return randGauss(29,2,26,33);     // 전성기
  if(grade==='A') return randGauss(28,3,24,35);     // 핵심 코어
  if(grade==='B') return randGauss(27,4,22,36);     // 1군 레귤러
  if(grade==='C'){
    // 50% 콜업 유망주(20~24), 50% 노장(33~38)
    return Math.random()<0.5 ? randGauss(22,1,20,24) : randGauss(35,1,33,38);
  }
  // D급: 80% 원석(18~22), 20% 은퇴 직전(37~40)
  return Math.random()<0.8 ? randGauss(20,1,18,22) : randGauss(38,1,37,40);
}

// 나이 기반 서비스 타임
function _ageToServiceTime(age){
  if(age<=20) return 0;
  if(age<=23) return rand(0,Math.min(age-18,3));
  if(age<=27) return rand(2,Math.min(age-18,6));
  return rand(Math.max(4,age-24),Math.min(age-18,15));
}

// ═══════════════════════════════════════════════════════
// 2단계: 메인 스탯 + 잠재력(POT) 생성
// ═══════════════════════════════════════════════════════

// 등급별 타겟 OVR을 평균으로 스탯 생성 (정규분포)
function _genStatFromOvr(targetOvr, offset){
  return randGauss(targetOvr+(offset||0), 6, 20, 80);
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
  const ovrFloor=currentOvr>=70?14 : currentOvr>=65?12 : currentOvr>=60?10 : 7;

  let pot;
  if(age<=23)      pot=clamp(basePot+rand(1,3), 7, 20);
  else if(age<=29) pot=clamp(basePot-rand(0,1), 7, 20);
  else if(age<=35) pot=clamp(basePot-rand(1,3), 7, 15);
  else {
    const ovrLevel=Math.round((currentOvr-20)/6);
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
// 3단계: 히든 스탯 생성 (평균 10.5, 표준편차 3.5)
// ═══════════════════════════════════════════════════════

function _genHidden(){
  return clamp(Math.round(randomGaussian(10.5, 3.5)), 7, 20);
}

// 등급별 잠재력 기반값 — 등급이 높을수록 최소 잠재력 보장
function _gradePotBase(grade){
  if(grade==='S') return randGauss(17,1,15,20);   // S급: 최소 15 보장
  if(grade==='A') return randGauss(14,2,12,18);   // A급: 최소 12 보장
  if(grade==='B') return randGauss(11,2,7,15);
  if(grade==='C') return randGauss(9,2,7,13);
  return randGauss(13,3,8,20); // D급: 원석이므로 잠재력 높을 수 있음
}

// ═══════════════════════════════════════════════════════
// 4단계: 8개 구단 팀 컬러 보정 (Flat Point)
// ═══════════════════════════════════════════════════════

function _applyConceptBatter(p, concept){
  if(concept==='power_hit')    { p.contact=clamp(p.contact-2,20,80); p.eye=clamp(p.eye-2,20,80); }
  if(concept==='speed')        { p.speed=clamp(p.speed+4,20,80); p.contact=clamp(p.contact+4,20,80);
                                  p.power=clamp(p.power-2,20,80); p.eye=clamp(p.eye-2,20,80);
                                  p.fielding=clamp(p.fielding+4,20,80); }
  if(concept==='sabermetrics') { p.eye=clamp(p.eye+4,20,80); p.power=clamp(p.power+2,20,80);
                                  p.contact=clamp(p.contact-2,20,80); p.speed=clamp(p.speed-2,20,80); }
  if(concept==='contact_hit')  { p.contact=clamp(p.contact+4,20,80); p.eye=clamp(p.eye+2,20,80);
                                  p.power=clamp(p.power-2,20,80); }
  if(concept==='defense')      { p.power=clamp(p.power-2,20,80); p.contact=clamp(p.contact-2,20,80);
                                  p.fielding=clamp(p.fielding+4,20,80); p.arm=clamp(p.arm+4,20,80); }
}

function _applyConceptPitcher(p, concept, role){
  if(concept==='power_hit'){
    if(role==='SP'){ p.stuff=clamp(p.stuff+3,25,80); p.stamina=clamp(p.stamina+4,20,80); }
  }
  if(concept==='bullpen'){
    if(role==='SP'){ p.stuff=clamp(p.stuff-2,25,80); p.control=clamp(p.control-2,20,80); }
    else { p.stuff=clamp(p.stuff+4,25,80); p.clutch=clamp(p.clutch+4,20,80); }
  }
  if(concept==='defense'){ p.movement=clamp(p.movement+3,20,80); }
}

// ═══════════════════════════════════════════════════════
// 5단계: 인플레이션 방어형 KBO 계약 산정
// ═══════════════════════════════════════════════════════

// 사치세 라인 비율(%) 기반 연봉 계산
function _calcSalary(pOvr, serviceTime){
  const taxLine = LUXURY_TAX_THRESHOLD;  // 현재 140억

  // 프리FA (0~3년): OVR 무관 1억 미만 억제
  if(serviceTime <= PRE_ARB_MAX_SERVICE){
    if(pOvr>=70) return +(rand(3,8)/10).toFixed(1);   // 0.3~0.8억
    if(pOvr>=65) return +(rand(3,6)/10).toFixed(1);   // 0.3~0.6억
    if(pOvr>=60) return +(rand(3,4)/10).toFixed(1);   // 0.3~0.4억
    return SALARY_MIN;                                  // 0.3억
  }

  // 연봉조정 (4~6년): 사치세 라인의 0.3% ~ 6%
  if(serviceTime <= ARB_MAX_SERVICE){
    if(pOvr>=70) return +((taxLine * rand(40,60)/1000).toFixed(1));  // 4%~6% → 5.6~8.4억
    if(pOvr>=65) return +((taxLine * rand(20,40)/1000).toFixed(1));  // 2%~4% → 2.8~5.6억
    if(pOvr>=60) return +((taxLine * rand(10,20)/1000).toFixed(1));  // 1%~2% → 1.4~2.8억
    if(pOvr>=50) return +((taxLine * rand(5,10)/1000).toFixed(1));   // 0.5%~1% → 0.7~1.4억
    return +((taxLine * rand(3,5)/1000).toFixed(1));                 // 0.3%~0.5% → 0.42~0.7억
  }

  // FA 계약 (7년+): 사치세 라인의 % 시장가치
  if(pOvr>=70) return +((taxLine * rand(100,180)/1000).toFixed(1));  // 10%~18% → 14~25.2억
  if(pOvr>=65) return +((taxLine * rand(60,100)/1000).toFixed(1));   // 6%~10% → 8.4~14억
  if(pOvr>=60) return +((taxLine * rand(30,50)/1000).toFixed(1));    // 3%~5% → 4.2~7억
  if(pOvr>=50) return +((taxLine * rand(10,20)/1000).toFixed(1));    // 1%~2% → 1.4~2.8억
  return SALARY_MIN;
}

// FA 계약 기간
function _calcContractYears(pOvr){
  if(pOvr>=70) return rand(3,5);
  if(pOvr>=65) return rand(2,4);
  if(pOvr>=60) return rand(1,3);
  if(pOvr>=50) return rand(1,2);
  return 1;
}

// 포지션별 특수 계약 이벤트 확률 보정
function _posEventMod(pos){
  const g=POS_CONTRACT_GROUP[pos]||'B';
  if(g==='A') return {franchiseMod:5, garbageMod:-5};  // C/SS/CF 프랜차이즈↑ 먹튀↓
  if(g==='C') return {franchiseMod:-5, garbageMod:0};
  if(g==='D') return {franchiseMod:-10, garbageMod:0};
  return {franchiseMod:0, garbageMod:0};
}

// 특수 계약 이벤트 (FA 단계만)
function _applySpecialContract(p, pOvr, team){
  const mod=_posEventMod(p.pos);

  // 1. 프랜차이즈 스타: FA + OVR 65+ → 기본 15% + 포지션 보정
  const franchiseProb=clamp(15+mod.franchiseMod, 0, 30);
  if(pOvr>=65 && rand(1,100)<=franchiseProb){
    p._contractYears=rand(4,6);
    p.salary=+(p.salary*1.2).toFixed(1);  // 1.2배 + 초장기
    p._contractEvent='franchise';
    return;
  }

  // 2. 악성 먹튀: FA + OVR 45~50 → 시스템 레벨 비례
  if(pOvr>=45 && pOvr<=50){
    let baseProb;
    if(team==='my' && typeof G!=='undefined' && G.myTeam){
      const sysLv=Math.round(((G.myTeam.devLevel||50)+(G.myTeam.facilityLevel||50))/2);
      baseProb=clamp(Math.round(5+(100-sysLv)*0.2), 5, 25);
    } else {
      baseProb=10;
    }
    const garbageProb=clamp(baseProb+mod.garbageMod, 0, 30);
    if(rand(1,100)<=garbageProb){
      p._contractYears=rand(3,4);
      p.salary=+(p.salary*2.5).toFixed(1);  // 2.5배 + 장기
      p._contractEvent='garbage';
    }
  }
}

// 초기 계약 적용 (등급 기반 나이 부여)
function applyInitialContract(p, grade, team){
  p.age=_gradeAge(grade);
  p._seasonsPlayed=Math.max(0, p.age-18);
  p._serviceTime=_ageToServiceTime(p.age);
  p._teamTenure=rand(0, Math.min(p._serviceTime, 5));

  // 에이징에 따른 잠재력 보정
  p._potential=_agingPotential(p.age, p._potential, ovr(p));

  // 에이징에 따른 피지컬 패널티 (speed/velocity)
  const agePen=_agingStatPenalty(p.age);
  if(agePen>0){
    if(p.isPitcher) p.velocity=clamp(p.velocity-agePen, 20, 80);
    else p.speed=clamp(p.speed-agePen, 20, 80);
  }

  // 계약 단계 + 연봉
  const st=p._serviceTime;
  const pOvr=ovr(p);

  if(st<=PRE_ARB_MAX_SERVICE){
    p._contractYears=1;
    p.salary=_calcSalary(pOvr, st);
  } else if(st<=ARB_MAX_SERVICE){
    p._contractYears=1;
    p.salary=_calcSalary(pOvr, st);
  } else {
    p._contractYears=_calcContractYears(pOvr);
    p.salary=_calcSalary(pOvr, st);
    _applySpecialContract(p, pOvr, team);
  }

}

// ═══════════════════════════════════════════════════════
// BATTER GENERATION (5단계 통합)
// ═══════════════════════════════════════════════════════
function genBatter(pos, gradeOrTier, concept, team){
  // 등급 결정: 문자열이면 그대로, 숫자(구 tier)면 변환
  let grade;
  if(typeof gradeOrTier==='string' && 'SABCD'.includes(gradeOrTier)){
    grade=gradeOrTier;
  } else {
    grade=_rollGrade();
  }

  // 1단계: 타겟 OVR 결정
  const [ovrMin, ovrMax]=GRADE_OVR[grade];
  const targetOvr=rand(ovrMin, ovrMax);
  const isDH=pos==='DH';
  const posPen=_posOffensePenalty(pos);

  // 2단계: 스탯 생성 (타겟 OVR 중심 정규분포)
  let p={
    _uid:Date.now().toString(36)+Math.random().toString(36).slice(2,7),
    name:genName(), pos, isPitcher:false, role:'starting', status:'active',
    xp:0, cooldown:0, isOnIL:false, ilGamesLeft:0, rehabGamesLeft:0, age:22,
    contact:  _genStatFromOvr(targetOvr+posPen),
    power:    _genStatFromOvr(targetOvr+posPen),
    eye:      _genStatFromOvr(targetOvr-2+posPen),
    speed:    _genStatFromOvr(targetOvr-2),
    fielding: isDH ? randGauss(30,5,20,45) : _genStatFromOvr(targetOvr),
    arm:      isDH ? randGauss(30,5,20,45) : _genStatFromOvr(targetOvr-2),
    condition:rand(70,100),
    popularity:rand(10, grade==='S'?80 : grade==='A'?60 : 40),
    salary:SALARY_MIN,
    overseasUntil:null, prevRole:null,
    canDebutYear:null, _serviceTime:0, _careerStats:null, _seasonsPlayed:0,
    _teamTenure:0, _optionYearsUsed:0, _contractYears:1,
    _contractEvent:null,
    // 3단계: 히든 스탯 (안정 정규분포)
    _potential: _gradePotBase(grade),
    _durability: _genHidden(),
    _consistency: _genHidden(),
    _clutchHidden: _genHidden(),
    _workEthic: _genHidden(),
  };

  // 4단계: 컨셉 보정
  _applyConceptBatter(p, concept);

  // OVR 80 상한 보장
  const stats=['contact','power','eye','speed','fielding','arm'];
  stats.forEach(s=>{ p[s]=clamp(p[s], 20, 80); });

  // POT-OVR 정합성: targetOvr에 도달 가능하도록 POT 최소값 보장
  const minPotForOvr=Math.ceil((targetOvr-30)/2.5);
  p._potential=Math.max(p._potential, clamp(minPotForOvr, 7, 20));

  // 5단계: 계약 산정
  applyInitialContract(p, grade, team);
  return p;
}

// ═══════════════════════════════════════════════════════
// PITCHER GENERATION (5단계 통합)
// ═══════════════════════════════════════════════════════
function genPitcher(role, gradeOrTier, concept, team){
  let grade;
  if(typeof gradeOrTier==='string' && 'SABCD'.includes(gradeOrTier)){
    grade=gradeOrTier;
  } else {
    grade=_rollGrade();
  }

  const [ovrMin, ovrMax]=GRADE_OVR[grade];
  const targetOvr=rand(ovrMin, ovrMax);
  const stamOff=role==='SP'?3 : role==='LR'?0 : role==='CP'?-6 : -4;

  let p={
    _uid:Date.now().toString(36)+Math.random().toString(36).slice(2,7),
    name:genName(), pos:role, isPitcher:true,
    role:role==='SP'?'rotation':'bullpen', status:'active',
    xp:0, cooldown:0, isOnIL:false, ilGamesLeft:0, rehabGamesLeft:0, age:22,
    stuff:    _genStatFromOvr(targetOvr+3),
    control:  _genStatFromOvr(targetOvr),
    velocity: _genStatFromOvr(targetOvr+2),
    movement: _genStatFromOvr(targetOvr),
    stamina:  _genStatFromOvr(targetOvr+stamOff),
    clutch:   _genStatFromOvr(targetOvr-3),
    condition:rand(70,100),
    popularity:rand(10, grade==='S'?80 : grade==='A'?60 : 40),
    salary:SALARY_MIN,
    currentStamina:100,
    overseasUntil:null, prevRole:null,
    canDebutYear:null, _serviceTime:0, _careerStats:null, _seasonsPlayed:0,
    _teamTenure:0, _optionYearsUsed:0, _contractYears:1,
    _contractEvent:null,
    _potential: _gradePotBase(grade),
    _durability: _genHidden(),
    _consistency: _genHidden(),
    _clutchHidden: _genHidden(),
    _workEthic: _genHidden(),
  };

  // 역할별 보정
  if(role==='CP'){p.clutch=clamp(p.clutch+rand(6,12),20,80); p.stuff=clamp(p.stuff+rand(4,8),25,80);}
  if(role==='SU'){p.stuff=clamp(p.stuff+rand(4,8),25,80); p.control=clamp(p.control+rand(3,6),20,80);}
  if(role==='LR'){p.stamina=clamp(p.stamina+rand(8,14),20,80); p.stuff=clamp(p.stuff-rand(2,6),25,80);}

  // 4단계: 컨셉 보정
  _applyConceptPitcher(p, concept, role);

  // OVR 80 상한 보장
  const stats=['stuff','control','velocity','movement','stamina','clutch'];
  stats.forEach(s=>{ p[s]=clamp(p[s], 20, 80); });

  // POT-OVR 정합성: targetOvr에 도달 가능하도록 POT 최소값 보장
  const minPotForOvr=Math.ceil((targetOvr-30)/2.5);
  p._potential=Math.max(p._potential, clamp(minPotForOvr, 7, 20));

  // 5단계: 계약 산정
  applyInitialContract(p, grade, team);
  return p;
}

// ═══════════════════════════════════════════════════════
// DRAFT PROSPECT (무조건 D급 원석)
// ═══════════════════════════════════════════════════════
// 드래프트 등급별 유망주 생성
// grade: 'S'|'A'|'B'|'C' — 등급별 POT/나이/OVR 범위
function genDraftProspect(isBatter, draftGrade){
  const grade=draftGrade||'C';
  const pos=isBatter ? pick(['C','1B','2B','3B','SS','LF','CF','RF']) : pick(['SP','SP','MR','SU']);
  const p=isBatter ? genBatter(pos,'D') : genPitcher(pos,'D');

  // 등급별 POT/나이/OVR 설정
  if(grade==='S'){
    p._potential=rand(17,20);
    p.age=rand(18,19);
    _forceDraftOvr(p,rand(20,30));
  }else if(grade==='A'){
    p._potential=rand(14,16);
    p.age=rand(18,21);
    _forceDraftOvr(p,rand(22,32));
  }else if(grade==='B'){
    p._potential=rand(12,13);
    p.age=rand(20,23);
    _forceDraftOvr(p,rand(25,35));
  }else if(grade==='D'){
    // D급: 낮은 잠재력, 로또 원석
    p._potential=rand(8,10);
    p.age=rand(22,25);
    _forceDraftOvr(p,rand(22,30));
  }else{
    // C급 (기본)
    p._potential=rand(10,11);
    p.age=rand(21,24);
    _forceDraftOvr(p,rand(28,38));
  }

  p.status='futures';
  p.role=p.isPitcher ? 'rotation' : 'bench';
  p.salary=SALARY_MIN;
  p._serviceTime=0;
  p._seasonsPlayed=0;
  p._contractYears=1;
  p._teamTenure=0;
  p._optionYearsUsed=0;
  p._contractEvent=null;
  p.canDebutYear=(typeof G!=='undefined' ? G.season : 1)+1;
  return p;
}

// 드래프트 OVR 강제 조정 (스탯을 타겟 OVR에 맞춤)
function _forceDraftOvr(p, targetOvr){
  const stats=p.isPitcher
    ? ['stuff','control','velocity','movement','stamina','clutch']
    : ['contact','power','eye','speed','fielding','arm'];
  // 먼저 모든 스탯을 낮은 기본값으로
  stats.forEach(s=>{p[s]=clamp(rand(20,28),20,80);});
  // 타겟 OVR까지 조정
  let att=0;
  while(Math.abs(ovr(p)-targetOvr)>2 && att<30){
    const diff=targetOvr-ovr(p);
    const s=pick(stats);
    p[s]=clamp(p[s]+Math.round(diff*0.5),20,80);
    att++;
  }
}

// ===================== DRAFT GENERATION (6 Rounds = 48 Players) =====================
// 목표 기대값: S 1명, A 7명, B 20명, C 15명, D 5명
function generateDraftPool(){
  const pool=[];
  // 1. 최소 보장 (1~3픽용 대어)
  pool.push(genDraftProspect(Math.random()<0.5, 'S'));
  pool.push(genDraftProspect(Math.random()<0.5, 'A'));
  pool.push(genDraftProspect(Math.random()<0.5, 'A'));
  // 2. 나머지 45명 확률형 생성
  for(let i=0;i<45;i++){
    const r=Math.random()*100;
    let g='D';
    if(r<0.5) g='S';       // 0.5% (황금 세대 잭팟)
    else if(r<12.0) g='A'; // 11.5%
    else if(r<56.0) g='B'; // 44.0%
    else if(r<90.0) g='C'; // 34.0%
    // 나머지 10% = D급
    pool.push(genDraftProspect(Math.random()<0.5, g));
  }
  // 3. 스카우팅 블라인드 (셔플)
  return pool.sort(()=>Math.random()-0.5);
}

// ═══════════════════════════════════════════════════════
// TEAM ROSTER GENERATION (등급 분포 적용)
// ═══════════════════════════════════════════════════════
function genTeamRoster(_tier, concept, isMyTeam){
  const _t=isMyTeam ? 'my' : null;
  const roster=[];

  // 1군 타자: DH 제외 8포지션 선발 (유저가 직접 DH 지정)
  const startingPos=['C','1B','2B','3B','SS','LF','CF','RF'];
  startingPos.forEach(pos=>roster.push(genBatter(pos, null, concept, _t)));
  // 벤치 5명: C~D 급 위주 (DH 슬롯용 여유 포함)
  const benchPos=['C','SS','CF','1B','RF'];
  benchPos.forEach(pos=>{
    const benchGrade=Math.random()<0.6 ? 'C' : 'D';
    const p=genBatter(pos, benchGrade, concept, _t);
    p.role='bench';
    roster.push(p);
  });

  // 1군 투수 14명
  for(let i=0;i<5;i++) roster.push(genPitcher('SP', null, concept, _t));  // 선발 5명
  roster.push(genPitcher('CP', null, concept, _t));                        // 마무리 1명
  for(let i=0;i<2;i++) roster.push(genPitcher('SU', null, concept, _t));  // 셋업 2명
  for(let i=0;i<4;i++) roster.push(genPitcher('MR', null, concept, _t)); // 중계 4명
  for(let i=0;i<2;i++) roster.push(genPitcher('LR', null, concept, _t)); // 롱릴리프 2명

  // 2군: C~D급 (DH 제외)
  const fieldPos=['C','1B','2B','3B','SS','LF','CF','RF'];
  for(let i=0;i<5;i++){
    const g=Math.random()<0.4 ? 'D' : 'C';
    const p=genBatter(pick(fieldPos), g, null, _t);
    p.role='bench'; p.status='futures';
    roster.push(p);
  }
  for(let i=0;i<4;i++){
    const g=Math.random()<0.4 ? 'D' : 'C';
    const p=genPitcher(pick(['SP','SP','MR','MR']), g, null, _t);
    p.status='futures';
    roster.push(p);
  }

  // 육성: D급 고정 + 추가 하향
  for(let i=0;i<3;i++){
    const p=i<2 ? genBatter(pick(fieldPos),'D', null, _t) : genPitcher(pick(['SP','MR']),'D', null, _t);
    p.role=p.isPitcher ? 'rotation' : 'bench';
    p.status='developmental';
    const ss=p.isPitcher
      ? ['stuff','control','velocity','movement','stamina','clutch']
      : ['contact','power','eye','speed','fielding','arm'];
    ss.forEach(s=>{ p[s]=clamp((p[s]||25)-rand(8,12), 20, 50); });
    roster.push(p);
  }

  return roster;
}
