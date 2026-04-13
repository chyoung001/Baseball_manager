// ===================== DRAFT LOGIC (State & Business Logic) =====================
let _draftFilter='all';
function _setDraftFilter(f){_draftFilter=f;renderDraft();}

// ── 테스트 모드 전용: 샌드박스 드래프트 (실제 이벤트 흐름 재현) ──
let _testDraftBackup=null;

function _testDraft(){
  if(!G.testMode){showToast('🚫 테스트 모드에서만 사용 가능!');return;}

  // 1. 현재 상태 전체 백업
  _testDraftBackup={
    phase:G.phase,
    draftPool:G.draftPool,
    draftState:G._draftState,
    draftResult:G._draftResult,
    scoutTickets:G._scoutTickets,
    allStars:G.allStars,
    rosters:G.teams.map(t=>t.roster.slice()),
    budgets:G.teams.map(t=>t.budget),
  };

  // 2. phase를 allstar로 세팅 (실제 드래프트 흐름 재현)
  G.phase='allstar';
  updateHeader();

  // 3. 풀 새로 생성
  G._scoutTickets=12;
  G.draftPool=null;G._draftState=null;G._draftResult=null;
  const scLv=G.myTeam.scoutingLevel||0;
  G.draftPool=generateDraftPool();
  G.draftPool.forEach(dp=>{dp._scoutedOvr=getScoutedOvr(dp,scLv);});

  // 4. 실제 올스타 → 드래프트 이벤트 흐름 시작 (isTest 플래그 주입)
  G._testDraftFlag=true;
  showAllStarBreak();
}

// 테스트 드래프트 종료 → 원본 상태 완전 복원
function _testDraftEnd(){
  if(!_testDraftBackup)return;
  const bk=_testDraftBackup;

  G.teams.forEach((t,i)=>{t.roster=bk.rosters[i];t.budget=bk.budgets[i];});
  G.phase=bk.phase;
  G.draftPool=bk.draftPool;
  G._draftState=bk.draftState;
  G._draftResult=bk.draftResult;
  G._scoutTickets=bk.scoutTickets;
  G.allStars=bk.allStars;
  delete G._testDraftFlag;

  _testDraftBackup=null;
  updateHeader();
  showToast('🧪 테스트 드래프트 종료 — 모든 변경사항이 원복되었습니다.');
  renderDraft();
}

// ── 정밀 스카우팅: 선수별 R&D 단계 업그레이드 ──
function _getEffectiveRdLv(p){
  const base=G.myTeam.scoutingLevel||0;
  const bonus=p._deepScouted||0; // 0~1 단계 업그레이드
  return Math.min(100,base+bonus);
}

function deepScoutPlayer(uid){
  const tickets=G._scoutTickets||0;
  if(tickets<=0){showToast('🚫 스카우팅 티켓이 없습니다!');return;}
  const p=G.draftPool.find(pl=>pl._uid===uid);
  if(!p){return;}
  if(p._deepScouted){showToast('🚫 이미 정밀 스카우팅된 선수입니다.');return;}

  G._scoutTickets--;
  // 목표 레벨 도달 방식: 현재 스카우트 레벨의 다음 구간까지 보정
  const rdLv=G.myTeam.scoutingLevel||0;
  let target=0;
  if(rdLv<30) target=30;
  else if(rdLv<60) target=60;
  else if(rdLv<80) target=80;
  else target=100;
  p._deepScouted=target-rdLv;
  // 정밀 스카우팅 후 겉보기 OVR 즉시 재계산 (정렬 반영)
  p._scoutedOvr=getScoutedOvr(p,_getEffectiveRdLv(p));

  showToast(`🔍 ${p.name} 정밀 스카우팅 완료! (티켓 ${G._scoutTickets}장 남음)`);
  renderDraft();saveGame();
}
