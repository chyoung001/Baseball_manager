// ===================== CONTRACTS SALARY (재계약·연봉 협상 — 스토브리그 유저 페이즈) =====================
// 연봉 산정(_calcNewSalary: 신인 슬롯 → Arb → FA 단계)과 재계약/연봉 협상 UI

// ── 재계약 협상 ─────────────────────────────────────────────────
function _showRenewalNegotiation(){
  const renewals=G._renewalCandidates||[];
  if(renewals.length===0){showToast('재계약 대상 선수가 없습니다.');showStoveLeague();return;}

  // 총 예상 비용
  const totalExpCost=renewals.reduce((s,p)=>{const e=getExpectedContract(p,'renewal');return s+e.salary*e.years;},0);

  $('modalTitle').textContent='';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:0.92rem;font-weight:700;color:var(--text);">📝 재계약 협상</div>
        <div style="display:flex;gap:10px;font-size:0.65rem;color:var(--text-dim);">
          <span>대상 <b style="color:var(--accent);">${renewals.length}명</b></span>
          <span>예상 총액 <b style="color:#f59e0b;">~${won(+totalExpCost.toFixed(1))}</b></span>
        </div>
      </div>

      <!-- 안내 -->
      <div style="background:rgba(245,158,11,0.06);border:1px solid #f59e0b22;border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:0.68rem;color:var(--text-dim);">
        선수를 클릭하여 계약 조건을 협상하세요. 협상 결렬 시 FA 시장으로 이동합니다.
      </div>

      <!-- 선수 목록 -->
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
        ${renewals.map((p,i)=>{
          const o=ovr(p);const exp=getExpectedContract(p,'renewal');const w=approxWAR(p);
          return `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#111827;border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='var(--border)'" onclick="_startRenewalNego(${i})">
            <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.6rem;padding:2px 8px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
            <div style="flex:1;">
              <div class="player-name" style="font-size:0.78rem;">${p.name}</div>
              <div style="font-size:0.58rem;color:var(--text-dim);">${p.age||22}세 · WAR ${w.toFixed(1)} · 서비스 ${p._serviceTime||0}yr</div>
            </div>
            <span style="color:${statColor(o)};font-weight:800;font-size:0.88rem;font-family:'JetBrains Mono',monospace;">${o}</span>
            <div style="text-align:right;min-width:80px;">
              <div style="color:#f59e0b;font-size:0.72rem;font-weight:700;">~${won(exp.salary)} × ${exp.years}년</div>
              <div style="font-size:0.55rem;color:var(--text-dim);">에이전트 요구</div>
            </div>
            <button class="btn btn-sm" onclick="_declineRenewal(${i});event.stopPropagation();" style="font-size:0.55rem;padding:3px 8px;background:rgba(239,68,68,0.08);border:1px solid #ef444433;color:#ef4444;border-radius:6px;">방출</button>
            <span style="color:var(--text-dim);font-size:0.72rem;">›</span>
          </div>`;
        }).join('')}
      </div>

      <!-- 하단 버튼 -->
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" onclick="_declineAllRenewals();" style="flex:1;color:#ef4444;border-color:#ef444433;">전체 방출</button>
        <button class="btn btn-secondary" onclick="showStoveLeague();" style="flex:1;padding:10px;">← 돌아가기</button>
      </div>
    </div>`;
  $('seasonModal').classList.add('active');
}

function _startRenewalNego(idx){
  const renewals=G._renewalCandidates||[];
  const p=renewals[idx];if(!p)return;

  showNegotiationModal(p,'renewal',
    function onAccept(salary,years){
      p.salary=salary;p._contractYears=years;p._contractEvent=null;
      G._renewalCandidates=(G._renewalCandidates||[]).filter(c=>c!==p);
      showToast(`✅ ${p.name} 재계약! (${won(salary)} × ${years}년)`);
      saveGame();
      if((G._renewalCandidates||[]).length>0)_showRenewalNegotiation();
      else showStoveLeague();
    },
    function onFail(reason){
      if(reason==='cancel'){_showRenewalNegotiation();return;}
      // 결렬 → FA 방출
      p._fromTeam=G.myTeam.name;p._fromTeamEmoji=G.myTeam.emoji;
      p._teamTenure=0;
      G.faPool.push(p);
      G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
      G._renewalCandidates=(G._renewalCandidates||[]).filter(c=>c!==p);
      showToast(`❌ ${p.name} 협상 결렬 → FA 이동`);
      saveGame();
      if((G._renewalCandidates||[]).length>0)_showRenewalNegotiation();
      else showStoveLeague();
    }
  );
}

function _declineRenewal(idx){
  const renewals=G._renewalCandidates||[];
  const p=renewals[idx];if(!p)return;
  p._fromTeam=G.myTeam.name;p._fromTeamEmoji=G.myTeam.emoji;
  p._teamTenure=0;
  G.faPool.push(p);
  G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
  G._renewalCandidates=renewals.filter(c=>c!==p);
  showToast(`❌ ${p.name} FA 방출`);saveGame();
  if((G._renewalCandidates||[]).length>0)_showRenewalNegotiation();
  else showStoveLeague();
}

function _declineAllRenewals(){
  const renewals=G._renewalCandidates||[];
  renewals.forEach(p=>{
    p._fromTeam=G.myTeam.name;p._fromTeamEmoji=G.myTeam.emoji;
    p._teamTenure=0;
    G.faPool.push(p);
    G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
  });
  G._renewalCandidates=[];
  showToast(`❌ 전체 FA 방출 (${renewals.length}명)`);
  showStoveLeague();saveGame();
}

// ── 연봉 협상 ───────────────────────────────────────────────────
function _calcNewSalary(p){
  const pOvr=ovr(p);
  const war=approxWAR(p);
  const st=p._serviceTime||0;
  const oldSalary=p.salary||0;
  const phase=getContractPhase(p);
  let newSalary;

  if(phase==='pre'){
    // 프리아브: 신인 계약 연봉 유지 (슬롯 연봉 3년 고정, 인상 없음)
    newSalary=Math.max(PRE_ARB_SALARY,oldSalary);
  }else if(phase==='arb'){
    // P2-3 연봉조정 (Arbitration): 연차별 설계 인상률
    // Arb1 = 성적 기반 베이스라인 / Arb2 = 전년 120~180% / Arb3+ = 전년 110~150%
    // 연차는 명시적 카운터(_arbYears, 호출부에서 시즌당 1회 증가) — floor(서비스타임) 파생 시
    // 슈퍼2 진입 기준이 뒤바뀌거나 부분 출전으로 연차가 정체되는 버그가 있어 교체
    const arbYear=Math.max(1,p._arbYears||1);
    if(arbYear<=1||oldSalary<=PRE_ARB_SALARY*1.5){
      newSalary=_calcSalary(pOvr,ARB_MIN_SERVICE,p._super2); // 베이스라인 (전년 연봉 무관)
    }else if(arbYear===2){
      newSalary=+(oldSalary*(rand(120,180)/100)).toFixed(1);
    }else{
      newSalary=+(oldSalary*(rand(110,150)/100)).toFixed(1);
    }
    if(war>=3)newSalary=+(newSalary*1.15).toFixed(1);
    newSalary=Math.max(SALARY_MIN,+newSalary);
  }else{
    // FA 자격자: 자유 시장 가치 기반
    if(pOvr>=75)newSalary=+(oldSalary*1.3+rand(5,20)*0.1).toFixed(1);
    else if(pOvr>=59)newSalary=+(oldSalary*1.1+rand(2,10)*0.1).toFixed(1);
    else if(pOvr>=37)newSalary=oldSalary;
    else newSalary=Math.max(SALARY_MIN,+(oldSalary*0.85).toFixed(1));
    if(war>=3)newSalary=+(newSalary*1.15).toFixed(1);
    else if(war<0.5&&pOvr<47)newSalary=Math.max(SALARY_MIN,+(newSalary-0.5).toFixed(1));
  }
  // 팀 컨셉 연봉 배율
  if(G.myTeam.concept==='pitching')newSalary=+(newSalary*1.05).toFixed(1);
  if(G.myTeam.concept==='prospect')newSalary=+(newSalary*1.10).toFixed(1);
  return +newSalary;
}

function _getSalaryPhase(p){
  const ph=getContractPhase(p);
  if(ph==='pre')return'프리아브';
  if(ph==='arb')return(p._super2&&(p._serviceTime||0)<ARB_MIN_SERVICE)?'연봉조정(슈퍼2)':'연봉조정';
  return'FA자격';
}

function _showSalaryNegotiation(){
  const t=G.myTeam;
  // 프리아브/연봉조정: 자동 조정
  const autoAdjust=[];
  // FA 자격: 개별 협상 대상
  const faPlayers=[];

  t.roster.forEach(p=>{
    const phase=_getSalaryPhase(p);
    if(phase==='FA자격'){
      faPlayers.push(p);
      return;
    }
    // 프리아브/연봉조정 자동 조정은 시즌당 1회만 — 재진입 시 복리 인상 방지
    if(p._salaryAdjSeason===G.season)return;
    // P2-3 Arb 연차 누적 (슈퍼2 조기 진입 포함, 서비스타임과 독립)
    if(getContractPhase(p)==='arb')p._arbYears=(p._arbYears||0)+1;
    const oldSalary=p.salary||0;
    const newSalary=_calcNewSalary(p);
    if(newSalary!==oldSalary){
      autoAdjust.push({p,oldSalary,newSalary,phase});
    }
    p._salaryAdjSeason=G.season;
  });

  // 프리아브/연봉조정 자동 적용
  autoAdjust.forEach(a=>{a.p.salary=a.newSalary;});

  // 자동 조정 요약
  const totalUp=autoAdjust.filter(a=>a.newSalary>a.oldSalary);
  const totalDown=autoAdjust.filter(a=>a.newSalary<a.oldSalary);
  const diffSum=autoAdjust.reduce((s,a)=>s+(a.newSalary-a.oldSalary),0);

  $('modalTitle').textContent='';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:0.92rem;font-weight:700;color:var(--text);">💰 연봉 협상</div>
        <div style="font-size:0.65rem;color:var(--text-dim);">시즌 ${G.season||1}</div>
      </div>

      ${autoAdjust.length>0?`
      <!-- 자동 조정 요약 카드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:#111827;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.58rem;color:var(--text-dim);">조정 인원</div>
          <div style="font-size:1rem;font-weight:700;color:var(--text);">${autoAdjust.length}명</div>
        </div>
        <div style="background:#111827;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.58rem;color:var(--text-dim);">인상 / 감봉</div>
          <div style="font-size:0.82rem;font-weight:700;"><span style="color:#ef4444;">${totalUp.length}</span> / <span style="color:#10b981;">${totalDown.length}</span></div>
        </div>
        <div style="background:#111827;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.58rem;color:var(--text-dim);">총 변동</div>
          <div style="font-size:0.82rem;font-weight:700;color:${diffSum>0?'#ef4444':'#10b981'};">${diffSum>0?'+':''}${won(+diffSum.toFixed(1))}</div>
        </div>
      </div>

      <!-- 자동 조정 상세 테이블 -->
      <div style="background:#111827;border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:14px;">
        <div style="font-size:0.68rem;color:var(--accent);margin-bottom:8px;">자동 조정 완료 (프리아브 / 연봉조정)</div>
        <div style="max-height:180px;overflow-y:auto;scrollbar-width:none;">
          <table class="data-table" style="font-size:0.7rem;">
            <thead><tr><th>포지션</th><th>이름</th><th>단계</th><th>OVR</th><th>변경</th><th>차액</th></tr></thead>
            <tbody>${autoAdjust.map(a=>{
              const diff=a.newSalary-a.oldSalary;
              const o=ovr(a.p);
              return '<tr>'+
                '<td><span class="pos-badge'+(a.p.isPitcher?' pitcher':'')+'" style="font-size:0.5rem;padding:1px 4px;">'+(ALL_POS_NAMES[a.p.pos]||a.p.pos)+'</span></td>'+
                '<td class="player-name" style="font-size:0.7rem;">'+a.p.name+'</td>'+
                '<td style="color:'+(a.phase==='프리아브'?'#67e8f9':'#f59e0b')+';font-size:0.6rem;">'+a.phase+'</td>'+
                '<td style="color:'+statColor(o)+';font-weight:700;">'+o+'</td>'+
                '<td style="font-family:JetBrains Mono,monospace;">'+won(a.oldSalary)+' → <b>'+won(a.newSalary)+'</b></td>'+
                '<td style="color:'+(diff>0?'#ef4444':'#10b981')+';font-family:JetBrains Mono,monospace;font-weight:700;">'+(diff>0?'+':'')+won(+diff.toFixed(1))+'</td></tr>';
            }).join('')}</tbody>
          </table>
        </div>
      </div>`:''}

      ${faPlayers.length>0?`
      <!-- FA 자격 선수 개별 협상 -->
      <div style="background:#111827;border:1px solid #10b98133;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:0.72rem;color:#10b981;font-weight:700;">FA 자격 선수 — 개별 협상</div>
          <div style="font-size:0.6rem;color:var(--text-dim);">${faPlayers.length}명</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${faPlayers.map(p=>{
            const o=ovr(p);
            const w=approxWAR(p);
            return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#0a0e1a;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='#10b981'" onmouseout="this.style.borderColor='var(--border)'" onclick="_startSalaryNego(${t.roster.indexOf(p)})">
              <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.55rem;padding:2px 6px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
              <div style="flex:1;">
                <div class="player-name" style="font-size:0.75rem;">${p.name}</div>
                <div style="font-size:0.58rem;color:var(--text-dim);">${p.age||22}세 · WAR ${w.toFixed(1)}</div>
              </div>
              <span style="color:${statColor(o)};font-weight:800;font-size:0.85rem;font-family:'JetBrains Mono',monospace;">${o}</span>
              <div style="text-align:right;min-width:60px;">
                <div style="color:var(--accent);font-size:0.75rem;font-weight:700;">${won(p.salary||0)}</div>
                <div style="font-size:0.55rem;color:var(--text-dim);">현재 연봉</div>
              </div>
              <span style="color:var(--text-dim);font-size:0.72rem;">›</span>
            </div>`;
          }).join('')}
        </div>
      </div>`:'<div style="background:#111827;border-radius:10px;padding:16px;text-align:center;color:var(--text-dim);font-size:0.72rem;margin-bottom:14px;">FA 자격 선수가 없습니다.</div>'}

      <button class="btn btn-secondary" onclick="showStoveLeague();" style="width:100%;padding:10px;">← 돌아가기</button>
    </div>`;
  $('seasonModal').classList.add('active');
  saveGame();
}

function _startSalaryNego(rosterIdx){
  const p=G.myTeam.roster[rosterIdx];if(!p)return;
  showNegotiationModal(p,'salary',
    function onAccept(salary,years){
      p.salary=salary;p._contractYears=years;
      showToast(`✅ ${p.name} 연봉 합의! (${won(salary)} × ${years}년)`);
      saveGame();_showSalaryNegotiation();
    },
    function onFail(){_showSalaryNegotiation();}
  );
}

