// ===================== DRAFT PAGE =====================
let _draftFilter='all';
function _setDraftFilter(f){_draftFilter=f;renderDraft();}

// ── 테스트 모드 전용: 샌드박스 드래프트 (실제 이벤트 흐름 재현) ──
let _testDraftBackup=null;

function _testDraft(){
  if(!G.testMode){showToast('🚫 테스트 모드에서만 사용 가능!');return;}

  // 1. 현재 상태 전체 백업
  _testDraftBackup={
    phase:G.phase,
    draftPool:G.draftPool,
    draftState:G._draftState,
    draftResult:G._draftResult,
    scoutTickets:G._scoutTickets,
    allStars:G.allStars,
    rosters:G.teams.map(t=>t.roster.slice()),
    budgets:G.teams.map(t=>t.budget),
  };

  // 2. phase를 allstar로 세팅 (실제 드래프트 흐름 재현)
  G.phase='allstar';
  updateHeader();

  // 3. 풀 새로 생성
  G._scoutTickets=12;
  G.draftPool=null;G._draftState=null;G._draftResult=null;
  const scLv=G.myTeam.scoutingLevel||0;
  G.draftPool=generateDraftPool();
  G.draftPool.forEach(dp=>{dp._scoutedOvr=getScoutedOvr(dp,scLv);});

  // 4. 실제 올스타 → 드래프트 이벤트 흐름 시작 (isTest 플래그 주입)
  G._testDraftFlag=true;
  showAllStarBreak();
}

// 테스트 드래프트 종료 → 원본 상태 완전 복원
function _testDraftEnd(){
  if(!_testDraftBackup)return;
  const bk=_testDraftBackup;

  G.teams.forEach((t,i)=>{t.roster=bk.rosters[i];t.budget=bk.budgets[i];});
  G.phase=bk.phase;
  G.draftPool=bk.draftPool;
  G._draftState=bk.draftState;
  G._draftResult=bk.draftResult;
  G._scoutTickets=bk.scoutTickets;
  G.allStars=bk.allStars;
  delete G._testDraftFlag;

  _testDraftBackup=null;
  updateHeader();
  showToast('🧪 테스트 드래프트 종료 — 모든 변경사항이 원복되었습니다.');
  renderDraft();
}

function renderDraft(){
  // 풀이 없는데 시즌이 진행 중이면 즉시 생성
  if((!G.draftPool||G.draftPool.length===0)&&['preseason','first_half','allstar'].includes(G.phase)){
    if(G._scoutTickets==null)G._scoutTickets=12;
    const rdLv=G.myTeam.scoutingLevel||0;
    G.draftPool=generateDraftPool();
    G.draftPool.forEach(dp=>{dp._scoutedOvr=getScoutedOvr(dp,rdLv);});
    saveGame();
  }
  if(!G.draftPool||G.draftPool.length===0){
    if(G._draftResult&&G._draftResult.length>0) renderDraftResult();
    else $('draftContent').innerHTML=`<div class="card" style="text-align:center;padding:40px;"><div style="font-size:2rem;margin-bottom:12px;">🎓</div><p style="color:var(--text-dim);">드래프트 풀이 아직 생성되지 않았습니다.<br>다음 시즌이 시작되면 유망주 풀이 공개됩니다.</p>${G.testMode?'<button class="btn btn-sm" onclick="_testDraft()" style="margin-top:14px;font-size:0.7rem;padding:6px 16px;background:#7c3aed;color:#fff;border:1px solid #a855f7;">🧪 테스트 드래프트 시작</button>':''}</div>`;
    return;
  }
  if(G._draftState&&(G.phase==='allstar'||G._draftState.isTest)) renderDraftLive();
  else if(G._draftResult&&G._draftResult.length>0&&(_testDraftBackup||['second_half','postseason','awards','stove_league'].includes(G.phase))) renderDraftResult();
  else renderDraftPreview();
}

// ── 정밀 스카우팅: 선수별 R&D 단계 업그레이드 ──
function _getEffectiveRdLv(p){
  const base=G.myTeam.scoutingLevel||0;
  const bonus=p._deepScouted||0; // 0~1 단계 업그레이드
  return Math.min(100,base+bonus);
}

function deepScoutPlayer(uid){
  const tickets=G._scoutTickets||0;
  if(tickets<=0){showToast('🚫 스카우팅 티켓이 없습니다!');return;}
  const p=G.draftPool.find(pl=>pl._uid===uid);
  if(!p){return;}
  if(p._deepScouted){showToast('🚫 이미 정밀 스카우팅된 선수입니다.');return;}

  G._scoutTickets--;
  // 목표 레벨 도달 방식: 현재 스카우트 레벨의 다음 구간까지 보정
  const rdLv=G.myTeam.scoutingLevel||0;
  let target=0;
  if(rdLv<30) target=30;
  else if(rdLv<60) target=60;
  else if(rdLv<80) target=80;
  else target=100;
  p._deepScouted=target-rdLv;
  // 정밀 스카우팅 후 겉보기 OVR 즉시 재계산 (정렬 반영)
  p._scoutedOvr=getScoutedOvr(p,_getEffectiveRdLv(p));

  showToast(`🔍 ${p.name} 정밀 스카우팅 완료! (티켓 ${G._scoutTickets}장 남음)`);
  renderDraft();saveGame();
}

// ═══════════════════════════════════════════════════════
// 미리보기 (프리시즌~전반기)
// ═══════════════════════════════════════════════════════
function renderDraftPreview(){
  const baseRd=G.myTeam.scoutingLevel||0;
  const pool=G.draftPool||[];
  const tickets=G._scoutTickets||0;

  const sorted=[...pool].sort((a,b)=>(b._scoutedOvr||ovr(b))-(a._scoutedOvr||ovr(a)));

  let filtered=sorted;
  if(_draftFilter==='if') filtered=sorted.filter(p=>!p.isPitcher&&['1B','2B','3B','SS'].includes(p.pos));
  else if(_draftFilter==='of') filtered=sorted.filter(p=>!p.isPitcher&&['LF','CF','RF'].includes(p.pos));
  else if(_draftFilter==='c') filtered=sorted.filter(p=>!p.isPitcher&&p.pos==='C');
  else if(_draftFilter==='pit') filtered=sorted.filter(p=>p.isPitcher);

  function fb(key,label){
    const active=_draftFilter===key;
    return `<span onclick="_setDraftFilter('${key}')" style="cursor:pointer;padding:3px 10px;border-radius:4px;font-size:0.68rem;border:1px solid ${active?'var(--accent)':'var(--border)'};color:${active?'var(--accent)':'var(--text-dim)'};background:${active?'rgba(245,158,11,0.1)':'transparent'};">${label}</span>`;
  }

  $('draftContent').innerHTML=`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div class="card-title" style="margin:0;">🎓 신인 드래프트 스카우팅 — 유망주 ${pool.length}명</div>
        ${G.testMode?'<button class="btn btn-sm" onclick="_testDraft()" style="font-size:0.6rem;padding:3px 8px;background:#7c3aed;color:#fff;border:1px solid #a855f7;">🧪 테스트 드래프트</button>':''}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:0.72rem;color:var(--text-dim);">
          스카우트팀 Lv.${baseRd} · ${baseRd>=90?'레전드 스카우터':baseRd>=80?'수석 스카우터':baseRd>=60?'프로 스카우터':baseRd>=30?'주니어 스카우터':'아마추어 스카우터'}
        </span>
        <span style="font-size:0.72rem;color:${tickets>0?'var(--accent)':'#ef4444'};">🔍 스카우팅 티켓: <b>${tickets}</b>/12</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        ${fb('all','전체')} ${fb('if','🧤 내야')} ${fb('of','🏃 외야')} ${fb('c','🎯 포수')} ${fb('pit','⚾ 투수')}
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table" style="font-size:0.72rem;">
          <thead><tr>
            <th>#</th><th>이름</th><th>포지션</th><th>나이</th><th>OVR</th>
            <th>스탯</th><th>잠재력</th><th>특수</th><th></th>
          </tr></thead>
          <tbody>${filtered.map((p,i)=>{
            const effRd=_getEffectiveRdLv(p);
            const info=getDraftScoutInfo(p,effRd);
            const isDeep=!!p._deepScouted;
            const poolIdx=pool.indexOf(p);
            // OVR (스카우팅 추정치)
            const ovrHTML=info.ovr!=null
              ?`<span style="color:${statColor(info.ovr)};font-weight:700;" title="스카우팅 추정치">~${info.ovr}</span>`
              :`<span style="color:var(--text-dim);" title="스카우팅 추정 범위">${info.ovrRange[0]}~${info.ovrRange[1]}</span>`;
            // 스탯 도트
            let statHTML='';
            if(!info.stats) statHTML='<span style="color:var(--text-dim);">🔒</span>';
            else{
              const keys=p.isPitcher?['stuff','control','velocity','movement','stamina','clutch']:['contact','power','eye','speed','fielding','arm'];
              statHTML=keys.map(k=>{
                const v=info.stats[k];
                if(Array.isArray(v)) return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statColor(Math.round((v[0]+v[1])/2))};margin:0 1px;" title="${v[0]}~${v[1]}"></span>`;
                return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statColor(v)};margin:0 1px;" title="${v}"></span>`;
              }).join('');
            }
            // 잠재력
            let potHTML='';
            if(info.pot!=null) potHTML=`<span style="color:${info.pot>=15?'#a855f7':info.pot>=12?'#10b981':'#f59e0b'};font-weight:700;">${info.pot}</span>`;
            else if(info.potRange) potHTML=`<span style="color:var(--text-dim);">${info.potRange[0]}~${info.potRange[1]}</span>`;
            else if(info.potHint) potHTML=`<span style="color:var(--text-dim);font-size:0.65rem;">${info.potHint}</span>`;
            else potHTML='<span style="color:var(--text-dim);">?</span>';
            // 특수 정보
            let specialHTML='';
            if(info.durability!=null) specialHTML+=`<span style="color:${info.durability>=12?'#10b981':info.durability>=8?'#f59e0b':'#ef4444'};font-size:0.6rem;" title="내구성">💪${info.durability}</span> `;
            if(info.consistency!=null) specialHTML+=`<span style="font-size:0.6rem;" title="꾸준함">📊${info.consistency}</span> `;
            if(info.clutchHidden!=null) specialHTML+=`<span style="font-size:0.6rem;" title="클러치">🔥${info.clutchHidden}</span> `;
            if(info.workEthic!=null) specialHTML+=`<span style="font-size:0.6rem;" title="프로의식">🧠${info.workEthic}</span> `;
            else if(info.workEthicRange) specialHTML+=`<span style="color:var(--text-dim);font-size:0.6rem;" title="프로의식">🧠${info.workEthicRange[0]}~${info.workEthicRange[1]}</span> `;
            if(!specialHTML) specialHTML='<span style="color:var(--text-dim);font-size:0.6rem;">-</span>';
            // 스카우트 버튼
            const scoutBtn=isDeep
              ?`<span style="color:#10b981;font-size:0.6rem;">✅ 완료</span>`
              :tickets>0
              ?`<button class="btn btn-sm" onclick="deepScoutPlayer('${p._uid}')" style="font-size:0.58rem;padding:2px 6px;background:#1e3a5f;color:#60a5fa;">🔍 스카우트</button>`
              :`<span style="color:var(--text-dim);font-size:0.58rem;">티켓 없음</span>`;

            return `<tr style="${isDeep?'background:rgba(16,185,129,0.05);':''}">
              <td style="color:var(--text-dim);">${i+1}</td>
              <td style="text-align:left;"><span class="player-name" style="font-size:0.72rem;">${p.name}</span>${isDeep?'<span style="color:#10b981;font-size:0.55rem;margin-left:3px;">🔍</span>':''}</td>
              <td><span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.55rem;padding:1px 4px;">${ALL_POS_NAMES[p.pos]||p.pos}</span></td>
              <td style="color:var(--text-dim);">${p.age||18}</td>
              <td>${ovrHTML}</td>
              <td>${statHTML}</td>
              <td>${potHTML}</td>
              <td>${specialHTML}</td>
              <td>${scoutBtn}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

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
