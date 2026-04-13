// ═══════════════════════════════════════════════════════
// 라이브 드래프트 (올스타)
// ═══════════════════════════════════════════════════════
function renderDraftLive(){
  const ds=G._draftState;if(!ds)return;
  const pool=G.draftPool||[];
  const sorted=[...pool].sort((a,b)=>(b._scoutedOvr||ovr(b))-(a._scoutedOvr||ovr(a)));
  const currentTeam=ds.order[ds.pickInRound];
  const isMyTurn=currentTeam===G.myTeam;
  const log=ds.log||[];

  const _isTestLive=!!(ds&&ds.isTest);
  $('draftContent').innerHTML=`
    ${_isTestLive?'<div style="background:rgba(124,58,237,0.15);border:1px solid #a855f7;border-radius:8px;padding:6px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:0.72rem;color:#c084fc;">🧪 테스트 모드 — 결과 미적용</span><button class="btn btn-sm" onclick="_testDraftEnd()" style="background:#7c3aed;color:#fff;border:1px solid #a855f7;font-size:0.6rem;padding:3px 10px;">✕ 중단</button></div>':''}
    <div class="card" style="margin-bottom:10px;">
      <div class="card-title">${_isTestLive?'🧪':'🎓'} 신인 드래프트 — ${ds.round}라운드 ${ds.pickInRound+1}번째 픽</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:0.78rem;color:${isMyTurn?'var(--accent)':'var(--text-dim)'};">
          ${isMyTurn?'⏰ 당신의 차례입니다!':currentTeam.emoji+' '+currentTeam.name+' 선택 중...'}
        </span>
        <span style="font-size:0.68rem;color:var(--text-dim);">남은 풀: ${pool.length}명</span>
      </div>

      ${isMyTurn?`
      <div style="overflow-x:auto;max-height:300px;overflow-y:auto;scrollbar-width:none;">
        <table class="data-table" style="font-size:0.72rem;">
          <thead><tr><th>이름</th><th>포지션</th><th>나이</th><th>OVR</th><th>스탯</th><th>잠재력</th><th></th></tr></thead>
          <tbody>${sorted.map(p=>{
            const effRd=_getEffectiveRdLv(p);
            const info=getDraftScoutInfo(p,effRd);
            const ovrHTML=info.ovr!=null?`<span style="color:${statColor(info.ovr)};font-weight:700;" title="스카우팅 추정치">~${info.ovr}</span>`:`<span style="color:var(--text-dim);" title="스카우팅 추정 범위">${info.ovrRange[0]}~${info.ovrRange[1]}</span>`;
            const keys=p.isPitcher?['stuff','control','velocity','movement','stamina','clutch']:['contact','power','eye','speed','fielding','arm'];
            const statHTML=!info.stats?'🔒':keys.map(k=>{
              const v=info.stats[k];
              if(Array.isArray(v))return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statColor(Math.round((v[0]+v[1])/2))};margin:0 1px;"></span>`;
              return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statColor(v)};margin:0 1px;"></span>`;
            }).join('');
            let potHTML=info.pot!=null?info.pot:info.potRange?info.potRange[0]+'~'+info.potRange[1]:info.potHint||'?';
            const poolIdx=pool.indexOf(p);
            const isDeep=!!p._deepScouted;
            return `<tr style="${isDeep?'background:rgba(16,185,129,0.05);':''}">
              <td style="text-align:left;">${p.name}${isDeep?'<span style="color:#10b981;font-size:0.5rem;">🔍</span>':''}</td>
              <td><span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.5rem;padding:1px 3px;">${p.pos}</span></td>
              <td style="color:var(--text-dim);">${p.age||18}</td>
              <td>${ovrHTML}</td>
              <td>${statHTML}</td>
              <td style="font-size:0.65rem;">${potHTML}</td>
              <td><button class="btn btn-primary btn-sm" onclick="draftPick('${p._uid}')" style="font-size:0.6rem;padding:2px 8px;">지명</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`:
      '<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:0.78rem;">AI가 선택 중입니다...</div>'}
    </div>

    <div class="card">
      <div style="font-size:0.72rem;color:var(--accent);margin-bottom:6px;">📋 드래프트 로그</div>
      <div style="max-height:200px;overflow-y:auto;scrollbar-width:none;font-size:0.68rem;color:var(--text-dim);line-height:1.8;" id="draftLog">
        ${log.map(l=>`<div>${l.emoji} <b>${l.team}</b> — <span style="color:${statColor(l.ovr)};">${l.name}</span> (${ALL_POS_NAMES[l.pos]||l.pos}, OVR ${l.ovr})</div>`).join('')}
      </div>
    </div>`;
}
