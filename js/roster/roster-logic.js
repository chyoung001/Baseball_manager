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
// 전환 난이도 테이블 (상수 맵 — 타석마다 호출되는 핫패스라 배열 재생성/선형 탐색 제거)
// 서브 포지션 생성 후보는 player-core.js의 _SUBPOS_CANDIDATES 참조 (교차 확인 필요)
const _POS_SWITCH_TIERS={
  '2B>SS':5,'SS>2B':5,'LF>RF':5,'RF>LF':5,'LF>1B':5,'RF>1B':5,'3B>1B':5, // 쉬움 -5%
  'SS>3B':12,'CF>LF':12,'CF>RF':12,'2B>3B':12,                            // 보통 -10~15%
};
function _posSwitchBase(from,to){
  if(from===to||to==='DH') return 0; // DH로 이동은 라인업 슬롯 (무페널티)
  if(to==='C') return null; // 어디든→C 불가 (포수는 전문 훈련 없이 전환 안 됨) — DH 출신 포함
  if(from==='DH') return 22; // 본 포지션 DH(지명타자 전문)의 수비 전환은 어려움
  return _POS_SWITCH_TIERS[from+'>'+to]||22; // 그 외 어려움 -20~25% (OF↔IF, 1B→SS, 역방향)
}
function getPosSwitchPenalty(p,to){
  const from=p._naturalPos||p.pos;
  let pen=_posSwitchBase(from,to);
  if(pen===null||pen===0) return pen;
  // 서브 포지션 실전 경험 → '쉬움' 등급(base 5)과 동등 취급: min(절반, 5)
  // 이후 다재다능 배율(×0.5~1.5)은 자연 전환과 공통 적용 — 절대 상한이 아니라 등급 동등성 보장
  // (저다재다능이면 서브 경험이어도 최대 7.5% — 자연 '쉬움' 전환도 동일하게 7.5%)
  if(Array.isArray(p._subPos)&&p._subPos.includes(to)) pen=Math.min(pen*0.5,5);
  const vers=hiddenEff(p,'_versatility'); // 다재다능 히든: 높으면 최대 -50%, 낮으면 최대 +50%
  pen*=clamp(1-(vers-50)/100,0.5,1.5);
  return Math.round(pen*10)/10;
}
// 유효 수비 스탯 — Tier3(statEff) 기준 + 현재 포지션 전환 페널티 반영 (매치 엔진용)
function effFielding(p){const pen=p.isPitcher?0:(getPosSwitchPenalty(p,p.pos)||0);return Math.round(statEff(p,'fielding')*(1-pen/100));}
function effArm(p){const pen=p.isPitcher?0:(getPosSwitchPenalty(p,p.pos)||0);return Math.round(statEff(p,'arm')*(1-pen/100));}
// 포지션 전환 OVR 시뮬 (프론트오피스 L3 힌트): 전환 페널티 반영 상대 OVR, 불가 시 null
// 라이브 객체를 변이하지 않고 얕은 클론으로 계산 (렌더/예외 시 원본 오염 방지)
function simulatePosOvr(p,to){
  if(p.isPitcher) return null;
  const pen=getPosSwitchPenalty(p,to);
  if(pen===null) return null;
  const q=Object.assign({},p,{pos:to});
  if(pen>0){
    q.fielding=Math.round((p.fielding||50)*(1-pen/100));
    q.arm=Math.round((p.arm||50)*(1-pen/100));
  }
  return ovr(q);
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
// 로스터 자동 배치 — 규정 위반 자동 해소 (내 팀 전용)
// 순서: ① 최소 인원 콜업(제약 준수) → ② 투수 보직(로테 5·불펜 최소)
//       → ③ 타선 9명 포지션 배치(전환 페널티 가중 greedy, 희소 포지션 우선) → ④ 잔여 벤치
// ═══════════════════════════════════════════════════════
function autoArrangeRoster(){
  const t=G.myTeam;
  if(G.matchInProgress){showToast('🚫 경기 중에는 자동 배치를 할 수 없습니다');return {ok:false,violations:['경기 중']};}
  let called=0;

  const activeOf=pred=>t.roster.filter(p=>(p.status||'active')==='active'&&p.role!=='overseas'&&pred(p));
  // ① 콜업 후보: 데뷔 가능·쿨다운/재활 없음·외국인 한도 준수, OVR 내림차순
  const callable=pred=>t.roster.filter(p=>(p.status==='futures'||p.status==='developmental')
    &&pred(p)&&(p.cooldown||0)<=0&&(p.rehabGamesLeft||0)<=0&&canPlayerDebut(p)
    &&(!p.isForeign||canAddForeign(t))).sort((a,b)=>ovr(b)-ovr(a));
  const callUpOne=pred=>{
    const c=callable(pred)[0];if(!c)return false;
    if(!canCallUp(t)){
      // 1군 정원 초과 → 동일 유형(투수/타자) 최저 OVR 잉여 자원을 강등해 자리 확보
      // (마이너 옵션 소진자 제외 · 주전/로테이션 제외 · 최소 정원 그룹(포수/내야/외야) 보호
      //  · 강등자는 쿨다운으로 재콜업 차단)
      const d=activeOf(p=>p.isPitcher===c.isPitcher
          &&(p._optionYearsUsed||0)<MAX_OPTION_YEARS
          &&p.role!=='rotation'&&p.role!=='starting'
          &&!(!p.isPitcher&&(p._naturalPos||p.pos)==='C'&&countActiveCatchers(t)<=ACTIVE_MIN_CATCHERS)
          &&!(!p.isPitcher&&['LF','CF','RF'].includes(p.pos)&&countActiveOF(t)<=ACTIVE_MIN_OF)
          &&!(!p.isPitcher&&['C','1B','2B','3B','SS'].includes(p.pos)&&countActiveIF(t)<=ACTIVE_MIN_IF))
        .sort((a,b)=>ovr(a)-ovr(b))[0];
      if(!d)return false;
      d.status='futures';d.cooldown=CALLUP_COOLDOWN;
      d._optionYearsUsed=(d._optionYearsUsed||0)+1;
      d.role=d.isPitcher?'bullpen':'bench';
    }
    c.status='active';c.role=c.isPitcher?'bullpen':'bench';called++;return true;
  };
  const runCallups=()=>{
    let guard=0;
    // 포수: natPos 기준 콜업 — 포지션 전환된 자연 포수(natPos='C'·pos≠'C')도 불러와야 greedy가 C 슬롯을 채운다
    // (규정 카운트 countActiveCatchers는 pos 기준이나, 콜업된 자연 포수는 greedy/④에서 pos='C'로 복원됨)
    [ [()=>getActiveRoster(t).filter(p=>!p.isPitcher&&(p._naturalPos||p.pos)==='C').length<ACTIVE_MIN_CATCHERS, p=>!p.isPitcher&&(p._naturalPos||p.pos)==='C'],
      [()=>countActiveIF(t)<ACTIVE_MIN_IF,             p=>!p.isPitcher&&['C','1B','2B','3B','SS'].includes(p.pos)],
      [()=>countActiveOF(t)<ACTIVE_MIN_OF,             p=>!p.isPitcher&&['LF','CF','RF'].includes(p.pos)],
      [()=>countActivePitchers(t)<ACTIVE_MIN_PITCHERS, p=>p.isPitcher],
      [()=>countActiveBatters(t)<ACTIVE_MIN_BATTERS,   p=>!p.isPitcher],
      [()=>getActiveCount(t)<ACTIVE_MIN_TOTAL,         ()=>true],
    ].forEach(([need,pred])=>{while(need()&&guard++<40){if(!callUpOne(pred))break;}});
  };
  runCallups();

  // ② 투수 보직: 로테이션 정원 맞추기 (초과분 OVR 낮은 순 불펜行, 부족분 SP 적성·스태미나순 승격)
  const pits=()=>activeOf(p=>p.isPitcher);
  guard=0;
  while(pits().filter(p=>p.role==='rotation').length>ACTIVE_MIN_SP&&guard++<20){
    const worst=pits().filter(p=>p.role==='rotation').sort((a,b)=>ovr(a)-ovr(b))[0];
    if(!worst)break;worst.role='bullpen';
  }
  guard=0;
  while(pits().filter(p=>p.role==='rotation').length<ACTIVE_MIN_SP&&guard++<20){
    const cand=pits().filter(p=>p.role!=='rotation')
      .sort((a,b)=>((b.pos==='SP')-(a.pos==='SP'))||((b.stamina||0)-(a.stamina||0))||(ovr(b)-ovr(a)))[0];
    if(cand){cand.role='rotation';}
    else if(!callUpOne(p=>p.isPitcher))break;
  }
  guard=0;
  while(pits().filter(p=>p.role==='bullpen').length<ACTIVE_MIN_BULLPEN&&guard++<20){
    if(!callUpOne(p=>p.isPitcher))break;
  }

  // ③ 타선 9명 — 수비 8포지션 각 1명 + DH. 적합도 = OVR − 전환 페널티×1.5 (서브/다재다능 반영)
  const bats=activeOf(p=>!p.isPitcher);
  bats.forEach(p=>{p.role='bench';});
  const ORDER=['C','SS','CF','2B','3B','RF','LF','1B']; // 희소·수비 중요 포지션 우선
  const OF_POS=['LF','CF','RF'];
  const used=new Set();
  const natPos=p=>(p._naturalPos||p.pos);
  const isNatC=p=>natPos(p)==='C';
  const isNatOF=p=>OF_POS.includes(natPos(p));
  const fitScore=(p,pos)=>{
    const pen=getPosSwitchPenalty(p,pos);
    return pen===null?-Infinity:ovr(p)-pen*1.5;
  };
  // 외야 최소 정원 보호: 라인업 외야 슬롯은 3개뿐이라 pos 기준 카운트(countActiveOF)가
  // 정원(ACTIVE_MIN_OF)을 채우려면 벤치에 자연 외야수 예비가 남아야 한다 —
  // 남은 자연 외야수가 (미충원 외야 슬롯 + 벤치 예비) 이하면 타 슬롯 전용을 막는다
  const guardOF=(pool,ofSlotsLeft)=>{
    if(pool.filter(isNatOF).length>ofSlotsLeft+(ACTIVE_MIN_OF-3))return pool;
    const g=pool.filter(p=>!isNatOF(p));
    return g.length?g:pool; // 자원 자체가 부족하면 라인업 9명 충원이 우선
  };
  ORDER.forEach((pos,i)=>{
    // 포수 최소 정원 보호: 자연 포수는 C 슬롯 외 전용 금지 (백업 포수 pos 'C' 유지 → 정원 카운트 보존)
    let pool=bats.filter(p=>!used.has(p)&&(pos==='C'||!isNatC(p)));
    if(!OF_POS.includes(pos))pool=guardOF(pool,ORDER.slice(i+1).filter(o=>OF_POS.includes(o)).length);
    const cand=pool.sort((a,b)=>fitScore(b,pos)-fitScore(a,pos))[0];
    if(cand&&fitScore(cand,pos)>-Infinity){
      if(cand._naturalPos==null&&cand.pos!=='DH')cand._naturalPos=cand.pos; // 본 포지션 보존
      cand.pos=pos;cand.role='starting';used.add(cand);
    }
  });
  const dh=guardOF(bats.filter(p=>!used.has(p)&&!isNatC(p)),0).sort((a,b)=>ovr(b)-ovr(a))[0];
  if(dh){
    if(dh._naturalPos==null&&dh.pos!=='DH')dh._naturalPos=dh.pos;
    dh.pos='DH';dh.role='starting';used.add(dh);
  }

  // ④ 벤치 포지션을 본 포지션으로 복원 (그리디가 외야/내야 자원을 타 그룹 슬롯에 전용해도
  //    포지션 그룹 최소 정원 카운트가 벤치에서 왜곡되지 않도록) + 정원 재검 콜업
  bats.filter(p=>!used.has(p)).forEach(p=>{
    if(p._naturalPos&&p._naturalPos!=='DH')p.pos=p._naturalPos;
  });
  runCallups();

  const check=validateActiveRoster(t);
  showToast(check.ok
    ?`⚡ 자동 배치 완료 — 콜업 ${called}명 · 타선 ${used.size}명 배치 (규정 충족)`
    :`⚡ 자동 배치 — 콜업 ${called}명 · 잔여 위반 ${check.violations.length}건 (가용 자원 부족: 2군/시장 보강 필요)`);
  if(typeof renderRoster==='function')renderRoster();
  updateHeader();saveGame();
  return check;
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
