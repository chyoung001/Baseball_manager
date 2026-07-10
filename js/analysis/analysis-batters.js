// ===================== ANALYSIS — 타자 성적 =====================
// 의존: helpers.js (ovrBatter, statColor, $), state.js (G)

function renderAnalysisBatters() {
  const t = G.myTeam;
  const batters = t.roster.filter(p => !p.isPitcher && (p.status || 'active') === 'active' && p.role !== 'overseas');
  const noData = (t.wins + t.losses) === 0;

  $('analysisContent').innerHTML = `
    <div class="card">
      <div class="card-title">📊 ${t.emoji} ${t.name} — 타자 시즌 성적</div>
      ${noData ? '<div style="color:var(--text-dim);text-align:center;padding:30px;">경기를 진행하면 실제 성적이 표시됩니다.</div>' : `
      <div style="overflow-x:auto;">
        <table class="data-table" style="font-size:0.72rem;">
          <thead><tr>
            <th>이름</th><th>포지션</th><th>나이</th><th>타석</th><th>안타</th>
            <th>AVG</th><th>OBP</th><th>HR</th><th>XBH</th><th>RBI</th>
            <th>BB</th><th>K</th><th>SB</th><th>OVR</th>
          </tr></thead>
          <tbody>${batters.map(p => {
            const s = p.ss || {};
            const ab = s.ab || 0, h = s.h || 0;
            const avg = ab > 0 ? (h / ab) : 0;
            const obp = (ab + (s.bb || 0)) > 0 ? ((h + (s.bb || 0)) / (ab + (s.bb || 0))) : 0;
            const o = ovrBatter(p);
            return `<tr>
              <td style="text-align:left;"><span class="player-name" style="font-size:0.72rem;">${p.name}</span></td>
              <td><span class="pos-badge" style="font-size:0.55rem;padding:1px 4px;">${p.pos}</span></td>
              <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||'??'}</td>
              <td>${ab}</td><td>${h}</td>
              <td style="color:${avg >= 0.300 ? '#10b981' : avg >= 0.250 ? '#f59e0b' : '#ef4444'};font-weight:700;">${avg.toFixed(3)}</td>
              <td style="color:${obp >= 0.380 ? '#10b981' : obp >= 0.320 ? '#f59e0b' : 'var(--text)'};">${obp.toFixed(3)}</td>
              <td style="font-weight:700;color:${(s.hr || 0) >= 10 ? '#a855f7' : 'var(--text)'};">${s.hr || 0}</td>
              <td>${s.xbh || 0}</td>
              <td>${s.rbi || 0}</td>
              <td>${s.bb || 0}</td>
              <td style="color:${(s.k || 0) > ab * 0.25 ? '#ef4444' : 'var(--text)'};">${s.k || 0}</td>
              <td>${s.sb || 0}</td>
              <td style="color:${statColor(o)};font-weight:700;">${o}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`}
    </div>`;
}
