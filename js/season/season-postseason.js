// ===================== SEASON POSTSEASON (4-Team Balanced Tournament) =====================
// 준플레이오프(5전3선승): 1위 vs 4위 / 2위 vs 3위 → 챔피언십(7전4선승)
// (v2 설계: 상위 4팀 균형 토너먼트. 헤드리스 시뮬은 팀 전력 확률 기반 best-of-N)

function _teamStrength(t){
  return t.roster ? t.roster.filter(p=>(p.role==='starting'||p.role==='rotation')).reduce((s,p)=>s+ovr(p),0) : t.wins*10;
}

// best-of-N 시리즈 (먼저 winsNeeded승). 반환 {winner, a, b}
function _simSeries(teamA,teamB,winsNeeded){
  const strA=_teamStrength(teamA), strB=_teamStrength(teamB);
  const pA=strA/(strA+strB||1);
  let a=0,b=0;
  while(a<winsNeeded&&b<winsNeeded){ if(Math.random()<pA) a++; else b++; }
  return { winner: a>=winsNeeded?teamA:teamB, a, b };
}

function _sortByWinPct(){
  return [...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
}

function showPostseason(){
  const sorted=_sortByWinPct();
  const top4=sorted.slice(0,POSTSEASON_TEAMS);
  const myRank=sorted.indexOf(G.myTeam)+1;

  G.postseasonBracket={
    teams:top4.map(t=>({name:t.name,emoji:t.emoji,wins:t.wins,losses:t.losses})),
    round:'semifinal',
    results:[],
  };

  // 포스트시즌 티켓 수익 (인기도 기반)
  top4.forEach(t=>{t.budget=+(t.budget+t.popularity*0.3*POSTSEASON_TICKET_MULTIPLIER).toFixed(1);});

  if(myRank>POSTSEASON_TEAMS){
    $('modalTitle').textContent='📊 정규시즌 종료';
    $('modalBody').innerHTML=`
      <div style="font-size:2rem;margin:8px 0;">😢</div>
      <p style="font-size:0.9rem;font-weight:700;">${G.myTeam.name} — ${myRank}위</p>
      <p style="color:var(--text-dim);font-size:0.8rem;margin-bottom:12px;">${G.myTeam.wins}승 ${G.myTeam.losses}패 | 포스트시즌 진출 실패</p>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:12px;">상위 ${POSTSEASON_TEAMS}팀만 가을야구에 진출합니다.</div>
      <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');G.phase='awards';advancePhase();" style="width:100%;">▶ 시상식으로</button>`;
    $('seasonModal').classList.add('active');
    _simPostseasonAI(top4);
    return;
  }

  $('modalTitle').textContent='🏆 포스트시즌';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <p style="font-size:0.85rem;margin-bottom:12px;">🏆 가을야구! ${G.myTeam.name}이 ${myRank}위로 진출합니다.</p>
      <div class="card" style="background:var(--bg-card-hover);padding:12px;margin-bottom:12px;">
        <div style="font-size:0.72rem;color:var(--accent);margin-bottom:8px;">4팀 균형 토너먼트 대진표</div>
        <div style="font-size:0.78rem;">
          <div style="padding:4px 0;">🥊 준PO A (5전3선승): ${top4[0].emoji} ${top4[0].name}(1위) vs ${top4[3].emoji} ${top4[3].name}(4위)</div>
          <div style="padding:4px 0;">🥊 준PO B (5전3선승): ${top4[1].emoji} ${top4[1].name}(2위) vs ${top4[2].emoji} ${top4[2].name}(3위)</div>
          <div style="padding:4px 0;">🏆 챔피언십 (7전4선승): 준PO A 승자 vs 준PO B 승자</div>
        </div>
      </div>
      <p style="font-size:0.72rem;color:var(--accent2);margin-bottom:12px;">🎫 포스트시즌 티켓 수익 ×${POSTSEASON_TICKET_MULTIPLIER}!</p>
      <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');_runPostseason();" style="width:100%;">⚾ 포스트시즌 시작!</button>
    </div>`;
  $('seasonModal').classList.add('active');
}

// 내 팀이 진출 실패한 경우 — 전 대진 AI 시뮬 (기록용)
function _simPostseasonAI(top4){
  const semiA=_simSeries(top4[0],top4[3],SEMI_WINS_NEEDED).winner;
  const semiB=_simSeries(top4[1],top4[2],SEMI_WINS_NEEDED).winner;
  const champ=_simSeries(semiA,semiB,FINAL_WINS_NEEDED).winner;
  G.postseasonBracket.results=[
    {round:'준PO A',winner:semiA.name},
    {round:'준PO B',winner:semiB.name},
    {round:'챔피언십',winner:champ.name,champion:true},
  ];
}

// 내 팀 진출 — 인터랙티브 진행
function _runPostseason(){
  const sorted=_sortByWinPct();
  const top4=sorted.slice(0,POSTSEASON_TEAMS);
  const bracketA=[top4[0],top4[3]]; // 1위 vs 4위
  const bracketB=[top4[1],top4[2]]; // 2위 vs 3위
  const myInA=bracketA.includes(G.myTeam);
  const myBracket=myInA?bracketA:bracketB;
  const otherBracket=myInA?bracketB:bracketA;
  const myOpp=myBracket[0]===G.myTeam?myBracket[1]:myBracket[0];

  // 내 준PO (5전3선승)
  const mySemi=_simSeries(G.myTeam,myOpp,SEMI_WINS_NEEDED);
  // 반대편 준PO는 AI로
  const otherWinner=_simSeries(otherBracket[0],otherBracket[1],SEMI_WINS_NEEDED).winner;

  if(mySemi.winner!==G.myTeam){
    // 탈락 → 챔피언십은 내 상대(준PO 승자) vs 반대편 승자
    const champ=_simSeries(myOpp,otherWinner,FINAL_WINS_NEEDED).winner;
    G.postseasonBracket.results=[
      {round:'준PO(내 경기)',winner:myOpp.name},
      {round:'준PO(반대편)',winner:otherWinner.name},
      {round:'챔피언십',winner:champ.name,champion:true},
    ];
    _showPostResult('준플레이오프 탈락',`${myOpp.emoji} ${myOpp.name}에 ${mySemi.b}-${mySemi.a} 패배`,false);
    return;
  }

  // 준PO 승리 → 챔피언십 (7전4선승)
  const finalS=_simSeries(G.myTeam,otherWinner,FINAL_WINS_NEEDED);
  G.postseasonBracket.results=[
    {round:'준PO(내 경기)',winner:G.myTeam.name},
    {round:'준PO(반대편)',winner:otherWinner.name},
    {round:'챔피언십',winner:finalS.winner.name,champion:true},
  ];
  if(finalS.winner===G.myTeam){
    G.myTeam.budget=+(G.myTeam.budget+CHAMPIONSHIP_BONUS+((G.seasonModifiers&&G.seasonModifiers.champBonusExtra)||0)).toFixed(1);
    _showPostResult('🏆 우승!',`${G.myTeam.name}이 챔피언십을 제패했습니다! (${finalS.a}-${finalS.b})`,true);
  }else{
    _showPostResult('챔피언십 준우승',`${otherWinner.emoji} ${otherWinner.name}에 ${finalS.b}-${finalS.a} 패배`,false);
  }
}

function _showPostResult(title,desc,isChampion){
  $('modalTitle').textContent=isChampion?'🏆🎉🏆':title;
  $('modalBody').innerHTML=`
    <div style="font-size:2.5rem;margin:8px 0;">${isChampion?'🎉🏆🎉':'📊'}</div>
    <p style="font-size:1rem;font-weight:700;margin-bottom:8px;">${title}</p>
    <p style="color:var(--text-dim);font-size:0.85rem;margin-bottom:16px;">${desc}</p>
    ${isChampion?`<p style="color:var(--accent);font-size:0.8rem;margin-bottom:12px;">우승 보너스 +${CHAMPIONSHIP_BONUS}억!</p>`:''}
    <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');G.phase='awards';advancePhase();" style="width:100%;">▶ 시상식으로</button>`;
  $('seasonModal').classList.add('active');
}
