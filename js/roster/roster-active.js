// ===================== ROSTER ACTIVE (1군 Render + DnD + Scout) =====================
// ===================== SCOUT REPORT POPUP =====================
function showScoutReport(idx){
  const p=G.myTeam.roster[idx];if(!p)return;
  const r=getScoutReport(p);
  const o=ovr(p);
  const rdLv=G.myTeam.analyticsLevel||0;
  const accuracy=rdLv>=60?'높음':rdLv>=30?'보통':'낮음';
  const tm=G.testMode;
  function debugNum(key){return tm?`<span style="font-family:'JetBrains Mono',monospace;color:#a855f7;font-size:0.75rem;margin-left:6px;">[${p[key]||0}/20]</span>`:''}

  // ── 계약 정보 ──
  const st=p._serviceTime||0;
  const phase=st<=PRE_ARB_MAX_SERVICE?'프리아브':st<=ARB_MAX_SERVICE?'연봉조정':'FA자격';
  const phColor=st<=PRE_ARB_MAX_SERVICE?'#67e8f9':st<=ARB_MAX_SERVICE?'#f59e0b':'#10b981';
  const contractLeft=p._contractYears||1;
  const potCap=maxOvrFromPot(p._potential||10);
  const growthRoom=Math.max(0,potCap-o);
  const foreignBadge=p.isForeign?'<span style="background:#3b82f622;color:#3b82f6;font-size:0.6rem;padding:1px 5px;border-radius:3px;margin-left:4px;">외국인</span>':'';

  // ── 능력치 바 생성 ──
  function statBar(label,val){
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
      <span style="width:32px;font-size:0.65rem;color:var(--text-dim);text-align:right;">${label}</span>
      <div style="flex:1;height:6px;background:#1f2937;border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${statPct(val)}%;background:${statColor(val)};border-radius:3px;"></div>
      </div>
      <span style="width:22px;font-size:0.7rem;color:${statColor(val)};font-weight:700;text-align:right;">${val}</span>
    </div>`;
  }

  const statsHTML=p.isPitcher
    ?statBar('구위',p.stuff)+statBar('제구',p.control)+statBar('구속',p.velocity)+statBar('무브',p.movement)+statBar('지구력',p.stamina)+statBar('위기',p.clutch)
    :statBar('컨택',p.contact)+statBar('파워',p.power)+statBar('선구',p.eye)+statBar('주력',p.speed)+statBar('수비',p.fielding)+statBar('어깨',p.arm);

  // ── 시즌 성적 ──
  const s=p.ss||{};
  let seasonHTML='';
  if(p.isPitcher){
    const _outs=(s.outs||0),era=_outs>0?(s.er||0)*27/_outs:0,whip=_outs>0?((s.ha||0)+(s.pbb||0))*3/_outs:0;
    seasonHTML=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:0.68rem;text-align:center;">
      <div><div style="color:var(--text-dim);">ERA</div><div style="color:${era<=3?'#10b981':era<=4.5?'#f59e0b':'#ef4444'};font-weight:700;">${era.toFixed(2)}</div></div>
      <div><div style="color:var(--text-dim);">WHIP</div><div style="font-weight:700;">${whip.toFixed(2)}</div></div>
      <div><div style="color:var(--text-dim);">W-L</div><div style="font-weight:700;">${s.w||0}-${s.l||0}</div></div>
      <div><div style="color:var(--text-dim);">IP</div><div>${Math.floor(_outs/3)}.${_outs%3}</div></div>
      <div><div style="color:var(--text-dim);">K</div><div>${s.pk||0}</div></div>
      <div><div style="color:var(--text-dim);">BB</div><div>${s.pbb||0}</div></div>
      <div><div style="color:var(--text-dim);">SV</div><div style="color:${(s.sv||0)>0?'var(--accent)':'var(--text-dim)'};">${s.sv||0}</div></div>
      <div><div style="color:var(--text-dim);">GP</div><div>${s.gp||0}</div></div>
    </div>`;
  }else{
    const ab=s.ab||0,h=s.h||0,avg=ab>0?h/ab:0,obp=(ab+(s.bb||0))>0?(h+(s.bb||0))/(ab+(s.bb||0)):0;
    seasonHTML=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:0.68rem;text-align:center;">
      <div><div style="color:var(--text-dim);">AVG</div><div style="color:${avg>=.300?'#10b981':avg>=.250?'#f59e0b':'#ef4444'};font-weight:700;">${avg.toFixed(3)}</div></div>
      <div><div style="color:var(--text-dim);">OBP</div><div style="font-weight:700;">${obp.toFixed(3)}</div></div>
      <div><div style="color:var(--text-dim);">HR</div><div style="color:${(s.hr||0)>=10?'#a855f7':'var(--text)'};">${s.hr||0}</div></div>
      <div><div style="color:var(--text-dim);">RBI</div><div>${s.rbi||0}</div></div>
      <div><div style="color:var(--text-dim);">H</div><div>${h}</div></div>
      <div><div style="color:var(--text-dim);">BB</div><div>${s.bb||0}</div></div>
      <div><div style="color:var(--text-dim);">K</div><div>${s.k||0}</div></div>
      <div><div style="color:var(--text-dim);">SB</div><div>${s.sb||0}</div></div>
    </div>`;
  }

  $('modalTitle').textContent=`📋 선수 분석 — ${p.name}`;
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      ${tm?'<div style="background:#a855f722;border:1px solid #a855f7;border-radius:6px;padding:6px 10px;margin-bottom:10px;font-size:0.68rem;color:#a855f7;">🔧 테스트 모드 — 히든 스탯 숫자 공개 중</div>':''}

      <!-- 상단: 선수 프로필 -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.8rem;padding:4px 12px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
        <span style="color:${statColor(o)};font-weight:700;font-family:'JetBrains Mono',monospace;font-size:1.2rem;">${o}</span>
        <span style="font-size:0.7rem;color:var(--text-dim);">OVR</span>
        ${foreignBadge}
        <span style="font-size:0.65rem;color:var(--text-dim);margin-left:auto;">정확도: ${accuracy}</span>
      </div>

      <!-- 프로필 카드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
        <div style="background:var(--bg-card-hover);border-radius:6px;padding:8px;text-align:center;">
          <div style="font-size:0.6rem;color:var(--text-dim);">나이</div>
          <div style="font-size:0.85rem;font-weight:700;">${p.age||22}세</div>
        </div>
        <div style="background:var(--bg-card-hover);border-radius:6px;padding:8px;text-align:center;">
          <div style="font-size:0.6rem;color:var(--text-dim);">연봉</div>
          <div style="font-size:0.85rem;font-weight:700;color:var(--accent);">${won(p.salary||0)}</div>
        </div>
        <div style="background:var(--bg-card-hover);border-radius:6px;padding:8px;text-align:center;">
          <div style="font-size:0.6rem;color:var(--text-dim);">컨디션</div>
          <div style="font-size:0.85rem;font-weight:700;color:${(p.condition||100)<40?'#ef4444':(p.condition||100)<60?'#f59e0b':'#10b981'};">${p.condition||100}%</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:14px;">
        <div style="background:var(--bg-card-hover);border-radius:6px;padding:8px;text-align:center;">
          <div style="font-size:0.6rem;color:var(--text-dim);">서비스타임</div>
          <div style="font-size:0.78rem;font-weight:700;">${st}년</div>
          <div style="font-size:0.58rem;color:${phColor};">${phase}</div>
        </div>
        <div style="background:var(--bg-card-hover);border-radius:6px;padding:8px;text-align:center;">
          <div style="font-size:0.6rem;color:var(--text-dim);">남은 계약</div>
          <div style="font-size:0.78rem;font-weight:700;color:${contractLeft<=1?'#ef4444':'var(--text)'};">${contractLeft}년</div>
          <div style="font-size:0.58rem;color:var(--text-dim);">팀재적 ${p._teamTenure||0}년</div>
        </div>
        <div style="background:var(--bg-card-hover);border-radius:6px;padding:8px;text-align:center;">
          <div style="font-size:0.6rem;color:var(--text-dim);">성장 천장</div>
          <div style="font-size:0.78rem;font-weight:700;color:${growthRoom>0?'#10b981':'var(--text-dim)'};">${potCap}</div>
          <div style="font-size:0.58rem;color:${growthRoom>0?'#10b981':'#ef4444'};">${growthRoom>0?'+'+growthRoom+' 여유':'한계 도달'}</div>
        </div>
      </div>

      <!-- 능력치 바 -->
      <div style="background:var(--bg-card-hover);border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="font-size:0.68rem;color:var(--accent);margin-bottom:6px;">📊 능력치</div>
        ${statsHTML}
      </div>

      <!-- 시즌 성적 -->
      <div style="background:var(--bg-card-hover);border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="font-size:0.68rem;color:var(--accent);margin-bottom:6px;">📈 시즌 ${G.season} 성적</div>
        ${(s.ab||0)+(s.ip||0)>0?seasonHTML:'<div style="font-size:0.68rem;color:var(--text-dim);text-align:center;">기록 없음</div>'}
      </div>

      <!-- 히든 스탯 (스카우트 리포트) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <div class="scout-item">
          <div class="scout-label">🌱 잠재력 ${debugNum('_potential')}</div>
          <div class="scout-grade ${r.pot.cls}">${r.pot.text}</div>
          <div class="scout-desc">${r.potText}</div>
        </div>
        <div class="scout-item">
          <div class="scout-label">💪 내구성 ${debugNum('_durability')}</div>
          <div class="scout-grade ${r.dur.cls}">${r.dur.text}</div>
          <div class="scout-desc">${r.durText}</div>
        </div>
        <div class="scout-item">
          <div class="scout-label">📊 꾸준함 ${debugNum('_consistency')}</div>
          <div class="scout-grade ${r.con.cls}">${r.con.text}</div>
          <div class="scout-desc">${r.conText}</div>
        </div>
        <div class="scout-item">
          <div class="scout-label">🔥 클러치 ${debugNum('_clutchHidden')}</div>
          <div class="scout-grade ${r.clt.cls}">${r.clt.text}</div>
          <div class="scout-desc">${r.cltText}</div>
        </div>
        <div class="scout-item" style="grid-column:span 2;">
          <div class="scout-label">🏋️ 프로의식 ${debugNum('_workEthic')}</div>
          <div class="scout-grade ${r.we.cls}">${r.we.text}</div>
          <div class="scout-desc">${r.weText}</div>
        </div>
      </div>

      <div style="background:var(--bg-card-hover);border-radius:8px;padding:8px;font-size:0.65rem;color:var(--text-dim);">
        ${tm?'🔧 테스트 모드: 히든 스탯 공개 중':'💡 분석팀 Lv.'+rdLv+' — 히든 스탯은 리포트 정확도에 따라 오차가 있을 수 있습니다.'}
      </div>

      ${(st>=ARB_MAX_SERVICE||(st>=ARB_MIN_SERVICE&&contractLeft<=1))&&!p.isForeign&&st>PRE_ARB_MAX_SERVICE?`
      <div style="margin-top:12px;">
        <button class="btn btn-primary" onclick="_startContractExtension(${idx})" style="width:100%;padding:8px;">
          📝 재계약 협상 (${st>=FA_SERVICE_TIME_THRESHOLD?'FA 자격':'FA 예정'} · 남은 계약: ${contractLeft}년)
        </button>
      </div>`:''}
    </div>`;
  $('seasonModal').classList.add('active');
}

// 선수 상세에서 재계약 협상 시작
function _startContractExtension(rosterIdx){
  const p=G.myTeam.roster[rosterIdx];
  if(!p){showToast('선수를 찾을 수 없습니다.');return;}
  $('seasonModal').classList.remove('active');

  showNegotiationModal(p,'renewal',
    function onAccept(salary,years){
      p.salary=salary;
      p._contractYears=years;
      p._contractEvent=null;
      showToast(`✅ ${p.name} 재계약 완료! (${won(salary)} × ${years}년)`);
      saveGame();
    },
    function onFail(reason){
      if(reason==='cancel') return;
      showToast(`❌ ${p.name} 협상 결렬`);
    }
  );
}

function posChangerHTML(p, rosterIdx) {
  const posKey = p.pos;
  const group  = getPosGroup(posKey, p);
  const label  = ALL_POS_NAMES[posKey] || posKey;
  const cls    = `pos-badge${p.isPitcher ? ' pitcher' : ''}`;

  if(!group) return `<span class="${cls}">${label}</span>`;

  const opts = group.filter(g => g !== posKey)
    .map(g => `<div class="pos-opt" onclick="changePlayerPos(${rosterIdx},'${g}');event.stopPropagation();">${ALL_POS_NAMES[g]||g}</div>`)
    .join('');

  return `<span class="${cls} pos-changeable" onclick="togglePosDropdown(this);event.stopPropagation();" title="포지션 변경">
    ${label} ▾<div class="pos-dropdown">${opts}</div>
  </span>`;
}

function togglePosDropdown(el) {
  if(G.matchInProgress) return;
  document.querySelectorAll('.pos-changeable.open').forEach(e => { if(e !== el) e.classList.remove('open'); });
  el.classList.toggle('open');
}

function changePlayerPos(rosterIdx, newPos) {
  const p = G.myTeam.roster[rosterIdx];
  if(!p || G.matchInProgress) return;
  const oldPos = p.pos;
  // DH로 전환: 원래 포지션 기억
  if(newPos === 'DH' && oldPos !== 'DH') {
    p._naturalPos = oldPos;
  }
  // DH에서 해제: naturalPos 삭제
  if(oldPos === 'DH' && newPos !== 'DH') {
    delete p._naturalPos;
  }
  p.pos = newPos;
  if(p.isPitcher) p.role = newPos === 'SP' ? 'rotation' : 'bullpen';
  document.querySelectorAll('.pos-changeable.open').forEach(e => e.classList.remove('open'));
  renderRoster();saveGame();
}

document.addEventListener('click', () => {
  document.querySelectorAll('.pos-changeable.open').forEach(e => e.classList.remove('open'));
});

// ---- Generic drag-and-drop (재사용 가능) ----
let _dragRosterIdx = -1;
let _dragBodyId    = '';

function _rosterDragStart(e, rosterIdx, bodyId) {
  _dragRosterIdx = rosterIdx;
  _dragBodyId    = bodyId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function _rosterDragEnd(e, bodyId) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll(`#${bodyId} tr`).forEach(r => r.classList.remove('drag-over'));
}

function _rosterDragOver(e, rosterIdx, bodyId) {
  if(_dragBodyId !== bodyId) return; // 다른 섹션으로는 드롭 불가
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll(`#${bodyId} tr`).forEach(r => r.classList.remove('drag-over'));
  if(rosterIdx !== _dragRosterIdx) e.currentTarget.classList.add('drag-over');
}

function _rosterDrop(e, targetRosterIdx, role) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if(_dragRosterIdx === -1 || _dragRosterIdx === targetRosterIdx) return;

  const roster = G.myTeam.roster;
  const group  = roster.map((p, i) => ({p, i})).filter(({p}) => p.role === role);
  const srcOrd = group.findIndex(g => g.i === _dragRosterIdx);
  const dstOrd = group.findIndex(g => g.i === targetRosterIdx);
  if(srcOrd === -1 || dstOrd === -1) return;

  const [moved] = group.splice(srcOrd, 1);
  group.splice(dstOrd, 0, moved);

  const slots = roster.map((p, i) => p.role === role ? i : null).filter(i => i !== null);
  slots.forEach((slotIdx, order) => { roster[slotIdx] = group[order].p; });

  _dragRosterIdx = -1;
  _dragBodyId    = '';
  renderRoster();saveGame();
}

// ===================== RENDER =====================
function renderRoster(){
  const allStarters = getStartingBatters(G.myTeam);
  const bench       = getBenchBatters(G.myTeam).sort((a,b) => ovrBatter(b)-ovrBatter(a));
  $('startingCount').textContent = `${allStarters.length}/9`;
  $('startingCount').style.color = allStarters.length<9?'#ef4444':'var(--accent)';
  $('benchCount').textContent    = bench.length;
  // Update tab badge counts
  const fc=$('futuresCountBadge');if(fc)fc.textContent=`(${getFuturesPlayers(G.myTeam).length})`;
  const dc=$('devCountBadge');if(dc)dc.textContent=`(${getDevPlayers(G.myTeam).length})`;
  const ic=$('ilCountBadge');if(ic){const ilc=getILPlayers(G.myTeam).length;ic.textContent=ilc>0?`(${ilc})`:'';};
  // Active roster info + violation warning
  const rCheck=validateActiveRoster(G.myTeam);
  const activeEl=$('activeRosterInfo');
  if(activeEl){
    if(rCheck.ok){
      activeEl.innerHTML=`<span style="color:var(--accent2);">✅</span> 1군 ${getActiveCount(G.myTeam)}/${ACTIVE_ROSTER_MAX}`;
    }else{
      activeEl.innerHTML=`<span style="color:#ef4444;">⚠️ 로스터 규정 위반</span> · 1군 ${getActiveCount(G.myTeam)}/${ACTIVE_ROSTER_MAX}<div style="background:rgba(239,68,68,0.08);border:1px solid #ef444466;border-radius:8px;padding:6px 10px;margin-top:6px;font-size:0.68rem;color:#ef4444;">경기 시작 불가 — 2군에서 콜업 필요<br>${rCheck.violations.map(v=>'• '+v).join('<br>')}</div>`;
    }
  }

  // Helper: compact colored stat cell
  function sc(v){return `<td style="color:${statColor(v)};">${v}</td>`;}

  $('startingBattersBody').innerHTML = allStarters.map((p, lineupNum) => {
    const idx = G.myTeam.roster.indexOf(p);
    const o=ovrBatter(p);
    return `<tr class="starter drag-row"
      draggable="true"
      ondragstart="_rosterDragStart(event,${idx},'startingBattersBody')"
      ondragend="_rosterDragEnd(event,'startingBattersBody')"
      ondragover="_rosterDragOver(event,${idx},'startingBattersBody')"
      ondrop="_rosterDrop(event,${idx},'starting')"
      onclick="moveToBench(${idx},event)">
      <td style="color:var(--accent);font-weight:700;cursor:grab;">${lineupNum+1}</td>
      <td><span class="player-name">${p.name}</span>${p.condition<40?'<span style="color:#ef4444;font-size:0.55rem;"> 🥶</span>':''}<span class="scout-btn" onclick="showScoutReport(${idx});event.stopPropagation();" title="스카우트 리포트">📋</span></td>
      <td>${posChangerHTML(p, idx)}</td>
      <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||22}</td>
      ${sc(p.contact)}${sc(p.power)}${sc(p.eye)}${sc(p.speed)}${sc(p.fielding)}${sc(p.arm)}
      <td style="color:${statColor(o)};font-weight:700;">${o}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" onclick="sendToFutures(${idx});event.stopPropagation();" style="background:#1e3a5f;color:#60a5fa;font-size:0.55rem;padding:1px 5px;" title="2군">⬇</button>
        <button class="btn btn-sm" onclick="sendToIL(${idx});event.stopPropagation();" style="background:#3b1111;color:#f87171;font-size:0.55rem;padding:1px 5px;margin-left:1px;" title="IL">IL</button>
      </td>
    </tr>`;
  }).join('');

  $('benchBattersBody').innerHTML = bench.map(p => {
    const idx = G.myTeam.roster.indexOf(p);
    const full = allStarters.length >= 9;
    const o=ovrBatter(p);
    return `<tr style="cursor:pointer;${full?'opacity:0.5;':''}" onclick="${full?'':'moveToStarting('+idx+',event)'}">
      <td><span class="player-name">${p.name}</span>${p.condition<40?'<span style="color:#ef4444;font-size:0.55rem;"> 🥶</span>':''}<span class="scout-btn" onclick="showScoutReport(${idx});event.stopPropagation();" title="스카우트 리포트">📋</span></td>
      <td>${posChangerHTML(p, idx)}</td>
      <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||22}</td>
      ${sc(p.contact)}${sc(p.power)}${sc(p.eye)}${sc(p.speed)}${sc(p.fielding)}${sc(p.arm)}
      <td style="color:${statColor(o)};font-weight:700;">${o}</td>
      <td><button class="btn btn-sm" onclick="sendToFutures(${idx});event.stopPropagation();" style="background:#1e3a5f;color:#60a5fa;font-size:0.55rem;padding:1px 5px;" title="2군">⬇</button></td>
    </tr>`;
  }).join('');

  // Pitchers — 순서 유지 (드래그로 변경)
  const rotation = getRotation(G.myTeam);   // 정렬 없음, roster 순서 유지
  const bullpen  = getBullpen(G.myTeam);    // 정렬 없음, roster 순서 유지
  $('rotationCount').textContent = `${rotation.length}/5`;
  $('bullpenCount').textContent  = bullpen.length;

  $('rotationBody').innerHTML = rotation.map((p, i) => {
    const idx      = G.myTeam.roster.indexOf(p);
    const nextGame = G.myTeam.rotationIdx % Math.max(1, rotation.length) === i;
    return `<tr class="starter drag-row"
      draggable="true"
      ondragstart="_rosterDragStart(event,${idx},'rotationBody')"
      ondragend="_rosterDragEnd(event,'rotationBody')"
      ondragover="_rosterDragOver(event,${idx},'rotationBody')"
      ondrop="_rosterDrop(event,${idx},'rotation')"
      style="${nextGame?'background:rgba(245,158,11,0.08);':''}">
      <td style="color:var(--accent);font-weight:700;cursor:grab;">⠿ ${i+1}${nextGame?' 🔜':''}</td>
      <td><span class="player-name">${p.name}</span><span class="scout-btn" onclick="showScoutReport(${idx});event.stopPropagation();" title="선수 분석">📋</span></td>
      <td>${posChangerHTML(p, idx)}</td>
      <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||22}</td>
      <td>${p.stuff}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.stuff)}%;background:${statColor(p.stuff)}"></div></div></td>
      <td>${p.control}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.control)}%;background:${statColor(p.control)}"></div></div></td>
      <td>${p.velocity}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.velocity)}%;background:${statColor(p.velocity)}"></div></div></td>
      <td>${p.movement}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.movement)}%;background:${statColor(p.movement)}"></div></div></td>
      <td style="color:${statColor(p.clutch)};font-size:0.72rem;">${p.clutch}</td>
      <td style="color:${statColor(p.stamina)};">${p.stamina}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.stamina)}%;background:${statColor(p.stamina)}"></div></div></td>
      <td style="color:${statColor(ovrPitcher(p))};font-weight:700;">${ovrPitcher(p)}</td>
      <td>${p.condition}%</td>
      <td><div class="stamina-bar"><div class="stamina-fill" style="width:${p.currentStamina}%;background:${p.currentStamina>50?'#10b981':p.currentStamina>25?'#f59e0b':'#ef4444'};"></div></div> ${p.currentStamina}%</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" onclick="sendToFutures(${idx});event.stopPropagation();" style="background:#1e3a5f;color:#60a5fa;font-size:0.6rem;padding:2px 6px;" title="2군 강등">⬇</button>
        <button class="btn btn-sm" onclick="sendToIL(${idx});event.stopPropagation();" style="background:#3b1111;color:#f87171;font-size:0.6rem;padding:2px 6px;margin-left:2px;" title="IL 등재">IL</button>
      </td>
    </tr>`;
  }).join('');

  // 불펜 보직별 그룹 렌더링 (우선순위: CP → SU → MR → LR)
  const _bpOrder=[
    {pos:'CP',icon:'🔒',label:'마무리',bg:'rgba(239,68,68,0.08)',border:'#ef4444',txt:'#f87171'},
    {pos:'SU',icon:'⚡',label:'필승조',bg:'rgba(245,158,11,0.08)',border:'#f59e0b',txt:'#fbbf24'},
    {pos:'MR',icon:'🔄',label:'추격조',bg:'rgba(59,130,246,0.08)',border:'#3b82f6',txt:'#60a5fa'},
    {pos:'LR',icon:'📋',label:'롱릴리프',bg:'rgba(107,114,128,0.08)',border:'#6b7280',txt:'#9ca3af'}
  ];
  let _bpHTML='';
  _bpOrder.forEach(({pos:role,icon,label,bg,border,txt})=>{
    const group=bullpen.filter(p=>p.pos===role||(role==='MR'&&p.pos==='RP'));
    _bpHTML+=`<tr><td colspan="14" style="background:${bg};border-left:3px solid ${border};padding:6px 12px;font-size:0.75rem;font-weight:600;color:${txt};letter-spacing:0.02em;">${icon} ${label} <span style="color:var(--text-dim);font-weight:400;font-size:0.68rem;margin-left:4px;">(${group.length}명)</span></td></tr>`;
    if(group.length===0){
      _bpHTML+=`<tr><td colspan="14" style="text-align:center;padding:6px;color:var(--text-dim);font-size:0.65rem;font-style:italic;">배정된 투수 없음</td></tr>`;
    }
    group.forEach((p,gi)=>{
      const idx=G.myTeam.roster.indexOf(p);
      _bpHTML+=`<tr class="bullpen-row drag-row"
      draggable="true"
      ondragstart="_rosterDragStart(event,${idx},'bullpenBody')"
      ondragend="_rosterDragEnd(event,'bullpenBody')"
      ondragover="_rosterDragOver(event,${idx},'bullpenBody')"
      ondrop="_rosterDrop(event,${idx},'bullpen')">
      <td style="cursor:grab;">⠿ <span style="color:${txt};font-weight:700;font-size:0.65rem;">${gi+1}</span></td>
      <td><span class="player-name">${p.name}</span><span class="scout-btn" onclick="showScoutReport(${idx});event.stopPropagation();" title="선수 분석">📋</span></td>
      <td>${posChangerHTML(p, idx)}</td>
      <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||22}</td>
      <td>${p.stuff}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.stuff)}%;background:${statColor(p.stuff)}"></div></div></td>
      <td>${p.control}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.control)}%;background:${statColor(p.control)}"></div></div></td>
      <td>${p.velocity}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.velocity)}%;background:${statColor(p.velocity)}"></div></div></td>
      <td>${p.movement}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.movement)}%;background:${statColor(p.movement)}"></div></div></td>
      <td style="color:${statColor(p.clutch)};font-size:0.72rem;">${p.clutch}</td>
      <td style="color:${statColor(p.stamina)};">${p.stamina}<div class="stat-bar"><div class="stat-bar-fill" style="width:${statPct(p.stamina)}%;background:${statColor(p.stamina)}"></div></div></td>
      <td style="color:${statColor(ovrPitcher(p))};font-weight:700;">${ovrPitcher(p)}</td>
      <td>${p.condition}%</td>
      <td><div class="stamina-bar"><div class="stamina-fill" style="width:${p.currentStamina}%;background:${p.currentStamina>50?'#10b981':p.currentStamina>25?'#f59e0b':'#ef4444'};"></div></div> ${p.currentStamina}%</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-sm" onclick="sendToFutures(${idx});event.stopPropagation();" style="background:#1e3a5f;color:#60a5fa;font-size:0.6rem;padding:2px 6px;" title="2군 강등">⬇</button>
      </td>
    </tr>`;
    });
  });
  $('bullpenBody').innerHTML=_bpHTML;

  renderLineupField();
}
