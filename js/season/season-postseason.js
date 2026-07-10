// ===================== SEASON POSTSEASON (Bracket & Simulation) =====================
// ===================== PHASE 5: POSTSEASON (KBO 5-Team) =====================
function _simSeries(teamA,teamB){
  const strA=teamA.roster?teamA.roster.filter(p=>(p.role==='starting'||p.role==='rotation')).reduce((s,p)=>s+ovr(p),0):teamA.wins*10;
  const strB=teamB.roster?teamB.roster.filter(p=>(p.role==='starting'||p.role==='rotation')).reduce((s,p)=>s+ovr(p),0):teamB.wins*10;
  return Math.random()<strA/(strA+strB)?teamA:teamB;
}

function showPostseason(){
  const sorted=[...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
  const top5=sorted.slice(0,POSTSEASON_TEAMS);
  const myRank=sorted.indexOf(G.myTeam)+1;

  G.postseasonBracket={
    teams:top5.map(t=>({name:t.name,emoji:t.emoji,wins:t.wins,losses:t.losses})),
    round:'wild_card',
    results:[],
  };

  // 포스트시즌 티켓 수익 보너스
  // 포스트시즌 티켓 수익 (인기도 기반)
  top5.forEach(t=>{t.budget=+(t.budget+t.popularity*0.3*POSTSEASON_TICKET_MULTIPLIER).toFixed(1);});

  if(myRank>POSTSEASON_TEAMS){
    $('modalTitle').textContent='📊 정규시즌 종료';
    $('modalBody').innerHTML=`
      <div style="font-size:2rem;margin:8px 0;">😢</div>
      <p style="font-size:0.9rem;font-weight:700;">${G.myTeam.name} — ${myRank}위</p>
      <p style="color:var(--text-dim);font-size:0.8rem;margin-bottom:12px;">${G.myTeam.wins}승 ${G.myTeam.losses}패 | 포스트시즌 진출 실패</p>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:12px;">상위 ${POSTSEASON_TEAMS}팀만 가을야구에 진출합니다.</div>
      <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');G.phase='awards';advancePhase();" style="width:100%;">▶ 시상식으로</button>`;
    $('seasonModal').classList.add('active');
    _simPostseasonAI(top5);
    return;
  }

  $('modalTitle').textContent='🏆 포스트시즌';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <p style="font-size:0.85rem;margin-bottom:12px;">🏆 가을야구! ${G.myTeam.name}이 ${myRank}위로 진출합니다.</p>
      <div class="card" style="background:var(--bg-card-hover);padding:12px;margin-bottom:12px;">
        <div style="font-size:0.72rem;color:var(--accent);margin-bottom:8px;">KBO 포스트시즌 대진표</div>
        <div style="font-size:0.78rem;">
          <div style="padding:4px 0;">🥊 와일드카드: ${top5[3].emoji} ${top5[3].name}(4위) vs ${top5[4].emoji} ${top5[4].name}(5위)</div>
          <div style="padding:4px 0;">🥊 준플레이오프: ${top5[2].emoji} ${top5[2].name}(3위) vs WC 승자</div>
          <div style="padding:4px 0;">🥊 플레이오프: ${top5[1].emoji} ${top5[1].name}(2위) vs 준PO 승자</div>
          <div style="padding:4px 0;">🏆 한국시리즈: ${top5[0].emoji} ${top5[0].name}(1위) vs PO 승자</div>
        </div>
      </div>
      <p style="font-size:0.72rem;color:var(--accent2);margin-bottom:12px;">🎫 포스트시즌 티켓 수익 ×${POSTSEASON_TICKET_MULTIPLIER}!</p>
      <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');_runPostseason();" style="width:100%;">⚾ 포스트시즌 시작!</button>
    </div>`;
  $('seasonModal').classList.add('active');
}

function _simPostseasonAI(top5){
  const wc=_simSeries(top5[3],top5[4]);
  const semi=_simSeries(top5[2],wc);
  const po=_simSeries(top5[1],semi);
  const champ=_simSeries(top5[0],po);
  G.postseasonBracket.results=[
    {round:'와일드카드',winner:wc.name},
    {round:'준플레이오프',winner:semi.name},
    {round:'플레이오프',winner:po.name},
    {round:'한국시리즈',winner:champ.name,champion:true},
  ];
}

function _runPostseason(){
  const sorted=[...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
  const top5=sorted.slice(0,5);
  const myRank=sorted.indexOf(G.myTeam)+1;

  // 와일드카드: 4위 vs 5위
  let wc_winner;
  if(myRank===4||myRank===5){
    const opp=myRank===4?top5[4]:top5[3];
    wc_winner=_simSeries(G.myTeam,opp);
    if(wc_winner!==G.myTeam){_showPostResult('와일드카드 탈락',''+opp.name+'에게 패배',false);return;}
  }else{
    wc_winner=_simSeries(top5[3],top5[4]);
  }

  // 준플레이오프: 3위 vs WC 승자
  let semi_winner;
  if(myRank===3||wc_winner===G.myTeam){
    const opp=myRank===3?wc_winner:top5[2];
    semi_winner=_simSeries(G.myTeam,opp);
    if(semi_winner!==G.myTeam){_showPostResult('준플레이오프 탈락',''+opp.name+'에게 패배',false);return;}
  }else{
    semi_winner=_simSeries(top5[2],wc_winner);
  }

  // 플레이오프: 2위 vs 준PO 승자
  let po_winner;
  if(myRank===2||semi_winner===G.myTeam){
    const opp=myRank===2?semi_winner:top5[1];
    po_winner=_simSeries(G.myTeam,opp);
    if(po_winner!==G.myTeam){_showPostResult('플레이오프 탈락',''+opp.name+'에게 패배',false);return;}
  }else{
    po_winner=_simSeries(top5[1],semi_winner);
  }

  // 한국시리즈: 1위 vs PO 승자
  let final_opp;
  if(myRank===1){
    final_opp=po_winner;
  }else if(po_winner===G.myTeam){
    final_opp=top5[0];
  }else{
    const champ=_simSeries(top5[0],po_winner);
    G.postseasonBracket.results=[{round:'한국시리즈',winner:champ.name,champion:true}];
    _showPostResult('시즌 종료','우승: '+champ.emoji+' '+champ.name,false);return;
  }

  const champion=_simSeries(G.myTeam,final_opp);
  if(champion===G.myTeam){
    G.myTeam.budget=+(G.myTeam.budget+50).toFixed(1); // 우승 보너스 50억
    _showPostResult('🏆 우승!',''+G.myTeam.name+'이 한국시리즈를 제패했습니다!',true);
  }else{
    _showPostResult('한국시리즈 준우승',''+final_opp.name+'에게 패배',false);
  }
}

function _showPostResult(title,desc,isChampion){
  $('modalTitle').textContent=isChampion?'🏆🎉🏆':title;
  $('modalBody').innerHTML=`
    <div style="font-size:2.5rem;margin:8px 0;">${isChampion?'🎉🏆🎉':'📊'}</div>
    <p style="font-size:1rem;font-weight:700;margin-bottom:8px;">${title}</p>
    <p style="color:var(--text-dim);font-size:0.85rem;margin-bottom:16px;">${desc}</p>
    ${isChampion?'<p style="color:var(--accent);font-size:0.8rem;margin-bottom:12px;">우승 보너스 +50억!</p>':''}
    <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');G.phase='awards';advancePhase();" style="width:100%;">▶ 시상식으로</button>`;
  $('seasonModal').classList.add('active');
}
