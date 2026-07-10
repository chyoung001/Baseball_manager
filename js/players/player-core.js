// ===================== PLAYER CORE (Grade, Age, Hidden Stats, Contracts) =====================

// ═══════════════════════════════════════════════════════
// 1단계: 등급(Grade) 확률 분포 + 나이 생성
// ═══════════════════════════════════════════════════════

// 등급 뽑기: S(2%), A(13%), B(35%), C(35%), D(15%)
function _rollGrade(){
  const r=rand(1,100);
  if(r<=3)  return 'S';   // 3%
  if(r<=18) return 'A';   // 15%
  if(r<=60) return 'B';   // 42%
  if(r<=90) return 'C';   // 30%
  return 'D';              // 10%
}

// 등급별 OVR 범위
const GRADE_OVR={S:[84,100],A:[67,82],B:[51,65],C:[34,49],D:[9,32]};

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
// 5단계: 인플레이션 방어형 KBO 계약 산정
// ═══════════════════════════════════════════════════════

// 사치세 라인 비율(%) 기반 연봉 계산
function _calcSalary(pOvr, serviceTime){
  const taxLine = LUXURY_TAX_THRESHOLD;  // 현재 140억

  // 프리FA (0~3년): OVR 무관 1억 미만 억제
  if(serviceTime <= PRE_ARB_MAX_SERVICE){
    if(pOvr>=84) return +(rand(3,8)/10).toFixed(1);   // 0.3~0.8억
    if(pOvr>=75) return +(rand(3,6)/10).toFixed(1);   // 0.3~0.6억
    if(pOvr>=67) return +(rand(3,4)/10).toFixed(1);   // 0.3~0.4억
    return SALARY_MIN;                                  // 0.3억
  }

  // 연봉조정 (4~6년): 사치세 라인의 0.3% ~ 6%
  if(serviceTime <= ARB_MAX_SERVICE){
    if(pOvr>=84) return +((taxLine * rand(40,60)/1000).toFixed(1));  // 4%~6% → 5.6~8.4억
    if(pOvr>=75) return +((taxLine * rand(20,40)/1000).toFixed(1));  // 2%~4% → 2.8~5.6억
    if(pOvr>=67) return +((taxLine * rand(10,20)/1000).toFixed(1));  // 1%~2% → 1.4~2.8억
    if(pOvr>=51) return +((taxLine * rand(5,10)/1000).toFixed(1));   // 0.5%~1% → 0.7~1.4억
    return +((taxLine * rand(3,5)/1000).toFixed(1));                 // 0.3%~0.5% → 0.42~0.7억
  }

  // FA 계약 (7년+): 사치세 라인의 % 시장가치
  if(pOvr>=84) return +((taxLine * rand(100,180)/1000).toFixed(1));  // 10%~18% → 14~25.2억
  if(pOvr>=75) return +((taxLine * rand(60,100)/1000).toFixed(1));   // 6%~10% → 8.4~14억
  if(pOvr>=67) return +((taxLine * rand(30,50)/1000).toFixed(1));    // 3%~5% → 4.2~7억
  if(pOvr>=51) return +((taxLine * rand(10,20)/1000).toFixed(1));    // 1%~2% → 1.4~2.8억
  return SALARY_MIN;
}

// FA 계약 기간
function _calcContractYears(pOvr){
  if(pOvr>=84) return rand(3,5);
  if(pOvr>=75) return rand(2,4);
  if(pOvr>=67) return rand(1,3);
  if(pOvr>=51) return rand(1,2);
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
  if(pOvr>=75 && rand(1,100)<=franchiseProb){
    p._contractYears=rand(4,6);
    p.salary=+(p.salary*1.2).toFixed(1);  // 1.2배 + 초장기
    p._contractEvent='franchise';
    return;
  }

  // 2. 악성 먹튀: FA + OVR 42~51 → 시스템 레벨 비례
  if(pOvr>=42 && pOvr<=51){
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
  p._potential=_agingPotential(p.age, p._potential, ovrRaw(p));

  // 에이징에 따른 피지컬 패널티 (speed/velocity)
  const agePen=_agingStatPenalty(p.age);
  if(agePen>0){
    if(p.isPitcher) p.velocity=clamp(p.velocity-agePen, STAT_MIN, STAT_MAX);
    else p.speed=clamp(p.speed-agePen, STAT_MIN, STAT_MAX);
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
