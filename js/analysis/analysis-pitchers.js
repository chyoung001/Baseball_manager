// ===================== ANALYSIS — 투수 성적 =====================
// 의존: helpers.js (ovrPitcher, ssERA, ssWHIP, ssIPstr, statColor, $), state.js (G)

function renderAnalysisPitchers() {
  const t = G.myTeam;
  const pitchers = t.roster.filter(p => p.isPitcher && (p.status || 'active') === 'active' && p.role !== 'overseas');
  const noData = (t.wins + t.losses) === 0;

  $('analysisContent').innerHTML = `
    <div class="card">
      <div class="card-title">📊 ${t.emoji} ${t.name} — 투수 시즌 성적</div>
      ${noData ? '<div style="color:var(--text-dim);text-align:center;padding:30px;">경기를 진행하면 실제 성적이 표시됩니다.</div>' : `
      <div style="overflow-x:auto;">
        <table class="data-table" style="font-size:0.72rem;">
          <thead><tr>
            <th>이름</th><th>역할</th><th>나이</th><th>GP</th><th>W</th><th>L</th><th>SV</th>
            <th>ERA</th><th>WHIP</th><th>FIP</th><th>IP</th><th>K</th><th>BB</th><th>H</th><th>WAR</th><th>OVR</th>
          </tr></thead>
          <tbody>${pitchers.map(p => {
            const s = p.ss || {};
            const era = ssERA(p);
            const whip = ssWHIP(p);
            const o = ovrPitcher(p);
            return `<tr>
              <td style="text-align:left;"><span class="player-name" style="font-size:0.72rem;">${p.name}</span></td>
              <td><span class="pos-badge pitcher" style="font-size:0.55rem;padding:1px 4px;">${p.pos}</span></td>
              <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||'??'}</td>
              <td>${s.gp || 0}</td>
              <td style="font-weight:700;color:${(s.w || 0) >= 5 ? '#10b981' : 'var(--text)'};">${s.w || 0}</td>
              <td style="color:${(s.l || 0) >= 5 ? '#ef4444' : 'var(--text)'};">${s.l || 0}</td>
              <td style="color:${(s.sv || 0) > 0 ? 'var(--accent)' : 'var(--text-dim)'};">${s.sv || 0}</td>
              <td style="color:${era <= 3.0 ? '#10b981' : era <= 4.5 ? '#f59e0b' : '#ef4444'};font-weight:700;">${era.toFixed(2)}</td>
              <td style="color:${whip <= 1.1 ? '#10b981' : whip <= 1.4 ? '#f59e0b' : '#ef4444'};">${whip.toFixed(2)}</td>
              <td style="color:${ssFIP(p) <= 3.5 ? '#10b981' : ssFIP(p) <= 4.5 ? '#f59e0b' : '#ef4444'};">${ssFIP(p).toFixed(2)}</td>
              <td>${ssIPstr(p)}</td>
              <td>${s.pk || 0}</td>
              <td>${s.pbb || 0}</td>
              <td>${s.ha || 0}</td>
              <td style="font-weight:700;">${warPitcher(p).toFixed(1)}</td>
              <td style="color:${statColor(o)};font-weight:700;">${o}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`}
    </div>`;
}
