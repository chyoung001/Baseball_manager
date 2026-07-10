// ===================== PHASE 8: GM 회의 (다음 시즌 룰 재정의) =====================
// 매 시즌 GM_PROPOSALS에서 2개 안건이 투표에 오름. 유저 1표 + AI 단장 7표 = 8표 과반(5)으로 가결.
// 가결된 안건의 effect가 G.seasonModifiers에 적용되어 다음 시즌부터 반영됨.

// 순수 로직 (헤드리스 테스트 가능) ─────────────────────────────
function _pickGMProposals(){
  const pool=[...GM_PROPOSALS];
  const picks=[];
  for(let i=0;i<2&&pool.length>0;i++){ picks.push(pool.splice(rand(0,pool.length-1),1)[0]); }
  return picks;
}
// 8표(유저+AI7) 집계. 반환 {passed, yes, no}
function _resolveGMProposal(prop, userYes){
  let yes = userYes?1:0;
  for(let i=0;i<7;i++){ if(Math.random()<(prop.aiSupport!=null?prop.aiSupport:0.5)) yes++; }
  return { passed: yes>=5, yes, no: 8-yes };
}
// 가결 안건들의 effect를 seasonModifiers에 적용 (매 회의마다 초기화 후 재적용)
function applyGMModifiers(passedProps){
  G.seasonModifiers={};
  passedProps.forEach(p=>{ if(p&&p.effect) G.seasonModifiers[p.effect.key]=p.effect.value; });
}

// UI ───────────────────────────────────────────────────────────
function showGMMeeting(){
  // 이번 회의 안건 확정 (재진입 시 유지)
  if(!G._gmProposals||G._gmProposals.length===0){ G._gmProposals=_pickGMProposals(); G._gmVotes=[null,null]; }
  const props=G._gmProposals;
  const votes=G._gmVotes||(G._gmVotes=[null,null]);

  const propCard=(p,i)=>{
    const v=votes[i];
    const btn=(yes)=>{
      const on=v===yes;
      const color=yes?'#10b981':'#ef4444';
      return `<button onclick="_gmVote(${i},${yes})" style="flex:1;padding:8px;border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:700;border:1px solid ${on?color:'var(--border)'};background:${on?color+'22':'transparent'};color:${on?color:'var(--text-dim)'};">${yes?'👍 찬성':'👎 반대'}</button>`;
    };
    return `<div class="card" style="background:var(--bg-card-hover);padding:12px;margin-bottom:10px;">
      <div style="font-size:0.85rem;font-weight:700;margin-bottom:4px;">${p.icon} ${p.name}</div>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:8px;">${p.desc}</div>
      <div style="display:flex;gap:8px;">${btn(true)}${btn(false)}</div>
    </div>`;
  };

  const allVoted=votes[0]!==null&&votes[1]!==null;
  $('modalTitle').textContent='🗳️ GM 회의 — 다음 시즌 룰 투표';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:12px;">유저 1표 + AI 단장 7표 = 8표. 과반(5표) 이상 찬성 시 다음 시즌부터 적용됩니다.</p>
      ${props.map(propCard).join('')}
      <button class="btn btn-primary" onclick="_gmDecide()" ${allVoted?'':'disabled'} style="width:100%;margin-top:6px;">${allVoted?'▶ 투표 종료 & 개표':'각 안건에 투표하세요'}</button>
    </div>`;
  $('seasonModal').classList.add('active');
}

function _gmVote(i,yes){ if(!G._gmVotes)G._gmVotes=[null,null]; G._gmVotes[i]=yes; showGMMeeting(); }

function _gmDecide(){
  const props=G._gmProposals||[];
  const votes=G._gmVotes||[];
  const results=props.map((p,i)=>({ prop:p, ...(_resolveGMProposal(p, votes[i]===true)) }));
  const passed=results.filter(r=>r.passed).map(r=>r.prop);
  applyGMModifiers(passed);
  // 회의 상태 정리
  G._gmProposals=null; G._gmVotes=null;

  $('modalTitle').textContent='🗳️ 개표 결과';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      ${results.map(r=>`
        <div class="card" style="background:var(--bg-card-hover);padding:10px;margin-bottom:8px;border-left:3px solid ${r.passed?'#10b981':'#ef4444'};">
          <div style="font-size:0.82rem;font-weight:700;">${r.prop.icon} ${r.prop.name} — <span style="color:${r.passed?'#10b981':'#ef4444'};">${r.passed?'가결':'부결'}</span></div>
          <div style="font-size:0.7rem;color:var(--text-dim);margin-top:2px;">찬성 ${r.yes} · 반대 ${r.no}${r.passed?` → ${r.prop.desc}`:''}</div>
        </div>`).join('')}
      ${passed.length===0?'<p style="font-size:0.75rem;color:var(--text-dim);margin:8px 0;">가결된 안건이 없어 다음 시즌 룰 변화는 없습니다.</p>':''}
      <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');G.phase='stove_league';advancePhase();" style="width:100%;margin-top:6px;">▶ 스토브리그로</button>
    </div>`;
  $('seasonModal').classList.add('active');
}
