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
