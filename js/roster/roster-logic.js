// ===================== ROSTER LOGIC (Status & Validation) =====================
function getPosGroup(pos, player) {
  // 외야수: 외야수끼리 + DH 옵션
  if(['LF','CF','RF'].includes(pos)) return ['LF','CF','RF','DH'];
  // 내야수: 내야수끼리 + DH 옵션
  if(['1B','2B','3B','SS'].includes(pos)) return ['1B','2B','3B','SS','DH'];
  // 포수: DH 옵션만
  if(pos === 'C') return ['C','DH'];
  // DH: 원래 포지션 그룹으로 복귀 (C는 본 포지션이 아닌 한 전환 불가 — P2-1)
  if(pos === 'DH') {
    const nat = player && player._naturalPos;
    if(!nat) return ['1B','2B','3B','SS','LF','CF','RF'];
    if(['LF','CF','RF'].includes(nat)) return ['LF','CF','RF'];
    if(['1B','2B','3B','SS'].includes(nat)) return ['1B','2B','3B','SS'];
    if(nat === 'C') return ['C'];
    return ['1B','2B','3B','SS','LF','CF','RF'];
  }
  // 투수: 자유 변경
  if(['SP','CP','SU','MR','LR','RP'].includes(pos)) return ['SP','CP','SU','MR','LR'];
  return null;
}

// ═══════════════════════════════════════════════════════
// 포지션 전환 페널티 (P2-1, 설계: OVR 시스템 — 비대칭)
// 반환: % 페널티 (수비 스탯 적용) / 0=페널티 없음 / null=전환 불가(→C)
// ═══════════════════════════════════════════════════════
function _posSwitchBase(from,to){
  if(from===to||to==='DH') return 0; // DH로 이동은 라인업 슬롯 (무페널티)
  if(to==='C') return null; // 어디든→C 불가 (포수는 전문 훈련 없이 전환 안 됨) — DH 출신 포함
  if(from==='DH') return 22; // 본 포지션 DH(지명타자 전문)의 수비 전환은 어려움
  const key=from+'>'+to;
  if(['2B>SS','SS>2B','LF>RF','RF>LF','LF>1B','RF>1B','3B>1B'].includes(key)) return 5;  // 쉬움 -5%
  if(['SS>3B','CF>LF','CF>RF','2B>3B'].includes(key)) return 12;                          // 보통 -10~15%
  return 22;                                                                              // 어려움 -20~25% (OF↔IF, 1B→SS, 역방향)
}
function getPosSwitchPenalty(p,to){
  const from=p._naturalPos||p.pos;
  let pen=_posSwitchBase(from,to);
  if(pen===null||pen===0) return pen;
  if(Array.isArray(p._subPos)&&p._subPos.includes(to)) pen*=0.5; // 서브 포지션 실전 경험 → 절반
  const vers=p._versatility||50; // 다재다능 히든: 높으면 최대 -50%, 낮으면 최대 +50%
  pen*=clamp(1-(vers-50)/100,0.5,1.5);
  return Math.round(pen*10)/10;
}
// 유효 수비 스탯 — 현재 포지션 기준 전환 페널티 반영 (매치 엔진용)
function effFielding(p){const pen=p.isPitcher?0:(getPosSwitchPenalty(p,p.pos)||0);return Math.round((p.fielding||50)*(1-pen/100));}
function effArm(p){const pen=p.isPitcher?0:(getPosSwitchPenalty(p,p.pos)||0);return Math.round((p.arm||50)*(1-pen/100));}
// 포지션 전환 OVR 시뮬 (프론트오피스 L3 힌트): 전환 페널티 반영 상대 OVR, 불가 시 null
function simulatePosOvr(p,to){
  if(p.isPitcher) return null;
  const pen=getPosSwitchPenalty(p,to);
  if(pen===null) return null;
  const o={pos:p.pos,f:p.fielding,a:p.arm};
  p.pos=to;
  if(pen>0){p.fielding=Math.round(o.f*(1-pen/100));p.arm=Math.round(o.a*(1-pen/100));}
  const v=ovr(p);
  p.pos=o.pos;p.fielding=o.f;p.arm=o.a;
  return v;
}

// 행 클릭 시 포지션 드롭다운 클릭이면 무시
function _isPosDrop(e){return e&&e.target&&e.target.closest&&e.target.closest('.pos-changeable');}
function moveToBench(idx,e){
  if(_isPosDrop(e)||G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(getStartingBatters(G.myTeam).length <= 1) return;
  p.role = 'bench';
  renderRoster();saveGame();
}
function moveToStarting(idx,e){
  if(_isPosDrop(e)||G.matchInProgress) return;
  if(getStartingBatters(G.myTeam).length >= 9) return;
  G.myTeam.roster[idx].role = 'starting';
  renderRoster();saveGame();
}
function moveToBullpen(idx,e){
  if(_isPosDrop(e)||G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(getRotation(G.myTeam).length <= 1) return;
  p.role = 'bullpen';
  renderRoster();saveGame();
}
function moveToRotation(idx,e){
  if(_isPosDrop(e)||G.matchInProgress) return;
  G.myTeam.roster[idx].role = 'rotation';
  renderRoster();saveGame();
}

// ===================== 1군/2군/육성 로스터 관리 =====================
function sendToFutures(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || (p.status||'active')!=='active') return;
  // 옵션 횟수 체크 (시즌당 1회 카운트)
  if((p._optionYearsUsed||0)>=MAX_OPTION_YEARS){
    showToast(`🚫 ${p.name}은(는) 마이너 옵션 ${MAX_OPTION_YEARS}회 소진! 강등 불가 (방출/트레이드만 가능)`);return;
  }
  if(!canRemoveFromActive(G.myTeam,p)){
    showToast(`🚫 강등 불가 — 최소 로스터 규정 위반`);return;
  }
  p.status='futures'; p.cooldown=CALLUP_COOLDOWN;
  p._optionYearsUsed=(p._optionYearsUsed||0)+1;
  showToast(`⬇️ ${p.name} 2군 강등 (옵션 ${p._optionYearsUsed}/${MAX_OPTION_YEARS}). ${CALLUP_COOLDOWN}경기 콜업 불가`);
  renderRoster();saveGame();
}

function sendToIL(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || (p.status||'active')!=='active') return;
  // IL은 인원 제외 → 최소 로스터 체크
  if(!canRemoveFromActive(G.myTeam,p)){
    showToast(`🚫 IL 등재 불가 — 최소 로스터 규정 위반. 먼저 2군에서 콜업하세요.`);return;
  }
  const days = rand(5,20);
  p.status='il'; p.isOnIL=true; p.ilGamesLeft=days;
  showToast(`🏥 ${p.name} IL 등재. ${days}경기 후 자동 복귀`);
  renderRoster();saveGame();
}

function callUp(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || p.status!=='futures') return;
  if(!canPlayerDebut(p)){showToast(`🚫 ${p.name}은(는) 시즌 ${p.canDebutYear}부터 1군 등록 가능`);return;}
  if(p.isForeign&&!canAddForeign(G.myTeam)){showToast(`🚫 외국인 선수 등록 한도 ${FOREIGN_PLAYER_MAX}명 초과`);return;}
  if((p.cooldown||0)>0){showToast(`⏳ 콜업 불가 — 쿨다운 ${p.cooldown}경기 남음`);return;}
  if(!canCallUp(G.myTeam)){showToast(`🚫 1군 한도 초과`);return;}
  p.status='active';
  showToast(`⬆️ ${p.name} 1군 콜업!`);
  renderRoster();saveGame();
}

function promoteFromDev(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || p.status!=='developmental') return;
  const orgCount = G.myTeam.roster.filter(r=>r.status==='active'||r.status==='futures').length;
  if(orgCount >= FUTURES_ORG_MAX){showToast(`🚫 조직 한도 ${FUTURES_ORG_MAX}명 초과`);return;}
  p.status='futures';
  showToast(`📋 ${p.name} 정식 등록 — 2군 합류`);
  renderRoster();saveGame();
}

function releasePlayer(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p) return;
  // 조직 최소 인원 체크
  const orgCount = G.myTeam.roster.length;
  if(orgCount <= ORG_MIN_TOTAL){showToast(`🚫 방출 불가 — 조직 최소 인원(${ORG_MIN_TOTAL}명)`);return;}
  // 1군 선수라면 최소 로스터 체크
  if((p.status||'active')==='active' && !canRemoveFromActive(G.myTeam,p)){
    showToast(`🚫 방출 불가 — 1군 최소 로스터 규정 위반`);return;
  }
  if(!confirm(`${p.name}을(를) 방출하시겠습니까?`)) return;
  G.myTeam.roster.splice(idx,1);
  renderRoster();saveGame();
}

function emergencyILReturn(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || p.status!=='il') return;
  if(!confirm(`${p.name} 조기 복귀 시 재활 5경기 패널티가 부과됩니다. 진행하시겠습니까?`)) return;
  p.status='futures'; p.isOnIL=false; p.ilGamesLeft=0;
  p.cooldown=5; p.rehabGamesLeft=5; // 조기 복귀 패널티
  showToast(`🏥 ${p.name} IL 조기 복귀! 2군 재활 5경기`);
  renderFutures();
}

// ═══════════════════════════════════════════════════════
// AI 라인업 자동 유지 (부상으로 빠진 주전을 벤치/2군에서 보충)
// 미유지 시 라인업이 시즌 내내 감소 → 잔존 타자에게 타석이 몰려 개인 기록 왜곡
// ═══════════════════════════════════════════════════════
function _aiMaintainLineup(t){
  if(t===G.myTeam) return; // 내 팀은 유저가 직접 관리
  const activeBat=()=>t.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active'&&p.role!=='overseas');
  const activePit=()=>t.roster.filter(p=>p.isPitcher&&(p.status||'active')==='active'&&p.role!=='overseas');
  // 2군/육성 → 1군 콜업 (재활 미완·데뷔 불가 제외, OVR 내림차순)
  const callUp=(pred)=>{
    if(!canCallUp(t)) return null;
    const pool=t.roster.filter(p=>(p.status==='futures'||p.status==='developmental')
      &&pred(p)&&(p.rehabGamesLeft||0)<=0&&canPlayerDebut(p)).sort((a,b)=>ovr(b)-ovr(a));
    const c=pool[0];
    if(c){c.status='active';c.role=c.isPitcher?'bullpen':'bench';}
    return c||null;
  };
  // 1) 타자 주전 9명 유지: 벤치 승격 → 부족 시 콜업
  let guard=0;
  while(activeBat().filter(p=>p.role==='starting').length<9&&guard++<20){
    const bench=activeBat().filter(p=>p.role==='bench').sort((a,b)=>ovr(b)-ovr(a))[0];
    if(bench){bench.role='starting';continue;}
    if(!callUp(p=>!p.isPitcher)) break;
  }
  // 2) 로테이션 5 유지: 불펜 승격 → 부족 시 콜업
  guard=0;
  while(activePit().filter(p=>p.role==='rotation').length<5&&guard++<12){
    const bp=activePit().filter(p=>p.role==='bullpen');
    if(bp.length>4){bp.sort((a,b)=>ovr(b)-ovr(a))[0].role='rotation';continue;}
    if(!callUp(p=>p.isPitcher)) break;
  }
  // 3) 불펜 최소 4명: 콜업으로 보충
  guard=0;
  while(activePit().filter(p=>p.role==='bullpen').length<4&&guard++<8){
    if(!callUp(p=>p.isPitcher)) break;
  }
}
