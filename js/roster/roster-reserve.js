// ===================== ROSTER RESERVE (2군 / 육성 / IL) =====================
// ===================== 2군 탭 렌더 =====================
function renderFutures() {
  const futures = getFuturesPlayers(G.myTeam);
  const il = getILPlayers(G.myTeam);
  const active = getActiveCount(G.myTeam);
  const batters = futures.filter(p=>!p.isPitcher);
  const pitchers = futures.filter(p=>p.isPitcher);

  function xpBar(p){
    const req=getRequiredXP(p);
    const pct=Math.min(100,Math.round(((p.xp||0)/req)*100));
    return `<div class="xp-bar-wrap"><div class="xp-bar-fill" style="width:${pct}%;"></div></div><span style="font-size:0.6rem;color:var(--text-dim);">${p.xp||0}/${req}</span>`;
  }
  function badges(p){
    let b='';
    if((p.rehabGamesLeft||0)>0) b+=`<span class="minor-badge rehab">재활 ${p.rehabGamesLeft}G</span>`;
    else if((p.cooldown||0)>0) b+=`<span class="minor-badge cooldown">쿨다운 ${p.cooldown}G</span>`;
    else b+=`<span class="minor-badge" style="background:#0d2d0d;color:#4ade80;">콜업가능</span>`;
    return b;
  }

  function playerRows(list) {
    return list.map(p=>{
      const idx=G.myTeam.roster.indexOf(p);
      const debutOk=canPlayerDebut(p);
      const canCU=canCallUp(G.myTeam)&&(p.cooldown||0)===0&&(p.rehabGamesLeft||0)===0&&debutOk;
      const isSlumping=(p.condition||100)<SLUMP_CONDITION_THRESHOLD;
      const debutTag=!debutOk?` <span style="color:#a855f7;font-size:0.6rem;">🔒 S${p.canDebutYear}</span>`:'';
      return `<tr>
        <td><span class="player-name">${p.name}</span>${debutTag}</td>
        <td>${posChangerHTML(p,idx)}</td>
        <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||22}</td>
        <td style="color:${statColor(ovr(p))};font-weight:700;">${ovr(p)}</td>
        <td style="color:${isSlumping?'#ef4444':'var(--text)'};">${p.condition}%${isSlumping?' 🥶':''}</td>
        <td>${xpBar(p)}</td>
        <td>${badges(p)}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="callUp(${idx})" ${canCU?'':'disabled'} title="${!debutOk?'시즌 '+p.canDebutYear+'부터 등록 가능':canCU?'콜업':'쿨다운 '+p.cooldown+'G'}">${!debutOk?'🔒':'콜업'}</button>
          <button class="btn btn-sm" onclick="releasePlayer(${idx})" style="margin-left:4px;background:#1f2937;color:#9ca3af;">방출</button>
        </td>
      </tr>`;
    }).join('');
  }

  function ilRows(list) {
    return list.map(p=>{
      const idx=G.myTeam.roster.indexOf(p);
      const pct=p.ilGamesLeft>0?Math.round((1-p.ilGamesLeft/20)*100):100;
      return `<tr>
      <td><span class="player-name">${p.name}</span></td>
      <td><span class="pos-badge${p.isPitcher?' pitcher':''}">${ALL_POS_NAMES[p.pos]||p.pos}</span></td>
      <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||22}</td>
      <td style="color:${statColor(ovr(p))};font-weight:700;">${ovr(p)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="minor-badge il">${p.ilGamesLeft}G</span>
          <div style="width:40px;height:4px;background:#1f2937;border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:#ef4444;border-radius:2px;"></div>
          </div>
        </div>
      </td>
      <td>
        <button class="btn btn-sm" onclick="emergencyILReturn(${idx})" style="background:#3b2a00;color:#f59e0b;font-size:0.58rem;padding:2px 6px;" title="조기 복귀 (재활 5경기 패널티)">조기복귀</button>
      </td>
    </tr>`;
    }).join('');
  }

  $('rosterFutures').innerHTML = `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;font-size:0.72rem;color:var(--text-dim);">
      <span>1군 <b style="color:var(--accent);">${active}/${ACTIVE_ROSTER_MAX}</b></span>
      <span>·</span>
      <span>2군 <b style="color:var(--accent2);">${futures.length}</b></span>
      ${il.length>0?`<span>·</span><span>IL <b style="color:#ef4444;">${il.length}</b></span>`:''}
    </div>
    <div class="card">
      <div class="section-divider">🏏 2군 타자 <span class="section-count">${batters.length}</span></div>
      <div style="overflow-x:auto;">
        <table class="data-table"><thead><tr><th>이름</th><th>포지션</th><th>나이</th><th>OVR</th><th>컨디션</th><th>XP</th><th>상태</th><th></th></tr></thead>
        <tbody>${playerRows(batters)||'<tr><td colspan="8" style="color:var(--text-dim);text-align:center;">없음</td></tr>'}</tbody></table>
      </div>
      <div class="section-divider" style="margin-top:18px;">⚾ 2군 투수 <span class="section-count">${pitchers.length}</span></div>
      <div style="overflow-x:auto;">
        <table class="data-table"><thead><tr><th>이름</th><th>포지션</th><th>나이</th><th>OVR</th><th>컨디션</th><th>XP</th><th>상태</th><th></th></tr></thead>
        <tbody>${playerRows(pitchers)||'<tr><td colspan="8" style="color:var(--text-dim);text-align:center;">없음</td></tr>'}</tbody></table>
      </div>
      ${il.length>0?`
      <div class="section-divider" style="margin-top:18px;">🏥 부상자 ���단 (IL) <span class="section-count">${il.length}</span></div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:8px;">IL 선수는 경기 출전 불가. 자동 복귀 후 2군 재활 3경기. 조기 복귀 시 재활 5경기 패널티.</div>
      <div style="overflow-x:auto;">
        <table class="data-table"><thead><tr><th>이름</th><th>포지션</th><th>나이</th><th>OVR</th><th>복귀까지</th><th></th></tr></thead>
        <tbody>${ilRows(il)}</tbody></table>
      </div>`:''}
    </div>`;
}

// ===================== 육성 탭 렌더 =====================
function renderDevelopmental() {
  const dev = getDevPlayers(G.myTeam);
  const orgCount = G.myTeam.roster.filter(r=>r.status==='active'||r.status==='futures').length;
  const canPromote = orgCount < FUTURES_ORG_MAX;

  const rows = dev.map(p=>{
    const idx=G.myTeam.roster.indexOf(p);
    const req=getRequiredXP(p);
    const pct=Math.min(100,Math.round(((p.xp||0)/req)*100));
    return `<tr>
      <td><span class="player-name">${p.name}</span></td>
      <td><span class="pos-badge${p.isPitcher?' pitcher':''}">${ALL_POS_NAMES[p.pos]||p.pos}</span></td>
      <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||22}</td>
      <td style="color:${statColor(ovr(p))};font-weight:700;">${ovr(p)}</td>
      <td>${p.condition}%</td>
      <td><div class="xp-bar-wrap"><div class="xp-bar-fill" style="width:${pct}%;"></div></div><span style="font-size:0.6rem;color:var(--text-dim);">${p.xp||0}/${req}</span></td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="promoteFromDev(${idx})" ${canPromote?'':'disabled'} title="${canPromote?'정식 등록':'조직 한도 초과'}">등록</button>
        <button class="btn btn-sm" onclick="releasePlayer(${idx})" style="margin-left:4px;background:#1f2937;color:#9ca3af;">방출</button>
      </td>
    </tr>`;
  }).join('');

  $('rosterDevelopmental').innerHTML = `
    <div class="card">
      <div class="section-divider">⭐ 육성 선수 <span class="section-count">${dev.length}</span>
        <span style="font-size:0.65rem;font-family:'JetBrains Mono',monospace;color:var(--text-dim);margin-left:8px;">조직 ${orgCount}/${FUTURES_ORG_MAX}</span>
      </div>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:10px;">
        정식 등록 시 2군 합류. 1군 콜업은 2군 경유 필요. 경기당 XP ${XP_DEVELOPMENTAL} 적립.
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table"><thead><tr><th>이름</th><th>포지션</th><th>나이</th><th>OVR</th><th>컨디션</th><th>XP</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="7" style="color:var(--text-dim);text-align:center;">육성 선수 없음</td></tr>'}</tbody></table>
      </div>
    </div>`;
}

// ===================== IL 관리 탭 렌더 =====================
function renderILPage() {
  const il = getILPlayers(G.myTeam);
  // 재활 중인 2군 선수 (IL 복귀 후 재활)
  const rehab = getFuturesPlayers(G.myTeam).filter(p=>(p.rehabGamesLeft||0)>0);

  function ilRow(p) {
    const idx = G.myTeam.roster.indexOf(p);
    const pct = Math.max(0, Math.round((1 - (p.ilGamesLeft||0) / 20) * 100));
    const o = ovr(p);
    return `<tr>
      <td><span class="player-name">${p.name}</span></td>
      <td><span class="pos-badge${p.isPitcher?' pitcher':''}">${ALL_POS_NAMES[p.pos]||p.pos}</span></td>
      <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||22}</td>
      <td style="color:${statColor(o)};font-weight:700;">${o}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:60px;height:6px;background:#1f2937;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${pct>80?'#10b981':pct>50?'#f59e0b':'#ef4444'};border-radius:3px;transition:width 0.3s;"></div>
          </div>
          <span style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:${pct>80?'#10b981':'#ef4444'};">${p.ilGamesLeft}경기</span>
        </div>
      </td>
      <td>${p.condition}%</td>
      <td>
        <button class="btn btn-sm" onclick="emergencyILReturn(${idx})" style="background:#3b2a00;color:#f59e0b;font-size:0.6rem;padding:2px 8px;" title="조기 복귀 시 재활 5경기 패널티">조기복귀</button>
      </td>
    </tr>`;
  }

  function rehabRow(p) {
    const o = ovr(p);
    return `<tr>
      <td><span class="player-name">${p.name}</span></td>
      <td><span class="pos-badge${p.isPitcher?' pitcher':''}">${ALL_POS_NAMES[p.pos]||p.pos}</span></td>
      <td style="color:${statColor(o)};font-weight:700;">${o}</td>
      <td><span class="minor-badge rehab">재활 ${p.rehabGamesLeft}경기 남음</span></td>
      <td>${p.condition}%</td>
      <td style="font-size:0.65rem;color:var(--text-dim);">재활 완료 후 콜업 가능</td>
    </tr>`;
  }

  $('rosterIL').innerHTML = `
    <div class="card">
      <div class="section-divider">🏥 부상자 명단 (IL) <span class="section-count">${il.length}명</span></div>
      <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:10px;">
        IL 등재 선수는 경기 출전 불가 · 1군 인원 미산입 · 자동 복귀 후 2군 재활 3경기<br>
        <span style="color:#f59e0b;">조기복귀: 즉시 2군 합류 (재활 5경기 패널티)</span>
      </div>
      ${il.length>0?`
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>이름</th><th>포지션</th><th>나이</th><th>OVR</th><th>복귀까지</th><th>컨디션</th><th></th></tr></thead>
          <tbody>${il.map(ilRow).join('')}</tbody>
        </table>
      </div>`:`<div style="text-align:center;padding:30px;color:var(--text-dim);font-size:0.8rem;">🏥 IL 등재 선수 없음</div>`}

      ${rehab.length>0?`
      <div class="section-divider" style="margin-top:20px;">💪 재활 중 (2군) <span class="section-count">${rehab.length}명</span></div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:8px;">IL 복귀 후 2군에서 재활 중. 재활 완료 전까지 스탯 -${REHAB_DEBUFF} 패널티.</div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>이름</th><th>포지션</th><th>OVR</th><th>상태</th><th>컨디션</th><th></th></tr></thead>
          <tbody>${rehab.map(rehabRow).join('')}</tbody>
        </table>
      </div>`:''}
    </div>`;
}
