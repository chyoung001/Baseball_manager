// ===================== ANALYSIS — 계약 현황 =====================
// 의존: helpers.js (ovr, statColor, won, $), constants.js (ALL_POS_NAMES, PRE_ARB_MAX_SERVICE, ARB_MAX_SERVICE, MAX_OPTION_YEARS), invest.js (getPayroll, getLuxuryTaxLine, getHardCap, getLuxuryTax)

let _contractFilter='all';
let _contractSortKey='salary';
let _contractSortAsc=false;
function _setContractFilter(f){_contractFilter=f;renderAnalysisContracts();}
function _toggleContractSort(key){
  if(_contractSortKey===key) _contractSortAsc=!_contractSortAsc;
  else { _contractSortKey=key; _contractSortAsc=(key==='name'); }
  // tbody만 교체 (전체 리렌더링 회피)
  const tbody=document.getElementById('contractTbody');
  if(tbody){
    tbody.innerHTML=_renderContractRows(_getFilteredContracts());
    _updateContractSortHeaders();
  } else {
    renderAnalysisContracts();
  }
}

// 옵션 남은 횟수를 동그라미 아이콘으로 변환
function _optionDots(p){
  const used=p._optionYearsUsed||0;
  const remaining=Math.max(0,MAX_OPTION_YEARS-used);
  let dots='';
  for(let i=0;i<MAX_OPTION_YEARS;i++){
    if(i<remaining) dots+='<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10b981;margin:0 1px;"></span>';
    else dots+='<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#374151;border:1px solid #4b5563;margin:0 1px;"></span>';
  }
  return dots;
}

// 계약 단계 라벨
function _contractPhaseLabel(p){
  const st=p._serviceTime||0;
  if(st<=PRE_ARB_MAX_SERVICE) return '<span style="color:#67e8f9;">최저연봉</span>';
  if(st<=ARB_MAX_SERVICE) return '<span style="color:#f59e0b;">연봉조정</span>';
  return '<span style="color:#10b981;">FA자격</span>';
}

// 필터링+정렬된 계약 현황 배열 반환
function _getFilteredContracts(){
  const allRoster=[...G.myTeam.roster];
  let filtered;
  if(_contractFilter==='if')      filtered=allRoster.filter(p=>!p.isPitcher&&['1B','2B','3B','SS'].includes(p._naturalPos||p.pos));
  else if(_contractFilter==='of') filtered=allRoster.filter(p=>!p.isPitcher&&['LF','CF','RF'].includes(p._naturalPos||p.pos));
  else if(_contractFilter==='c')  filtered=allRoster.filter(p=>!p.isPitcher&&(p._naturalPos||p.pos)==='C');
  else if(_contractFilter==='sp') filtered=allRoster.filter(p=>p.isPitcher&&(p.role==='rotation'||p.pos==='SP'));
  else if(_contractFilter==='bp') filtered=allRoster.filter(p=>p.isPitcher&&p.role!=='rotation'&&p.pos!=='SP');
  else filtered=allRoster;
  if(_contractFilter==='all'){
    const dhOrphans=allRoster.filter(p=>p.pos==='DH'&&!p._naturalPos&&!filtered.includes(p));
    filtered=filtered.concat(dhOrphans);
  }
  const sortVal=(p)=>{
    switch(_contractSortKey){
      case 'name': return p.name||'';
      case 'pos': return p.pos||'';
      case 'age': return p.age||0;
      case 'status': return (p.status||'active')==='active'?0:p.status==='futures'?1:p.status==='developmental'?2:3;
      case 'ovr': return ovr(p);
      case 'salary': return p.salary||0;
      case 'service': return p._serviceTime||0;
      case 'phase': return (p._serviceTime||0)<=PRE_ARB_MAX_SERVICE?0:(p._serviceTime||0)<=ARB_MAX_SERVICE?1:2;
      case 'contract': return p._contractYears||1;
      case 'tenure': return p._teamTenure||0;
      case 'option': return MAX_OPTION_YEARS-(p._optionYearsUsed||0);
      default: return 0;
    }
  };
  filtered.sort((a,b)=>{
    const va=sortVal(a),vb=sortVal(b);
    const cmp=typeof va==='string'?va.localeCompare(vb):va-vb;
    return _contractSortAsc?cmp:-cmp;
  });
  return filtered;
}

// tbody 행 HTML 생성
function _renderContractRows(filtered){
  return filtered.map(p=>{
    const o=ovr(p);
    const st=p._serviceTime||0;
    const tenure=p._teamTenure||0;
    const contract=p._contractYears||1;
    const status=(p.status||'active')==='active'?'1군':p.status==='futures'?'2군':p.status==='developmental'?'육성':p.status==='il'?'IL':p.status;
    const statusColor=status==='1군'?'var(--accent2)':status==='2군'?'#67e8f9':status==='IL'?'#ef4444':'var(--text-dim)';
    return `<tr>
      <td style="text-align:left;"><span class="player-name" style="font-size:0.72rem;">${p.name}</span></td>
      <td><span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.55rem;padding:1px 4px;">${ALL_POS_NAMES[p.pos]||p.pos}</span></td>
      <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||'??'}</td>
      <td style="color:${statusColor};font-size:0.65rem;">${status}</td>
      <td style="color:${statColor(o)};font-weight:800;font-size:0.82rem;font-family:'JetBrains Mono',monospace;text-shadow:0 0 8px ${statColor(o)}44;">${o}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:0.8rem;color:var(--accent);">${won(p.salary||0)}</td>
      <td style="font-family:'JetBrains Mono',monospace;">${st}yr</td>
      <td style="font-size:0.65rem;">${_contractPhaseLabel(p)}</td>
      <td style="font-family:'JetBrains Mono',monospace;color:${contract<=1?'#ef4444':'var(--text)'};">${contract}년</td>
      <td style="font-family:'JetBrains Mono',monospace;">${tenure}yr</td>
      <td style="font-size:0.6rem;">${_optionDots(p)}</td>
      <td style="font-size:0.6rem;">
        ${p.canDebutYear&&p.canDebutYear>G.season?'<span style="color:#a855f7;">S'+p.canDebutYear+'데뷔</span>':''}
      </td>
    </tr>`;
  }).join('');
}

// 정렬 헤더 화살표만 업데이트
function _updateContractSortHeaders(){
  document.querySelectorAll('#contractThead th[data-sort]').forEach(th=>{
    const key=th.dataset.sort;
    const label=th.dataset.label;
    if(_contractSortKey===key){
      th.textContent=label+(_contractSortAsc?' ▲':' ▼');
      th.style.color='var(--accent)';
    } else {
      th.textContent=label;
      th.style.color='';
    }
  });
}

function renderAnalysisContracts() {
  const t = G.myTeam;
  const totalPayroll = getPayroll(t);
  const luxLine = getLuxuryTaxLine();
  const hardCap = getHardCap();
  const luxTax = getLuxuryTax(t);
  const filtered = _getFilteredContracts();

  function cfb(key,label){
    const active=_contractFilter===key;
    return `<span onclick="_setContractFilter('${key}')" style="cursor:pointer;padding:3px 10px;border-radius:4px;font-size:0.68rem;border:1px solid ${active?'var(--accent)':'var(--border)'};color:${active?'var(--accent)':'var(--text-dim)'};background:${active?'rgba(245,158,11,0.1)':'transparent'};">${label}</span>`;
  }

  function sortTh(key,label){
    const isActive=_contractSortKey===key;
    const arrow=isActive?(_contractSortAsc?' ▲':' ▼'):'';
    const style='cursor:pointer;user-select:none;'+(isActive?'color:var(--accent);':'');
    return `<th data-sort="${key}" data-label="${label}" style="${style}" onclick="_toggleContractSort('${key}')">${label}${arrow}</th>`;
  }

  $('analysisContent').innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-title">💰 페이롤 요약</div>
      <div class="finance-grid" style="margin-bottom:12px;">
        <div class="finance-item">
          <div class="finance-label">총 페이롤</div>
          <div class="finance-value" style="color:${totalPayroll > luxLine ? '#ef4444' : 'var(--accent)'};">${won(totalPayroll)}</div>
        </div>
        <div class="finance-item">
          <div class="finance-label">사치세 라인</div>
          <div class="finance-value">${won(luxLine)}</div>
        </div>
        <div class="finance-item">
          <div class="finance-label">하드캡</div>
          <div class="finance-value">${won(hardCap)}</div>
        </div>
        <div class="finance-item">
          <div class="finance-label">사치세</div>
          <div class="finance-value" style="color:${luxTax > 0 ? '#ef4444' : '#10b981'};">${luxTax > 0 ? '-' + won(luxTax) : '없음'}</div>
        </div>
      </div>
      <div style="display:flex;gap:16px;font-size:0.72rem;color:var(--text-dim);flex-wrap:wrap;">
        <span>1군: ${t.roster.filter(p => (p.status || 'active') === 'active').length}명</span>
        <span>2군: ${t.roster.filter(p => p.status === 'futures').length}명</span>
        <span>육성: ${t.roster.filter(p => p.status === 'developmental').length}명</span>
        <span>IL: ${t.roster.filter(p => p.status === 'il').length}명</span>
        <span>총원: ${t.roster.length}명</span>
      </div>
    </div>
    <div class="card">
      <div class="card-title">📋 계약 현황</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        ${cfb('all','전체')}
        ${cfb('if','🧤 내야수')}
        ${cfb('of','🏃 외야수')}
        ${cfb('c','🎯 포수')}
        ${cfb('sp','🔥 선발')}
        ${cfb('bp','🛡️ 불펜')}
      </div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:8px;">${filtered.length}명 표시</div>
      ${filtered.length===0?'<div style="color:var(--text-dim);text-align:center;padding:20px;">해당 포지션 선수가 없습니다.</div>':`
      <div style="overflow-x:auto;">
        <table class="data-table" style="font-size:0.72rem;">
          <thead id="contractThead"><tr>
            ${sortTh('name','이름')}
            ${sortTh('pos','포지션')}
            ${sortTh('age','나이')}
            ${sortTh('status','상태')}
            ${sortTh('ovr','OVR')}
            ${sortTh('salary','연봉')}
            ${sortTh('service','서비스')}
            ${sortTh('phase','단계')}
            ${sortTh('contract','계약')}
            ${sortTh('tenure','팀재적')}
            ${sortTh('option','옵션')}
            <th>비고</th>
          </tr></thead>
          <tbody id="contractTbody">${_renderContractRows(filtered)}</tbody>
        </table>
      </div>`}
    </div>`;
}
