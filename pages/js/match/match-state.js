// ===================== MATCH STATE (데이터 / 상태 관리) =====================
// 경기의 현재 상태만을 저장. 계산식이나 UI 조작 코드 없음.

let matchState={};
let _luRowCache=null; // 라인업 행 캐시 (match-ui.js에서 사용)

// TTO + BABIP 엔진 상수 (84경기 최적화)
const TTO_BASE_HR    = 0.025;   // 기본 홈런율 2.5%
const TTO_BASE_K     = 0.180;   // 기본 삼진율 18%
const TTO_BASE_BB    = 0.090;   // 기본 볼넷율 9%
const TTO_BASE_BABIP = 0.315;   // 기본 BABIP
const REG_PA_THRESH  = 30;      // 타자 회귀 시작 타석 수
const REG_IP_THRESH  = 45;      // 투수 회귀 시작 아웃 수
const FATIGUE_NP1    = 70;      // 피로도 1단계 투구수
const FATIGUE_NP2    = 90;      // 피로도 2단계 투구수
