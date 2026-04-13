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
