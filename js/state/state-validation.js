// ===================== STATE VALIDATION (Roster Rules & Position Counters) =====================
// ── Position counters for active roster ────────────────────
function getActiveRoster(team){return team.roster.filter(p=>(p.status||'active')==='active'&&p.role!=='overseas');}
function countActivePitchers(team){return getActiveRoster(team).filter(p=>p.isPitcher).length;}
function countActiveSP(team){return getActiveRoster(team).filter(p=>p.isPitcher&&p.role==='rotation').length;}
function countActiveBullpen(team){return getActiveRoster(team).filter(p=>p.isPitcher&&p.role==='bullpen').length;}
function countActiveBatters(team){return getActiveRoster(team).filter(p=>!p.isPitcher).length;}
function countActiveCatchers(team){return getActiveRoster(team).filter(p=>!p.isPitcher&&p.pos==='C').length;}
function countActiveIF(team){return getActiveRoster(team).filter(p=>!p.isPitcher&&['C','1B','2B','3B','SS'].includes(p.pos)).length;}
function countActiveOF(team){return getActiveRoster(team).filter(p=>!p.isPitcher&&['LF','CF','RF'].includes(p.pos)).length;}

// ── Validate active roster meets all minimums ──────────────
// Returns {ok:true} or {ok:false, violations:[...messages]}
function validateActiveRoster(team){
  const v=[];
  const ac=getActiveCount(team);
  if(ac<ACTIVE_MIN_TOTAL)        v.push(`1군 총원 부족: ${ac}/${ACTIVE_MIN_TOTAL}명`);
  if(countActivePitchers(team)<ACTIVE_MIN_PITCHERS) v.push(`투수 부족: ${countActivePitchers(team)}/${ACTIVE_MIN_PITCHERS}명`);
  if(countActiveSP(team)<ACTIVE_MIN_SP)             v.push(`선발투수(SP) 부족: ${countActiveSP(team)}/${ACTIVE_MIN_SP}명`);
  if(countActiveBullpen(team)<ACTIVE_MIN_BULLPEN)   v.push(`불펜(RP/CP) 부족: ${countActiveBullpen(team)}/${ACTIVE_MIN_BULLPEN}명`);
  if(countActiveBatters(team)<ACTIVE_MIN_BATTERS)   v.push(`타자 부족: ${countActiveBatters(team)}/${ACTIVE_MIN_BATTERS}명`);
  if(countActiveCatchers(team)<ACTIVE_MIN_CATCHERS) v.push(`포수(C) 부족: ${countActiveCatchers(team)}/${ACTIVE_MIN_CATCHERS}명`);
  if(countActiveIF(team)<ACTIVE_MIN_IF)             v.push(`내야수 부족: ${countActiveIF(team)}/${ACTIVE_MIN_IF}명`);
  if(countActiveOF(team)<ACTIVE_MIN_OF)             v.push(`외야수 부족: ${countActiveOF(team)}/${ACTIVE_MIN_OF}명`);
  // 선발 라인업 9명 체크 (DH 포함)
  const starters=getStartingBatters(team);
  const lineupCount=starters.length;
  if(lineupCount<9) v.push(`선발 라인업 미완성: ${lineupCount}/9명 (DH 지정 필요)`);

  // 포지션 중복 체크 (DH는 1명만, 수비 포지션은 각 1명씩)
  if(lineupCount>=2){
    const posCount={};
    starters.forEach(p=>{posCount[p.pos]=(posCount[p.pos]||0)+1;});
    const requiredPos=['C','1B','2B','3B','SS','LF','CF','RF'];
    requiredPos.forEach(pos=>{
      if(!posCount[pos]) v.push(`${ALL_POS_NAMES[pos]||pos} 없음 — 포지션 배치 필요`);
      if((posCount[pos]||0)>1) v.push(`${ALL_POS_NAMES[pos]||pos} ${posCount[pos]}명 중복 — 포지션 변경 필요`);
    });
    if((posCount['DH']||0)>1) v.push(`지명타자 ${posCount['DH']}명 중복`);
  }

  return v.length===0?{ok:true,violations:[]}:{ok:false,violations:v};
}

// ── Check if removing a player would violate minimums ──────
function canRemoveFromActive(team,player){
  // Simulate removal and check
  const oldStatus=player.status;player.status='_temp';
  const result=validateActiveRoster(team);
  player.status=oldStatus;
  return result.ok;
}
