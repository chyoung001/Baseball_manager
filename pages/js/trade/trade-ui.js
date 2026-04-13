// ===================== TRADE UI (Team Select + Trade Board Render) =====================
function _renderTeamSelect(){
  const teams=G.teams.filter(t=>t!==G.myTeam);
  const sorted=[...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
  $('marketGrid').innerHTML=`
    <div style="margin-bottom:12px;">
      <div style="font-size:0.78rem;color:var(--accent);font-weight:700;margin-bottom:8px;">트레이드 상대 팀 선택</div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:12px;">상대 팀을 선택하면 로스터를 열람하고 트레이드를 제안할 수 있습니다.</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
      ${teams.map(t=>{
        const rank=sorted.indexOf(t)+1;
        const gp=t.wins+t.losses;
        const pct=gp>0?(t.wins/gp).toFixed(3):'.000';
        const stance=rank<=3?'윈나우':rank>=6?'리빌딩':'중간';
        const stanceColor=rank<=3?'#10b981':rank>=6?'#3b82f6':'#f59e0b';
        return `<div class="card" style="cursor:pointer;padding:12px;border:1px solid var(--border);" onclick="_selectTradeTeam(${G.teams.indexOf(t)})">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:1rem;">${t.emoji} <b>${t.name}</b></span>
            <span style="font-size:0.65rem;color:${stanceColor};font-weight:700;">${rank}위 · ${stance}</span>
          </div>
          <div style="font-size:0.72rem;color:var(--text-dim);">${t.wins}승 ${t.losses}패 (${pct}) · 페이롤 ${won(getPayroll(t))}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function _selectTradeTeam(teamIdx){
  _tradeState.targetTeam=G.teams[teamIdx];
  _tradeState.myOffer=[];
  _tradeState.theirOffer=[];
  _tradeState.myFilter='all';
  _tradeState.theirFilter='all';
  renderTrade();
}

function _renderTradeBoard(){
  const tt=_tradeState.targetTeam;
  const myAll=G.myTeam.roster.filter(p=>(p.status||'active')==='active'||p.status==='futures');
  const theirAll=tt.roster.filter(p=>(p.status||'active')==='active'||p.status==='futures');
  const myRoster=_filterRoster(myAll, _tradeState.myFilter);
  const theirRoster=_filterRoster(theirAll, _tradeState.theirFilter);

  // TV 합산 — 유저 측 효율 점감(Diminishing Returns): 1st 100%, 2nd 50%, 3rd+ 20%
  const _drWeights=[1.0, 0.5, 0.2];
  function _calcDiminishedTV(offerIdxs, roster, aiTeam){
    const tvs=offerIdxs.map(idx=>{const p=roster[idx];return p?calcTradeValueForAI(p,aiTeam):0;}).sort((a,b)=>b-a);
    return tvs.reduce((s,tv,i)=>s+tv*(_drWeights[i]||0.2),0);
  }
  const myTvTotal=_calcDiminishedTV(_tradeState.myOffer, G.myTeam.roster, tt);
  const theirTvTotal=_calcDiminishedTV(_tradeState.theirOffer, tt.roster, tt);
  const threshold=Math.round(theirTvTotal*TRADE_AI_ACCEPT_RATIO);
  const wouldAccept=myTvTotal>=threshold&&_tradeState.myOffer.length>0&&_tradeState.theirOffer.length>0;

  // 선택된 선수 요약
  const mySelected=_tradeState.myOffer.map(i=>G.myTeam.roster[i]).filter(Boolean);
  const theirSelected=_tradeState.theirOffer.map(i=>tt.roster[i]).filter(Boolean);

  function selectedChip(p){
    return `<span style="display:inline-flex;align-items:center;gap:3px;background:var(--bg-card-hover);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:0.62rem;margin:2px;">
      <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.48rem;padding:0 3px;">${p.pos}</span>
      ${p.name} <span style="color:${statColor(ovr(p))};font-weight:700;">${ovr(p)}</span>
    </span>`;
  }

  // 테이블 행 (OOTP 스타일)
  function playerRow(p, rosterIdx, side){
    const selected=side==='my'?_tradeState.myOffer.includes(rosterIdx):_tradeState.theirOffer.includes(rosterIdx);
    const tv=calcTradeValueForAI(p,tt);
    const st=p._serviceTime||0;
    const phase=st<=PRE_ARB_MAX_SERVICE?'Pre':st<=ARB_MAX_SERVICE?'Arb':'FA';
    const phColor=phase==='Pre'?'#67e8f9':phase==='Arb'?'#f59e0b':'#10b981';
    const o=ovr(p);
    return `<tr style="cursor:pointer;background:${selected?'rgba(245,158,11,0.1)':'transparent'};border-left:3px solid ${selected?'var(--accent)':'transparent'};" onclick="_toggleTradePlayer('${side}',${rosterIdx})">
      <td><span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.5rem;padding:1px 3px;">${p.pos}</span></td>
      <td style="text-align:left;font-size:0.7rem;">${p.name}</td>
      <td style="color:var(--text-dim);font-size:0.65rem;">${p.age||22}</td>
      <td style="font-size:0.65rem;">${_statDots(p)}</td>
      <td style="color:${statColor(o)};font-weight:700;font-size:0.72rem;">${o}</td>
      <td style="color:${phColor};font-size:0.6rem;">${phase}</td>
      <td style="color:var(--text-dim);font-size:0.62rem;">${won(p.salary||0)}</td>
      <td style="color:var(--accent);font-weight:700;font-size:0.65rem;">${tv}</td>
    </tr>`;
  }

  function filterBar(side){
    return `<div style="display:flex;gap:4px;margin-bottom:6px;">
      ${_tradeFilterBtn(side,'all','전체')}
      ${_tradeFilterBtn(side,'bat','타자')}
      ${_tradeFilterBtn(side,'sp','선발')}
      ${_tradeFilterBtn(side,'bp','불펜')}
    </div>`;
  }

  $('marketGrid').innerHTML=`
    <!-- 헤더 -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div style="font-size:0.82rem;color:var(--accent);font-weight:700;">${G.myTeam.emoji} ${G.myTeam.name} ⇄ ${tt.emoji} ${tt.name}</div>
      <button class="btn btn-sm" onclick="_tradeState.targetTeam=null;renderTrade();" style="background:#1f2937;color:#9ca3af;font-size:0.65rem;">← 팀 선택</button>
    </div>

    <!-- 트레이드 요약 패널 -->
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:10px;">
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:start;">
        <div>
          <div style="font-size:0.65rem;color:var(--accent);margin-bottom:4px;">${G.myTeam.emoji} 보내는 선수 (TV: ${myTvTotal})</div>
          <div style="min-height:28px;">${mySelected.length>0?mySelected.map(selectedChip).join(''):'<span style="color:var(--text-dim);font-size:0.62rem;">선수를 선택하세요</span>'}</div>
        </div>
        <div style="display:flex;align-items:center;font-size:1.2rem;padding-top:10px;">⇄</div>
        <div>
          <div style="font-size:0.65rem;color:var(--accent2);margin-bottom:4px;">${tt.emoji} 받는 선수 (TV: ${theirTvTotal})</div>
          <div style="min-height:28px;">${theirSelected.length>0?theirSelected.map(selectedChip).join(''):'<span style="color:var(--text-dim);font-size:0.62rem;">선수를 선택하세요</span>'}</div>
        </div>
      </div>
      <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:0.65rem;color:var(--text-dim);">
          AI 수락: TV ${myTvTotal} ≥ ${threshold} (${(TRADE_AI_ACCEPT_RATIO*100).toFixed(0)}%)
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:0.72rem;font-weight:700;color:${wouldAccept?'#10b981':'#ef4444'};">
            ${_tradeState.myOffer.length===0||_tradeState.theirOffer.length===0?'—':wouldAccept?'✅ 수락 예상':'❌ 거부 예상'}
          </span>
          <button class="btn btn-primary btn-sm" onclick="_executeTrade()" ${wouldAccept?'':'disabled'} style="font-size:0.65rem;padding:4px 12px;">트레이드 제안</button>
        </div>
      </div>
    </div>

    <!-- 좌우 로스터 테이블 -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <!-- 내 팀 -->
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:0.7rem;color:var(--accent);font-weight:700;">${G.myTeam.emoji} ${G.myTeam.name} (${myAll.length}명)</span>
        </div>
        ${filterBar('my')}
        <div style="overflow-y:auto;max-height:350px;scrollbar-width:none;">
          <table class="data-table" style="font-size:0.68rem;">
            <thead><tr><th>포지션</th><th>이름</th><th>나이</th><th>스탯</th><th>OVR</th><th>단계</th><th>연봉</th><th>TV</th></tr></thead>
            <tbody>${myRoster.map(p=>playerRow(p,G.myTeam.roster.indexOf(p),'my')).join('')}</tbody>
          </table>
        </div>
      </div>

      <!-- 상대 팀 -->
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <span style="font-size:0.7rem;color:var(--accent2);font-weight:700;">${tt.emoji} ${tt.name} (${theirAll.length}명)</span>
        </div>
        ${filterBar('their')}
        <div style="overflow-y:auto;max-height:350px;scrollbar-width:none;">
          <table class="data-table" style="font-size:0.68rem;">
            <thead><tr><th>포지션</th><th>이름</th><th>나이</th><th>스탯</th><th>OVR</th><th>단계</th><th>연봉</th><th>TV</th></tr></thead>
            <tbody>${theirRoster.map(p=>playerRow(p,tt.roster.indexOf(p),'their')).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}
