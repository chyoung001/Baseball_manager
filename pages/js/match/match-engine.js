// ===================== MATCH ENGINE (순수 수학 / 확률 계산) =====================
// DOM 접근 없음. TTO/BABIP 엔진, 피로도, 회귀, XP, 불펜 선택 등 순수 로직만 포함.
// 의존: match-state.js (TTO 상수), constants.js, helpers.js (clamp, rand, ovr, pick), state.js (getBullpen)

// ── 투구수 기반 피로도 커브 (점진적 스탯 감산) ──
function _fatigueDebuff(np){
  if(np>=FATIGUE_NP2) return {vel:-12, ctrl:-12, mov:-10};
  if(np>=FATIGUE_NP1) return {vel:-5,  ctrl:-5,  mov:0};
  return {vel:0, ctrl:0, mov:0};
}

// ── 84경기 맞춤형 동적 회귀 보정 ──
function _calcRegression(batter, pitcher){
  let hitMod=1.0, erMod=1.0;
  // 타자: REG_PA_THRESH 타석 이상부터 평균 회귀
  const bss=batter.ss;
  if(bss&&bss.ab>=REG_PA_THRESH){
    const avg=bss.h/bss.ab;
    if(avg>0.380) hitMod=0.80;        // 타율 .380↑ → 안타 확률 20%↓
    else if(avg>0.350) hitMod=0.90;   // 타율 .350↑ → 안타 확률 10%↓
    else if(avg<0.230&&ovr(batter)>=65) hitMod=1.15;  // 강타자 부진 → 15%↑
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
  const pHR=clamp(TTO_BASE_HR+(adjPow-effMovement)/100*0.16, 0.005, 0.12);
  const pK =clamp(TTO_BASE_K +(effStuff-adjCon)/100*0.15, 0.04, 0.35);
  const pBB=clamp(TTO_BASE_BB+(adjEye-effControl)/100*0.12, 0.02, 0.18);
  const contactMod=1+(adjCon-50)/200;
  const defMod=1-(avgFld-50)/250;
  const babip=clamp(TTO_BASE_BABIP*contactMod*defMod*(babipMod||1.0), 0.180, 0.450);
  const pError=clamp(0.02-(avgFld-50)/2000, 0.005, 0.04);
  const r=Math.random();
  if(r<pHR) return 'HR';
  if(r<pHR+pK) return 'K';
  if(r<pHR+pK+pBB) return 'BB';
  const ip=Math.random();
  if(ip<pError) return 'ERROR';
  if(ip<pError+babip) return 'HIT';
  return 'OUT';
}

// ── 불펜 보직 우선순위 기반 투수 선택 ──
// roster 순서 = 보직 내 우선순위, 스태미나 부족 시 다음 투수로 폴백
function _pickReliever(team, inn, lead){
  const bp=getBullpen(team).filter(p=>p.currentStamina>25&&(p.condition||100)>=50);
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
  if(o>=70) return 250;
  if(o>=60) return 150;
  if(o>=50) return 110;
  if(o>=40) return 90;
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
    const pot = p._potential || 10;
    if(ovr(p) >= maxOvrFromPot(pot)) return; // POT 천장 도달 → 성장 차단
    // 프로의식(workEthic) 기반 성장 배율 — 잠재력은 천장에만 사용
    const ethicMod = 0.5 + ((p._workEthic||10) / 20); // 0.85~1.5
    const baseGain = rand(1,3);
    const gain = Math.max(0, Math.round(baseGain * ethicMod));
    if(gain > 0) {
      p[s] = clamp((p[s]||0)+gain, 20, 80);
      if(p.status==='futures'||p.status==='developmental') showToast(`⬆️ ${p.name} 성장! ${s} +${gain}`);
    }
  }
}
