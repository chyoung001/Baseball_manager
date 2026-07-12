// ===================== ANALYSIS (퍼사드 / 진입점) =====================
// 외부에서 호출되는 공용 API만 유지. 실제 로직은 분리된 모듈에 위치.
//   analysis-batters.js   → 타자 성적 테이블
//   analysis-pitchers.js  → 투수 성적 테이블
//   analysis-scout.js     → 스카우트 리포트 + 히든 스탯
//   analysis-contracts.js → 계약/재정 + 정렬/필터

let _analysisTab = 'batters';

function switchAnalysisTab(tab) {
  _analysisTab = tab;
  document.querySelectorAll('#analysisTabs .roster-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  renderAnalysis();
}

function renderAnalysis() {
  if (_analysisTab === 'batters') renderAnalysisBatters();
  else if (_analysisTab === 'pitchers') renderAnalysisPitchers();
  else if (_analysisTab === 'scout') renderAnalysisScout();
  else if (_analysisTab === 'contracts') renderAnalysisContracts();
  // else if (_analysisTab === 'codex') renderTraitCodex(); // P2 특성 도감 — 현재 UI 비활성(탭 제거). 재활성: index.html 탭 + 이 분기 복원
}
