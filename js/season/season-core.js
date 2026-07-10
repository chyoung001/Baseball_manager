// ===================== SEASON CORE (Phase Controller + Preseason + Draft) =====================
// ── Phase Info ───────────────────────────────────────────────────
function getPhaseInfo(){
  const p=SEASON_PHASES;
  const phases=[p.PRESEASON,p.FIRST_HALF,p.ALLSTAR,p.SECOND_HALF,p.POSTSEASON,p.AWARDS,p.GM_MEETING,p.STOVE_LEAGUE];
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
    case 'gm_meeting':   showGMMeeting();break;
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
        const pot=p._potential||50;
        const we=p._workEthic||50;
        const ethicMod=0.5+(we/100); // 0.85~1.5 (히든 1~100)
        const seasonsPlayed=p._seasonsPlayed||0;

        // 에이징 면역 체크 (의료 센터 대성공)
        if((p.agingImmunityYears||0)>0){
          p.agingImmunityYears--;
          const immuneGrowth=Math.round((rand(0,2)+Math.floor(team.devLevel/30))*ethicMod);
          const stats=p.isPitcher?['stuff','control','velocity','movement','stamina','clutch']:['contact','power','eye','speed','fielding','arm'];
          if(ovrRaw(p)<maxOvrFromPot(pot)){
            stats.forEach(s=>{p[s]=clamp((p[s]||0)+immuneGrowth,STAT_MIN,STAT_MAX);});
          }
          p.condition=rand(75,100);
          if(p.isPitcher)p.currentStamina=100;
          p._seasonsPlayed=(seasonsPlayed||0)+1;
          if(p.age)p.age++;
          return;
        }

        // 프로의식 기반 에이징 커브 시작 시점 조정
        // 기본: 8시즌부터 하락, 12시즌부터 급하락
        // workEthic 75+: 2~3시즌 지연 / workEthic 35-: 1~2시즌 조기
        const ethicShift=we>=75?-rand(2,3):we<=35?rand(1,2):0;
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
        const canGrow=ovrRaw(p)<potCap;
        if(p.isPitcher){
          if(canGrow)['stuff','movement'].forEach(s=>{p[s]=clamp((p[s]||0)+growth,STAT_MIN,STAT_MAX);});
          p.velocity=clamp((p.velocity||0)+(canGrow?growth:0)-velPen,STAT_MIN,STAT_MAX);
          p.stamina=clamp((p.stamina||0)+(canGrow?growth:0)-stamPen,STAT_MIN,STAT_MAX);
          // 베테랑 관록: 제구 + 위기관리 상승
          p.control=clamp((p.control||0)+(canGrow?growth:0)+vetCtrlBuff,STAT_MIN,STAT_MAX);
          p.clutch=clamp((p.clutch||0)+(canGrow?growth:0)+vetClutchBuff,STAT_MIN,STAT_MAX);
        }else{
          if(canGrow)['power','arm'].forEach(s=>{p[s]=clamp((p[s]||0)+growth,STAT_MIN,STAT_MAX);});
          p.speed=clamp((p.speed||0)+(canGrow?growth:0)-speedPen,STAT_MIN,STAT_MAX);
          p.contact=clamp((p.contact||0)+(canGrow?growth:0)-conPen,STAT_MIN,STAT_MAX);
          p.fielding=clamp((p.fielding||0)+(canGrow?growth:0)-fldPen,STAT_MIN,STAT_MAX);
          // 베테랑 관록: 선구안 상승
          p.eye=clamp((p.eye||0)+(canGrow?growth:0)+vetEyeBuff,STAT_MIN,STAT_MAX);
        }
        p.condition=rand(75,100);
        if(p.isPitcher)p.currentStamina=100;
        p._seasonsPlayed=(seasonsPlayed||0)+1;
        p._slumpGames=0; // 시즌 초기화
        p._tradeRefused=false; // 거부권 리셋
        if(p.age)p.age++;

        // P2-1 서브 포지션 습득: 다재다능 65+ 타자, 커리어 중 최대 1개 추가 (10% 확률)
        if(!p.isPitcher&&!p._subPosLearned&&(p._versatility||50)>=65
          &&Array.isArray(p._subPos)&&p._subPos.length<2&&rand(1,100)<=10){
          const natPos=p._naturalPos||p.pos;
          const cand=(_SUBPOS_CANDIDATES[natPos]||[]).filter(x=>!p._subPos.includes(x));
          if(cand.length){
            p._subPos.push(pick(cand));
            p._subPosLearned=true;
            if(team===G.myTeam)showToast(`🧩 ${p.name} 서브 포지션 습득! (${p._subPos.join('·')})`);
          }
        }
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
    const pot=p._potential||50;const sp=p._seasonsPlayed||0;
    if(pot>=70){changes.push({name:p.name,stat:'성장↑',delta:rand(1,3)});}
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
        if((p._potential||50)>=75)score+=rand(3,8);
        return {p,score};
      }).sort((a,b)=>b.score-a.score);

      const best=scored[0]?.p;
      if(best){
        const idx=G.draftPool.indexOf(best);
        G.draftPool.splice(idx,1);
        best.status='futures';
        best.canDebutYear=G.season+1;
        applyRookieContract(best,ds.round,ds.pickInRound+1); // P2-3 신인 슬롯 연봉 + 3년 고정
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
  applyRookieContract(p,ds.round,ds.pickInRound+1); // P2-3 신인 슬롯 연봉 + 3년 고정
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
