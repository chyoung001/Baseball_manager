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
// 3단계: 히든 스탯 생성 — P2-2: 1~100 스케일 (50=평균, 구 7~20의 ×5)
// 생성 하한 35 = 구 스케일 하한 7 유지 (밸런스 보존, 특성 시스템이 이하로 내릴 수 있음)
// ═══════════════════════════════════════════════════════

function _genHidden(){
  return clamp(Math.round(randomGaussian(52.5, 17.5)), 35, 100);
}
// 당김 성향 전용 (타자): Statcast 관측 분포 근사 — 50=전방향 균등 평균
function _genPullTendency(){
  return randGauss(50, 15, 1, 100);
}

// ── 서브 포지션 (P2-1): 생성 분포 0개 60% / 1개 35% / 2개 5% ──
// 후보는 인접 포지션만. C는 서브 취득 불가(전문 포지션), DH는 슬롯이라 제외.
const _SUBPOS_CANDIDATES={
  '1B':['3B','LF','RF'], '2B':['SS','3B'], SS:['2B','3B'], '3B':['1B','2B'],
  LF:['RF','CF','1B'], CF:['LF','RF'], RF:['LF','CF','1B'], DH:['1B','LF','RF'], C:[],
};
function _rollSubPos(pos){
  const cand=(_SUBPOS_CANDIDATES[pos]||[]).slice();
  if(cand.length===0) return [];
  const roll=rand(1,100);
  const n=roll<=60?0:roll<=95?1:2;
  const subs=[];
  while(subs.length<Math.min(n,cand.length)){
    subs.push(cand.splice(rand(0,cand.length-1),1)[0]);
  }
  return subs;
}

// 등급별 잠재력 기반값 — 등급이 높을수록 최소 잠재력 보장
function _gradePotBase(grade){
  if(grade==='S') return randGauss(85,5,75,100);  // S급: 최소 75 보장
  if(grade==='A') return randGauss(70,10,60,90);  // A급: 최소 60 보장
  if(grade==='B') return randGauss(55,10,35,75);
  if(grade==='C') return randGauss(45,10,35,65);
  return randGauss(65,15,40,100); // D급: 원석이므로 잠재력 높을 수 있음
}

// ═══════════════════════════════════════════════════════
// 5단계: 인플레이션 방어형 KBO 계약 산정
// ═══════════════════════════════════════════════════════

// P2-4: 연봉 계산 — 설계 절대 레인지 (사치세 라인과 분리, KBO 기준)
// 신인 0.3~1.5 / Arb 2~12 / FA 10~30 스케일. 소프트캡 200억과 균형.
// P2-3: super2 → 서비스 2년차부터 Arb 스케일 적용
function _calcSalary(pOvr, serviceTime, super2){
  // FA 계약: 시장가치 (설계: 일반 10~20억, 대형 20~30억)
  if(serviceTime >= FA_SERVICE_TIME_THRESHOLD){
    if(pOvr>=84) return +((rand(200,300)/10).toFixed(1)); // 20~30억
    if(pOvr>=75) return +((rand(120,200)/10).toFixed(1)); // 12~20억
    if(pOvr>=67) return +((rand(80,120)/10).toFixed(1));  // 8~12억
    if(pOvr>=51) return +((rand(30,60)/10).toFixed(1));   // 3~6억
    return SALARY_MIN;
  }

  // 연봉조정 (Arb): 성적 기반 베이스라인 (설계: 초기 2~5억, 후기 5~12억)
  if(serviceTime >= ARB_MIN_SERVICE || (super2 && serviceTime >= 2)){
    if(pOvr>=84) return +((rand(50,80)/10).toFixed(1));  // 5~8억
    if(pOvr>=75) return +((rand(30,50)/10).toFixed(1));  // 3~5억
    if(pOvr>=67) return +((rand(20,30)/10).toFixed(1));  // 2~3억
    if(pOvr>=51) return +((rand(10,20)/10).toFixed(1));  // 1~2억
    return +((rand(5,10)/10).toFixed(1));                // 0.5~1억
  }

  // 프리Arb (서비스 0~2): OVR 무관 1억 미만 억제 (드래프트 지명자는 슬롯 연봉)
  if(pOvr>=84) return +(rand(3,8)/10).toFixed(1);   // 0.3~0.8억
  if(pOvr>=75) return +(rand(3,6)/10).toFixed(1);   // 0.3~0.6억
  if(pOvr>=67) return +(rand(3,4)/10).toFixed(1);   // 0.3~0.4억
  return SALARY_MIN;                                  // 0.3억
}

// ── P2-3 신인 슬롯 연봉 (드래프트 전체 순번 기준) + 3년 고정 계약 ──
function _rookieSlotSalary(overallPick){
  if(overallPick<=1) return 1.5;                                        // 전체 1순위
  if(overallPick<=8) return +(1.2-(overallPick-2)*(0.4/6)).toFixed(1);  // 1R: 1.2~0.8
  if(overallPick<=16) return +(0.7-(overallPick-9)*(0.2/7)).toFixed(1); // 2R: 0.7~0.5
  return Math.max(0.3,+(0.4-(overallPick-17)*0.005).toFixed(1));        // 3R~: 0.4~0.3
}
function applyRookieContract(p, round, pickInRound){
  const overall=(round-1)*8+pickInRound;
  p.salary=_rookieSlotSalary(overall);
  p._contractYears=3;      // 신인 계약 3년 고정 (인상 없음, 옵션 없음)
  p._serviceTime=0;
  p._svcGames=0;
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
