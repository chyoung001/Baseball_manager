// ===================== LINEUP FIELD VIEW =====================
// 포지션 좌표: x/y는 필드 컨테이너 기준 % (카드 중심)
// 가장자리 여유 확보 → anchor로 카드 정렬 방향 지정
// anchor: 'c'=center(기본), 'l'=left-align, 'r'=right-align
const _FIELD_POS = {
  'CF': { x: 50, y:  8, a: 'c' },
  'LF': { x: 18, y: 20, a: 'l' },
  'RF': { x: 82, y: 20, a: 'r' },
  'SS': { x: 34, y: 48, a: 'c' },
  '2B': { x: 60, y: 38, a: 'c' },
  '3B': { x: 16, y: 60, a: 'l' },
  '1B': { x: 84, y: 60, a: 'r' },
  'C':  { x: 50, y: 84, a: 'c' },
  'DH': { x: 14, y: 80, a: 'l' },
};

function renderLineupField() {
  const el = document.getElementById('lineupFieldView');
  if (!el) return;
  const starters = getStartingBatters(G.myTeam);
  const posMap = {};
  starters.forEach(p => { posMap[p.pos] = p; });

  const fieldSVG = '';

  // anchor 속성에 따라 카드 정렬 방향 결정 (가장자리 잘림 방지)
  const anchorTransform = { c: 'translate(-50%,-50%)', l: 'translate(0,-50%)', r: 'translate(-100%,-50%)' };

  // 선발 투수 정보
  const rotation = getRotation(G.myTeam);
  const sp = rotation.length > 0 ? rotation[G.myTeam.rotationIdx % rotation.length] : null;

  const playerCards = Object.entries(_FIELD_POS).map(([pos, {x, y, a}]) => {
    const p = posMap[pos];
    const isDH = pos === 'DH';
    const tf = anchorTransform[a || 'c'];
    if (p) {
      const ovrVal = ovrBatter(p);
      const lineupNum = starters.indexOf(p) + 1;
      const isSlump = (p.condition||100) < SLUMP_CONDITION_THRESHOLD;
      const condColor = isSlump ? '#ef4444' : p.condition >= 80 ? '#10b981' : p.condition >= 60 ? '#f59e0b' : '#f97316';
      const borderStyle = isSlump ? 'border-color:#ef4444aa;' : ovrVal >= 80 ? 'border-color:rgba(168,85,247,0.6);box-shadow:0 0 8px rgba(168,85,247,0.15);' : '';
      return `<div class="field-player" style="left:${x}%;top:${y}%;transform:${tf};">
        <div class="field-player-badge${isDH ? ' dh' : ''}" style="${borderStyle}">
          <div class="field-player-pos">${pos} <span style="color:var(--text-dim);font-weight:400;">#${lineupNum}</span></div>
          <div class="field-player-name">${p.name}</div>
          <div style="display:flex;align-items:center;gap:3px;justify-content:center;">
            <span class="field-player-ovr" style="color:${statColor(ovrVal)};">${ovrVal}</span>
            <span style="font-size:0.44rem;color:${condColor};">${isSlump?'🥶':'●'}</span>
          </div>
          <div style="display:flex;gap:2px;justify-content:center;font-size:0.42rem;color:var(--text-dim);margin-top:1px;">
            <span title="수비" style="color:${statColor(p.fielding)};">🧤${p.fielding}</span>
            <span title="송구" style="color:${statColor(p.arm)};">💪${p.arm}</span>
          </div>
          <div style="width:100%;height:2px;background:#1f2937;border-radius:1px;margin-top:1px;">
            <div style="height:100%;width:${p.condition}%;background:${condColor};border-radius:1px;"></div>
          </div>
        </div>
      </div>`;
    } else {
      return `<div class="field-player" style="left:${x}%;top:${y}%;transform:${tf};">
        <div class="field-player-badge empty${isDH ? ' dh' : ''}">
          <div class="field-player-pos">${pos}</div>
          <div class="field-player-name">-</div>
        </div>
      </div>`;
    }
  }).join('');

  // 마운드에 선발투수 표시
  const spCard = sp ? `<div class="field-player" style="left:50%;top:59%;transform:translate(-50%,-50%);">
    <div class="field-player-badge" style="border-color:rgba(248,113,113,0.5);background:rgba(30,10,10,0.92);">
      <div class="field-player-pos" style="color:#f87171;">SP</div>
      <div class="field-player-name">${sp.name}</div>
      <div class="field-player-ovr" style="color:${statColor(ovrPitcher(sp))};">${ovrPitcher(sp)}</div>
    </div>
  </div>` : '';

  // 벤치 깊이 표시 (각 포지션별 백업)
  const benchPlayers = getBenchBatters(G.myTeam);
  const benchByPos = {};
  benchPlayers.forEach(p => { if(!benchByPos[p.pos]) benchByPos[p.pos]=[]; benchByPos[p.pos].push(p); });

  el.innerHTML = `
    <div class="lineup-field-wrap">
      <div class="lineup-field-wrap-title">
        <span>🏟️ 필드 라인업</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:0.62rem;color:${starters.length<9?'#ef4444':'var(--accent2)'};">${starters.length}/9</span>
        ${starters.length<9?`<span style="font-size:0.6rem;color:#ef4444;margin-left:8px;">${9-starters.length}명 미배치</span>`:''}
      </div>
      <div class="lineup-field">
        <div class="lineup-field-bg"></div>
        ${fieldSVG}
        ${playerCards}
        ${spCard}
      </div>
    </div>`;
}

// ===================== ROSTER RENDER =====================

// ---- Position change helpers ----
function getPosGroup(pos, player) {
  // 외야수: 외야수끼리 + DH 옵션
  if(['LF','CF','RF'].includes(pos)) return ['LF','CF','RF','DH'];
  // 내야수: 내야수끼리 + DH 옵션
  if(['1B','2B','3B','SS'].includes(pos)) return ['1B','2B','3B','SS','DH'];
  // 포수: DH 옵션만
  if(pos === 'C') return ['C','DH'];
  // DH: 원래 포지션 그룹으로 복귀
  if(pos === 'DH') {
    const nat = player && player._naturalPos;
    if(!nat) return ['C','1B','2B','3B','SS','LF','CF','RF'];
    if(['LF','CF','RF'].includes(nat)) return ['LF','CF','RF'];
    if(['1B','2B','3B','SS'].includes(nat)) return ['1B','2B','3B','SS'];
    if(nat === 'C') return ['C'];
    return ['C','1B','2B','3B','SS','LF','CF','RF'];
  }
  // 투수: 자유 변경
  if(['SP','CP','SU','MR','LR','RP'].includes(pos)) return ['SP','CP','SU','MR','LR'];
  return null;
}

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
    const ip=(s.ip||0),era=ip>0?(s.er||0)*9/ip:0,whip=ip>0?((s.ha||0)+(s.pbb||0))/ip:0;
    seasonHTML=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:0.68rem;text-align:center;">
      <div><div style="color:var(--text-dim);">ERA</div><div style="color:${era<=3?'#10b981':era<=4.5?'#f59e0b':'#ef4444'};font-weight:700;">${era.toFixed(2)}</div></div>
      <div><div style="color:var(--text-dim);">WHIP</div><div style="font-weight:700;">${whip.toFixed(2)}</div></div>
      <div><div style="color:var(--text-dim);">W-L</div><div style="font-weight:700;">${s.w||0}-${s.l||0}</div></div>
      <div><div style="color:var(--text-dim);">IP</div><div>${ip.toFixed(1)}</div></div>
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

// 행 클릭 시 포지션 드롭다운 클릭이면 무시
function _isPosDrop(e){return e&&e.target&&e.target.closest&&e.target.closest('.pos-changeable');}
function moveToBench(idx,e){
  if(_isPosDrop(e)||G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(getStartingBatters(G.myTeam).length <= 1) return;
  p.role = 'bench';
  renderRoster();saveGame();
}
function moveToStarting(idx,e){
  if(_isPosDrop(e)||G.matchInProgress) return;
  if(getStartingBatters(G.myTeam).length >= 9) return;
  G.myTeam.roster[idx].role = 'starting';
  renderRoster();saveGame();
}
function moveToBullpen(idx,e){
  if(_isPosDrop(e)||G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(getRotation(G.myTeam).length <= 1) return;
  p.role = 'bullpen';
  renderRoster();saveGame();
}
function moveToRotation(idx,e){
  if(_isPosDrop(e)||G.matchInProgress) return;
  G.myTeam.roster[idx].role = 'rotation';
  renderRoster();saveGame();
}

// ===================== 1군/2군/육성 로스터 관리 =====================
function sendToFutures(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || (p.status||'active')!=='active') return;
  // 옵션 횟수 체크 (시즌당 1회 카운트)
  if((p._optionYearsUsed||0)>=MAX_OPTION_YEARS){
    showToast(`🚫 ${p.name}은(는) 마이너 옵션 ${MAX_OPTION_YEARS}회 소진! 강등 불가 (방출/트레이드만 가능)`);return;
  }
  if(!canRemoveFromActive(G.myTeam,p)){
    showToast(`🚫 강등 불가 — 최소 로스터 규정 위반`);return;
  }
  p.status='futures'; p.cooldown=CALLUP_COOLDOWN;
  p._optionYearsUsed=(p._optionYearsUsed||0)+1;
  showToast(`⬇️ ${p.name} 2군 강등 (옵션 ${p._optionYearsUsed}/${MAX_OPTION_YEARS}). ${CALLUP_COOLDOWN}경기 콜업 불가`);
  renderRoster();saveGame();
}

function sendToIL(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || (p.status||'active')!=='active') return;
  // IL은 인원 제외 → 최소 로스터 체크
  if(!canRemoveFromActive(G.myTeam,p)){
    showToast(`🚫 IL 등재 불가 — 최소 로스터 규정 위반. 먼저 2군에서 콜업하세요.`);return;
  }
  const days = rand(5,20);
  p.status='il'; p.isOnIL=true; p.ilGamesLeft=days;
  showToast(`🏥 ${p.name} IL 등재. ${days}경기 후 자동 복귀`);
  renderRoster();saveGame();
}

function callUp(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || p.status!=='futures') return;
  if(!canPlayerDebut(p)){showToast(`🚫 ${p.name}은(는) 시즌 ${p.canDebutYear}부터 1군 등록 가능`);return;}
  if(p.isForeign&&!canAddForeign(G.myTeam)){showToast(`🚫 외국인 선수 등록 한도 ${FOREIGN_PLAYER_MAX}명 초과`);return;}
  if((p.cooldown||0)>0){showToast(`⏳ 콜업 불가 — 쿨다운 ${p.cooldown}경기 남음`);return;}
  if(!canCallUp(G.myTeam)){showToast(`🚫 1군 한도 초과`);return;}
  p.status='active';
  showToast(`⬆️ ${p.name} 1군 콜업!`);
  renderRoster();saveGame();
}

function promoteFromDev(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || p.status!=='developmental') return;
  const orgCount = G.myTeam.roster.filter(r=>r.status==='active'||r.status==='futures').length;
  if(orgCount >= FUTURES_ORG_MAX){showToast(`🚫 조직 한도 ${FUTURES_ORG_MAX}명 초과`);return;}
  p.status='futures';
  showToast(`📋 ${p.name} 정식 등록 — 2군 합류`);
  renderRoster();saveGame();
}

function releasePlayer(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p) return;
  // 조직 최소 인원 체크
  const orgCount = G.myTeam.roster.length;
  if(orgCount <= ORG_MIN_TOTAL){showToast(`🚫 방출 불가 — 조직 최소 인원(${ORG_MIN_TOTAL}명)`);return;}
  // 1군 선수라면 최소 로스터 체크
  if((p.status||'active')==='active' && !canRemoveFromActive(G.myTeam,p)){
    showToast(`🚫 방출 불가 — 1군 최소 로스터 규정 위반`);return;
  }
  if(!confirm(`${p.name}을(를) 방출하시겠습니까?`)) return;
  G.myTeam.roster.splice(idx,1);
  renderRoster();saveGame();
}

function emergencyILReturn(idx) {
  if(G.matchInProgress) return;
  const p = G.myTeam.roster[idx];
  if(!p || p.status!=='il') return;
  if(!confirm(`${p.name} 조기 복귀 시 재활 5경기 패널티가 부과됩니다. 진행하시겠습니까?`)) return;
  p.status='futures'; p.isOnIL=false; p.ilGamesLeft=0;
  p.cooldown=IL_COOLDOWN_ON_RETURN; p.rehabGamesLeft=5; // 조기 복귀 패널티
  showToast(`🏥 ${p.name} IL 조기 복귀! 2군 재활 5경기`);
  renderFutures();
}

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
