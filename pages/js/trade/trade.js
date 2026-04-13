// ===================== TRADE (Router) =====================
function renderTrade(){
  const tw=getTradeWindowStatus();
  if(!tw.open){
    $('marketGrid').innerHTML=`
      <div style="text-align:center;padding:40px;">
        <div style="font-size:2rem;margin-bottom:12px;">🚫</div>
        <p style="font-size:0.85rem;color:var(--text-dim);">${tw.label}</p>
        <p style="font-size:0.72rem;color:var(--text-dim);margin-top:8px;">트레이드는 시즌 ${TRADE_DEADLINE_GAME}경기까지 또는 스토브리그에서 가능합니다.</p>
      </div>`;
    return;
  }
  if(!_tradeState.targetTeam) _renderTeamSelect();
  else _renderTradeBoard();
}
