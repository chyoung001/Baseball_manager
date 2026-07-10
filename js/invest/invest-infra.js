// ===================== 🏗️ 인프라 & 시설 =====================
function renderInvestInfra() {
  const t = G.myTeam;
  const stadLv  = t.stadiumLevel || 0;
  const medLv   = t.medicalLevel || 0;
  const scLv    = t.scoutingLevel || 0;
  const aLv     = t.analyticsLevel || 0;
  const medDrop = Math.floor(medLv / 20);

  // P2-5 신규 4레벨 시설 카드 (설계: 재정 밸런스 — 비용 5/12/25/40억, L3+ 유지비)
  function fac4Card(key, icon, name, desc, effectFn, upgradeFn){
    const lv = t[key] || 0;
    const cost = FACILITY4_COSTS[lv];
    const upkeep = FACILITY4_UPKEEP[lv] * (FACILITY4_COSTS[lv-1] || 0);
    return `<div class="facility-card" onclick="${upgradeFn}()">
      <div class="facility-icon">${icon}</div>
      <div class="facility-name">${name}</div>
      <div class="facility-desc">${desc}</div>
      <div class="prog-bar" style="margin-top:8px;">
        <div class="prog-bar-fill" style="width:${lv/4*100}%;background:${statColor(lv/4*100)};"></div>
      </div>
      <div class="facility-level">Lv.${lv}/4</div>
      <div style="font-size:0.7rem;color:var(--accent2);margin-top:4px;">${effectFn(lv)}${upkeep>0?` · 유지비 ${won(+upkeep.toFixed(1))}/시즌`:''}</div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-top:4px;">
        ${lv>=4?'<span style="color:#4ade80;">✅ 최대 레벨</span>':`💰 ${won(cost)} → Lv.${lv+1}${lv+1>=3?' <span style="color:#f59e0b;">(유지비 발생)</span>':''}`}
      </div>
    </div>`;
  }
  const slumpCard = fac4Card('slumpCareLevel','🧊','슬럼프 완화 시설','슬럼프 발동 억제 · L3+ 지속 -1경기',
    lv=>`완화율 ${Math.round(SLUMP_CARE_RELIEF[lv]*100)}%${lv<4?` → ${Math.round(SLUMP_CARE_RELIEF[lv+1]*100)}%`:''}`,'investUpgradeSlumpCare');
  const mentalCard = fac4Card('mentalCoachLevel','🧠','멘탈 코칭 룸','하이 레버리지 클러치 보정 증폭',
    lv=>`클러치 증폭 +${Math.round(MENTAL_COACH_AMP[lv]*100)}%${lv<4?` → +${Math.round(MENTAL_COACH_AMP[lv+1]*100)}%`:''}`,'investUpgradeMentalCoach');

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

    <div class="card" style="margin-bottom:14px;">
      <div class="card-title">▸ 특수 시설 (4레벨制 · P2-5)</div>
      <div style="margin-bottom:10px;font-size:0.72rem;color:var(--text-dim);">레벨 3 이상은 시즌마다 유지비가 발생합니다 (도달 비용의 10~15%).</div>
      <div class="facility-grid">${slumpCard}${mentalCard}</div>
    </div>

    <div class="card">
      <div class="card-title">▸ 시설</div>
      <div style="margin-bottom:10px;font-size:0.72rem;color:var(--text-dim);">구단 운영 효율에 영향을 줍니다. 80 이상은 효율이 감소합니다.</div>
      <div class="facility-grid">${facilityCards}</div>
    </div>`;
}

// P2-5 신규 4레벨 시설 업그레이드
function _investUpgradeFac4(key,label){
  const t = G.myTeam, lv = t[key] || 0;
  if(lv >= 4) { showToast('🚫 최대 레벨!'); return; }
  const cost = FACILITY4_COSTS[lv];
  if(!canSpend(t,cost)) { showToast('🚫 사용 가능 자금 부족!'); return; }
  t.budget -= cost; t[key] = lv + 1;
  showToast(`${label} Lv.${lv+1} 완공!`);
  updateHeader(); renderInvest(); saveGame();
}
function investUpgradeSlumpCare(){_investUpgradeFac4('slumpCareLevel','🧊 슬럼프 완화 시설');}
function investUpgradeMentalCoach(){_investUpgradeFac4('mentalCoachLevel','🧠 멘탈 코칭 룸');}

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
