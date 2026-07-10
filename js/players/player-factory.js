// ===================== PLAYER FACTORY (Individual Player Assembly) =====================

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
  if(role==='CP'){p.clutch=clamp(p.clutch+rand(6,12),STAT_MIN,STAT_MAX); p.stuff=clamp(p.stuff+rand(4,8),25,80);}
  if(role==='SU'){p.stuff=clamp(p.stuff+rand(4,8),25,80); p.control=clamp(p.control+rand(3,6),STAT_MIN,STAT_MAX);}
  if(role==='LR'){p.stamina=clamp(p.stamina+rand(8,14),STAT_MIN,STAT_MAX); p.stuff=clamp(p.stuff-rand(2,6),25,80);}

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
// DRAFT PROSPECT (등급별 유망주 생성)
// ═══════════════════════════════════════════════════════
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
