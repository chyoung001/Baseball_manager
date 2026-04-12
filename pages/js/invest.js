// ===================== INVESTMENT SCREEN =====================
let currentInvestTab = 'finance';

function switchInvestTab(tab) {
  currentInvestTab = tab;
  document.querySelectorAll('#investScreen .roster-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  renderInvest();
}

function renderInvest() {
  if(currentInvestTab === 'finance')   renderInvestFinance();
  if(currentInvestTab === 'infra')     renderInvestInfra();
  if(currentInvestTab === 'coaching')  renderInvestCoaching();
  // 팬 이벤트 삭제됨
  if(currentInvestTab === 'overseas')  renderInvestOverseas();
  if(currentInvestTab === 'scoutcamp') renderInvestScoutCamp();
  if(currentInvestTab === 'medical')   renderInvestMedicalCenter();
}

// ===================== 💰 재정 =====================
function renderInvestFinance() {
  const t = G.myTeam;
  const payroll = getPayroll(t);
  const luxTax = getLuxuryTax(t);
  const overHard = payroll >= getHardCap();
  const overSoft = payroll > getLuxuryTaxLine();
  const stadMult = (1 + (t.stadiumLevel || 0) * STADIUM_REVENUE_BONUS).toFixed(2);

  const sortedRoster = [...t.roster].sort((a, b) => (b.salary || 0) - (a.salary || 0));

  $('investContent').innerHTML = `
    <div class="card">
      <div class="card-title">▸ FA & 페이롤 현황</div>
      <div class="finance-grid" style="margin-bottom:12px;">
        <div class="finance-item">
          <div class="finance-label">총 페이롤</div>
          <div class="finance-value" style="color:${overHard?'#ef4444':overSoft?'#f97316':'var(--accent2)'};">${won(payroll)}</div>
          <div style="font-size:0.65rem;color:var(--text-dim);margin-top:2px;">소프트 ${won(getLuxuryTaxLine())} / 한도 ${won(getHardCap())}</div>
        </div>
        <div class="finance-item">
          <div class="finance-label">시즌 사치세</div>
          <div class="finance-value" style="color:${luxTax>0?'#ef4444':'var(--accent2)'};">${luxTax > 0 ? '-'+won(luxTax) : '없음'}</div>
          <div style="font-size:0.65rem;color:var(--text-dim);margin-top:2px;">초과분 × 50%</div>
        </div>
        <div class="finance-item">
          <div class="finance-label">경기장 수익 배율</div>
          <div class="finance-value" style="color:var(--accent);">×${stadMult}</div>
          <div style="font-size:0.65rem;color:var(--text-dim);margin-top:2px;">구장 Lv.${t.stadiumLevel || 0}/5</div>
        </div>
        <div class="finance-item">
          <div class="finance-label">보유 자금</div>
          <div class="finance-value" style="color:var(--accent);">💰 ${won(t.budget)}</div>
        </div>
      </div>
      ${overHard ? `<div class="invest-warning">🚫 하드 캡(${won(getHardCap())}) 초과! 신규 선수 영입이 불가합니다.</div>` : ''}
      ${overSoft && !overHard ? `<div class="invest-warning" style="border-color:#f97316;color:#f97316;background:rgba(249,115,22,0.08);">⚠️ 사치세 구간! 초과분 ${won(payroll - getLuxuryTaxLine())} × 50% = <strong>${won(luxTax)}</strong>이 시즌 수익에서 차감됩니다.</div>` : ''}

      <div class="card-title" style="margin-top:14px;">▸ 선수 연봉 내역</div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>이름</th><th>포지션</th><th>나이</th><th>역할</th><th>OVR</th><th>연봉</th></tr></thead>
          <tbody>
            ${sortedRoster.map(p => `
              <tr>
                <td><span class="player-name">${p.name}</span></td>
                <td><span class="pos-badge${p.isPitcher ? ' pitcher' : ''}">${ALL_POS_NAMES[p.pos] || p.pos}</span></td>
                <td style="color:var(--text-dim);font-size:0.72rem;">${p.age||22}</td>
                <td>${p.role === 'overseas' ? '<span style="color:#67e8f9;">✈️ 해외연수</span>'
                    : p.isPitcher ? (p.role === 'rotation' ? '선발' : '불펜')
                    : (p.role === 'starting' ? '선발' : '후보')}</td>
                <td style="color:${statColor(ovr(p))};font-weight:700;">${ovr(p)}</td>
                <td style="color:var(--accent);font-weight:700;font-family:'JetBrains Mono',monospace;">${won(p.salary || 0)}</td>
              </tr>`).join('')}
            <tr style="border-top:2px solid var(--border);">
              <td colspan="5" style="color:var(--text-dim);font-size:0.72rem;">합계</td>
              <td style="color:${overSoft?'#ef4444':'var(--accent)'};font-weight:700;font-family:'JetBrains Mono',monospace;">${won(payroll)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

// ===================== 🏗️ 인프라 & 시설 =====================
function renderInvestInfra() {
  const t = G.myTeam;
  const stadLv  = t.stadiumLevel || 0;
  const medLv   = t.medicalLevel || 0;
  const scLv    = t.scoutingLevel || 0;
  const aLv     = t.analyticsLevel || 0;
  const medDrop = Math.floor(medLv / 20);

  const facilityCards = FACILITIES.map((f, i) => {
    const lv = t[f.key];
    const c  = upgradeCost(lv);
    const g  = upgradeEfficiency(lv);
    return `<div class="facility-card" onclick="investUpgradeFacility(${i})">
      <div class="facility-icon">${f.icon}</div>
      <div class="facility-name">${f.name}</div>
      <div class="facility-desc">${f.desc}</div>
      <div class="prog-bar" style="margin-top:8px;">
        <div class="prog-bar-fill" style="width:${lv}%;background:${statColor(lv)};"></div>
      </div>
      <div class="facility-level">Lv.${lv}/100</div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-top:4px;">
        ${lv >= 100
          ? '<span style="color:#4ade80;">✅ 최대 레벨</span>'
          : `💰 ${won(c)} → +${g} ${lv>=80 ? '<span style="color:#ef4444;">(효율↓)</span>' : ''}`}
      </div>
    </div>`;
  }).join('');

  $('investContent').innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-title">▸ 구단 인프라</div>
      <div class="facility-grid">

        <div class="facility-card" onclick="investUpgradeStadium()">
          <div class="facility-icon">🏟️</div>
          <div class="facility-name">경기장 확장</div>
          <div class="facility-desc">시즌 수익 영구 +${STADIUM_REVENUE_BONUS*100}%/레벨</div>
          <div class="prog-bar" style="margin-top:8px;">
            <div class="prog-bar-fill" style="width:${stadLv/STADIUM_MAX_LEVEL*100}%;background:${statColor(stadLv/STADIUM_MAX_LEVEL*100)};"></div>
          </div>
          <div class="facility-level">Lv.${stadLv}/${STADIUM_MAX_LEVEL}</div>
          <div style="font-size:0.7rem;color:var(--accent2);margin-top:4px;">
            수익 배율 ×${(1+stadLv*STADIUM_REVENUE_BONUS).toFixed(2)}${stadLv < STADIUM_MAX_LEVEL ? ` → ×${(1+(stadLv+1)*STADIUM_REVENUE_BONUS).toFixed(2)}` : ''}
          </div>
          <div style="font-size:0.68rem;color:var(--text-dim);margin-top:4px;">
            ${stadLv >= STADIUM_MAX_LEVEL ? '<span style="color:#4ade80;">✅ 최대 레벨</span>' : `💰 ${won((stadLv+1)*STADIUM_COST_PER_LEVEL)} → 레벨 업`}
          </div>
        </div>

        <div class="facility-card" onclick="investUpgradeMedical()">
          <div class="facility-icon">🏥</div>
          <div class="facility-name">의료·재활 센터</div>
          <div class="facility-desc">경기 후 컨디션 저하 감소, 부상 방어</div>
          <div class="prog-bar" style="margin-top:8px;">
            <div class="prog-bar-fill" style="width:${medLv}%;background:${statColor(medLv)};"></div>
          </div>
          <div class="facility-level">Lv.${medLv}/100</div>
          <div style="font-size:0.7rem;color:var(--accent2);margin-top:4px;">컨디션 저하 -${medDrop} (범위 ${Math.max(1,2-medDrop)}~${Math.max(1,5-medDrop)})</div>
          <div style="font-size:0.68rem;color:var(--text-dim);margin-top:4px;">
            ${medLv >= 100 ? '<span style="color:#4ade80;">✅ 최대 레벨</span>' : `💰 ${won(upgradeCost(medLv))} → +${upgradeEfficiency(medLv)} ${medLv>=80?'<span style="color:#ef4444;">(효율↓)</span>':''}`}
          </div>
        </div>

        <div class="facility-card" onclick="investUpgradeScouting()">
          <div class="facility-icon">🔍</div>
          <div class="facility-name">스카우트팀</div>
          <div class="facility-desc">드래프트 유망주 평가 · 잠재력 추정</div>
          <div class="prog-bar" style="margin-top:8px;">
            <div class="prog-bar-fill" style="width:${scLv}%;background:${statColor(scLv)};"></div>
          </div>
          <div class="facility-level">Lv.${scLv}/100</div>
          <div style="font-size:0.7rem;color:var(--accent2);margin-top:4px;">
            ${scLv>=90?'🏆 스틸픽 감지':scLv>=80?'📊 POT 정확 수치':scLv>=60?'📈 POT 범위 공개':scLv>=30?'💬 POT 힌트':'🔒 비공개'}
          </div>
          <div style="font-size:0.68rem;color:var(--text-dim);margin-top:4px;">
            ${scLv >= 100 ? '<span style="color:#4ade80;">✅ 최대 레벨</span>' : `💰 ${won(deptUpgradeCost(scLv))} → +${deptUpgradeEfficiency(scLv)} ${scLv>=80?'<span style="color:#ef4444;">(효율↓)</span>':''}`}
          </div>
        </div>

        <div class="facility-card" onclick="investUpgradeAnalytics()">
          <div class="facility-icon">📊</div>
          <div class="facility-name">데이터 분석팀</div>
          <div class="facility-desc">FA 시장 분석 · 히든 스탯 · 연봉 협상</div>
          <div class="prog-bar" style="margin-top:8px;">
            <div class="prog-bar-fill" style="width:${aLv}%;background:${statColor(aLv)};"></div>
          </div>
          <div class="facility-level">Lv.${aLv}/100</div>
          <div style="font-size:0.7rem;color:var(--accent2);margin-top:4px;">
            ${aLv>=90?'🏆 전체 히든스탯 공개':aLv>=80?'📊 꾸준함 공개':aLv>=60?'✅ 정확 스탯 + 내구성':aLv>=30?'🔎 범위 공개':'🔒 비공개'}
          </div>
          <div style="font-size:0.68rem;color:var(--text-dim);margin-top:4px;">
            ${aLv >= 100 ? '<span style="color:#4ade80;">✅ 최대 레벨</span>' : `💰 ${won(deptUpgradeCost(aLv))} → +${deptUpgradeEfficiency(aLv)} ${aLv>=80?'<span style="color:#ef4444;">(효율↓)</span>':''}`}
          </div>
        </div>

      </div>
    </div>

    <div class="card">
      <div class="card-title">▸ 시설</div>
      <div style="margin-bottom:10px;font-size:0.72rem;color:var(--text-dim);">구단 운영 효율에 영향을 줍니다. 80 이상은 효율이 감소합니다.</div>
      <div class="facility-grid">${facilityCards}</div>
    </div>`;
}

function investUpgradeStadium() {
  const t = G.myTeam, lv = t.stadiumLevel || 0;
  if(lv >= STADIUM_MAX_LEVEL) { showToast('🚫 최대 레벨!'); return; }
  const cost = (lv + 1) * STADIUM_COST_PER_LEVEL;
  if(!canSpend(t,cost)) { showToast('🚫 사용 가능 자금 부족!'); return; }
  t.budget -= cost; t.stadiumLevel = lv + 1;
  updateHeader(); renderInvest(); saveGame();
}

function investUpgradeMedical() {
  const t = G.myTeam, lv = t.medicalLevel || 0;
  if(lv >= 100) { showToast('🚫 최대 레벨!'); return; }
  const cost = upgradeCost(lv);
  if(!canSpend(t,cost)) { showToast('🚫 사용 가능 자금 부족!'); return; }
  t.budget -= cost; t.medicalLevel = clamp(lv + upgradeEfficiency(lv), 0, 100);
  updateHeader(); renderInvest(); saveGame();
}

function investUpgradeScouting() {
  const t = G.myTeam, lv = t.scoutingLevel || 0;
  if(lv >= 100) { showToast('🚫 최대 레벨!'); return; }
  const cost = deptUpgradeCost(lv);
  if(!canSpend(t,cost)) { showToast('🚫 사용 가능 자금 부족!'); return; }
  t.budget -= cost; t.scoutingLevel = clamp(lv + deptUpgradeEfficiency(lv), 0, 100);
  updateHeader(); renderInvest(); saveGame();
}

function investUpgradeAnalytics() {
  const t = G.myTeam, lv = t.analyticsLevel || 0;
  if(lv >= 100) { showToast('🚫 최대 레벨!'); return; }
  const cost = deptUpgradeCost(lv);
  if(!canSpend(t,cost)) { showToast('🚫 사용 가능 자금 부족!'); return; }
  t.budget -= cost; t.analyticsLevel = clamp(lv + deptUpgradeEfficiency(lv), 0, 100);
  updateHeader(); renderInvest(); saveGame();
}

function investUpgradeFacility(idx) {
  const f = FACILITIES[idx], lv = G.myTeam[f.key];
  const c = upgradeCost(lv);
  if(lv >= 100) { showToast('🚫 최대 레벨!'); return; }
  if(!canSpend(G.myTeam,c)) { showToast('🚫 사용 가능 자금 부족!'); return; }
  G.myTeam.budget -= c;
  G.myTeam[f.key] = clamp(lv + upgradeEfficiency(lv), 0, 100);
  updateHeader(); renderInvest(); saveGame();
}

// ===================== 👔 코치진 =====================
function renderInvestCoaching() {
  const t = G.myTeam;

  function coachSection(title, group){
    const coaches=COACH_TYPES.filter(ct=>ct.group===group);
    return `<div style="margin-bottom:16px;">
      <div style="font-size:0.75rem;color:var(--accent);font-weight:700;margin-bottom:8px;">${title}</div>
      <div class="facility-grid">
        ${coaches.map(ct=>{
          const lv=t.coachStaff[ct.key]||0;
          const cost=COACH_STAFF_COST_BASE*(lv+1);
          const multBonus=(lv*0.05).toFixed(2);
          const pct=lv/5*100;
          return `<div class="facility-card" onclick="investHireCoach('${ct.key}')">
            <div class="facility-icon">${ct.icon}</div>
            <div class="facility-name">${ct.name}</div>
            <div class="facility-desc">${ct.desc}</div>
            <div class="prog-bar" style="margin-top:8px;">
              <div class="prog-bar-fill" style="width:${pct}%;background:${statColor(pct)};"></div>
            </div>
            <div class="facility-level">Lv.${lv}/5</div>
            <div style="font-size:0.7rem;color:var(--accent2);margin-top:4px;">훈련 배율 +${multBonus}</div>
            <div style="font-size:0.68rem;color:var(--text-dim);margin-top:4px;">
              ${lv>=5
                ?'<span style="color:#4ade80;">✅ 최대 레벨</span>'
                :`💰 ${won(cost)} → Lv.${lv+1} (배율 +${((lv+1)*0.05).toFixed(2)})`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  $('investContent').innerHTML = `
    <div class="card">
      <div class="card-title">▸ 전문 코치진 영입</div>
      <p style="font-size:0.72rem;color:var(--text-dim);margin-bottom:14px;">
        각 코치 레벨당 해당 훈련의 배율이 +0.05씩 증가합니다. (최대 Lv.5 = +0.25)
      </p>
      ${coachSection('🏏 타자 코치','batter')}
      ${coachSection('⚾ 투수 코치','pitcher')}
      ${coachSection('🧘 공통','common')}
    </div>`;
}

function investHireCoach(key) {
  const t = G.myTeam;
  const lv = t.coachStaff[key] || 0;
  if(lv >= 5) { showToast('🚫 최대 레벨!'); return; }
  const cost = COACH_STAFF_COST_BASE * (lv + 1);
  if(!canSpend(t,cost)) { showToast('🚫 사용 가능 자금 부족!'); return; }
  t.budget -= cost;
  t.coachStaff[key] = lv + 1;
  updateHeader();
  renderInvestCoaching();
  saveGame();
}

// ===================== 🎪 팬 이벤트 =====================
function renderInvestEvents() {
  const used = G.fanEventUsedThisGame;
  const inMatch = G.matchInProgress;
  $('investContent').innerHTML = `
    <div class="card">
      <div class="card-title">▸ 팬 이벤트 프로모션</div>
      <p style="font-size:0.72rem;color:var(--text-dim);margin-bottom:4px;">
        경기 전 이벤트 개최 → 인기도 상승 + 경기 시작 시 선수단 사기 부스트 + 경기 후 추가 수익.
      </p>
      <p style="font-size:0.72rem;margin-bottom:14px;color:${used||inMatch?'#ef4444':'var(--accent2)'};">
        ${inMatch ? '⚠️ 경기 중에는 이벤트를 개최할 수 없습니다.' : used ? '✅ 이번 경기 이벤트 사용 완료 (경기당 1회).' : '🎪 경기당 1회 개최 가능.'}
      </p>
      <div class="market-grid">
        ${FAN_EVENTS.map((ev, i) => `
          <div class="market-card" style="${used||inMatch?'opacity:0.5;':''}">
            <div style="font-size:2rem;margin-bottom:6px;">${ev.icon}</div>
            <div style="font-weight:700;font-size:0.9rem;margin-bottom:4px;">${ev.name}</div>
            <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:10px;">${ev.desc}</div>
            <div style="font-size:0.72rem;color:var(--accent2);line-height:1.8;margin-bottom:10px;">
              📈 인기도 +${ev.popMin}~+${ev.popMax}<br>
              💪 사기 부스트 +${ev.morale}<br>
              💰 경기 후 수익 +${won(ev.revenue)}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--accent);font-weight:700;">💰 ${won(ev.cost)}</span>
              <button class="btn btn-primary btn-sm" onclick="investHoldFanEvent(${i})" ${used||inMatch?'disabled':''}>개최</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function investHoldFanEvent(idx) {
  if(G.fanEventUsedThisGame) { alert('이번 경기에 이미 이벤트를 진행했습니다!'); return; }
  if(G.matchInProgress) { alert('경기 중에는 이벤트를 개최할 수 없습니다!'); return; }
  const ev = FAN_EVENTS[idx];
  if(!canSpend(G.myTeam,ev.cost)) { showToast('🚫 사용 가능 자금 부족!'); return; }

  G.myTeam.budget -= ev.cost;
  const popGain = rand(ev.popMin, ev.popMax);
  G.myTeam.popularity = clamp(G.myTeam.popularity + popGain, 0, 100);
  G.myTeam.moralBoost  = ev.morale;
  G.myTeam.eventRevenue = ev.revenue;
  G.fanEventUsedThisGame = true;

  updateHeader();
  renderInvestEvents();
  showToast(`🎉 ${ev.name} 개최! 인기도 +${popGain} | 다음 경기 사기 +${ev.morale} | 경기 후 수익 +${won(ev.revenue)}`);
  saveGame();
}

// ===================== ✈️ 해외연수 =====================
function renderInvestOverseas() {
  const t = G.myTeam;
  const isOffseason = G.phase==='stove_league'||G.phase==='preseason';
  const overseasUsed = t.overseasUsedThisSeason || 0;
  const overseas = t.roster.filter(p => p.role === 'overseas');
  const eligible = t.roster.filter(p => p.role !== 'overseas' && (p.status||'active')==='active');

  $('investContent').innerHTML = `
    <div class="card">
      <div class="card-title">▸ 해외 교육리그 연수</div>
      <p style="font-size:0.72rem;color:var(--text-dim);margin-bottom:4px;">
        💰 비용: ${won(OVERSEAS_COST)} | 비시즌 즉시 완료 (스탯 +${OVERSEAS_BOOST_MIN}~${OVERSEAS_BOOST_MAX})
      </p>
      <p style="font-size:0.72rem;color:var(--accent2);margin-bottom:4px;">
        ✨ 복귀 시 주요 능력치 +${OVERSEAS_BOOST_MIN}~${OVERSEAS_BOOST_MAX} 대폭 상승
      </p>
      <p style="font-size:0.72rem;margin-bottom:14px;">
        <span style="color:${isOffseason?'#10b981':'#ef4444'};">${isOffseason?'✅ 비시즌 — 파견 가능':'🚫 시즌 중 — 비시즌에만 가능'}</span>
        · 시즌 ${overseasUsed}/3명 파견
      </p>

      ${overseas.length > 0 ? `
        <div class="section-divider">✈️ 해외 연수 중 <span class="section-count">${overseas.length}명</span></div>
        <div style="overflow-x:auto;margin-bottom:16px;">
          <table class="data-table">
            <thead><tr><th>이름</th><th>포지션</th><th>OVR</th><th>복귀까지</th></tr></thead>
            <tbody>
              ${overseas.map(p => `<tr>
                <td><span class="player-name">${p.name}</span></td>
                <td><span class="pos-badge${p.isPitcher?' pitcher':''}">${ALL_POS_NAMES[p.pos]||p.pos}</span></td>
                <td style="color:${statColor(ovr(p))};font-weight:700;">${ovr(p)}</td>
                <td style="color:#67e8f9;font-family:'JetBrains Mono',monospace;">${Math.max(0, p.overseasUntil - G.gameNum)}경기 후</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : ''}

      <div class="section-divider">📋 파견 가능 선수 <span class="section-count">${eligible.length}명</span></div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th>이름</th><th>포지션</th><th>역할</th><th>OVR</th><th>파견</th></tr></thead>
          <tbody>
            ${eligible.map(p => {
              const idx = t.roster.indexOf(p);
              const canAfford = t.budget >= OVERSEAS_COST;
              const pOverseas = p._overseasCount||0;
              const canSend = isOffseason && canAfford && overseasUsed < 3 && pOverseas < 3 && !G.matchInProgress;
              const roleLabel = p.role==='starting'?'선발타자':p.role==='bench'?'후보':p.role==='rotation'?'선발투수':'불펜';
              return `<tr>
                <td><span class="player-name">${p.name}</span> <span style="font-size:0.58rem;color:var(--text-dim);">(${pOverseas}/3)</span></td>
                <td><span class="pos-badge${p.isPitcher?' pitcher':''}">${ALL_POS_NAMES[p.pos]||p.pos}</span></td>
                <td><span class="role-badge ${p.role}">${roleLabel}</span></td>
                <td style="color:${statColor(ovr(p))};font-weight:700;">${ovr(p)}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="investSendOverseas(${idx})"
                    ${canSend ? '' : 'disabled'}
                    title="${!isOffseason?'비시즌에만 가능':!canAfford?'예산 부족':overseasUsed>=3?'시즌 3명 제한':'파견'}">
                    ✈️ ${won(OVERSEAS_COST)}
                  </button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function investSendOverseas(rosterIdx) {
  const t = G.myTeam;
  const p = t.roster[rosterIdx];
  if(!p || p.role === 'overseas') { showToast('🚫 이미 해외 연수 중!'); return; }
  if(!(G.phase==='stove_league'||G.phase==='preseason')) { showToast('🚫 비시즌에만 가능!'); return; }
  if((t.overseasUsedThisSeason||0) >= 3) { showToast('🚫 시즌 3명 파견 제한 초과!'); return; }
  if((p._overseasCount||0) >= 3) { showToast(`🚫 ${p.name}은(는) 커리어 연수 3회를 모두 사용했습니다!`); return; }
  if(!canSpend(t,OVERSEAS_COST)) { showToast('🚫 사용 가능 자금 부족!'); return; }

  // 참가 제한: 24세 이하 유망주 또는 OVR 60 미만
  if((p.age||22) > 24 && ovr(p) >= 60) { showToast('🚫 24세 이하 또는 OVR 60 미만 선수만 파견 가능!'); return; }

  // 최소 인원 보호
  if(!p.isPitcher && p.role === 'starting' && getStartingBatters(t).length <= 1) {
    showToast('🚫 선발 타자가 최소 1명 필요합니다!'); return;
  }
  if(p.isPitcher && p.role === 'rotation' && getRotation(t).length <= 1) {
    showToast('🚫 로테이션 투수가 최소 1명 필요합니다!'); return;
  }

  t.budget = Math.floor(t.budget - OVERSEAS_COST);
  t.overseasUsedThisSeason = (t.overseasUsedThisSeason||0) + 1;
  p._overseasCount = (p._overseasCount||0) + 1;

  // 즉시 복귀: POT 확장 + 스탯 부스트 (비시즌이므로 대기 없음)
  p._potential = Math.min(20, (p._potential||10) + rand(1,2));
  const boost = rand(OVERSEAS_BOOST_MIN, OVERSEAS_BOOST_MAX);
  if(p.isPitcher){const s=pick(['stuff','control','velocity','movement']);p[s]=clamp((p[s]||0)+boost,20,80);}
  else{const s=pick(['contact','power','eye','speed']);p[s]=clamp((p[s]||0)+boost,20,80);}

  // 프로의식 연동: _workEthic 높으면 추가 보너스 스탯
  const we=p._workEthic||10;
  if(we>=12 && Math.random()<(we/25)){ // ethic 12~20 → 48~80% 확률
    const extraBoost=rand(1,2);
    const extraStats=p.isPitcher?['stuff','control','movement']:['contact','power','eye'];
    const es=pick(extraStats);
    p[es]=clamp((p[es]||0)+extraBoost,20,80);
    showToast(`✈️ ${p.name} 해외 연수 완료! 능력치 +${boost}, 프로의식 보너스 ${es} +${extraBoost}!`);
  }else{
    showToast(`✈️ ${p.name} 해외 연수 완료! 능력치 +${boost}, 잠재력↑`);
  }

  updateHeader();
  renderInvestOverseas();
  saveGame();
}

// ===================== 🌎 중남미 스카우팅 캠프 =====================
function renderInvestScoutCamp() {
  const t = G.myTeam;
  const isOffseason = G.phase==='stove_league'||G.phase==='preseason';
  const used = t.scoutCampUsed || 0;
  const foreignCount = getActiveForeignCount(t);
  const canUse = isOffseason && used < SCOUT_CAMP_MAX_PER_SEASON && t.budget >= SCOUT_CAMP_COST && foreignCount < FOREIGN_PLAYER_MAX;

  $('investContent').innerHTML = `
    <div class="card">
      <div class="card-title">🌎 중남미 비밀 스카우팅 캠프</div>
      <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:14px;line-height:1.7;">
        중남미 현지 스카우팅 네트워크를 가동하여 원석급 선수를 발굴합니다.<br>
        비용 <b style="color:var(--accent);">${won(SCOUT_CAMP_COST)}</b> | 시즌 ${SCOUT_CAMP_MAX_PER_SEASON}회 제한 (사용: ${used}/${SCOUT_CAMP_MAX_PER_SEASON})<br>
        🌐 외국인 선수: <b style="color:${foreignCount>=FOREIGN_PLAYER_MAX?'#ef4444':'var(--accent2)'};">${foreignCount}/${FOREIGN_PLAYER_MAX}명</b><br>
        <span style="color:${isOffseason?'#10b981':'#ef4444'};">${isOffseason?'✅ 비시즌 — 스카우팅 가능':'🚫 시즌 중 — 비시즌에만 가능'}</span>
      </div>
      <div class="card" style="background:var(--bg-card-hover);padding:14px;margin-bottom:14px;">
        <div style="font-size:0.72rem;color:var(--accent);margin-bottom:8px;">🎲 확률 테이블</div>
        <table class="data-table" style="font-size:0.72rem;">
          <thead><tr><th>등급</th><th>확률</th><th>결과</th></tr></thead>
          <tbody>
            <tr><td style="color:#ef4444;">꽝</td><td>60%</td><td>OVR 35~45 선수</td></tr>
            <tr><td style="color:#f59e0b;">본전</td><td>34%</td><td>OVR 50~60 선수</td></tr>
            <tr><td style="color:#10b981;">대박</td><td>5%</td><td>OVR 65~69 선수</td></tr>
            <tr><td style="color:#a855f7;">초대박</td><td>1%</td><td>OVR 75~80 선수</td></tr>
          </tbody>
        </table>
        <div style="font-size:0.65rem;color:var(--text-dim);margin-top:6px;">* 생성 선수는 즉시 로스터에 추가되며 OVR에 맞는 FA급 연봉이 자동 체결됩니다.</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.72rem;color:var(--accent);margin-bottom:10px;font-weight:700;">포지션 선택</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:14px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="executeScoutCamp('if')" ${canUse?'':'disabled'} style="padding:10px 20px;font-size:0.78rem;">🧤 내야수</button>
          <button class="btn btn-secondary" onclick="executeScoutCamp('of')" ${canUse?'':'disabled'} style="padding:10px 20px;font-size:0.78rem;">🏃 외야수</button>
          <button class="btn btn-secondary" onclick="executeScoutCamp('c')" ${canUse?'':'disabled'} style="padding:10px 20px;font-size:0.78rem;">🎯 포수</button>
          <button class="btn btn-secondary" onclick="executeScoutCamp('pit')" ${canUse?'':'disabled'} style="padding:10px 20px;font-size:0.78rem;">⚾ 투수</button>
        </div>
        <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:8px;">비용: ${won(SCOUT_CAMP_COST)} / 경기</div>
        ${!canUse && used >= SCOUT_CAMP_MAX_PER_SEASON ? '<div style="font-size:0.68rem;color:#ef4444;margin-top:8px;">이번 시즌 사용 횟수를 모두 소진했습니다.</div>' : ''}
        ${!canUse && t.budget < SCOUT_CAMP_COST ? '<div style="font-size:0.68rem;color:#ef4444;margin-top:8px;">예산이 부족합니다.</div>' : ''}
        ${!canUse && foreignCount >= FOREIGN_PLAYER_MAX ? '<div style="font-size:0.68rem;color:#ef4444;margin-top:8px;">🌐 외국인 선수 등록 한도('+FOREIGN_PLAYER_MAX+'명)를 초과합니다.</div>' : ''}
      </div>
    </div>`;
}

function executeScoutCamp(posCategory) {
  const t = G.myTeam;
  if(!(G.phase==='stove_league'||G.phase==='preseason')) { showToast('🚫 비시즌에만 가능!'); return; }
  if((t.scoutCampUsed||0) >= SCOUT_CAMP_MAX_PER_SEASON) { showToast('🚫 이번 시즌 사용 횟수 소진!'); return; }
  if(!canSpend(t,SCOUT_CAMP_COST)) { showToast('🚫 사용 가능 자금 부족!'); return; }
  if(!canAddForeign(t)) { showToast('🚫 외국인 선수 등록 한도 '+FOREIGN_PLAYER_MAX+'명 초과!'); return; }

  t.budget = +(t.budget - SCOUT_CAMP_COST).toFixed(1);
  t.scoutCampUsed = (t.scoutCampUsed || 0) + 1;

  // 확률 롤
  const roll = rand(1, 100);
  let ovrMin, ovrMax, grade, gradeColor, gradeEmoji;
  if (roll <= 60)       { ovrMin=35; ovrMax=45; grade='꽝';   gradeColor='#ef4444'; gradeEmoji='😢'; }
  else if (roll <= 94)  { ovrMin=50; ovrMax=60; grade='본전'; gradeColor='#f59e0b'; gradeEmoji='😐'; }
  else if (roll <= 99)  { ovrMin=65; ovrMax=69; grade='대박'; gradeColor='#10b981'; gradeEmoji='🎉'; }
  else                  { ovrMin=75; ovrMax=80; grade='초대박';gradeColor='#a855f7'; gradeEmoji='🔥'; }

  // 선수 생성 — 포지션 카테고리에 따라 결정
  const targetOvr = rand(ovrMin, ovrMax);
  const pGrade = targetOvr >= 70 ? 'S' : targetOvr >= 60 ? 'A' : targetOvr >= 50 ? 'B' : targetOvr >= 40 ? 'C' : 'D';
  let pos, isBat;
  if(posCategory==='if')       { isBat=true;  pos=pick(['1B','2B','3B','SS']); }
  else if(posCategory==='of')  { isBat=true;  pos=pick(['LF','CF','RF']); }
  else if(posCategory==='c')   { isBat=true;  pos='C'; }
  else                         { isBat=false; pos=pick(['SP','SP','CP','MR','SU']); }
  const p = isBat ? genBatter(pos, pGrade, null, 'my') : genPitcher(pos, pGrade, null, 'my');

  // OVR을 목표 범위로 강제 조정
  const stats = p.isPitcher
    ? ['stuff','control','velocity','movement','stamina','clutch']
    : ['contact','power','eye','speed','fielding','arm'];
  let currentOvr = ovr(p);
  let attempts = 0;
  while (Math.abs(currentOvr - targetOvr) > 3 && attempts < 20) {
    const diff = targetOvr - currentOvr;
    const s = pick(stats);
    p[s] = clamp(p[s] + Math.round(diff * 0.4), 20, 80);
    currentOvr = ovr(p);
    attempts++;
  }

  // POT-OVR 정합성: 목표 OVR에 도달 가능하도록 POT 최소값 보장
  const minPotScout = Math.ceil((ovr(p) - 30) / 2.5);
  p._potential = Math.max(p._potential||10, clamp(minPotScout, 7, 20));

  // 선수 데이터 준비 (아직 로스터에 추가하지 않음)
  p.name = genLatinName();  // 남미 선수 이름
  p.isForeign = true;
  p._serviceTime = rand(7, 10);
  p._contractYears = targetOvr >= 65 ? rand(2, 4) : rand(1, 2);
  p.salary = _calcSalary(ovr(p), p._serviceTime);
  p.age = rand(22, 30);
  p._seasonsPlayed = p.age - 18;
  p.status = 'active';
  p.role = p.isPitcher ? (p.pos === 'SP' ? 'rotation' : 'bullpen') : 'bench';
  initSeasonStats(p);

  // 임시 저장 (계약 선택 대기)
  G._scoutResult = p;

  // 결과 모달 (계약/포기 선택)
  const o = ovr(p);
  $('modalTitle').textContent = `${gradeEmoji} 스카우팅 결과: ${grade}!`;
  $('modalBody').innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:2.5rem;margin:10px 0;">${gradeEmoji}</div>
      <div style="font-size:1.2rem;font-weight:700;color:${gradeColor};margin-bottom:8px;">${grade}</div>
      <div class="card" style="background:var(--bg-card-hover);padding:14px;text-align:left;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span class="player-name" style="font-size:1rem;">${p.name}</span>
          <span class="pos-badge${p.isPitcher?' pitcher':''}">${ALL_POS_NAMES[p.pos]||p.pos}</span>
        </div>
        <div style="font-size:0.82rem;margin-bottom:4px;">OVR <span style="color:${statColor(o)};font-weight:700;font-size:1.1rem;">${o}</span></div>
        <div style="font-size:0.72rem;color:var(--text-dim);">
          ${p.isPitcher
            ? '구위 '+p.stuff+' | 제구 '+p.control+' | 구속 '+p.velocity+' | 무브 '+p.movement
            : '컨택 '+p.contact+' | 파워 '+p.power+' | 선구안 '+p.eye+' | 주력 '+p.speed}
        </div>
        <div style="font-size:0.72rem;color:var(--accent);margin-top:6px;">연봉 ${won(p.salary)} · ${p._contractYears}년 계약 · 🌐 외국인</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" onclick="_confirmScoutSign()" style="flex:1;padding:10px;">✅ 계약 체결</button>
        <button class="btn btn-secondary" onclick="_declineScoutSign()" style="flex:1;padding:10px;">❌ 포기</button>
      </div>
    </div>`;
  $('seasonModal').classList.add('active');
  updateHeader(); saveGame();
}

function _confirmScoutSign() {
  const p = G._scoutResult;
  if (!p) return;
  $('seasonModal').classList.remove('active');

  // 협상 모달로 전환
  showNegotiationModal(p,'scout',
    function onAccept(salary,years){
      p.salary=salary;p._contractYears=years;
      G.myTeam.roster.push(p);
      delete G._scoutResult;
      showToast(`✅ ${p.name} 계약! (${won(salary)} × ${years}년)`);
      updateHeader();renderInvestScoutCamp();saveGame();
    },
    function onFail(){
      delete G._scoutResult;
      showToast(`❌ ${p.name} 계약 결렬 (스카우팅 비용은 소모됨)`);
      renderInvestScoutCamp();
    }
  );
}

function _declineScoutSign() {
  const p = G._scoutResult;
  delete G._scoutResult;
  $('seasonModal').classList.remove('active');
  showToast(`❌ 스카우팅 선수 계약 포기${p ? ' (' + p.name + ')' : ''}`);
  renderInvestScoutCamp();
}

// ===================== 🏥 독일 뮌헨 의료 센터 =====================
function renderInvestMedicalCenter() {
  const t = G.myTeam;
  const isOffseason = G.phase==='stove_league'||G.phase==='preseason';
  const medicalUsed = t.medicalUsedThisSeason || 0;
  // 대상: 34세 이상 또는 IL 상태 선수
  const eligible = t.roster.filter(p =>
    !p.isMedicalTreated &&
    ((p.age || 22) >= MEDICAL_MIN_AGE || p.status === 'il')
  );

  $('investContent').innerHTML = `
    <div class="card">
      <div class="card-title">🏥 독일 뮌헨 의료 센터</div>
      <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:14px;line-height:1.7;">
        독일 최첨단 의료 기술로 베테랑 선수의 회춘 또는 부상 선수의 근본적 치료를 시도합니다.<br>
        비용 <b style="color:var(--accent);">${won(MEDICAL_CENTER_COST)}~${won(30)}</b> <span style="font-size:0.65rem;">(OVR에 따라 변동)</span> | 선수당 <b>커리어 1회</b> 제한 (${MEDICAL_MIN_AGE}세 이상 또는 부상 중)<br>
        <span style="color:${isOffseason?'#10b981':'#ef4444'};">${isOffseason?'✅ 비시즌 — 치료 가능':'🚫 시즌 중 — 비시즌에만 가능'}</span>
        · 시즌 ${medicalUsed}/3명 치료
      </div>
      <div class="card" style="background:var(--bg-card-hover);padding:14px;margin-bottom:14px;">
        <div style="font-size:0.72rem;color:var(--accent);margin-bottom:8px;">🎲 확률 테이블</div>
        <table class="data-table" style="font-size:0.72rem;">
          <thead><tr><th>결과</th><th>확률</th><th>효과</th></tr></thead>
          <tbody>
            <tr><td style="color:var(--text-dim);">실패</td><td>50%</td><td>효과 없음 (비용만 소모)</td></tr>
            <tr><td style="color:#f59e0b;">부분 성공</td><td>35%</td><td>전체 스탯 <b>+2</b> 영구 상승</td></tr>
            <tr><td style="color:#10b981;">대성공</td><td>5%</td><td>전체 스탯 <b>+5</b> + 2년간 에이징 면역</td></tr>
            <tr><td style="color:#ef4444;">의료 사고</td><td>10%</td><td>전체 스탯 <b>-3</b> 영구 하락</td></tr>
          </tbody>
        </table>
      </div>
      ${eligible.length === 0
        ? '<div style="text-align:center;padding:20px;color:var(--text-dim);">대상 선수가 없습니다 ('+MEDICAL_MIN_AGE+'세 이상 또는 부상 중, 미치료)</div>'
        : `<div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:8px;">대상 선수 (${eligible.length}명)</div>
           <div style="display:flex;flex-direction:column;gap:6px;">
             ${eligible.map(p => {
               const idx = t.roster.indexOf(p);
               const o = ovr(p);
               const medCost = o >= 70 ? 30 : o >= 60 ? 22 : MEDICAL_CENTER_COST;
               const canAfford = t.budget >= medCost;
               const canTreat = isOffseason && canAfford && medicalUsed < 3;
               return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-card-hover);border-radius:8px;">
                 <span class="player-name" style="font-size:0.78rem;flex:1;">${p.name}</span>
                 <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.55rem;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
                 <span style="font-size:0.68rem;color:var(--text-dim);">${p.age||22}세</span>
                 <span style="font-size:0.72rem;color:${statColor(o)};font-weight:700;">OVR ${o}</span>
                 ${p.status==='il'?'<span style="font-size:0.6rem;color:#ef4444;">🏥 부상</span>':''}
                 <button class="btn btn-primary btn-sm" onclick="executeMedicalCenter(${idx})" ${canTreat?'':'disabled'}
                   title="${!isOffseason?'비시즌에만 가능':!canAfford?'예산 부족 (필요: '+won(medCost)+')':medicalUsed>=3?'시즌 3명 제한':''}">
                   치료 (${won(medCost)})
                 </button>
               </div>`;
             }).join('')}
           </div>`
      }
    </div>`;
}

function executeMedicalCenter(rosterIdx) {
  const t = G.myTeam;
  const p = t.roster[rosterIdx];
  if (!p) return;
  if (!(G.phase==='stove_league'||G.phase==='preseason')) { showToast('🚫 비시즌에만 가능!'); return; }
  if ((t.medicalUsedThisSeason||0) >= 3) { showToast('🚫 시즌 3명 치료 제한 초과!'); return; }
  if (p.isMedicalTreated) { showToast('🚫 이미 치료받은 선수입니다.'); return; }

  // OVR 기반 비용 스케일링
  const playerOvr = ovr(p);
  const medCost = playerOvr >= 70 ? 30 : playerOvr >= 60 ? 22 : MEDICAL_CENTER_COST;
  if (!canSpend(t, medCost)) { showToast(`🚫 사용 가능 자금 부족! (필요: ${won(medCost)})`); return; }

  t.budget = Math.floor(t.budget - medCost);
  t.medicalUsedThisSeason = (t.medicalUsedThisSeason||0) + 1;
  p.isMedicalTreated = true;

  const stats = p.isPitcher
    ? ['stuff','control','velocity','movement','stamina','clutch']
    : ['contact','power','eye','speed','fielding','arm'];

  // 확률 롤 (하이 리스크: 대성공 5%, 사고 10%)
  const roll = rand(1, 100);
  let result, resultColor, resultEmoji, resultDesc;

  if (roll <= 50) {
    // 실패 (50%)
    result = '실패'; resultColor = 'var(--text-dim)'; resultEmoji = '😔';
    resultDesc = '치료가 효과를 발휘하지 못했습니다. 비용만 소모되었습니다.';
  } else if (roll <= 85) {
    // 부분 성공 (35%): +2 영구 + POT +1
    result = '부분 성공'; resultColor = '#f59e0b'; resultEmoji = '💪';
    p._potential = Math.min(20, (p._potential||10) + 1);
    stats.forEach(s => { p[s] = clamp((p[s] || 30) + 2, 20, 80); });
    resultDesc = `전체 스탯 +2 영구 상승! 잠재력 확장 (최대 ${maxOvrFromPot(p._potential)} OVR)`;
  } else if (roll <= 90) {
    // 대성공 (5%): +5 영구 + POT +3 + 에이징 면역 2년
    result = '대성공'; resultColor = '#10b981'; resultEmoji = '🌟';
    p._potential = Math.min(20, (p._potential||10) + 3);
    stats.forEach(s => { p[s] = clamp((p[s] || 30) + 5, 20, 80); });
    p.agingImmunityYears = 2;
    resultDesc = `전체 스탯 +5 영구 상승! 잠재력 대폭 확장 (최대 ${maxOvrFromPot(p._potential)} OVR)! 2년간 에이징 면역!`;
    if (p.status === 'il') {
      p.status = 'futures'; p.isOnIL = false; p.ilGamesLeft = 0; p.rehabGamesLeft = 0;
      resultDesc += ' 부상도 완치되었습니다!';
    }
  } else {
    // 의료 사고 (10%): -3 영구
    result = '의료 사고'; resultColor = '#ef4444'; resultEmoji = '⚠️';
    stats.forEach(s => { p[s] = clamp((p[s] || 30) - 3, 20, 80); });
    resultDesc = '의료 사고 발생! 전체 스탯이 -3 영구 하락했습니다...';
  }

  const o = ovr(p);
  $('modalTitle').textContent = `${resultEmoji} 의료 센터 결과: ${result}`;
  $('modalBody').innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:2.5rem;margin:10px 0;">${resultEmoji}</div>
      <div style="font-size:1.2rem;font-weight:700;color:${resultColor};margin-bottom:8px;">${result}</div>
      <div class="card" style="background:var(--bg-card-hover);padding:14px;text-align:left;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span class="player-name" style="font-size:1rem;">${p.name}</span>
          <span style="font-size:0.82rem;color:${statColor(o)};font-weight:700;">OVR ${o}</span>
        </div>
        <div style="font-size:0.78rem;color:var(--text-dim);line-height:1.6;">${resultDesc}</div>
        ${p.agingImmunityYears > 0 ? '<div style="font-size:0.72rem;color:#10b981;margin-top:6px;">🛡️ 에이징 면역: ' + p.agingImmunityYears + '년</div>' : ''}
      </div>
      <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');renderInvestMedicalCenter();" style="width:100%;">확인</button>
    </div>`;
  $('seasonModal').classList.add('active');
  updateHeader(); saveGame();
}

// ===================== 공통 유틸 =====================
function showToast(msg) {
  document.querySelectorAll('.invest-toast').forEach(el=>el.remove());
  const toast = document.createElement('div');
  toast.className = 'invest-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3200);
}
