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
    _naturalPos:pos, _subPos:_rollSubPos(pos), // P2-1 서브 포지션 (다재다능 세금·전환 페널티 연동)
    xp:0, cooldown:0, isOnIL:false, ilGamesLeft:0, rehabGamesLeft:0, age:22,
    contact:  _genStatFromOvr(targetOvr+posPen),
    power:    _genStatFromOvr(targetOvr+posPen),
    eye:      _genStatFromOvr(targetOvr-2+posPen),
    speed:    _genStatFromOvr(targetOvr-2),
    fielding: isDH ? randGauss(18,8,STAT_MIN,42) : _genStatFromOvr(targetOvr),
    arm:      isDH ? randGauss(18,8,STAT_MIN,42) : _genStatFromOvr(targetOvr-2),
    condition:rand(70,100),
    popularity:rand(10, grade==='S'?80 : grade==='A'?60 : 40),
    salary:SALARY_MIN,
    overseasUntil:null, prevRole:null,
    canDebutYear:null, _serviceTime:0, _careerStats:null, _seasonsPlayed:0,
    _teamTenure:0, _optionYearsUsed:0, _contractYears:1,
    _contractEvent:null,
    // 3단계: 히든 스탯 (안정 정규분포, 1~100) — P2-2: 10종 체계
    _potential: _gradePotBase(grade),
    _durability: _genHidden(),      // 부상위험도 (높을수록 강골)
    _consistency: _genHidden(),     // 일관성
    _clutchHidden: _genHidden(),    // 클러치
    _workEthic: _genHidden(),       // 프로의식
    _versatility: _genHidden(),     // 다재다능 (포지션 전환 적응)
    _ambition: _genHidden(),        // 야망 (성장↑·협상 공격적)
    _loyalty: _genHidden(),         // 충성심 (FA 디스카운트·트레이드 저항)
    _temperament: _genHidden(),     // 참을성 (협상 인내·벤치 수용)
    _pullTendency: _genPullTendency(), // 당김 성향 (타자 전용, 타구 방향 분포 — P4 매치엔진 연동)
  };

  // 4단계: 컨셉 보정
  _applyConceptBatter(p, concept);

  // P3-2 자연 특성 롤 (15%, 슬롯 1 영구)
  rollNaturalTrait(p);

  // 스탯 스케일 상한(STAT_MAX) 보장
  const stats=['contact','power','eye','speed','fielding','arm'];
  stats.forEach(s=>{ p[s]=clamp(p[s], STAT_MIN, STAT_MAX); });

  // POT-OVR 정합성: targetOvr에 도달 가능하도록 POT 최소값 보장
  const minPotForOvr=Math.ceil((targetOvr-18)/0.825);
  p._potential=Math.max(p._potential, clamp(minPotForOvr, 35, 100));

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
    // 히든 스탯 (1~100) — P2-2: 10종 체계
    _potential: _gradePotBase(grade),
    _durability: _genHidden(),
    _consistency: _genHidden(),
    _clutchHidden: _genHidden(),
    _workEthic: _genHidden(),
    _versatility: _genHidden(),
    _ambition: _genHidden(),
    _loyalty: _genHidden(),
    _temperament: _genHidden(),
    _recovery: _genHidden(),        // 연투회복 (투수 전용, 경기 간 회복 속도)
  };

  // 역할별 보정
  if(role==='CP'){p.clutch=clamp(p.clutch+rand(6,12),STAT_MIN,STAT_MAX); p.stuff=clamp(p.stuff+rand(4,8),9,100);}
  if(role==='SU'){p.stuff=clamp(p.stuff+rand(4,8),9,100); p.control=clamp(p.control+rand(3,6),STAT_MIN,STAT_MAX);}
  if(role==='LR'){p.stamina=clamp(p.stamina+rand(8,14),STAT_MIN,STAT_MAX); p.stuff=clamp(p.stuff-rand(2,6),9,100);}

  // 4단계: 컨셉 보정
  _applyConceptPitcher(p, concept, role);

  // P3-2 자연 특성 롤 (15%, 슬롯 1 영구)
  rollNaturalTrait(p);

  // 스탯 스케일 상한(STAT_MAX) 보장
  const stats=['stuff','control','velocity','movement','stamina','clutch'];
  stats.forEach(s=>{ p[s]=clamp(p[s], STAT_MIN, STAT_MAX); });

  // POT-OVR 정합성: targetOvr에 도달 가능하도록 POT 최소값 보장
  const minPotForOvr=Math.ceil((targetOvr-18)/0.825);
  p._potential=Math.max(p._potential, clamp(minPotForOvr, 35, 100));

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

  // 등급별 POT/나이/OVR 설정 (POT 1~100 스케일)
  if(grade==='S'){
    p._potential=rand(85,100);
    p.age=rand(18,19);
    _forceDraftOvr(p,rand(1,18));
  }else if(grade==='A'){
    p._potential=rand(70,80);
    p.age=rand(18,21);
    _forceDraftOvr(p,rand(4,21));
  }else if(grade==='B'){
    p._potential=rand(60,65);
    p.age=rand(20,23);
    _forceDraftOvr(p,rand(9,26));
  }else if(grade==='D'){
    // D급: 낮은 잠재력, 로또 원석
    p._potential=rand(40,50);
    p.age=rand(22,25);
    _forceDraftOvr(p,rand(4,18));
  }else{
    // C급 (기본)
    p._potential=rand(50,55);
    p.age=rand(21,24);
    _forceDraftOvr(p,rand(14,31));
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
