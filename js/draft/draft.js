// ===================== DRAFT PAGE (Router) =====================
function renderDraft(){
  // 풀이 없는데 시즌이 진행 중이면 즉시 생성
  if((!G.draftPool||G.draftPool.length===0)&&['preseason','first_half','allstar'].includes(G.phase)){
    if(G._scoutTickets==null)G._scoutTickets=12;
    const rdLv=G.myTeam.scoutingLevel||0;
    G.draftPool=generateDraftPool();
    G.draftPool.forEach(dp=>{dp._scoutedOvr=getScoutedOvr(dp,rdLv);});
    saveGame();
  }
  if(!G.draftPool||G.draftPool.length===0){
    if(G._draftResult&&G._draftResult.length>0) renderDraftResult();
    else $('draftContent').innerHTML=`<div class="card" style="text-align:center;padding:40px;"><div style="font-size:2rem;margin-bottom:12px;">🎓</div><p style="color:var(--text-dim);">드래프트 풀이 아직 생성되지 않았습니다.<br>다음 시즌이 시작되면 유망주 풀이 공개됩니다.</p>${G.testMode?'<button class="btn btn-sm" onclick="_testDraft()" style="margin-top:14px;font-size:0.7rem;padding:6px 16px;background:#7c3aed;color:#fff;border:1px solid #a855f7;">🧪 테스트 드래프트 시작</button>':''}</div>`;
    return;
  }
  if(G._draftState&&(G.phase==='allstar'||G._draftState.isTest)) renderDraftLive();
  else if(G._draftResult&&G._draftResult.length>0&&(_testDraftBackup||['second_half','postseason','awards','stove_league'].includes(G.phase))) renderDraftResult();
  else renderDraftPreview();
}
