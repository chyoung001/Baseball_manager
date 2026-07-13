// ===================== INVESTMENT SCREEN (Router) =====================
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
  // 모든 탭 상단에 예산 요약바 고정 주입 (단일 지점 — 각 렌더 함수 수정 불필요)
  const host = $('investContent');
  if(host) host.innerHTML = _investBudgetBar() + host.innerHTML;
}

// 투자 화면 공통 상단 예산 요약바 — 보유·투자가용·페이롤·사치세를 한눈에
function _investBudgetBar() {
  const t = G.myTeam;
  if(!t) return '';
  const avail   = getAvailableBudget(t);
  const payroll = getPayroll(t);
  const line    = getLuxuryTaxLine();
  const luxTax  = getLuxuryTax(t);
  const room    = +(line - payroll).toFixed(1);
  return `<div class="invest-budgetbar">
    <div class="ibb-item">
      <div class="ibb-label">보유 자금</div>
      <div class="ibb-value" style="color:var(--accent);">💰 ${won(t.budget)}</div>
    </div>
    <div class="ibb-item">
      <div class="ibb-label">투자 가용</div>
      <div class="ibb-value" style="color:${avail>0?'var(--accent2)':'#ef4444'};">${avail<0?'-':''}${won(Math.abs(avail))}</div>
    </div>
    <div class="ibb-item">
      <div class="ibb-label">페이롤 / 소프트캡</div>
      <div class="ibb-value" style="${payroll>line?'color:#f97316;':''}">${won(payroll)} <span class="ibb-sub">/ ${won(line)}</span></div>
    </div>
    <div class="ibb-item">
      <div class="ibb-label">${luxTax>0?'시즌 사치세':'사치세 여유'}</div>
      <div class="ibb-value" style="color:${luxTax>0?'#ef4444':'var(--accent2)'};">${luxTax>0?'-'+won(luxTax):won(room)}</div>
    </div>
  </div>`;
}
