// ===================== MARKET =====================
let _marketFilter='all';

function generateMarket(){
  G.marketPlayers=[];
  for(let i=0;i<5;i++){const p=genBatter(pick(BAT_POS),null,'balanced');if(p.age<26)p.age=rand(26,33);p._serviceTime=rand(7,12);p.price=+(ovrBatter(p)*0.25+rand(3,10)).toFixed(1);p.role='bench';G.marketPlayers.push(p);}
  for(let i=0;i<4;i++){const role=['SP','SU','MR','CP'][i];const p=genPitcher(role,null,'balanced');if(p.age<26)p.age=rand(26,33);p._serviceTime=rand(7,12);p.price=+(ovrPitcher(p)*0.25+rand(3,10)).toFixed(1);p.role=role==='SP'?'rotation':'bullpen';G.marketPlayers.push(p);}
}

function switchMarketTab(tab){
  G.currentMarketTab=tab;
  document.querySelectorAll('#marketScreen .roster-tab').forEach(t=>t.classList.remove('active'));
  event.target.classList.add('active');
  _marketFilter='all';
  if(tab==='trade'){renderTrade();return;}
  renderMarket();
}

function _setMarketFilter(f){_marketFilter=f;renderMarket();}

function renderMarket(){
  const rdLv=G.myTeam.analyticsLevel||0;
  const payroll=getPayroll(G.myTeam);
  const overHard=payroll>=getHardCap();
  const tab=G.currentMarketTab||'bat';

  // 필터 적용
  let players=G.marketPlayers;
  if(tab==='bat') players=players.filter(p=>!p.isPitcher);
  else if(tab==='pitch') players=players.filter(p=>p.isPitcher);

  if(_marketFilter==='sp') players=players.filter(p=>p.isPitcher&&(p.pos==='SP'));
  else if(_marketFilter==='bp') players=players.filter(p=>p.isPitcher&&p.pos!=='SP');
  else if(_marketFilter==='if') players=players.filter(p=>!p.isPitcher&&['C','1B','2B','3B','SS'].includes(p.pos));
  else if(_marketFilter==='of') players=players.filter(p=>!p.isPitcher&&['LF','CF','RF','DH'].includes(p.pos));

  // 배너
  let rdBanner='';
  if(rdLv<30)       rdBanner=`<div style="background:rgba(239,68,68,0.08);border:1px solid #ef444466;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:0.72rem;color:#ef4444;">🔒 분석팀 Lv.0 — 스탯 비공개. 투자 → 데이터 분석팀 업그레이드 시 공개.</div>`;
  else if(rdLv<60)  rdBanner=`<div style="background:rgba(59,130,246,0.08);border:1px solid #3b82f666;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:0.72rem;color:#60a5fa;">🔎 분석팀 Lv.${rdLv} — 스탯 범위 공개. Lv.60 시 정확 수치.</div>`;
  else              rdBanner=`<div style="background:rgba(16,185,129,0.08);border:1px solid #10b98166;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:0.72rem;color:#10b981;">✅ 분석팀 Lv.${rdLv} — 정확 스탯 공개.</div>`;

  const capWarn=overHard
    ?`<div style="background:rgba(239,68,68,0.08);border:1px solid #ef444466;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:0.72rem;color:#ef4444;">🚫 하드 캡(${won(getHardCap())}) 초과! 영입 불가.</div>`
    :payroll>getLuxuryTaxLine()
    ?`<div style="background:rgba(249,115,22,0.08);border:1px solid #f9731666;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:0.72rem;color:#f97316;">⚠️ 사치세 구간 (페이롤 ${won(payroll)})</div>`
    :'';

  // 필터 버튼
  function fb(key,label){
    const active=_marketFilter===key;
    return `<span onclick="_setMarketFilter('${key}')" style="cursor:pointer;padding:2px 6px;border-radius:3px;font-size:0.6rem;border:1px solid ${active?'var(--accent)':'var(--border)'};color:${active?'var(--accent)':'var(--text-dim)'};">${label}</span>`;
  }
  const filterHTML=tab==='bat'
    ?`<div style="display:flex;gap:4px;margin-bottom:8px;">${fb('all','전체')}${fb('if','내야/포수')}${fb('of','외야/DH')}</div>`
    :tab==='pitch'
    ?`<div style="display:flex;gap:4px;margin-bottom:8px;">${fb('all','전체')}${fb('sp','선발')}${fb('bp','불펜')}</div>`
    :'';

  // 스탯 도트 (트레이드와 동일)
  function dots(p){
    function d(v){return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statColor(v)};margin:0 1px;" title="${rdLv>=60?v:rdLv>=30?Math.max(20,v-5)+'~'+Math.min(80,v+5):'?'}"></span>`;}
    if(rdLv<30) return '<span style="color:var(--text-dim);font-size:0.6rem;">🔒</span>';
    if(p.isPitcher) return d(p.stuff)+d(p.control)+d(p.velocity)+d(p.movement)+d(p.stamina)+d(p.clutch);
    return d(p.contact)+d(p.power)+d(p.eye)+d(p.speed)+d(p.fielding)+d(p.arm);
  }

  // OVR 표시
  function ovrDisp(p){
    if(rdLv<30){const o=ovr(p);return `<span style="color:var(--text-dim);">${Math.max(20,o-8)}~${Math.min(80,o+8)}</span>`;}
    const o=ovr(p);return `<span style="color:${statColor(o)};font-weight:700;">${o}</span>`;
  }

  // 재정 요약
  const budgetHTML=`
    <div style="display:flex;gap:12px;font-size:0.68rem;color:var(--text-dim);margin-bottom:10px;">
      <span>보유 자금: <b style="color:var(--accent);">${won(G.myTeam.budget)}</b></span>
      <span>페이롤: <b style="color:${payroll>getLuxuryTaxLine()?'#ef4444':'var(--text)'};">${won(payroll)}</b></span>
      <span>사치세: ${won(getLuxuryTaxLine())}</span>
      <span>하드캡: ${won(getHardCap())}</span>
      <span>FA ${players.length}명</span>
    </div>`;

  // 테이블
  const tableHTML=players.length===0
    ?'<div style="color:var(--text-dim);text-align:center;padding:20px;">해당 포지션 선수가 없습니다.</div>'
    :`<div style="overflow-x:auto;">
      <table class="data-table" style="font-size:0.68rem;">
        <thead><tr>
          <th>포지션</th><th>이름</th><th>나이</th><th>스탯</th><th>OVR</th>
          <th>연봉</th><th>계약</th><th>이적료</th><th>출신</th><th></th>
        </tr></thead>
        <tbody>${players.map(p=>{
          const gi=G.marketPlayers.indexOf(p);
          const newPR=payroll+(p.salary||0);
          const blocked=overHard||newPR>getHardCap();
          const st=p._serviceTime||0;
          const phase=st<=PRE_ARB_MAX_SERVICE?'Pre':st<=ARB_MAX_SERVICE?'Arb':'FA';
          const phColor=phase==='Pre'?'#67e8f9':phase==='Arb'?'#f59e0b':'#10b981';
          return `<tr>
            <td><span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.5rem;padding:1px 3px;">${p.pos}</span></td>
            <td style="text-align:left;font-size:0.7rem;">${p.name}</td>
            <td style="color:var(--text-dim);">${p.age||22}</td>
            <td>${dots(p)}</td>
            <td>${ovrDisp(p)}</td>
            <td style="font-family:'JetBrains Mono',monospace;">${won(p.salary||0)}</td>
            <td style="color:${phColor};font-size:0.6rem;">${p._contractYears||1}년</td>
            <td style="color:var(--accent);font-weight:700;">${won(p.price)}</td>
            <td style="color:#67e8f9;font-size:0.6rem;">${p._fromTeam||'-'}</td>
            <td><button class="btn btn-primary btn-sm" onclick="buyPlayer(${gi})" ${blocked?'disabled':''} style="font-size:0.58rem;padding:2px 8px;">${blocked?'불가':'영입'}</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;

  $('marketGrid').innerHTML=rdBanner+capWarn+budgetHTML+filterHTML+tableHTML;
}

function buyPlayer(idx){
  const p=G.marketPlayers[idx];
  if(!canSpend(G.myTeam,p.price)){showToast('🚫 사용 가능 자금 부족!');return;}
  const newPayroll=getPayroll(G.myTeam)+(p.salary||0);
  if(newPayroll>getHardCap()){showToast(`🚫 하드 캡(${won(getHardCap())}) 초과!`);return;}

  // 협상 모달 → 유저가 연봉/기간 제안
  showNegotiationModal(p,'fa',
    function onAccept(salary,years){
      if(!canSpend(G.myTeam,p.price)){showToast('🚫 자금 부족!');renderMarket();return;}
      // 협상된 연봉 기준 하드캡 재검증 (사전 검사는 호가 기준이라 협상 인상분을 놓칠 수 있음)
      if(getPayroll(G.myTeam)+(salary||0)>getHardCap()){showToast(`🚫 하드 캡(${won(getHardCap())}) 초과!`);renderMarket();return;}
      G.myTeam.budget-=p.price;
      p.salary=salary;p._contractYears=years;
      if(!p.status)p.status='futures';
      if(!p.xp)p.xp=0;if(!p.cooldown)p.cooldown=0;
      if(typeof p.isOnIL==='undefined')p.isOnIL=false;
      if(typeof p.ilGamesLeft==='undefined')p.ilGamesLeft=0;
      if(typeof p.rehabGamesLeft==='undefined')p.rehabGamesLeft=0;
      G.myTeam.roster.push(p);
      G.marketPlayers.splice(G.marketPlayers.indexOf(p),1);
      showToast(`✅ ${p.name} 영입! (${won(salary)} × ${years}년)`);
      updateHeader();renderMarket();saveGame();
    },
    function onFail(reason){
      if(reason==='snatched'){
        // AI가 빼앗음 → 시장에서 삭제
        G.marketPlayers.splice(G.marketPlayers.indexOf(p),1);
        showToast(`🚫 ${p.name}이(가) 다른 구단과 계약했습니다!`);
      }
      if(reason==='exhausted'){
        G.marketPlayers.splice(G.marketPlayers.indexOf(p),1);
        showToast(`❌ ${p.name} 협상 결렬 — 시장에서 이탈`);
      }
      renderMarket();
    }
  );
}
