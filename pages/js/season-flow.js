// ===================== SEASON FLOW ENGINE (7-Phase) =====================
// 프리시즌 → 전반기 → 올스타&드래프트 → 후반기 → 포스트시즌 → 시상식&은퇴 → 스토브리그

// ── calcSeasonRevenue (absorbed from season.js) ──────────────────
function calcSeasonRevenue(t,rank){
  // 목표: 시즌 수익 130~160억 (사치세 라인 140억과 균형)
  const popRev=+(t.popularity*0.8).toFixed(1);           // 인기 60 → 48억, 80 → 64억
  const winB=+(t.wins*1.5).toFixed(1);                   // 42승 → 63억, 60승 → 90억
  const facB=+(t.facilityLevel*0.2).toFixed(1);          // 시설 60 → 12억, 100 → 20억
  const starB=+(t.roster.filter(p=>p.popularity>=60).length*5); // OVR65+ 스타 1명당 5억
  const rankB=rank===1?20:rank===2?15:rank===3?10:rank===4?5:0;
  const base=+(popRev+winB+facB+starB+rankB).toFixed(1);
  const stadMult=t===G.myTeam?1+(t.stadiumLevel||0)*STADIUM_REVENUE_BONUS:1;
  const stadBonus=+(base*(stadMult-1)).toFixed(1);
  const total=+(base+stadBonus).toFixed(1);
  const luxTax=t===G.myTeam?getLuxuryTax(t):0;
  return{popRev,winB,facB,starB,rankB,base,stadBonus,total,luxTax,net:+(total-luxTax).toFixed(1)};
}

// ── Phase Info ───────────────────────────────────────────────────
function getPhaseInfo(){
  const p=SEASON_PHASES;
  const phases=[p.PRESEASON,p.FIRST_HALF,p.ALLSTAR,p.SECOND_HALF,p.POSTSEASON,p.AWARDS,p.STOVE_LEAGUE];
  return phases.find(ph=>ph.id===G.phase)||p.PRESEASON;
}

// ── Main Phase Advance ──────────────────────────────────────────
function advancePhase(){
  switch(G.phase){
    case 'preseason':    showPreseason();break;
    case 'first_half':   break;
    case 'allstar':      showAllStarBreak();break;
    case 'second_half':  break;
    case 'postseason':   showPostseason();break;
    case 'awards':       showAwards();break;
    case 'stove_league': showStoveLeague();break;
  }
  updateHeader();saveGame();
}

// ===================== PHASE 1: PRESEASON =====================
function showPreseason(){
  const t=G.myTeam;
  const isFirstYear=(G.season===1);

  if(!isFirstYear){
    // 대규모 스탯 업데이트 (에이징 + 프로의식 기반, 잠재력은 천장 역할만)
    G.teams.forEach(team=>{
      team.roster.forEach(p=>{
        const pot=p._potential||10;
        const we=p._workEthic||10;
        const ethicMod=0.5+(we/20); // 0.85~1.5
        const seasonsPlayed=p._seasonsPlayed||0;

        // 에이징 면역 체크 (의료 센터 대성공)
        if((p.agingImmunityYears||0)>0){
          p.agingImmunityYears--;
          const immuneGrowth=Math.round((rand(0,2)+Math.floor(team.devLevel/30))*ethicMod);
          const stats=p.isPitcher?['stuff','control','velocity','movement','stamina','clutch']:['contact','power','eye','speed','fielding','arm'];
          if(ovr(p)<maxOvrFromPot(pot)){
            stats.forEach(s=>{p[s]=clamp((p[s]||0)+immuneGrowth,20,80);});
          }
          p.condition=rand(75,100);
          if(p.isPitcher)p.currentStamina=100;
          p._seasonsPlayed=(seasonsPlayed||0)+1;
          if(p.age)p.age++;
          return;
        }

        // 프로의식 기반 에이징 커브 시작 시점 조정
        // 기본: 8시즌부터 하락, 12시즌부터 급하락
        // workEthic 15+: 2~3시즌 지연 / workEthic 7-: 1~2시즌 조기
        const ethicShift=we>=15?-rand(2,3):we<=7?rand(1,2):0;
        const agingStart=8+ethicShift;
        const agingSevere=12+ethicShift;

        // ── 노쇠화: 피지컬 다각 하락 + 베테랑 관록 버프 ──
        let speedPen=0,velPen=0,stamPen=0,fldPen=0,conPen=0;
        if(seasonsPlayed>=agingSevere){
          speedPen=rand(3,6);velPen=rand(2,5);stamPen=rand(2,4);fldPen=rand(1,3);conPen=rand(1,3);
        }else if(seasonsPlayed>=agingStart){
          speedPen=rand(1,3);velPen=rand(1,2);stamPen=rand(0,2);fldPen=rand(0,1);conPen=rand(0,1);
        }

        // 베테랑 관록: 30대 중반까지 eye/control/clutch 소폭 상승
        let vetEyeBuff=0,vetCtrlBuff=0,vetClutchBuff=0;
        if(seasonsPlayed>=agingStart&&seasonsPlayed<agingSevere+3){
          vetEyeBuff=rand(0,2);vetCtrlBuff=rand(0,2);vetClutchBuff=rand(1,2);
        }

        const agePenalty=seasonsPlayed>=agingSevere?rand(-4,-2):seasonsPlayed>=agingStart?rand(-2,0):0;
        const baseGrowth=rand(-1,2)+Math.floor(team.devLevel/30)+agePenalty;
        const growth=Math.round(baseGrowth*ethicMod);

        const potCap=maxOvrFromPot(pot);
        const canGrow=ovr(p)<potCap;
        if(p.isPitcher){
          if(canGrow)['stuff','movement'].forEach(s=>{p[s]=clamp((p[s]||0)+growth,20,80);});
          p.velocity=clamp((p.velocity||0)+(canGrow?growth:0)-velPen,20,80);
          p.stamina=clamp((p.stamina||0)+(canGrow?growth:0)-stamPen,20,80);
          // 베테랑 관록: 제구 + 위기관리 상승
          p.control=clamp((p.control||0)+(canGrow?growth:0)+vetCtrlBuff,20,80);
          p.clutch=clamp((p.clutch||0)+(canGrow?growth:0)+vetClutchBuff,20,80);
        }else{
          if(canGrow)['power','arm'].forEach(s=>{p[s]=clamp((p[s]||0)+growth,20,80);});
          p.speed=clamp((p.speed||0)+(canGrow?growth:0)-speedPen,20,80);
          p.contact=clamp((p.contact||0)+(canGrow?growth:0)-conPen,20,80);
          p.fielding=clamp((p.fielding||0)+(canGrow?growth:0)-fldPen,20,80);
          // 베테랑 관록: 선구안 상승
          p.eye=clamp((p.eye||0)+(canGrow?growth:0)+vetEyeBuff,20,80);
        }
        p.condition=rand(75,100);
        if(p.isPitcher)p.currentStamina=100;
        p._seasonsPlayed=(seasonsPlayed||0)+1;
        p._slumpGames=0; // 시즌 초기화
        p._tradeRefused=false; // 거부권 리셋
        if(p.age)p.age++;
      });
    });
  }

  $('modalTitle').textContent='🌸 프리시즌';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <p style="font-size:0.85rem;margin-bottom:12px;">시즌 ${G.season} ${isFirstYear?'개막 준비':'스프링캠프'}!</p>
      ${isFirstYear
        ?'<p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:12px;">첫 시즌입니다. 로스터를 확인하고 1군 27인 개막 엔트리를 확정하세요.<br>이적시장에서 전력 보강도 가능합니다.</p>'
        :`<p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:12px;">
            선수들의 능력치가 잠재력과 나이에 따라 변동되었습니다.<br>
            로스터를 확인하고 1군 27인 개막 엔트리를 확정하세요.
          </p>
          <div class="card" style="background:var(--bg-card-hover);padding:12px;margin-bottom:12px;">
            <div style="font-size:0.72rem;color:var(--accent);margin-bottom:6px;">📊 주요 변동 선수</div>
            ${_getTopChanges(t).map(c=>'<div style="font-size:0.75rem;padding:2px 0;color:'+(c.delta>0?'#10b981':'#ef4444')+';">'+c.name+': '+c.stat+' '+(c.delta>0?'+':'')+c.delta+'</div>').join('')||'<div style="color:var(--text-dim);font-size:0.72rem;">큰 변동 없음</div>'}
          </div>`
      }
      <button class="btn btn-primary" onclick="_confirmPreseason();" style="width:100%;">
        ✅ 개막 로스터 확정 & 시즌 시작
      </button>
    </div>`;
  $('seasonModal').classList.add('active');
}

function _confirmPreseason(){
  const check=validateActiveRoster(G.myTeam);
  if(!check.ok){
    alert('⚠️ 로스터 규정 위반!\n\n'+check.violations.join('\n')+'\n\n로스터 탭에서 수정하세요.');
    $('seasonModal').classList.remove('active');
    switchTab('roster');
    return;
  }
  $('seasonModal').classList.remove('active');
  G.phase='first_half';
  updateHeader();switchTab('dashboard');saveGame();
}

function _getTopChanges(team){
  const changes=[];
  team.roster.filter(p=>(p.status||'active')==='active').slice(0,20).forEach(p=>{
    const pot=p._potential||10;const sp=p._seasonsPlayed||0;
    if(pot>=14){changes.push({name:p.name,stat:'성장↑',delta:rand(1,3)});}
    else if(sp>=10){changes.push({name:p.name,stat:'노화↓',delta:-rand(1,3)});}
  });
  return changes.slice(0,5);
}

// ===================== PHASE 3: ALL-STAR BREAK & DRAFT =====================
function showAllStarBreak(){
  // 올스타 선정: 리그 OVR 상위 타자9+투수5
  const allPlayers=[];
  G.teams.forEach(t=>t.roster.filter(p=>(p.status||'active')==='active'&&p.role!=='overseas').forEach(p=>allPlayers.push({p,team:t})));
  const topBat=allPlayers.filter(e=>!e.p.isPitcher).sort((a,b)=>ovrBatter(b.p)-ovrBatter(a.p)).slice(0,9);
  const topPit=allPlayers.filter(e=>e.p.isPitcher).sort((a,b)=>ovrPitcher(b.p)-ovrPitcher(a.p)).slice(0,5);
  G.allStars=[...topBat,...topPit].map(e=>({name:e.p.name,team:e.team.name,emoji:e.team.emoji,ovr:ovr(e.p),pos:e.p.pos}));

  // 올스타 보유 구단 수익 보너스 (모든 팀)
  G.teams.forEach(team=>{
    const cnt=G.allStars.filter(s=>s.team===team.name).length;
    if(cnt>0)team.budget=+(team.budget+cnt*5).toFixed(1); // 올스타 1명당 5억
  });

  const myStars=G.allStars.filter(s=>s.team===G.myTeam.name);
  const starBonus=myStars.length*5;

  $('modalTitle').textContent='⭐ 올스타 브레이크';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <p style="font-size:0.85rem;margin-bottom:12px;">전반기 ${FIRST_HALF_END}경기 종료! 올스타가 선정되었습니다.</p>
      <div class="card" style="background:var(--bg-card-hover);padding:12px;margin-bottom:12px;">
        <div style="font-size:0.72rem;color:var(--accent);margin-bottom:8px;">⭐ 올스타 선정</div>
        ${G.allStars.map(s=>'<div style="font-size:0.73rem;padding:2px 0;"><span>'+s.emoji+'</span> <b>'+s.name+'</b> <span style="color:var(--text-dim);">'+(ALL_POS_NAMES[s.pos]||s.pos)+'</span> <span style="color:'+statColor(s.ovr)+';font-weight:700;">'+s.ovr+'</span></div>').join('')}
      </div>
      ${myStars.length>0?'<div style="font-size:0.78rem;color:var(--accent2);margin-bottom:8px;">🎉 내 팀 올스타 '+myStars.length+'명! 관중 수익 보너스 +'+won(starBonus)+'</div>':'<div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:8px;">내 팀 올스타 선수 없음</div>'}
      <button class="btn btn-primary" onclick="_startRookieDraft();" style="width:100%;">
        📝 신인 드래프트로 →
      </button>
    </div>`;
  $('seasonModal').classList.add('active');
}

// ===================== ROOKIE DRAFT (5 Rounds × 8 Teams) =====================
function _startRookieDraft(){
  $('seasonModal').classList.remove('active');

  // 풀이 없으면 생성 (호환성)
  if(!G.draftPool||G.draftPool.length===0){
    const scLv=G.myTeam.scoutingLevel||0;
    G.draftPool=generateDraftPool();
    G.draftPool.forEach(dp=>{dp._scoutedOvr=getScoutedOvr(dp,scLv);});
  }

  // 드래프트 순서: 전년 최종 순위 역순 (1년차: 랜덤)
  let draftOrder;
  if(G.season===1||!G.previousSeasonStandings||G.previousSeasonStandings.length===0){
    draftOrder=[...G.teams].sort(()=>Math.random()-0.5);
  }else{
    draftOrder=[...G.previousSeasonStandings].reverse().map(idx=>G.teams[idx]);
  }

  G._draftState={
    order:draftOrder,
    round:1,
    pickInRound:0,
    totalRounds:DRAFT_ROUNDS,
    myPicks:[],
    log:[],
    isTest:!!G._testDraftFlag,
  };

  // 드래프트 탭으로 이동
  switchTab('draft');
  _processDraftPick();
}

function _processDraftPick(){
  const ds=G._draftState;
  if(ds.round>ds.totalRounds||G.draftPool.length===0){
    _finishDraft();return;
  }

  const currentTeam=ds.order[ds.pickInRound];

  if(currentTeam===G.myTeam){
    // 내 차례: 드래프트 탭 렌더 → 유저가 선택
    renderDraft();
  }else{
    // AI 픽: scoutedOvr + 팀 니즈 + POT 가중치 (딜레이)
    renderDraft(); // 진행 중 화면 표시
    setTimeout(()=>{
      const team=currentTeam;
      const batCount=team.roster.filter(p=>!p.isPitcher).length;
      const pitCount=team.roster.filter(p=>p.isPitcher).length;
      const needBat=batCount<15;const needPit=pitCount<12;

      // AI도 퍼징된 OVR 사용 (fuzz ±4)
      const scored=G.draftPool.map(p=>{
        let score=(p._scoutedOvr||ovr(p))+rand(-4,4);
        // 포지션 니즈 가중치
        if(!p.isPitcher&&needBat)score+=rand(5,10);
        if(p.isPitcher&&needPit)score+=rand(5,10);
        // POT 가중치
        if((p._potential||10)>=15)score+=rand(3,8);
        return {p,score};
      }).sort((a,b)=>b.score-a.score);

      const best=scored[0]?.p;
      if(best){
        const idx=G.draftPool.indexOf(best);
        G.draftPool.splice(idx,1);
        best.status='futures';
        best.canDebutYear=G.season+1;
        // 로스터 정원 초과 시 자동 방출 (OVR 최저 + 고령 2군 선수)
        if(team.roster.length>=FUTURES_ORG_MAX){
          const cuts=team.roster.filter(p=>p.status==='futures'||p.status==='developmental')
            .sort((a,b)=>(ovr(a)-(a.age||22)*0.3)-(ovr(b)-(b.age||22)*0.3));
          if(cuts.length>0)team.roster.splice(team.roster.indexOf(cuts[0]),1);
        }
        team.roster.push(best);
        initSeasonStats(best);
        // 로그 기록
        if(!ds.log)ds.log=[];
        ds.log.push({team:team.name,emoji:team.emoji,name:best.name,pos:best.pos,ovr:ovr(best),isPitcher:best.isPitcher,round:ds.round,pick:ds.pickInRound+1});
      }
      _advanceDraftPick();
    },1500);
  }
}

function _advanceDraftPick(){
  const ds=G._draftState;
  ds.pickInRound++;
  if(ds.pickInRound>=ds.order.length){
    ds.pickInRound=0;
    ds.round++;
    // 스네이크 드래프트: 짝수 라운드는 순서 반전
    ds.order.reverse();
  }
  _processDraftPick();
}

function draftPick(uid){
  const ds=G._draftState;
  if(!ds.isTest&&G.myTeam.roster.length>=FUTURES_ORG_MAX){
    showToast('🚫 로스터 정원('+FUTURES_ORG_MAX+'명) 초과! 방출 후 지명하세요.');return;
  }
  const poolIdx=G.draftPool.findIndex(p=>p._uid===uid);
  if(poolIdx===-1){showToast('⚠️ 선수를 찾을 수 없습니다. 다시 시도해주세요.');return;}
  const p=G.draftPool.splice(poolIdx,1)[0];
  if(!p)return;
  p.status='futures';
  p.canDebutYear=G.season+1;
  G.myTeam.roster.push(p);
  initSeasonStats(p);
  ds.myPicks.push(p.name);
  // 로그 기록
  if(!ds.log)ds.log=[];
  ds.log.push({team:G.myTeam.name,emoji:G.myTeam.emoji,name:p.name,pos:p.pos,ovr:ovr(p),isPitcher:p.isPitcher,round:ds.round,pick:ds.pickInRound+1});
  showToast('📝 '+p.name+' 지명!');
  _advanceDraftPick();
}

function _finishDraft(){
  // 테스트 드래프트: 결과만 보여주고 원복 대기
  if(G._draftState&&G._draftState.isTest){
    const testLog=G._draftState.log||[];
    G._draftResult=testLog;
    delete G._draftState;
    delete G._testDraftFlag;
    G.draftPool=[];
    showToast('🧪 테스트 드래프트 완료! 결과 확인 후 "테스트 종료" 버튼을 눌러주세요.');
    renderDraft();
    return;
  }

  // 실제 드래프트
  G._draftResult=G._draftState?G._draftState.log||[]:[];
  G.draftPool=[];
  delete G._draftState;

  G.phase='second_half';
  updateHeader();saveGame();

  showToast('🎓 드래프트 완료! 후반기 시작');
  renderDraft();
}

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

// ===================== PHASE 6: AWARDS & RETIREMENT =====================
function showAwards(){
  const allB=[];const allP=[];
  G.teams.forEach(t=>t.roster.forEach(p=>{
    if(!p.ss)return;
    if(!p.isPitcher&&p.ss.ab>=20)allB.push({p,team:t});
    if(p.isPitcher&&_ssOuts(p.ss)>=30)allP.push({p,team:t});
  }));

  // MVP
  const mvpList=[...allB].sort((a,b)=>{
    const wa=ssAvg(a.p)*100+a.p.ss.hr*3+a.p.ss.rbi;
    const wb=ssAvg(b.p)*100+b.p.ss.hr*3+b.p.ss.rbi;
    return wb-wa;
  });
  const mvp=mvpList[0]||null;

  // 투수상 (사이영)
  const cyList=[...allP].sort((a,b)=>ssERA(a.p)-ssERA(b.p));
  const cyYoung=cyList[0]||null;

  // 신인왕
  const rookieList=[...allB].filter(e=>(e.p._seasonsPlayed||0)<=1).sort((a,b)=>ssAvg(b.p)-ssAvg(a.p));
  const rookie=rookieList[0]||null;

  // 홈런왕
  const hrList=[...allB].sort((a,b)=>b.p.ss.hr-a.p.ss.hr);
  const hrKing=hrList[0]||null;

  // 투수 트리플 크라운
  const tripleList=[...allP].sort((a,b)=>{
    const sa=-ssERA(a.p)+a.p.ss.w*10+a.p.ss.pk;
    const sb=-ssERA(b.p)+b.p.ss.w*10+b.p.ss.pk;
    return sb-sa;
  });
  const pitTriple=tripleList[0]||null;

  G.awards=[
    mvp?{title:'MVP',name:mvp.p.name,team:mvp.team.name,emoji:mvp.team.emoji}:null,
    cyYoung?{title:'투수상',name:cyYoung.p.name,team:cyYoung.team.name,emoji:cyYoung.team.emoji}:null,
    rookie?{title:'신인왕',name:rookie.p.name,team:rookie.team.name,emoji:rookie.team.emoji}:null,
    hrKing?{title:'홈런왕',name:hrKing.p.name,team:hrKing.team.name,emoji:hrKing.team.emoji}:null,
    pitTriple?{title:'투수 트리플 크라운',name:pitTriple.p.name,team:pitTriple.team.name,emoji:pitTriple.team.emoji}:null,
  ].filter(Boolean);

  // 수상자 보너스: 잠재력 +1~2, 인기도 +20
  G.awards.forEach(a=>{
    const potBoost=(a.title==='MVP'||a.title==='투수 트리플 크라운')?2:1;
    G.teams.forEach(t=>t.roster.forEach(p=>{
      if(p.name===a.name){
        p._potential=clamp((p._potential||10)+potBoost,1,20);
        p.popularity=clamp(p.popularity+20,0,100);
      }
    }));
  });

  // 은퇴 처리 + 명예의 전당
  const retirees=[];
  G.teams.forEach(t=>{
    t.roster=t.roster.filter(p=>{
      const sp=p._seasonsPlayed||0;
      if(sp<RETIRE_MIN_AGE_PROXY)return true;
      const prob=RETIRE_BASE_PROB+(sp-RETIRE_MIN_AGE_PROXY)*RETIRE_PROB_PER_SEASON;
      if(rand(1,100)>prob)return true;

      // 은퇴 확정
      const pOvr=ovr(p);
      const isHoF=pOvr>=HOF_OVR_THRESHOLD&&sp>=HOF_MIN_SEASONS;
      const entry={name:p.name,team:t.name,emoji:t.emoji,ovr:pOvr,seasonsPlayed:sp,isPitcher:p.isPitcher,pos:p.pos,isHoF};
      retirees.push(entry);
      if(isHoF){
        G.hallOfFame.push({
          ...entry,
          inductedSeason:G.season,
          careerStats:p._careerStats||p.ss,
        });
      }
      return false;
    });
  });

  $('modalTitle').textContent='🏅 시상식 & 은퇴';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <div style="font-size:0.72rem;color:var(--accent);margin-bottom:8px;">타이틀 홀더</div>
      ${G.awards.map(a=>'<div style="font-size:0.85rem;padding:6px 0;border-bottom:1px solid var(--border);"><span style="color:var(--accent);font-weight:700;">'+a.title+'</span> — '+a.emoji+' <b>'+a.name+'</b> <span style="color:var(--text-dim);">('+a.team+')</span></div>').join('')}
      ${retirees.length>0?`
      <div style="margin-top:14px;font-size:0.72rem;color:var(--text-dim);margin-bottom:6px;">👋 은퇴 선수</div>
      ${retirees.map(r=>'<div style="font-size:0.75rem;padding:3px 0;">'+r.emoji+' '+r.name+' (OVR '+r.ovr+', '+r.seasonsPlayed+'시즌)'+(r.isHoF?' <span style="color:#f59e0b;font-weight:700;">🏛️ 명예의 전당!</span>':'')+'</div>').join('')}
      `:''}
      ${G.hallOfFame.length>0?`
      <div style="margin-top:14px;font-size:0.72rem;color:#f59e0b;margin-bottom:6px;">🏛️ 명예의 전당 (${G.hallOfFame.length}명)</div>
      ${G.hallOfFame.slice(-3).map(h=>'<div style="font-size:0.72rem;padding:2px 0;color:var(--text-dim);">'+h.emoji+' '+h.name+' (S'+h.inductedSeason+' 입성)</div>').join('')}
      `:''}
      <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');G.phase='stove_league';advancePhase();" style="width:100%;margin-top:16px;">▶ 스토브리그로</button>
    </div>`;
  $('seasonModal').classList.add('active');
}

// ===================== PHASE 7: STOVE LEAGUE =====================
function showStoveLeague(){
  const t=G.myTeam;
  const isFirstYear=(G.season===1 && G.gameNum===0 && (t.wins+t.losses)===0);
  const sorted=[...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
  const rank=sorted.indexOf(t)+1;

  // 전년도 순위 저장 (다음 시즌 드래프트용)
  G.previousSeasonStandings=sorted.map(team=>G.teams.indexOf(team));

  if(!isFirstYear){
    // 수익 정산 (모든 팀) — 시즌 1 첫 시작 시 건너뜀
    G.teams.forEach(team=>{
      const tr=sorted.indexOf(team)+1;
      const rev=calcSeasonRevenue(team,tr);
      team.budget+=rev.net;
    });

    // 연간 고정 지출 차감 (모든 팀)
    G.teams.forEach(team=>{
      const upkeep=calcAnnualUpkeep(team);
      team.budget=Math.floor(team.budget-upkeep.total);
    });

    // 서비스 타임 + 팀 재적 증가 + 계약 만료 처리
    G.faPool=[];
    G._aiRenewalLog=[];
    G.teams.forEach(team=>{
      team.roster.forEach(p=>{
        if((p.status||'active')==='active'){
          p._serviceTime=(p._serviceTime||0)+1;
        }
        p._teamTenure=(p._teamTenure||0)+1;
        p._contractYears=(p._contractYears||1)-1;
      });
      // 계약 만료 선수 처리 (소속 구단 우선 재계약)
      const expired=team.roster.filter(p=>(p._contractYears||0)<=0 && (p._serviceTime||0)>=FA_SERVICE_TIME_THRESHOLD);
      const released=[];  // 재계약 실패 → FA 방출 대상
      expired.forEach(p=>{
        if(p.isForeign) return; // 외국인: FA 없이 삭제 (귀국)
        if(team===G.myTeam){
          // 유저 팀: 재계약 대기 목록에 추가 (FA 직행 방지)
          if(!G._renewalCandidates) G._renewalCandidates=[];
          G._renewalCandidates.push(p);
        } else {
          // AI 팀: 소속 구단 우선 재계약 시도
          const pOvr=ovr(p);
          const taxLine=LUXURY_TAX_THRESHOLD;
          let renewSalary;
          if(pOvr>=70) renewSalary=Math.floor(taxLine*rand(100,180)/1000);
          else if(pOvr>=65) renewSalary=Math.floor(taxLine*rand(60,100)/1000);
          else if(pOvr>=60) renewSalary=Math.floor(taxLine*rand(30,50)/1000);
          else if(pOvr>=50) renewSalary=Math.floor(taxLine*rand(10,20)/1000);
          else renewSalary=Math.max(1,Math.floor(taxLine*rand(5,10)/1000));
          const renewYears=_calcContractYears(pOvr);
          // 재계약 조건: OVR 50+ AND 팀 예산 여유 AND 50~80% 확률 (높은 OVR일수록 높음)
          const renewProb=pOvr>=70?80:pOvr>=65?70:pOvr>=60?60:pOvr>=50?50:20;
          const canAfford=team.budget>(renewSalary*renewYears);
          if(canAfford && pOvr>=50 && rand(1,100)<=renewProb){
            // 재계약 성공
            p.salary=renewSalary;
            p._contractYears=renewYears;
            p._contractEvent=null;
            G._aiRenewalLog.push({name:p.name,pos:p.pos,ovr:pOvr,age:p.age||22,team:team.name,emoji:team.emoji,salary:renewSalary,years:renewYears});
          } else {
            // 재계약 실패 → FA 풀로
            released.push(p);
          }
        }
      });
      // 재계약 실패한 선수만 FA 방출
      released.forEach(p=>{
        p._fromTeam=team.name;
        p._fromTeamEmoji=team.emoji;
        p._teamTenure=0;
        G.faPool.push(p);
      });
      // AI 팀은 FA 방출 선수만 로스터에서 제거, 유저 팀은 재계약 결정 후 제거
      if(team!==G.myTeam) team.roster=team.roster.filter(p=>!released.includes(p) && !(p.isForeign && (p._contractYears||0)<=0));
    });

    // AI 로스터 최적화 (승격/강등/방출/캡 정리)
    G.teams.filter(t=>t!==G.myTeam).forEach(t=>_aiOptimizeRoster(t));

    // AI 경쟁 입찰
    _runAIFreeAgentBidding();
  } else {
    G.faPool=G.faPool||[];
    G.faBiddingLog=[];
  }

  // 유저 팀 재계약 대상 선수
  const renewals=G._renewalCandidates||[];
  const renewalHTML=(!isFirstYear&&renewals.length>0)?`
    <div class="card" style="background:rgba(245,158,11,0.05);border:1px solid #f59e0b33;padding:10px;margin-bottom:10px;">
      <div style="font-size:0.72rem;color:#f59e0b;margin-bottom:6px;">📝 계약 만료 — 재계약 협상 대상 (${renewals.length}명)</div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:8px;">재계약하지 않으면 FA 시장으로 이동합니다.</div>
      <button class="btn btn-primary" onclick="_showRenewalNegotiation();" style="width:100%;">📝 재계약 협상</button>
    </div>`:'';

  // AI 재계약 결과
  const renewLog=G._aiRenewalLog||[];
  const renewLogHTML=(!isFirstYear&&renewLog.length>0)?`
    <div class="card" style="background:rgba(16,185,129,0.05);border:1px solid #10b98133;padding:10px;margin-bottom:10px;">
      <div style="font-size:0.72rem;color:#10b981;margin-bottom:6px;">🔄 소속 구단 재계약 (${renewLog.length}건)</div>
      <div style="max-height:100px;overflow-y:auto;scrollbar-width:none;font-size:0.68rem;color:var(--text-dim);line-height:1.7;">
        ${renewLog.map(r=>`${r.emoji} <b style="color:var(--text);">${r.team}</b> — <span style="color:${statColor(r.ovr)};">${r.name}</span>(${r.pos}, ${r.age}세, OVR ${r.ovr}) <b style="color:var(--accent);">${r.years}년 ${won(r.salary)}</b> 재계약`).join('<br>')}
      </div>
    </div>`:'';

  // AI 경쟁 입찰 결과
  const bidLog=G.faBiddingLog||[];
  const bidHTML=(!isFirstYear&&bidLog.length>0)?`
    <div class="card" style="background:rgba(245,158,11,0.05);border:1px solid #f59e0b33;padding:10px;margin-bottom:10px;">
      <div style="font-size:0.72rem;color:#f59e0b;margin-bottom:6px;">📰 FA 시장 속보 (${bidLog.length}건 계약)</div>
      <div style="max-height:120px;overflow-y:auto;font-size:0.68rem;color:var(--text-dim);line-height:1.7;">
        ${bidLog.map(b=>`${b.emoji} <b style="color:var(--text);">${b.team}</b>이(가) <span style="color:${statColor(b.ovr)};">${b.name}</span>(${b.pos}, ${b.age}세, OVR ${b.ovr})과(와) <b style="color:var(--accent);">${b.years}년 ${won(b.salary)}</b>에 계약${b.bidders>=3?' <span style="color:#a855f7;">🔥경쟁과열</span>':b.bidders>=2?' <span style="color:#f59e0b;">경쟁</span>':''}`).join('<br>')}
      </div>
    </div>`:'';

  // FA 풀 잔여 (유저가 영입 가능)
  const faRemain=(G.faPool||[]).length;
  const faInfo=faRemain>0?`<span style="color:#10b981;font-size:0.68rem;"> (잔여 FA ${faRemain}명)</span>`:'';

  // 유지비 정보
  const upkeep=calcAnnualUpkeep(t);
  const upkeepHTML=(!isFirstYear)?`
    <div class="card" style="background:rgba(239,68,68,0.03);border:1px solid #ef444422;padding:10px;margin-bottom:10px;">
      <div style="font-size:0.72rem;color:#ef4444;margin-bottom:6px;">💸 연간 유지비 (-${won(upkeep.total)})</div>
      <div style="font-size:0.68rem;color:var(--text-dim);line-height:1.6;">
        👔 코칭스태프 -${won(upkeep.staffCost)} · 🏟️ 경기장 -${won(upkeep.stadiumCost)} · 🏗️ 시설 -${won(upkeep.facilityCost)} · 🌱 퓨처스 -${won(upkeep.farmCost)}
      </div>
    </div>`:'';

  // 수익 정보 (시즌 1 첫 시작 시에는 수익 정산 없음)
  const r=isFirstYear?null:calcSeasonRevenue(t,rank);
  const revenueHTML=isFirstYear?`
    <div class="card" style="background:var(--bg-card-hover);padding:12px;margin-bottom:12px;">
      <div style="font-size:0.72rem;color:var(--accent);margin-bottom:6px;">📋 팀 현황</div>
      <div style="font-size:0.78rem;color:var(--text-dim);line-height:1.8;">
        새로운 시즌을 시작합니다! FA 시장에서 선수를 영입하거나 시설에 투자하세요.
        <hr style="border-color:#333;margin:6px 0;">
        <span style="font-weight:700;color:var(--accent);">보유 자금: ${won(t.budget)}</span>
      </div>
    </div>`:`
    <div class="card" style="background:var(--bg-card-hover);padding:12px;margin-bottom:12px;">
      <div style="font-size:0.72rem;color:var(--accent);margin-bottom:6px;">💰 시즌 수익</div>
      <div style="font-size:0.78rem;color:var(--text-dim);line-height:1.8;">
        인기도 +${won(r.popRev)} | 승리 +${won(r.winB)} | 시설 +${won(r.facB)} | 스타 +${won(r.starB)} | 순위 +${won(r.rankB)}
        ${r.stadBonus>0?' | 구장 +'+won(r.stadBonus):''}
        ${r.luxTax>0?'<br><span style="color:#ef4444;">사치세 -'+won(r.luxTax)+'</span>':''}
        <hr style="border-color:#333;margin:6px 0;">
        <span style="font-weight:700;color:var(--accent);">최종 수익: +${won(r.net)} → 보유 자금: ${won(t.budget)}</span>
      </div>
    </div>`;

  $('modalTitle').textContent=isFirstYear?'🔥 시즌 준비':'🔥 스토브리그';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <p style="font-size:0.85rem;margin-bottom:8px;">${t.emoji} ${t.name} — ${isFirstYear?'시즌 1 준비':'시즌 '+G.season+' 결산'}</p>
      ${revenueHTML}
      ${upkeepHTML}
      ${renewalHTML}
      ${renewLogHTML}
      ${bidHTML}
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${isFirstYear?'':`<button class="btn btn-primary" onclick="_showSalaryNegotiation();" style="width:100%;">💰 연봉 협상</button>`}
        <button class="btn btn-secondary" onclick="_showFAMarket();" style="width:100%;">🔄 FA 시장${faInfo}</button>
        <button class="btn btn-secondary" onclick="$('seasonModal').classList.remove('active');switchTab('invest');" style="width:100%;">🏗️ 시설 투자</button>
        <button class="btn btn-secondary" onclick="$('seasonModal').classList.remove('active');switchTab('roster');" style="width:100%;">👥 로스터 확인</button>
        <button class="btn btn-primary" onclick="_startNextSeason();" style="width:100%;margin-top:8px;">▶ ${isFirstYear?'시즌 시작':'다음 시즌 준비 완료'}</button>
      </div>
    </div>`;
  $('seasonModal').classList.add('active');
}

// ── 재계약 협상 ─────────────────────────────────────────────────
function _showRenewalNegotiation(){
  const renewals=G._renewalCandidates||[];
  if(renewals.length===0){showToast('재계약 대상 선수가 없습니다.');showStoveLeague();return;}

  // 총 예상 비용
  const totalExpCost=renewals.reduce((s,p)=>{const e=getExpectedContract(p);return s+e.salary*e.years;},0);

  $('modalTitle').textContent='';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:0.92rem;font-weight:700;color:var(--text);">📝 재계약 협상</div>
        <div style="display:flex;gap:10px;font-size:0.65rem;color:var(--text-dim);">
          <span>대상 <b style="color:var(--accent);">${renewals.length}명</b></span>
          <span>예상 총액 <b style="color:#f59e0b;">~${won(+totalExpCost.toFixed(1))}</b></span>
        </div>
      </div>

      <!-- 안내 -->
      <div style="background:rgba(245,158,11,0.06);border:1px solid #f59e0b22;border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:0.68rem;color:var(--text-dim);">
        선수를 클릭하여 계약 조건을 협상하세요. 협상 결렬 시 FA 시장으로 이동합니다.
      </div>

      <!-- 선수 목록 -->
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
        ${renewals.map((p,i)=>{
          const o=ovr(p);const exp=getExpectedContract(p);const w=approxWAR(p);
          return `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#111827;border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='var(--border)'" onclick="_startRenewalNego(${i})">
            <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.6rem;padding:2px 8px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
            <div style="flex:1;">
              <div class="player-name" style="font-size:0.78rem;">${p.name}</div>
              <div style="font-size:0.58rem;color:var(--text-dim);">${p.age||22}세 · WAR ${w.toFixed(1)} · 서비스 ${p._serviceTime||0}yr</div>
            </div>
            <span style="color:${statColor(o)};font-weight:800;font-size:0.88rem;font-family:'JetBrains Mono',monospace;">${o}</span>
            <div style="text-align:right;min-width:80px;">
              <div style="color:#f59e0b;font-size:0.72rem;font-weight:700;">~${won(exp.salary)} × ${exp.years}년</div>
              <div style="font-size:0.55rem;color:var(--text-dim);">에이전트 요구</div>
            </div>
            <button class="btn btn-sm" onclick="_declineRenewal(${i});event.stopPropagation();" style="font-size:0.55rem;padding:3px 8px;background:rgba(239,68,68,0.08);border:1px solid #ef444433;color:#ef4444;border-radius:6px;">방출</button>
            <span style="color:var(--text-dim);font-size:0.72rem;">›</span>
          </div>`;
        }).join('')}
      </div>

      <!-- 하단 버튼 -->
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" onclick="_declineAllRenewals();" style="flex:1;color:#ef4444;border-color:#ef444433;">전체 방출</button>
        <button class="btn btn-secondary" onclick="showStoveLeague();" style="flex:1;padding:10px;">← 돌아가기</button>
      </div>
    </div>`;
  $('seasonModal').classList.add('active');
}

function _startRenewalNego(idx){
  const renewals=G._renewalCandidates||[];
  const p=renewals[idx];if(!p)return;

  showNegotiationModal(p,'renewal',
    function onAccept(salary,years){
      p.salary=salary;p._contractYears=years;p._contractEvent=null;
      G._renewalCandidates=(G._renewalCandidates||[]).filter(c=>c!==p);
      showToast(`✅ ${p.name} 재계약! (${won(salary)} × ${years}년)`);
      saveGame();
      if((G._renewalCandidates||[]).length>0)_showRenewalNegotiation();
      else showStoveLeague();
    },
    function onFail(reason){
      if(reason==='cancel'){_showRenewalNegotiation();return;}
      // 결렬 → FA 방출
      p._fromTeam=G.myTeam.name;p._fromTeamEmoji=G.myTeam.emoji;
      p._teamTenure=0;
      G.faPool.push(p);
      G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
      G._renewalCandidates=(G._renewalCandidates||[]).filter(c=>c!==p);
      showToast(`❌ ${p.name} 협상 결렬 → FA 이동`);
      saveGame();
      if((G._renewalCandidates||[]).length>0)_showRenewalNegotiation();
      else showStoveLeague();
    }
  );
}

function _declineRenewal(idx){
  const renewals=G._renewalCandidates||[];
  const p=renewals[idx];if(!p)return;
  p._fromTeam=G.myTeam.name;p._fromTeamEmoji=G.myTeam.emoji;
  p._teamTenure=0;
  G.faPool.push(p);
  G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
  G._renewalCandidates=renewals.filter(c=>c!==p);
  showToast(`❌ ${p.name} FA 방출`);saveGame();
  if((G._renewalCandidates||[]).length>0)_showRenewalNegotiation();
  else showStoveLeague();
}

function _declineAllRenewals(){
  const renewals=G._renewalCandidates||[];
  renewals.forEach(p=>{
    p._fromTeam=G.myTeam.name;p._fromTeamEmoji=G.myTeam.emoji;
    p._teamTenure=0;
    G.faPool.push(p);
    G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
  });
  G._renewalCandidates=[];
  showToast(`❌ 전체 FA 방출 (${renewals.length}명)`);
  showStoveLeague();saveGame();
}

// ── 연봉 협상 ───────────────────────────────────────────────────
function _calcNewSalary(p){
  const pOvr=ovr(p);
  const war=approxWAR(p);
  const st=p._serviceTime||0;
  const oldSalary=p.salary||0;
  let newSalary;

  if(st<=PRE_ARB_MAX_SERVICE){
    // 프리아브: 최저 연봉 고정, 팀 완전 통제
    newSalary=PRE_ARB_SALARY;
  }else if(st<=ARB_MAX_SERVICE){
    // 연봉조정 (Arbitration): OVR/WAR 기반 자동 인상
    if(pOvr>=65)newSalary=+(oldSalary*1.4+rand(1,3)*0.1).toFixed(1);
    else if(pOvr>=55)newSalary=+(oldSalary*1.2+rand(0,2)*0.1).toFixed(1);
    else if(pOvr>=42)newSalary=+(oldSalary*1.1).toFixed(1);
    else newSalary=Math.max(SALARY_MIN,+(oldSalary*0.9).toFixed(1));
    if(war>=3)newSalary=Math.round(newSalary*1.15);
  }else{
    // FA 자격자: 자유 시장 가치 기반
    if(pOvr>=65)newSalary=+(oldSalary*1.3+rand(5,20)*0.1).toFixed(1);
    else if(pOvr>=55)newSalary=+(oldSalary*1.1+rand(2,10)*0.1).toFixed(1);
    else if(pOvr>=42)newSalary=oldSalary;
    else newSalary=Math.max(SALARY_MIN,+(oldSalary*0.85).toFixed(1));
    if(war>=3)newSalary=+(newSalary*1.15).toFixed(1);
    else if(war<0.5&&pOvr<48)newSalary=Math.max(SALARY_MIN,+(newSalary-0.5).toFixed(1));
  }
  // 팀 컨셉 연봉 배율
  if(G.myTeam.concept==='pitching')newSalary=+(newSalary*1.05).toFixed(1);
  if(G.myTeam.concept==='prospect')newSalary=+(newSalary*1.10).toFixed(1);
  return +newSalary;
}

function _getSalaryPhase(p){
  const st=p._serviceTime||0;
  if(st<=PRE_ARB_MAX_SERVICE)return'프리아브';
  if(st<=ARB_MAX_SERVICE)return'연봉조정';
  return'FA자격';
}

function _showSalaryNegotiation(){
  const t=G.myTeam;
  // 프리아브/연봉조정: 자동 조정
  const autoAdjust=[];
  // FA 자격: 개별 협상 대상
  const faPlayers=[];

  t.roster.forEach(p=>{
    const oldSalary=p.salary||0;
    const newSalary=_calcNewSalary(p);
    const phase=_getSalaryPhase(p);
    if(phase==='FA자격'){
      faPlayers.push(p);
    } else if(newSalary!==oldSalary){
      autoAdjust.push({p,oldSalary,newSalary,phase});
    }
  });

  // 프리아브/연봉조정 자동 적용
  autoAdjust.forEach(a=>{a.p.salary=a.newSalary;});

  // 자동 조정 요약
  const totalUp=autoAdjust.filter(a=>a.newSalary>a.oldSalary);
  const totalDown=autoAdjust.filter(a=>a.newSalary<a.oldSalary);
  const diffSum=autoAdjust.reduce((s,a)=>s+(a.newSalary-a.oldSalary),0);

  $('modalTitle').textContent='';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:0.92rem;font-weight:700;color:var(--text);">💰 연봉 협상</div>
        <div style="font-size:0.65rem;color:var(--text-dim);">시즌 ${G.season||1}</div>
      </div>

      ${autoAdjust.length>0?`
      <!-- 자동 조정 요약 카드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:#111827;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.58rem;color:var(--text-dim);">조정 인원</div>
          <div style="font-size:1rem;font-weight:700;color:var(--text);">${autoAdjust.length}명</div>
        </div>
        <div style="background:#111827;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.58rem;color:var(--text-dim);">인상 / 감봉</div>
          <div style="font-size:0.82rem;font-weight:700;"><span style="color:#ef4444;">${totalUp.length}</span> / <span style="color:#10b981;">${totalDown.length}</span></div>
        </div>
        <div style="background:#111827;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.58rem;color:var(--text-dim);">총 변동</div>
          <div style="font-size:0.82rem;font-weight:700;color:${diffSum>0?'#ef4444':'#10b981'};">${diffSum>0?'+':''}${won(+diffSum.toFixed(1))}</div>
        </div>
      </div>

      <!-- 자동 조정 상세 테이블 -->
      <div style="background:#111827;border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:14px;">
        <div style="font-size:0.68rem;color:var(--accent);margin-bottom:8px;">자동 조정 완료 (프리아브 / 연봉조정)</div>
        <div style="max-height:180px;overflow-y:auto;scrollbar-width:none;">
          <table class="data-table" style="font-size:0.7rem;">
            <thead><tr><th>포지션</th><th>이름</th><th>단계</th><th>OVR</th><th>변경</th><th>차액</th></tr></thead>
            <tbody>${autoAdjust.map(a=>{
              const diff=a.newSalary-a.oldSalary;
              const o=ovr(a.p);
              return '<tr>'+
                '<td><span class="pos-badge'+(a.p.isPitcher?' pitcher':'')+'" style="font-size:0.5rem;padding:1px 4px;">'+(ALL_POS_NAMES[a.p.pos]||a.p.pos)+'</span></td>'+
                '<td class="player-name" style="font-size:0.7rem;">'+a.p.name+'</td>'+
                '<td style="color:'+(a.phase==='프리아브'?'#67e8f9':'#f59e0b')+';font-size:0.6rem;">'+a.phase+'</td>'+
                '<td style="color:'+statColor(o)+';font-weight:700;">'+o+'</td>'+
                '<td style="font-family:JetBrains Mono,monospace;">'+won(a.oldSalary)+' → <b>'+won(a.newSalary)+'</b></td>'+
                '<td style="color:'+(diff>0?'#ef4444':'#10b981')+';font-family:JetBrains Mono,monospace;font-weight:700;">'+(diff>0?'+':'')+won(+diff.toFixed(1))+'</td></tr>';
            }).join('')}</tbody>
          </table>
        </div>
      </div>`:''}

      ${faPlayers.length>0?`
      <!-- FA 자격 선수 개별 협상 -->
      <div style="background:#111827;border:1px solid #10b98133;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:0.72rem;color:#10b981;font-weight:700;">FA 자격 선수 — 개별 협상</div>
          <div style="font-size:0.6rem;color:var(--text-dim);">${faPlayers.length}명</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${faPlayers.map(p=>{
            const o=ovr(p);
            const w=approxWAR(p);
            return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#0a0e1a;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='#10b981'" onmouseout="this.style.borderColor='var(--border)'" onclick="_startSalaryNego(${t.roster.indexOf(p)})">
              <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.55rem;padding:2px 6px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
              <div style="flex:1;">
                <div class="player-name" style="font-size:0.75rem;">${p.name}</div>
                <div style="font-size:0.58rem;color:var(--text-dim);">${p.age||22}세 · WAR ${w.toFixed(1)}</div>
              </div>
              <span style="color:${statColor(o)};font-weight:800;font-size:0.85rem;font-family:'JetBrains Mono',monospace;">${o}</span>
              <div style="text-align:right;min-width:60px;">
                <div style="color:var(--accent);font-size:0.75rem;font-weight:700;">${won(p.salary||0)}</div>
                <div style="font-size:0.55rem;color:var(--text-dim);">현재 연봉</div>
              </div>
              <span style="color:var(--text-dim);font-size:0.72rem;">›</span>
            </div>`;
          }).join('')}
        </div>
      </div>`:'<div style="background:#111827;border-radius:10px;padding:16px;text-align:center;color:var(--text-dim);font-size:0.72rem;margin-bottom:14px;">FA 자격 선수가 없습니다.</div>'}

      <button class="btn btn-secondary" onclick="showStoveLeague();" style="width:100%;padding:10px;">← 돌아가기</button>
    </div>`;
  $('seasonModal').classList.add('active');
  saveGame();
}

function _startSalaryNego(rosterIdx){
  const p=G.myTeam.roster[rosterIdx];if(!p)return;
  showNegotiationModal(p,'salary',
    function onAccept(salary,years){
      p.salary=salary;p._contractYears=years;
      showToast(`✅ ${p.name} 연봉 합의! (${won(salary)} × ${years}년)`);
      saveGame();_showSalaryNegotiation();
    },
    function onFail(){_showSalaryNegotiation();}
  );
}

// ── AI 경쟁 입찰 ─────────────────────────────────────────────────
// ===== AI 로스터 최적화 시스템 =====

// AI 가치 평가: OVR + 나이 + 연봉 → 종합 가치 점수
function _aiPlayerValue(p){
  const o=ovr(p);
  const age=p.age||22;
  const sal=p.salary||0;
  let val=o*2; // 기본: OVR 비례
  // 나이 보정: 25세 이하 유망주 가산, 34세 이상 노장 급감
  if(age<=23) val+=15;
  else if(age<=27) val+=8;
  else if(age<=31) val+=0;
  else if(age<=33) val-=10;
  else val-=25-(age-34)*5; // 34세: -25, 35세: -30, 36세: -35...
  // 잠재력 가산
  val+=((p._potential||10)-10)*2;
  // 연봉 효율 페널티: 고액+저능력 → 가치 급감
  if(sal>10&&o<55) val-=sal*2;
  else if(sal>20&&o<60) val-=sal;
  return val;
}

// AI 로스터 정리: OVR 기반 무한경쟁 + 명시적 방출 + 캡 정리
function _aiOptimizeRoster(team){
  if(team===G.myTeam)return;

  // ── 1. 1군-2군 무한 경쟁: 전체 로스터를 OVR 순 정렬 → 상위 29명만 active ──
  const healthy=team.roster.filter(p=>p.status!=='il'&&p.status!=='overseas');
  // 투수/타자 최소 비율 유지 (타자 최소 9, 투수 최소 5)
  const batters=healthy.filter(p=>!p.isPitcher).sort((a,b)=>ovr(b)-ovr(a));
  const pitchers=healthy.filter(p=>p.isPitcher).sort((a,b)=>ovr(b)-ovr(a));
  const minBat=Math.min(13,batters.length);
  const minPit=Math.min(10,pitchers.length);

  // 먼저 모든 건강한 선수 2군으로 리셋
  healthy.forEach(p=>{p.status='futures';p.role=p.isPitcher?'bullpen':'bench';});

  // 타자 상위 minBat명 1군
  let activeSlots=ACTIVE_ROSTER_MAX;
  batters.slice(0,minBat).forEach(p=>{
    if(activeSlots<=0)return;
    p.status='active';p.role='starting';activeSlots--;
  });
  // 투수 상위 minPit명 1군
  pitchers.slice(0,minPit).forEach(p=>{
    if(activeSlots<=0)return;
    p.status='active';p.role=p.pos==='SP'?'rotation':'bullpen';activeSlots--;
  });
  // 남은 슬롯: 전체 OVR 순으로 채움
  if(activeSlots>0){
    const remaining=healthy.filter(p=>p.status==='futures').sort((a,b)=>ovr(b)-ovr(a));
    remaining.slice(0,activeSlots).forEach(p=>{
      p.status='active';
      p.role=p.isPitcher?(p.pos==='SP'?'rotation':'bullpen'):'bench';
    });
  }

  // ── 2. 명시적 방출: 정원 60명 이상이면 선제 정리 (드래프트 6명 여유) ──
  const releaseThreshold=FUTURES_ORG_MAX-6; // 59명까지 정리
  if(team.roster.length>releaseThreshold){
    const candidates=team.roster
      .filter(p=>p.status==='futures'||p.status==='developmental')
      .sort((a,b)=>_aiPlayerValue(a)-_aiPlayerValue(b));
    let toCut=team.roster.length-releaseThreshold;
    while(toCut>0&&candidates.length>0){
      const cut=candidates.shift();
      // 25세 이상 + 잠재력 C/D급(12 미만) + 낮은 OVR 우선 방출
      const idx=team.roster.indexOf(cut);
      if(idx>=0){team.roster.splice(idx,1);toCut--;}
    }
  }

  // ── 3. 고액 연봉 정리: 페이롤 > 하드캡 90% 시 비효율 선수 방출 ──
  const capThreshold=getHardCap()*0.9;
  if(getPayroll(team)>capThreshold){
    const expensive=team.roster
      .filter(p=>(p.salary||0)>5&&_aiPlayerValue(p)<80)
      .sort((a,b)=>(b.salary||0)/(ovr(b)||1)-(a.salary||0)/(ovr(a)||1));
    expensive.forEach(p=>{
      if(getPayroll(team)<=capThreshold)return;
      if((p._contractYears||0)<=0||(p.age||22)>=34){
        const idx=team.roster.indexOf(p);
        if(idx>=0)team.roster.splice(idx,1);
      }else{
        p.status='futures';p.role=p.isPitcher?'bullpen':'bench';
      }
    });
  }
}

function _runAIFreeAgentBidding(){
  if(!G.faPool||G.faPool.length===0)return;
  G.faBiddingLog=[];  // 입찰 로그 (UI 표시용)

  // FA를 OVR 내림차순 정렬 (고급 선수부터 입찰)
  const pool=[...G.faPool].sort((a,b)=>ovr(b)-ovr(a));
  const aiTeams=G.teams.filter(t=>t!==G.myTeam);

  // AI 팀별 예산/니즈 계산
  function teamNeed(team){
    const batCount=team.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active').length;
    const pitCount=team.roster.filter(p=>p.isPitcher&&(p.status||'active')==='active').length;
    return {needBat:batCount<11, needPit:pitCount<10, budget:team.budget||0};
  }

  pool.forEach(fa=>{
    const pOvr=ovr(fa);
    const taxLine=LUXURY_TAX_THRESHOLD;

    // 시장 가치 산정 (사치세 비율 기반)
    let marketSalary;
    if(pOvr>=70) marketSalary=+(taxLine*rand(100,180)/1000).toFixed(1);
    else if(pOvr>=65) marketSalary=+(taxLine*rand(60,100)/1000).toFixed(1);
    else if(pOvr>=60) marketSalary=+(taxLine*rand(30,50)/1000).toFixed(1);
    else if(pOvr>=50) marketSalary=+(taxLine*rand(10,20)/1000).toFixed(1);
    else marketSalary=+(taxLine*rand(5,10)/1000).toFixed(1);

    const contractYears=_calcContractYears(pOvr);
    const transferFee=+(pOvr*0.3+rand(5,15)).toFixed(1);

    // OVR 55 미만: AI 경쟁 없음 → 유저 전용 FA 시장으로
    if(pOvr<55){
      fa.salary=marketSalary;
      fa._contractYears=contractYears;
      fa.price=transferFee;
      return;  // faPool에 남김
    }

    // AI 팀 입찰: 예산 여유 + 포지션 니즈 + OVR 기반 + 샐러리캡 가드
    const bidders=aiTeams.filter(t=>{
      const need=teamNeed(t);
      const posMatch=fa.isPitcher?need.needPit:need.needBat;
      const canAfford=need.budget>(marketSalary*contractYears+transferFee);
      // 샐러리캡 90% 초과 시 추가 영입 중단
      const payroll=getPayroll(t);
      if(payroll+marketSalary>getHardCap()*0.9) return false;
      // 높은 OVR → 더 많은 팀이 관심 (랜덤 경쟁)
      const interest=pOvr>=70?60:pOvr>=65?45:pOvr>=60?30:20;
      return canAfford&&(posMatch||rand(1,100)<=interest);
    });

    if(bidders.length===0) {
      // 아무도 안 원함 → FA 시장에 남김
      fa.salary=marketSalary;
      fa._contractYears=contractYears;
      fa.price=transferFee;
      return;
    }

    // 최고 입찰팀: 예산이 가장 큰 팀이 낙찰 (경쟁 프리미엄 적용)
    bidders.sort((a,b)=>(b.budget||0)-(a.budget||0));
    const winner=bidders[0];
    const competitionMult=bidders.length>=3?1.25:bidders.length>=2?1.15:1.0;
    const finalSalary=+(marketSalary*competitionMult).toFixed(1);
    const finalContract=Math.min(contractYears+Math.floor(bidders.length/2),6);

    // 계약 체결
    fa.salary=finalSalary;
    fa._contractYears=finalContract;
    fa._teamTenure=0;
    fa._contractEvent=null;
    fa.status='active';
    fa.role=fa.isPitcher?(fa.pos==='SP'?'rotation':'bullpen'):'bench';
    initSeasonStats(fa);
    winner.roster.push(fa);
    winner.budget=+(winner.budget-transferFee).toFixed(1);

    G.faBiddingLog.push({
      name:fa.name, pos:fa.pos, ovr:pOvr, age:fa.age||22,
      team:winner.name, emoji:winner.emoji,
      salary:finalSalary, years:finalContract,
      bidders:bidders.length, from:fa._fromTeam||'외부'
    });

    // FA 풀에서 제거
    const idx=G.faPool.indexOf(fa);
    if(idx>=0) G.faPool.splice(idx,1);
  });
}

// ── FA 시장 (유저용: 계약 만료 + 보충 FA) ────────────────────────
function _showFAMarket(){
  G.marketPlayers=[];
  const faMult=G.myTeam.concept==='pitching'?1.05:G.myTeam.concept==='prospect'?1.10:1.0;
  const taxLine=LUXURY_TAX_THRESHOLD;

  // 1. 계약 만료로 FA 풀에 남은 선수 (AI가 안 가져간 것)
  (G.faPool||[]).forEach(fa=>{
    fa.price=+(fa.price||((ovr(fa)*0.3+rand(5,15))*faMult)).toFixed(1);
    if(!fa.salary) fa.salary=+(taxLine*rand(10,30)/1000).toFixed(1);
    if(!fa._contractYears) fa._contractYears=_calcContractYears(ovr(fa));
    fa.status='futures';
    if(!fa.ss)initSeasonStats(fa);
    G.marketPlayers.push(fa);
  });

  // 2. 기존: 서비스 타임 달성 선수 추가 FA (다른 팀에서 30% 확률)
  G.teams.filter(team=>team!==G.myTeam).forEach(team=>{
    const candidates=team.roster.filter(p=>
      (p._serviceTime||0)>=FA_SERVICE_TIME_THRESHOLD && (p._contractYears||0)<=1
    );
    candidates.forEach(p=>{
      if(rand(1,100)<=20&&team.roster.length>ORG_MIN_TOTAL){
        const fa={...p};
        fa.price=+((ovr(fa)*0.3+rand(5,15))*faMult).toFixed(1);
        fa.status='futures';
        fa._fromTeam=team.name;
        if(!fa.ss)initSeasonStats(fa);
        G.marketPlayers.push(fa);
        team.roster=team.roster.filter(tp=>tp!==p);
      }
    });
  });

  // 3. 랜덤 FA 보충 (등급 분포 기반, 최소 26세)
  for(let i=0;i<3;i++){
    const p=genBatter(pick(BAT_POS),null);
    if(p.age<26)p.age=rand(26,33);
    p.price=+((ovrBatter(p)*0.25+rand(3,10))*faMult).toFixed(1);
    p.role='bench';p.status='futures';
    p._serviceTime=rand(7,12);
    G.marketPlayers.push(p);
  }
  for(let i=0;i<2;i++){
    const role=['SP','CP'][i];
    const p=genPitcher(role,null);
    if(p.age<26)p.age=rand(26,33);
    p.price=+((ovrPitcher(p)*0.25+rand(3,10))*faMult).toFixed(1);
    p.role=role==='SP'?'rotation':'bullpen';p.status='futures';
    p._serviceTime=rand(7,12);
    G.marketPlayers.push(p);
  }

  $('seasonModal').classList.remove('active');
  switchTab('market');
  showToast('🔄 FA 시장이 개장되었습니다!');
}

// ── 다음 시즌 시작 ──────────────────────────────────────────────
function _startNextSeason(){
  $('seasonModal').classList.remove('active');
  G.season++;G.gameNum=0;G.phase='preseason';
  G.fanEventUsedThisGame=false;G.trainedBatter=false;G.trainedPitcher=false;
  G.allStars=[];G.awards=[];G.postseasonBracket=null;
  G.faPool=[];G.faBiddingLog=[];G._draftResult=null;

  // 드래프트 풀 시즌 초 미리 생성 (48명) + 스카우팅 티켓 12장
  G._scoutTickets=12;
  const scLv=G.myTeam.scoutingLevel||0;
  G.draftPool=generateDraftPool();
  G.draftPool.forEach(dp=>{dp._scoutedOvr=getScoutedOvr(dp,scLv);});

  // AI 오프시즌 보강
  G.teams.filter(team=>team!==G.myTeam).forEach(team=>{
    if(rand(1,100)<=50)team.facilityLevel=clamp(team.facilityLevel+rand(1,4),0,100);
    if(rand(1,100)<=40)team.devLevel=clamp(team.devLevel+rand(1,4),0,100);
    if(team.budget>40){
      const np=rand(1,2)===1?genBatter(pick(BAT_POS),null,team.concept):genPitcher(pick(['SP','CP','SU','MR','LR']),null,team.concept);
      np.role=np.isPitcher?(np.pos==='SP'?'rotation':'bullpen'):'bench';
      team.roster.push(np);initSeasonStats(np);team.budget=+(team.budget-rand(10,25)).toFixed(1);
    }
    // AI 연봉 자동 조정
    team.roster.forEach(p=>{
      const pOvr=ovr(p);
      if(pOvr>=62)p.salary=Math.round((p.salary||3)*1.2);
      else if(pOvr<38)p.salary=Math.max(1,Math.round((p.salary||3)*0.8));
    });
  });

  // 시즌 리셋
  G.teams.forEach(t=>{
    t.wins=0;t.losses=0;t.rs=0;t.ra=0;t.rotationIdx=0;t.streak=0;t.recentResults=[];t.scoutCampUsed=0;t.overseasUsedThisSeason=0;t.medicalUsedThisSeason=0;
    if(t===G.myTeam){t.moralBoost=0;t.eventRevenue=0;}

    // 해외연수 강제 복귀 (스탯 부스트)
    t.roster.forEach(p=>{
      if(p.role==='overseas'){
        const boost=rand(OVERSEAS_BOOST_MIN,OVERSEAS_BOOST_MAX);
        if(p.isPitcher){const s=pick(['stuff','control','velocity','movement']);p[s]=clamp((p[s]||0)+boost,20,80);}
        else{const s=pick(['contact','power','eye','speed']);p[s]=clamp((p[s]||0)+boost,20,80);}
        p.role=p.prevRole||(p.isPitcher?'bullpen':'bench');p.overseasUntil=null;p.prevRole=null;
      }
    });

    // 커리어 스탯 누적 + 시즌 초기화
    t.roster.forEach(p=>{
      if(p.ss){
        if(!p._careerStats)p._careerStats={...p.ss};
        else Object.keys(p.ss).forEach(k=>{p._careerStats[k]=(p._careerStats[k]||0)+(p.ss[k]||0);});
      }
      p.xp=0;p.cooldown=0;p.rehabGamesLeft=0;
      initSeasonStats(p);
      if(p.status==='il'){p.status='futures';p.isOnIL=false;p.ilGamesLeft=0;}
    });
  });

  updateHeader();switchTab('dashboard');
  advancePhase(); // → preseason
  saveGame();
}

// ── showSeasonEnd (하위 호환 — 기존 코드 참조용) ─────────────────
function showSeasonEnd(){showStoveLeague();}
function nextSeason(){_startNextSeason();}
