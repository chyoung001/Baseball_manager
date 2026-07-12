// ===================== MATCH ENGINE (순수 수학 / 확률 계산) =====================
// DOM 접근 없음. TTO/BABIP 엔진, 피로도, 회귀, XP, 불펜 선택 등 순수 로직만 포함.
// 의존: match-state.js (TTO 상수), constants.js, helpers.js (clamp, rand, ovr, pick), state.js (getBullpen)

// ── 투구수 기반 피로도 커브 (50구부터 점진적 감산) ──
function _fatigueDebuff(np){
  if(np<50) return {vel:0, ctrl:0, mov:0};
  const f=Math.min(1.0, (np-50)/60); // 50~110구에서 0→1 선형 보간
  return {
    vel:  Math.round(-12*f),
    ctrl: Math.round(-12*f),
    mov:  Math.round(-10*f),
  };
}

// ── 63경기 맞춤형 동적 회귀 보정 ──
function _calcRegression(batter, pitcher){
  let hitMod=1.0, erMod=1.0;
  // 타자: REG_PA_THRESH 타석 이상부터 평균 회귀
  const bss=batter.ss;
  if(bss&&bss.ab>=REG_PA_THRESH){
    const avg=bss.h/bss.ab;
    if(avg>0.380) hitMod=0.80;        // 타율 .380↑ → 안타 확률 20%↓
    else if(avg>0.350) hitMod=0.90;   // 타율 .350↑ → 안타 확률 10%↓
    else if(avg<0.230&&ovr(batter)>=75) hitMod=1.15;  // 강타자 부진 → 15%↑
  }
  // 투수: REG_IP_THRESH 아웃 이상부터 ERA 회귀
  const pss=pitcher.ss;
  if(pss&&(pss.outs||0)>=REG_IP_THRESH){
    const era=(pss.outs||0)>0?(pss.er*27/(pss.outs||1)):99;
    const isRP=pitcher.role!=='rotation';
    if((isRP&&era<1.20)||(!isRP&&era<1.80)) erMod=1.20;  // 비현실적 ERA → 피안타 20%↑
  }
  return {hitMod, erMod};
}

// ── TTO 기반 간이 타석 판정 (AI/빠른 시뮬용) ──
function _ttoSimAB(adjPow, adjCon, adjEye, effStuff, effControl, effMovement, avgFld, babipMod){
  const pHR=clamp(TTO_BASE_HR+(adjPow-effMovement)/165*0.16, 0.005, 0.08);
  const pK =clamp(TTO_BASE_K +(effStuff-adjCon)/165*0.15, 0.04, 0.30);
  const pBB=clamp(TTO_BASE_BB+(adjEye-effControl)/165*0.12, 0.02, 0.15);
  const contactMod=1+(adjCon-50)/330;
  const defMod=1-(avgFld-50)/412;
  const babip=clamp(TTO_BASE_BABIP*contactMod*defMod*(babipMod||1.0), 0.200, 0.380);
  const pError=clamp(0.02-(avgFld-50)/3300, 0.005, 0.04);
  const r=Math.random();
  if(r<pHR) return 'HR';
  if(r<pHR+pK) return 'K';
  if(r<pHR+pK+pBB) return 'BB';
  const ip=Math.random();
  if(ip<pError) return 'ERROR';
  if(ip<pError+babip) return 'HIT';
  return 'OUT';
}

// ── 투구수 한계 산정 (스태미나 스탯 기반) ──
function getMaxPitches(pitcher){
  const base=statEff(pitcher,'stamina');
  if(pitcher.role==='rotation') return Math.floor(base+40); // stamina 50→90구, 80→120구
  const bonus=pitcher.pos==='LR'?15:0;
  return Math.floor(base/2+10+bonus); // 불펜 50→35구, LR 50→50구
}

// ── 통합 강판 판정 (유저/AI 공용) ──
function shouldHookPitcher(pitcher, inning, runsGivenToday, teamConcept){
  if(!pitcher) return false;
  const np=(pitcher.today&&pitcher.today.np)||pitcher._simNP||0;
  const maxNp=getMaxPitches(pitcher);
  // 1. 투구수 한계 도달
  if(np>=maxNp) return true;
  // 2. 대량 실점 조기 강판 (5회 이전에 5실점 이상)
  if(runsGivenToday>=5&&inning<=5) return true;
  // 3. 이글스(bullpen 컨셉) 전용: 6회부터 선발 교체
  if(teamConcept==='bullpen'&&inning>=6&&pitcher.role==='rotation') return true;
  // 4. 불펜 투수 35구 이상이면 교체
  if(pitcher.role!=='rotation'&&np>=35) return true;
  return false;
}

// ── 불펜 보직 우선순위 기반 투수 선택 ──
function _pickReliever(team, inn, lead){
  const bp=getBullpen(team).filter(p=>
    (p._consecutiveDaysPitched||0)<3 && // 3연투 금지
    (p.condition||100)>=20 &&            // 컨디션 20 이상
    !p._pitchedThisGame                  // 이번 경기 미등판
  );
  if(bp.length===0)return null;
  let roles;
  if(inn>=9&&lead>=1&&lead<=3)        roles=['CP','SU','MR','LR'];  // 세이브 상황
  else if(inn>=9&&lead>=4)            roles=['MR','LR','SU'];       // 대량리드→CP 아끼기
  else if(inn>=9&&lead>=1)            roles=['CP','SU','MR','LR'];  // 리드 마무리
  else if(inn>=7&&lead>=0)            roles=['SU','MR','CP','LR'];  // 리드/동점 셋업
  else if(inn>=6&&lead>=-4&&lead<0)   roles=['MR','LR','SU'];       // 추격
  else                                roles=['LR','MR','SU','CP'];  // 조기강판/대량 점수차
  for(const role of roles){
    const pick=bp.find(p=>p.pos===role);
    if(pick)return pick;
  }
  return bp[0];
}

// ── OVR 구간별 동적 레벨업 요구 XP (계단식 성장) ──
function getRequiredXP(p){
  const o=ovr(p);
  if(o>=84) return 250;
  if(o>=67) return 150;
  if(o>=51) return 110;
  if(o>=34) return 90;
  return 70;
}

// ── XP 부여 + 레벨업 판정 ──
function awardXP(p, amount) {
  p.xp = (p.xp||0) + amount;
  const reqXP = getRequiredXP(p);
  if(p.xp >= reqXP) {
    p.xp -= reqXP;
    const stats = p.isPitcher ? ['stuff','control','velocity','movement','stamina','clutch'] : ['contact','power','eye','speed','fielding','arm'];
    const s = pick(stats);
    const pot = p._potential || 50;
    if(ovrRaw(p) >= maxOvrFromPot(pot)) return; // POT 천장 도달 → 성장 차단 (절대 raw 기준)
    // 프로의식(workEthic) 기반 성장 배율 — 잠재력은 천장에만 사용 (히든 1~100, 특성 반영)
    const _we=hiddenEff(p,'_workEthic');
    let ethicMod = 0.5 + (_we / 100); // 0.85~1.5
    // 엘리트 성장 곡선 (상황 E): 프로의식+야망 모두 75+ 시너지 → 성장 +20%
    if(_we>=75 && (hiddenEff(p,'_ambition'))>=75) ethicMod *= 1.2;
    const baseGain = rand(1,3);
    const gain = Math.max(0, Math.round(baseGain * ethicMod));
    if(gain > 0) {
      p[s] = clamp((p[s]||0)+gain, STAT_MIN, STAT_MAX);
      if(p.status==='futures'||p.status==='developmental') showToast(`⬆️ ${p.name} 성장! ${s} +${gain}`);
    }
  }
}
