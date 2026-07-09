// ===================== ANALYSIS — 스카우트 리포트 =====================
// 의존: helpers.js (ovr, statColor, won, _hiddenGrade, $), constants.js (ALL_POS_NAMES, PRE_ARB_MAX_SERVICE, ARB_MAX_SERVICE), roster.js (showScoutReport)

let _scoutFilter = 'all';
function _setScoutFilter(f){_scoutFilter=f;renderAnalysisScout();}

function renderAnalysisScout() {
  const t = G.myTeam;
  const all = t.roster.filter(p => (p.status || 'active') === 'active' && p.role !== 'overseas');
  const tm = G.testMode;
  const aLv = t.analyticsLevel || 0;  // 분석팀 레벨 — 내구성/꾸준함/클러치 열람 게이팅

  // 포지션 그룹 필터
  let filtered;
  if(_scoutFilter==='if')      filtered=all.filter(p=>!p.isPitcher&&['1B','2B','3B','SS'].includes(p._naturalPos||p.pos));
  else if(_scoutFilter==='of') filtered=all.filter(p=>!p.isPitcher&&['LF','CF','RF'].includes(p._naturalPos||p.pos));
  else if(_scoutFilter==='c')  filtered=all.filter(p=>!p.isPitcher&&(p._naturalPos||p.pos)==='C');
  else if(_scoutFilter==='sp') filtered=all.filter(p=>p.isPitcher&&(p.role==='rotation'||p.pos==='SP'));
  else if(_scoutFilter==='bp') filtered=all.filter(p=>p.isPitcher&&p.role!=='rotation'&&p.pos!=='SP');
  else filtered=all;
  // DH(원래 포지션 불명)는 전체 탭에서만 포함
  if(_scoutFilter==='all'){
    const dhOrphans=all.filter(p=>p.pos==='DH'&&!p._naturalPos&&!filtered.includes(p));
    filtered=filtered.concat(dhOrphans);
  }

  function hiddenBar(val, revealed, max) {
    max = max || 20;
    // 테스트 모드가 아니고 분석팀 레벨이 부족하면 잠금 (데이터분석팀 투자 가치 부여)
    if (!tm && revealed === false) {
      return `<span style="color:var(--text-dim);font-size:0.7rem;" title="데이터분석팀 투자로 열람">🔒</span>`;
    }
    const pct = Math.round((val / max) * 100);
    const color = val >= 17 ? '#a855f7' : val >= 13 ? '#10b981' : val >= 9 ? '#f59e0b' : val >= 5 ? '#f97316' : '#ef4444';
    return tm
      ? `<div style="display:flex;align-items:center;gap:4px;">
          <div style="width:50px;height:5px;background:#1f2937;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;"></div>
          </div>
          <span style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:${color};width:20px;">${val}</span>
        </div>`
      : `<span style="color:${color};font-size:0.7rem;">${_hiddenGrade(val).text}</span>`;
  }

  function filterBtn(key,label){
    const active=_scoutFilter===key;
    return `<span onclick="_setScoutFilter('${key}')" style="cursor:pointer;padding:3px 10px;border-radius:4px;font-size:0.68rem;border:1px solid ${active?'var(--accent)':'var(--border)'};color:${active?'var(--accent)':'var(--text-dim)'};background:${active?'rgba(245,158,11,0.1)':'transparent'};">${label}</span>`;
  }

  $('analysisContent').innerHTML = `
    <div class="card">
      <div class="card-title">📋 스카우트 리포트 ${tm ? '<span style="color:#a855f7;font-size:0.65rem;">(테스트 모드)</span>' : ''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        ${filterBtn('all','전체')}
        ${filterBtn('if','🧤 내야수')}
        ${filterBtn('of','🏃 외야수')}
        ${filterBtn('c','🎯 포수')}
        ${filterBtn('sp','🔥 선발')}
        ${filterBtn('bp','🛡️ 불펜')}
      </div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:10px;">분석팀 Lv.${t.analyticsLevel || 0} · ${filtered.length}명 표시${tm ? '' : ` · 🔓 열람: 내구성 Lv.60 / 꾸준함 Lv.80 / 클러치 Lv.90`}</div>
      ${filtered.length===0?'<div style="color:var(--text-dim);text-align:center;padding:20px;">해당 포지션 선수가 없습니다.</div>':`
      <div style="overflow-x:auto;">
        <table class="data-table" style="font-size:0.72rem;">
          <thead><tr>
            <th>이름</th><th>포지션</th><th>나이</th><th>OVR</th><th>연봉</th><th>서비스</th>
            <th>잠재력</th><th>내구성</th><th>꾸준함</th><th>클러치</th><th>프로의식</th>
            <th>컨디션</th>
          </tr></thead>
          <tbody>${filtered.map(p => {
            const o = ovr(p);
            const av = getAnalyticsHiddenInfo(p, aLv);  // 분석팀 레벨별 열람 가능 히든스탯
            const st = p._serviceTime || 0;
            const phase = st <= PRE_ARB_MAX_SERVICE ? '프리아브' : st <= ARB_MAX_SERVICE ? '연봉조정' : 'FA자격';
            const phColor = st <= PRE_ARB_MAX_SERVICE ? '#67e8f9' : st <= ARB_MAX_SERVICE ? '#f59e0b' : '#10b981';
            return `<tr>
              <td style="text-align:left;"><span class="player-name" style="font-size:0.72rem;">${p.name}</span><span class="scout-btn" onclick="showScoutReport(${G.myTeam.roster.indexOf(p)});event.stopPropagation();" title="선수 분석">📋</span></td>
              <td><span class="pos-badge${p.isPitcher ? ' pitcher' : ''}" style="font-size:0.55rem;padding:1px 4px;">${ALL_POS_NAMES[p.pos] || p.pos}</span></td>
              <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||'??'}</td>
              <td style="color:${statColor(o)};font-weight:700;">${o}</td>
              <td style="font-family:'JetBrains Mono',monospace;">${won(p.salary || 0)}</td>
              <td><span style="color:${phColor};font-size:0.65rem;font-weight:600;">${phase}</span> <span style="color:var(--text-dim);font-size:0.6rem;">${st}yr</span></td>
              <td>${hiddenBar(p._potential || 10)}</td>
              <td>${hiddenBar(p._durability || 10, av.durability !== undefined)}</td>
              <td>${hiddenBar(p._consistency || 10, av.consistency !== undefined)}</td>
              <td>${hiddenBar(p._clutchHidden || 10, av.clutchHidden !== undefined)}</td>
              <td>${hiddenBar(p._workEthic || 10)}</td>
              <td style="color:${(p.condition || 100) < 40 ? '#ef4444' : 'var(--text)'};">${p.condition || 100}%${(p._slumpGames||0)>0?'<span style="color:#ef4444;font-size:0.6rem;"> 📉</span>':''}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`}
    </div>`;
}
