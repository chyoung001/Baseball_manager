// ═══════════════════════════════════════════════════════
// 드래프트 결과 (후반기~)
// ═══════════════════════════════════════════════════════
function renderDraftResult(){
  const result=G._draftResult||[];
  const myPicks=result.filter(r=>r.team===G.myTeam.name);
  const isTest=!!_testDraftBackup;

  $('draftContent').innerHTML=`
    ${isTest?`<div style="background:rgba(124,58,237,0.15);border:1px solid #a855f7;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:0.78rem;color:#c084fc;font-weight:700;">🧪 테스트 드래프트 결과 — 실제 적용되지 않습니다</span>
      <button class="btn btn-sm" onclick="_testDraftEnd()" style="background:#7c3aed;color:#fff;border:1px solid #a855f7;font-size:0.7rem;padding:5px 14px;">✕ 테스트 종료 (원복)</button>
    </div>`:''}
    <div class="card" style="margin-bottom:10px;">
      <div class="card-title">${isTest?'🧪':'🎓'} 드래프트 결과 — 시즌 ${G.season}</div>
      ${myPicks.length>0?`
      <div style="font-size:0.72rem;color:var(--accent);margin-bottom:8px;">🏆 내 팀 지명 (${myPicks.length}명)</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
        ${myPicks.map(r=>`<span style="background:var(--bg-card-hover);border:1px solid var(--accent);border-radius:6px;padding:4px 10px;font-size:0.72rem;">
          <span class="pos-badge${r.isPitcher?' pitcher':''}" style="font-size:0.5rem;padding:1px 3px;">${r.pos}</span>
          ${r.name} <span style="color:${statColor(r.ovr)};font-weight:700;">${r.ovr}</span>
        </span>`).join('')}
      </div>`:''}
    </div>
    <div class="card">
      <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:8px;">전체 지명 내역 (${result.length}건)</div>
      <div style="overflow-x:auto;">
        <table class="data-table" style="font-size:0.7rem;">
          <thead><tr><th>라운드</th><th>픽</th><th>팀</th><th>선수</th><th>포지션</th><th>OVR</th></tr></thead>
          <tbody>${result.map(r=>{
            const isMine=r.team===G.myTeam.name;
            return `<tr style="${isMine?'background:rgba(245,158,11,0.08);':''}">
              <td>${r.round}</td><td>${r.pick}</td>
              <td>${r.emoji} ${r.team}</td>
              <td style="text-align:left;${isMine?'color:var(--accent);font-weight:700;':''}">${r.name}</td>
              <td><span class="pos-badge${r.isPitcher?' pitcher':''}" style="font-size:0.5rem;padding:1px 3px;">${r.pos}</span></td>
              <td style="color:${statColor(r.ovr)};font-weight:700;">${r.ovr}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>`;
}
