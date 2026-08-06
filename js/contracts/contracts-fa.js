// ===================== CONTRACTS FA (FA 시장 — AI 경쟁 입찰 / 유저 영입) =====================

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

    // 시장 가치 산정 (P2-4 절대 스케일 + 야망 히든 보정 — AI 입찰가에도 동일 반영)
    const marketSalary=Math.max(SALARY_MIN,+(_calcSalary(pOvr,fa._serviceTime||FA_SERVICE_TIME_THRESHOLD)*_contractHiddenMod(fa,'fa')).toFixed(1));

    const contractYears=_calcContractYears(pOvr);
    const transferFee=+(pOvr*0.3+rand(5,15)).toFixed(1);

    // OVR 55 미만: AI 경쟁 없음 → 유저 전용 FA 시장으로
    if(pOvr<59){
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
      // P2-4: 소프트캡(사치세 라인) 근접 시 추가 영입 중단 — AI가 모르고 세금 구간에 눌러앉는 것 방지
      const payroll=getPayroll(t);
      if(payroll+marketSalary>getLuxuryTaxLine()*1.05) return false;
      // 잉여 현금 팀은 캡 근처까지 경쟁적으로 전력 보강 (설계: 지출로 잉여 소모·사치세 활성)
      // 예산 여유 크고 페이롤이 소프트캡에 여유 있을 때만 — 세금 구간 눌러앉기 방지
      const surplus=(t.budget||0)>250 && payroll<getLuxuryTaxLine()*0.80;
      const interest=surplus?92:(pOvr>=84?60:pOvr>=75?45:pOvr>=67?30:20);
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
    // 로스터 비대 방지 — 정원 초과 시 최저 가치 2군/벤치 방출 (공격 영입의 부작용 상쇄)
    if(winner.roster.length>FUTURES_ORG_MAX){
      const cut=winner.roster.filter(p=>p!==fa&&(p.status==='futures'||p.status==='developmental'||p.role==='bench'))
        .sort((a,b)=>_aiPlayerValue(a)-_aiPlayerValue(b))[0];
      if(cut)winner.roster.splice(winner.roster.indexOf(cut),1);
    }

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
// `G.marketPlayers`는 **매 개장마다 초기화되는 표시용 배열**이고, 선수의 영속 보관소는 `G.faPool`이다.
// 이전엔 타 구단에서 빼낸 선수와 신규 생성 FA를 marketPlayers에만 넣어서
//  ① 계약되지 않은 채 시장을 다시 열면 게임에서 통째로 사라지고(관측: 5회 개장에 AI 조직 5명 감소),
//  ② 매 개장마다 AI 로스터를 다시 훑어 20%씩 추가 유출 + 신규 FA 5명이 새로 생성돼
//     원하는 선수가 나올 때까지 시장을 여닫으며 리롤할 수 있었다.
// → 시장 **구성**은 스토브리그당 1회(`_faMarketSeason` 가드)로 묶고 결과를 faPool에 적재하며,
//   marketPlayers는 매번 faPool에서 다시 그린다.
function _showFAMarket(){
  const faMult=G.myTeam.concept==='pitching'?1.05:G.myTeam.concept==='prospect'?1.10:1.0;
  G.faPool=G.faPool||[];

  if(G._faMarketSeason!==G.season){
    G._faMarketSeason=G.season;

    // 1. 서비스 타임 달성 선수 추가 FA (다른 팀에서 20% 확률)
    //    얕은 복사({...p})가 아니라 **원본을 이관**한다 — 복사본은 ss/_traits를 원본과 공유해
    //    스탯이 유령 객체와 얽히고, faPool을 거치지 않아 재개장 시 소멸했다.
    G.teams.filter(team=>team!==G.myTeam).forEach(team=>{
      const candidates=team.roster.filter(p=>
        (p._serviceTime||0)>=FA_SERVICE_TIME_THRESHOLD && (p._contractYears||0)<=1
      );
      candidates.forEach(p=>{
        if(rand(1,100)<=20&&team.roster.length>ORG_MIN_TOTAL){
          p._fromTeam=team.name;
          p._fromTeamEmoji=team.emoji;
          p._teamTenure=0;
          p.status='futures';
          if(!p.ss)initSeasonStats(p);
          team.roster=team.roster.filter(tp=>tp!==p);
          G.faPool.push(p);
        }
      });
    });

    // 2. 랜덤 FA 보충 (등급 분포 기반, 최소 26세)
    for(let i=0;i<3;i++){
      const p=genBatter(pick(BAT_POS),null);
      if(p.age<26)p.age=rand(26,33);
      p.role='bench';p.status='futures';
      p._serviceTime=rand(7,12);
      G.faPool.push(p);
    }
    for(let i=0;i<2;i++){
      const role=['SP','CP'][i];
      const p=genPitcher(role,null);
      if(p.age<26)p.age=rand(26,33);
      p.role=role==='SP'?'rotation':'bullpen';p.status='futures';
      p._serviceTime=rand(7,12);
      G.faPool.push(p);
    }
  }

  // 3. faPool → 표시용 marketPlayers 재구성 (개장할 때마다 수행, 부작용 없음)
  G.marketPlayers=[];
  G.faPool.forEach(fa=>{
    fa.price=+(fa.price||((ovr(fa)*0.3+rand(5,15))*faMult)).toFixed(1);
    if(!fa.salary) fa.salary=Math.max(SALARY_MIN,+_calcSalary(ovr(fa),fa._serviceTime||FA_SERVICE_TIME_THRESHOLD).toFixed(1));
    if(!fa._contractYears) fa._contractYears=_calcContractYears(ovr(fa));
    fa.status='futures';
    if(!fa.ss)initSeasonStats(fa);
    G.marketPlayers.push(fa);
  });

  $('seasonModal').classList.remove('active');
  switchTab('market');
  showToast('🔄 FA 시장이 개장되었습니다!');
}

