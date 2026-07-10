// ===================== ROSTER FIELD (Diamond Visualization) =====================
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
