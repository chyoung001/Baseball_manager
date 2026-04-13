// ===================== DASHBOARD =====================
function renderDashboard(){
  const t=G.myTeam;
  const payroll=getPayroll(t);
  const luxTax=getLuxuryTax(t);
  const stadMult=(1+(t.stadiumLevel||0)*STADIUM_REVENUE_BONUS).toFixed(2);
  const popRev=Math.round(t.popularity*0.8);
  const winBonus=t.wins*2;
  const estRev=Math.round((popRev+winBonus)*parseFloat(stadMult));

  $('financeGrid').innerHTML=`
    <div class="finance-item">
      <div class="finance-label">보유 자금</div>
      <div class="finance-value" style="color:var(--accent);">💰 ${won(t.budget)}</div>
      <div style="font-size:0.62rem;color:var(--text-dim);">사용 가능: <b style="color:${getAvailableBudget(t)>=0?'#10b981':'#ef4444'};">${won(getAvailableBudget(t))}</b></div>
    </div>
    <div class="finance-item">
      <div class="finance-label">페이롤</div>
      <div class="finance-value" style="color:${payroll>getLuxuryTaxLine()?'#ef4444':payroll>getLuxuryTaxLine()*0.8?'#f97316':'var(--text-bright)'};">${won(payroll)}</div>
      ${luxTax>0?`<div style="font-size:0.65rem;color:#ef4444;">사치세 -${won(luxTax)}</div>`:''}
      <div style="font-size:0.62rem;color:var(--text-dim);">캡 ${won(getLuxuryTaxLine())} | 한도 ${won(getHardCap())}</div>
    </div>
    <div class="finance-item">
      <div class="finance-label">연간 유지비</div>
      <div class="finance-value" style="color:#ef4444;">-${won(calcAnnualUpkeep(t).total)}</div>
      <div style="font-size:0.62rem;color:var(--text-dim);">코칭+경기장+시설+퓨처스</div>
    </div>
    <div class="finance-item">
      <div class="finance-label">예상 시즌 수익</div>
      <div class="finance-value positive">+${won(estRev)}</div>
      <div style="font-size:0.62rem;color:var(--text-dim);">구장 배율 ×${stadMult}</div>
    </div>
    <div class="finance-item">
      <div class="finance-label">시즌 성적</div>
      <div class="finance-value" style="color:var(--text-bright);">${t.wins}승 ${t.losses}패</div>
    </div>`;

  const starP=t.roster.slice().sort((a,b)=>ovr(b)-ovr(a)).slice(0,3);
  const starters=getStartingBatters(t);
  const avgOvr=Math.round(starters.reduce((s,p)=>s+ovrBatter(p),0)/Math.max(1,starters.length));
  const rotation=getRotation(t);
  const avgPOvr=Math.round(rotation.reduce((s,p)=>s+ovrPitcher(p),0)/Math.max(1,rotation.length));
  const overseas=t.roster.filter(p=>p.role==='overseas');

  $('dashTeamInfo').innerHTML=`
    <div style="font-size:0.78rem;margin-bottom:8px;"><span style="color:var(--text-dim);">컨셉:</span> <span style="color:${t.conceptColor};font-weight:700;">${t.conceptLabel}</span></div>
    <div style="font-size:0.78rem;margin-bottom:4px;"><span style="color:var(--text-dim);">타선 평균 OVR:</span> <span style="color:${statColor(avgOvr)};font-weight:700;">${avgOvr}</span> (${starters.length}명)</div>
    <div style="font-size:0.78rem;margin-bottom:8px;"><span style="color:var(--text-dim);">로테이션 평균 OVR:</span> <span style="color:${statColor(avgPOvr)};font-weight:700;">${avgPOvr}</span> (${rotation.length}명)</div>
    ${overseas.length>0?`<div style="font-size:0.72rem;color:#67e8f9;margin-bottom:6px;">✈️ 해외연수 중: ${overseas.map(p=>p.name).join(', ')}</div>`:''}
    <div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:4px;">⭐ 프랜차이즈 스타:</div>
    ${starP.map(p=>`<div style="font-size:0.78rem;padding:3px 0;"><span class="player-name">${p.name}</span> <span class="pos-badge${p.isPitcher?' pitcher':''}" style="margin-left:4px;">${ALL_POS_NAMES[p.pos]||p.pos}</span> <span style="color:${statColor(ovr(p))};font-weight:700;margin-left:6px;">OVR ${ovr(p)}</span></div>`).join('')}`;

  // ── 팀 기록 순위 (스탯 기반 시뮬레이션 기록) ──
  renderDashTeamStats(t);

  $('dashFacility').innerHTML=`
    <div style="font-size:0.78rem;margin-bottom:5px;">🏟️ 경기장: <span style="color:var(--accent);font-weight:700;">${t.facilityLevel}</span>/100 <span style="font-size:0.65rem;color:var(--text-dim);">(관중 수입)</span><div class="prog-bar"><div class="prog-bar-fill" style="width:${t.facilityLevel}%;background:${statColor(t.facilityLevel)};"></div></div></div>
    <div style="font-size:0.78rem;margin-bottom:5px;">🌱 육성: <span style="color:var(--accent2);font-weight:700;">${t.devLevel}</span>/100<div class="prog-bar"><div class="prog-bar-fill" style="width:${t.devLevel}%;background:${statColor(t.devLevel)};"></div></div></div>
    <div style="font-size:0.78rem;margin-bottom:5px;">🏟️ 구장 확장: <span style="color:var(--accent);font-weight:700;">Lv.${t.stadiumLevel||0}/${STADIUM_MAX_LEVEL}</span> <span style="font-size:0.65rem;color:var(--text-dim);">(×${stadMult} 배율)</span></div>
    <div style="font-size:0.78rem;margin-bottom:5px;">🏥 의료센터: <span style="color:var(--accent2);font-weight:700;">${t.medicalLevel||0}</span>/100<div class="prog-bar"><div class="prog-bar-fill" style="width:${t.medicalLevel||0}%;background:${statColor(t.medicalLevel||0)};"></div></div></div>
    <div style="font-size:0.78rem;">🔍 스카우트: <span style="color:var(--accent4);font-weight:700;">${t.scoutingLevel||0}</span>/100 · 📊 분석: <span style="color:var(--accent4);font-weight:700;">${t.analyticsLevel||0}</span>/100</div>`;
}

// ===================== TEAM STATS DASHBOARD (실제 기록 기반) =====================
function renderDashTeamStats(t) {
  const starters = getStartingBatters(t);
  const bench = getBenchBatters(t);
  const allBatters = [...starters,...bench].filter(p=>p.ss&&p.ss.ab>0);
  const qualBatters = allBatters.filter(p=>qualifyBatter(p, QUALIFY_RATIO_DASH));
  const rot = getRotation(t);
  const bp = getBullpen(t);
  const allPitchers = [...rot,...bp].filter(p=>p.ss&&_ssOuts(p.ss)>0);
  const qualPitchers = allPitchers.filter(p=>qualifyPitcher(p, QUALIFY_RATIO_DASH));
  const noGames = (t.wins+t.losses)===0;

  // 리더 테이블 생성 헬퍼
  function leaderRow(p,i,val){
    return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:0.72rem;">
      <span style="color:${i===0?'#f59e0b':'var(--text-dim)'};font-weight:700;width:14px;text-align:right;font-family:'JetBrains Mono',monospace;">${i+1}</span>
      <span style="color:var(--text-bright);flex:1;">${p.name}</span>
      <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.55rem;padding:1px 4px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${i===0?'#f59e0b':'var(--text-bright)'};">${val}</span>
    </div>`;
  }
  function leaderSection(title,list){
    return `<div style="margin-bottom:12px;"><div style="font-size:0.7rem;font-weight:700;color:var(--accent);margin-bottom:4px;font-family:'Orbitron',sans-serif;letter-spacing:0.5px;">${title}</div>${list}</div>`;
  }

  if(noGames){
    $('dashBatterStats').innerHTML='<div style="color:var(--text-dim);font-size:0.75rem;text-align:center;padding:20px;">경기 기록 없음</div>';
    $('dashPitcherStats').innerHTML='<div style="color:var(--text-dim);font-size:0.75rem;text-align:center;padding:20px;">경기 기록 없음</div>';
    $('dashLineup').innerHTML='<div style="color:var(--text-dim);font-size:0.75rem;text-align:center;padding:20px;">경기를 진행하면 실제 성적이 표시됩니다.</div>';
    $('dashPitching').innerHTML='';
    return;
  }

  // ── 타자 기록 순위 — 비율(AVG)은 규정타석 충족자, 누적(HR/RBI)은 전체 ──
  const byAvg=[...(qualBatters.length>0?qualBatters:allBatters)].sort((a,b)=>ssAvg(b)-ssAvg(a)).slice(0,5);
  const byHR=[...allBatters].sort((a,b)=>(b.ss.hr)-(a.ss.hr)).slice(0,5);
  const byRBI=[...allBatters].sort((a,b)=>(b.ss.rbi)-(a.ss.rbi)).slice(0,5);
  $('dashBatterStats').innerHTML=
    leaderSection('타율 (AVG)',byAvg.map((p,i)=>leaderRow(p,i,ssAvg(p).toFixed(3))).join(''))+
    leaderSection('홈런 (HR)',byHR.map((p,i)=>leaderRow(p,i,p.ss.hr)).join(''))+
    leaderSection('타점 (RBI)',byRBI.map((p,i)=>leaderRow(p,i,p.ss.rbi)).join(''));

  // ── 투수 기록 순위 — 비율(ERA/K9)은 규정이닝 충족자, 누적(W)은 전체 ──
  const byERA=[...(qualPitchers.length>0?qualPitchers:allPitchers)].sort((a,b)=>ssERA(a)-ssERA(b)).slice(0,5);
  const byK9=[...(qualPitchers.length>0?qualPitchers:allPitchers)].sort((a,b)=>ssK9(b)-ssK9(a)).slice(0,5);
  const byW=[...allPitchers].sort((a,b)=>(b.ss.w)-(a.ss.w)).slice(0,5);
  $('dashPitcherStats').innerHTML=
    leaderSection('방어율 (ERA)',byERA.map((p,i)=>leaderRow(p,i,ssERA(p).toFixed(2))).join(''))+
    leaderSection('K/9',byK9.map((p,i)=>leaderRow(p,i,ssK9(p).toFixed(1))).join(''))+
    leaderSection('승리 (W)',byW.map((p,i)=>leaderRow(p,i,p.ss.w)).join(''));

  // ── 1군 주전 라인업 ──
  $('dashLineup').innerHTML=`
    <div style="font-size:0.62rem;color:var(--text-dim);margin-bottom:6px;">PRIMARY LINEUP — 실제 시즌 기록</div>
    <table class="data-table" style="font-size:0.72rem;">
      <thead><tr><th>#</th><th>이름</th><th>포지션</th><th>AVG</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th><th>SB</th></tr></thead>
      <tbody>${starters.map((p,i)=>{const s=p.ss||{};const avg=s.ab>0?(s.h/s.ab):0;
        return `<tr>
          <td style="color:var(--accent);font-weight:700;">${i+1}</td>
          <td><span class="player-name" style="font-size:0.72rem;">${p.name}</span></td>
          <td><span class="pos-badge" style="font-size:0.55rem;padding:1px 4px;">${p.pos}</span></td>
          <td style="color:${avg>=0.300?'#10b981':avg>=0.250?'#f59e0b':'#ef4444'};font-family:'JetBrains Mono',monospace;">${avg.toFixed(3)}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${s.hr||0}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${s.rbi||0}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${s.bb||0}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${s.k||0}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${s.sb||0}</td>
        </tr>`;}).join('')}</tbody>
    </table>`;

  // ── 로테이션 + 불펜 ──
  $('dashPitching').innerHTML=`
    <div style="font-size:0.62rem;color:var(--text-dim);margin-bottom:6px;">ROTATION — 실제 시즌 기록</div>
    <table class="data-table" style="font-size:0.72rem;">
      <thead><tr><th>#</th><th>이름</th><th>W-L</th><th>ERA</th><th>IP</th><th>K</th><th>BB</th></tr></thead>
      <tbody>${rot.map((p,i)=>{const s=p.ss||{};const era=s.ip>0?(s.er*9/s.ip):0;
        const next=t.rotationIdx%Math.max(1,rot.length)===i;
        return `<tr${next?' style="background:rgba(245,158,11,0.08);"':''}>
          <td style="color:var(--accent);font-weight:700;">${i+1}${next?' 🔜':''}</td>
          <td><span class="player-name" style="font-size:0.72rem;">${p.name}</span></td>
          <td style="font-family:'JetBrains Mono',monospace;">${s.w||0}-${s.l||0}</td>
          <td style="color:${era<=3.0?'#10b981':era<=4.5?'#f59e0b':'#ef4444'};font-family:'JetBrains Mono',monospace;">${era.toFixed(2)}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${(s.ip||0).toFixed(1)}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${s.pk||0}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${s.pbb||0}</td>
        </tr>`;}).join('')}</tbody>
    </table>
    <div style="font-size:0.62rem;color:var(--text-dim);margin:10px 0 6px;">BULLPEN</div>
    <table class="data-table" style="font-size:0.72rem;">
      <thead><tr><th>이름</th><th>역할</th><th>ERA</th><th>SV</th><th>IP</th><th>K</th></tr></thead>
      <tbody>${bp.map(p=>{const s=p.ss||{};const era=s.ip>0?(s.er*9/s.ip):0;
        return `<tr>
          <td><span class="player-name" style="font-size:0.72rem;">${p.name}</span></td>
          <td><span class="pos-badge pitcher" style="font-size:0.55rem;padding:1px 4px;">${p.pos}</span></td>
          <td style="color:${era<=3.0?'#10b981':era<=4.5?'#f59e0b':'#ef4444'};font-family:'JetBrains Mono',monospace;">${era.toFixed(2)}</td>
          <td style="font-family:'JetBrains Mono',monospace;color:${(s.sv||0)>0?'var(--accent)':'var(--text-dim)'};">${(s.sv||0)>0?(s.sv+' SV'):'-'}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${(s.ip||0).toFixed(1)}</td>
          <td style="font-family:'JetBrains Mono',monospace;">${s.pk||0}</td>
        </tr>`;}).join('')}</tbody>
    </table>`;
}
