// ===================== 💰 재정 =====================
function renderInvestFinance() {
  const t = G.myTeam;
  const payroll = getPayroll(t);
  const luxTax = getLuxuryTax(t);
  const overHard = payroll >= getHardCap();
  const overSoft = payroll > getLuxuryTaxLine();
  const floorLine = getSalaryFloor();
  const underFloor = payroll < floorLine;
  const surcharge = getLuxurySurcharge(t);
  const stadMult = (1 + (t.stadiumLevel || 0) * STADIUM_REVENUE_BONUS).toFixed(2);

  const sortedRoster = [...t.roster].sort((a, b) => (b.salary || 0) - (a.salary || 0));

  $('investContent').innerHTML = `
    <div class="card">
      <div class="card-title">▸ FA & 페이롤 현황</div>
      <div class="finance-grid" style="margin-bottom:12px;">
        <div class="finance-item">
          <div class="finance-label">총 페이롤</div>
          <div class="finance-value" style="color:${overHard?'#ef4444':overSoft?'#f97316':underFloor?'#ef4444':'var(--accent2)'};">${won(payroll)}</div>
          <div style="font-size:0.65rem;color:var(--text-dim);margin-top:2px;">플로어 ${won(floorLine)} / 소프트캡 ${won(getLuxuryTaxLine())}</div>
        </div>
        <div class="finance-item">
          <div class="finance-label">시즌 사치세</div>
          <div class="finance-value" style="color:${luxTax>0?'#ef4444':'var(--accent2)'};">${luxTax > 0 ? '-'+won(luxTax) : '없음'}</div>
          <div style="font-size:0.65rem;color:var(--text-dim);margin-top:2px;">누진 20/40/60%${surcharge>0?` +연속초과 ${Math.round(surcharge*100)}%p`:''}</div>
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
      ${overSoft && !overHard ? `<div class="invest-warning" style="border-color:#f97316;color:#f97316;background:rgba(249,115,22,0.08);">⚠️ 사치세 구간! 초과분 ${won(+(payroll - getLuxuryTaxLine()).toFixed(1))} → 누진 과세 <strong>${won(luxTax)}</strong> (20/40/60%${surcharge>0?`, 연속 초과 +${Math.round(surcharge*100)}%p`:''}). 시즌 수익에서 차감됩니다.</div>` : ''}
      ${underFloor ? `<div class="invest-warning" style="border-color:#ef4444;color:#ef4444;background:rgba(239,68,68,0.08);">🚨 샐러리 플로어(${won(floorLine)}) 미달! 시즌 종료 시 미달액 <strong>${won(+(floorLine-payroll).toFixed(1))}</strong> 전액 벌과금 + 리그 분배금 수령 박탈.</div>` : ''}

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

// ===================== 🎪 팬 이벤트 (비활성화 — 무한 흑자 익스플로잇 방지) =====================
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
