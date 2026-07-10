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
}
