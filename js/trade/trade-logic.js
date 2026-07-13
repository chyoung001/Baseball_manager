// ===================== TRADE LOGIC (State + Window + Filter + Validation + Execute) =====================
// ===================== TRADE SYSTEM =====================
let _tradeState={
  targetTeam:null,
  myOffer:[],
  theirOffer:[],
  myFilter:'all',
  theirFilter:'all',
};

function isTradeWindowOpen(){
  const playPhases=['first_half','second_half'];
  if(playPhases.includes(G.phase)&&G.gameNum<=TRADE_DEADLINE_GAME)return true;
  if(G.phase==='stove_league'||G.phase==='preseason')return true;
  return false;
}

function getTradeWindowStatus(){
  if(G.phase==='stove_league'||G.phase==='preseason')return{open:true,label:'스토브리그'};
  if(['first_half','second_half'].includes(G.phase)){
    if(G.gameNum<=TRADE_DEADLINE_GAME)return{open:true,label:'트레이드 가능 ('+G.gameNum+'/'+TRADE_DEADLINE_GAME+')'};
    return{open:false,label:'데드라인 경과 ('+TRADE_DEADLINE_GAME+'경기)'};
  }
  return{open:false,label:'트레이드 불가'};
}

// ── 스탯 컬러 도트 (OOTP 스타일) ──
function _statDot(val){
  const c=statColor(val);
  return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin:0 1px;" title="${val}"></span>`;
}

function _statDots(p){
  if(p.isPitcher){
    return _statDot(p.stuff)+_statDot(p.control)+_statDot(p.velocity)+_statDot(p.movement)+_statDot(p.stamina)+_statDot(p.clutch);
  }
  return _statDot(p.contact)+_statDot(p.power)+_statDot(p.eye)+_statDot(p.speed)+_statDot(p.fielding)+_statDot(p.arm);
}

// ── 포지션 필터 버튼 ──
function _tradeFilterBtn(side, key, label){
  const current=side==='my'?_tradeState.myFilter:_tradeState.theirFilter;
  const active=current===key;
  return `<span onclick="_setTradeFilter('${side}','${key}')" style="cursor:pointer;padding:2px 6px;border-radius:3px;font-size:0.6rem;border:1px solid ${active?'var(--accent)':'var(--border)'};color:${active?'var(--accent)':'var(--text-dim)'};">${label}</span>`;
}

function _setTradeFilter(side,key){
  if(side==='my')_tradeState.myFilter=key;
  else _tradeState.theirFilter=key;
  renderTrade();
}

function _filterRoster(roster, filter){
  if(filter==='bat') return roster.filter(p=>!p.isPitcher);
  if(filter==='pit') return roster.filter(p=>p.isPitcher);
  if(filter==='sp')  return roster.filter(p=>p.isPitcher&&(p.role==='rotation'||p.pos==='SP'));
  if(filter==='bp')  return roster.filter(p=>p.isPitcher&&p.role!=='rotation'&&p.pos!=='SP');
  return roster;
}

function _toggleTradePlayer(side,rosterIdx){
  const arr=side==='my'?_tradeState.myOffer:_tradeState.theirOffer;
  const idx=arr.indexOf(rosterIdx);
  if(idx>=0){
    arr.splice(idx,1);
  }else{
    if(arr.length>=TRADE_MAX_PLAYERS){showToast(`최대 ${TRADE_MAX_PLAYERS}명까지 선택 가능`);return;}
    arr.push(rosterIdx);
  }
  renderTrade();
}

// 프랜차이즈 스타 판정: 재적 FRANCHISE_MIN_TENURE 시즌 이상 AND OVR FRANCHISE_MIN_OVR 이상
function _isFranchiseStar(p){
  return (p._teamTenure||0)>=FRANCHISE_MIN_TENURE && ovr(p)>=FRANCHISE_MIN_OVR;
}

function _executeTrade(){
  const tt=_tradeState.targetTeam;
  if(!tt||_tradeState.myOffer.length===0||_tradeState.theirOffer.length===0)return;

  const myGiving=_tradeState.myOffer.map(i=>G.myTeam.roster[i]).filter(Boolean);
  const theirGiving=_tradeState.theirOffer.map(i=>tt.roster[i]).filter(Boolean);

  // ── 검증 1: 재정 검증 (양 팀 하드캡 + 유저 가용 예산) ──
  const incomingSalary=theirGiving.reduce((s,p)=>s+(p.salary||0),0);
  const outgoingSalary=myGiving.reduce((s,p)=>s+(p.salary||0),0);
  const myNewPayroll=getPayroll(G.myTeam)-outgoingSalary+incomingSalary;
  const ttNewPayroll=getPayroll(tt)-incomingSalary+outgoingSalary;
  if(myNewPayroll>getHardCap()){
    showToast(`🚫 트레이드 불가 — 우리 팀 하드캡(${won(getHardCap())}) 초과! (예상: ${won(+myNewPayroll.toFixed(1))})`);
    return;
  }
  if(ttNewPayroll>getHardCap()){
    showToast(`🚫 상대 팀의 재정 문제로 트레이드가 불가능합니다. (상대 하드캡 초과)`);
    return;
  }
  // 유저 가용 예산 파산 방지
  const salaryDiff=incomingSalary-outgoingSalary;
  if(salaryDiff>0&&getAvailableBudget(G.myTeam)<salaryDiff){
    showToast(`🚫 트레이드 불가 — 가용 예산 부족! (추가 연봉 ${won(+salaryDiff.toFixed(1))} 감당 불가)`);
    return;
  }

  // ── 검증 2: 로스터 조직 상/하한선 ──
  const myNewCount=G.myTeam.roster.length-myGiving.length+theirGiving.length;
  const ttNewCount=tt.roster.length-theirGiving.length+myGiving.length;
  if(myNewCount>FUTURES_ORG_MAX||ttNewCount>FUTURES_ORG_MAX){
    showToast(`🚫 트레이드 불가 — 조직 상한(${FUTURES_ORG_MAX}명) 초과`);
    return;
  }
  if(myNewCount<ORG_MIN_TOTAL||ttNewCount<ORG_MIN_TOTAL){
    showToast(`🚫 트레이드 불가 — 조직 하한(${ORG_MIN_TOTAL}명) 미달`);
    return;
  }

  // ── 검증 3: 프랜차이즈 스타 트레이드 거부권 (유저가 보내는 선수) ──
  for(const p of myGiving){
    // 이미 이번 시즌에 거부한 선수는 확정 거부
    if(p._tradeRefused){
      showToast(`🚫 ${p.name} 선수가 트레이드를 완강히 거부합니다. (이번 시즌 재협상 불가)`);
      return;
    }
    if(_isFranchiseStar(p) && rand(1,100)<=50){
      p._tradeRefused=true; // 시즌 내 재시도 차단
      showToast(`🚫 ${p.name} 선수가 트레이드 거부권을 행사했습니다! (사유: 팀에 대한 충성)`);
      return;
    }
  }

  // ── 트레이드 실행 ──
  // 프랜차이즈 스타 이적 시 팬덤 페널티 체크
  let franchiseTraded=false;
  myGiving.forEach(p=>{
    if(_isFranchiseStar(p)) franchiseTraded=true;
    G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
    p._teamTenure=0;
    p.status='futures';
    tt.roster.push(p);
  });
  theirGiving.forEach(p=>{
    tt.roster=tt.roster.filter(r=>r!==p);
    p._teamTenure=0;
    p.status='futures';
    G.myTeam.roster.push(p);
    if(!p.ss)initSeasonStats(p);
  });

  const myNames=myGiving.map(p=>p.name).join(', ');
  const theirNames=theirGiving.map(p=>p.name).join(', ');
  showToast(`🔄 트레이드 성사! ${myNames} ↔ ${theirNames}`);

  // 프랜차이즈 스타 방출 시 인기도 폭락
  if(franchiseTraded){
    G.myTeam.popularity=clamp((G.myTeam.popularity||50)-15,0,100);
    showToast('⚠️ 프랜차이즈 스타의 이적으로 팬덤이 분노하여 인기도가 폭락했습니다!');
  }

  _tradeState.targetTeam=null;
  _tradeState.myOffer=[];
  _tradeState.theirOffer=[];
  updateHeader();renderTrade();saveGame();
}
