#!/usr/bin/env node
// ===================== 페이롤 디플레이션 계측 프로브 (fix/#28) =====================
// 실행: node tools/probe-payroll.js [seed] [seasons]
//   예: node tools/probe-payroll.js 20260826 12
//
// 목적: 리그 페이롤이 다시즌에 걸쳐 95억 → 44억으로 붕괴하는 원인을 가설별로 분해한다.
//   H1 중간 대역 연봉 영구 동결   (season-flow.js: OVR 31~69 만료계약자는 배율 0으로 조기 return)
//   H2 최저 연봉 유입 vs 고연봉 유출의 일방향 치환
//   H3 샐러리 플로어가 현금 중립  (payroll + fine = floor → 페이롤을 올릴 유인 0)
//   H4 FA 시장 고액 계약 미형성   (fix/#29 영역 — 이번 계측에서는 상수 취급)
//
// ⚠️ 게임 코드는 일절 수정하지 않는다. 부트스트랩은 tools/harness.js와 공유한다.
// ⚠️ 드래프트 함정: _processDraftPick이 유저 지명 차례에 UI 입력을 기다리며 멈춘다.
//    draftPick()으로 이어주지 않으면 시즌당 6명 유입이 통째로 빠져 로스터·예산 수지를 오판한다.

'use strict';
const H = require('./harness');

const SEED = Number(process.argv[2]) || 20260826;
const SEASONS = Number(process.argv[3]) || 12;
// 4번째 인자로 드래프트 라운드를 갈아끼운다 (밸런스 반사실). 미지정 시 실제 소스값 그대로.
const ROUNDS = process.argv[4] ? Number(process.argv[4]) : null;
// 5번째 인자: 밸런스 패키지 반사실.
//   dev / svc / retire / purge / fa5 — '+'로 조합 (예: svc+retire)
const PKG = process.argv[5] || null;

// ── 반사실 패키지 ────────────────────────────────────────────
// 드래프트 라운드를 유지한 채(E 고정) a=S/E의 다른 축을 건드리는 후보들.
//   dev    : 진입 OVR 상향 + 팜 XP 상향 (육성 가속)
//   svc    : 팜에도 서비스 부분 적립 (1군 슬롯 희소성과 FA 자격을 분리)
//   retire : 은퇴 시작 나이 33 → 35 (커리어 길이 L 연장)
//   purge  : 팜 조기 방출 임계 59 → 38 (슬롯을 못 딸 선수를 일찍 정리)
//   svc+retire 처럼 '+'로 조합 가능
const DRAFT_OVR_MAP = {
  'rand(1,18)':  'rand(14,34)',
  'rand(4,21)':  'rand(16,36)',
  'rand(9,26)':  'rand(20,38)',
  'rand(4,18)':  'rand(12,28)',
  'rand(14,31)': 'rand(22,40)',
};
const on = (name) => !!PKG && PKG.split('+').includes(name);

function pkgTransform(code, src){
  if(on('dev') && src.endsWith('player-factory.js')){
    Object.entries(DRAFT_OVR_MAP).forEach(([from,to])=>{
      code = code.split('_forceDraftOvr(p,'+from+')').join('_forceDraftOvr(p,'+to+')');
    });
  }
  if(src.endsWith('constants.js')){
    if(on('dev')){
      code = code.replace(/const XP_FUTURES\s*=\s*\d+;/, 'const XP_FUTURES = 14;');
      code = code.replace(/const XP_DEVELOPMENTAL\s*=\s*\d+;/, 'const XP_DEVELOPMENTAL = 10;');
    }
    if(on('retire')) code = code.replace(/const RETIRE_MIN_AGE=\d+;/, 'const RETIRE_MIN_AGE=35;');
    if(on('fa5'))    code = code.replace(/const FA_SERVICE_TIME_THRESHOLD=\d+;/, 'const FA_SERVICE_TIME_THRESHOLD=5;');
  }
  // 팜 서비스 부분 적립 — 1군 등록 경기만 세던 것을 2군/육성에도 40% 크레딧으로 확장.
  // 1군 슬롯(240)이 희소해 유입(56)을 감당 못 하는 구조에서, FA 자격을 슬롯 경쟁과 분리한다.
  if((on('svc')||on('svc2')) && src.endsWith('match-postgame.js')){
    // 필요 크레딧 계산: 서비스 = a×1.0 + f×c ≥ 6.  a(1군)=4.3, f(팜)≈3~5 →  c ≥ 0.34~0.57
    // svc  c≈0.38 (0.4게임/경기 → 8시리즈/21)  — 계산상 하한, 약함
    // svc2 c≈0.62 (0.65게임/경기 → 13시리즈/21) — 밴드 중앙
    const _c = on('svc2') ? 0.65 : 0.4;
    code = code.replace(
      "G.teams.forEach(tm=>tm.roster.forEach(p=>{if((p.status||'active')==='active'&&p.role!=='overseas')p._svcGames=(p._svcGames||0)+1;}));",
      "G.teams.forEach(tm=>tm.roster.forEach(p=>{const _st=(p.status||'active');" +
      "if(_st==='active'&&p.role!=='overseas')p._svcGames=(p._svcGames||0)+1;" +
      "else if(_st==='futures'||_st==='developmental')p._svcGames=(p._svcGames||0)+"+_c+";}));");
  }
  if(on('purge') && src.endsWith('season-flow.js')){
    code = code.replace('const releaseThreshold=FUTURES_ORG_MAX-6;', 'const releaseThreshold=38;');
  }
  // ── 처방 무력화 (A/B 대조용) ──
  // H1/H3는 rand() 호출 수를 바꿔 **이후 난수 시퀀스를 통째로 어긋나게** 한다.
  // 따라서 단일 시드의 전후 비교는 처방 효과와 표본 흔들림을 분리하지 못한다.
  // 같은 시드에서 처방만 끈 대조군을 만들어 다중 시드로 대조한다.
  if(on('noH1') && src.endsWith('season-flow.js')){
    // 구 동작 복원: OVR>=70 x1.2 / <31 x0.8 / 그 외 x1(=동결).
    // 개행 없는 한 줄 치환만 쓴다 — 여러 줄 매칭은 이스케이프가 깨지기 쉽다.
    code = code.replace(
      'p.salary=Math.max(SALARY_MIN,+_calcNewSalary(p,team).toFixed(1));',
      'p.salary=Math.max(SALARY_MIN,+((p.salary||SALARY_MIN)*(ovr(p)>=70?1.2:ovr(p)<31?0.8:1)).toFixed(1));');
  }
  if(on('noH3') && src.endsWith('constants.js')){
    code = code.replace(/const SALARY_FLOOR_PENALTY_RATE = [\d.]+;/, 'const SALARY_FLOOR_PENALTY_RATE = 1.0;');
  }
  return code;
}

const h = H.createHarness();
const load = H.loadModules(h, (ROUNDS == null && !PKG) ? null : (code, src) => {
  if (ROUNDS != null && src.endsWith('constants.js')) {
    code = code.replace(/const DRAFT_ROUNDS=\d+;/, `const DRAFT_ROUNDS=${ROUNDS};`);
  }
  return pkgTransform(code, src);
});
if (load.loadErrors) {
  load.errors.forEach((e) => console.error(`로드 실패: ${e.src} → ${e.message}`));
  process.exit(1);
}
H.installHelpers(h);
const g = h.g;

// ── 스냅샷: 팀 재정 + 전 선수 연봉 상태 ─────────────────────
// 연봉 밴드는 게임 자체의 getContractPhase()를 쓴다 (프로브가 규칙을 재구현하면 어긋난다).
function snapshot() {
  return g(`(function(){
    const teams=G.teams.map(function(t){
      return {name:t.name, payroll:getPayroll(t), budget:+(t.budget||0).toFixed(1),
              luxTax:getLuxuryTax(t), upkeep:calcAnnualUpkeep(t).total};
    });
    const players=[];
    G.teams.forEach(function(t){
      t.roster.forEach(function(p){
        players.push({uid:p._uid, team:t.name, salary:+(p.salary||0),
                      ovr:ovr(p), st:+(p._serviceTime||0), band:getContractPhase(p),
                      age:p.age||0, years:+(p._contractYears||0),
                      grp:_ovrCalibGroup(p), active:(p.status||'active')==='active'});
      });
    });
    // FA 풀은 로스터 밖 보관소다. 여기서 2오프시즌(FA_UNSIGNED_MAX_YEARS) 안에 계약되지 않으면
    // 선수가 게임에서 영구 삭제되므로, 페이롤 수지를 보려면 반드시 함께 봐야 한다.
    const fa=(G.faPool||[]).map(function(p){
      return {uid:p._uid, salary:+(p.salary||0), ovr:ovr(p), faYears:+(p._faYears||0),
              st:+(p._serviceTime||0), grp:_ovrCalibGroup(p), isPitcher:!!p.isPitcher};
    });
    return {teams:teams, players:players, faPool:fa,
            bidLog:(G.faBiddingLog||[]).length,
            bids:(G.faBiddingLog||[]).map(function(x){return {bidders:x.bidders,salary:x.salary,ovr:x.ovr};}),
            floor:getSalaryFloor(), luxLine:getLuxuryTaxLine(), season:G.season};
  })()`);
}

// ── 드래프트 체인 구동 (AI 픽은 setTimeout 재귀, 내 픽은 draftPick 호출) ──
function runDraftChain() {
  let guard = 0, myPicks = 0;
  while (guard++ < 200) {
    h.drainTimers();
    const stalled = g(`(function(){const ds=G._draftState;
      return !!(ds && ds.round<=ds.totalRounds && G.draftPool.length>0 && ds.order[ds.pickInRound]===G.myTeam);})()`);
    if (!stalled) break;
    // 정원이 찼으면 draftPick()이 거부하므로 먼저 자리를 비운다 (유저의 방출 행동 대체)
    g(`__harnessMakeDraftRoom();`);
    const before = g('G.draftPool.length');
    g(`draftPick(G.draftPool[0]._uid);`);
    if (g('G.draftPool.length') === before) break;   // 여전히 거부 → 무한루프 방지
    myPicks++;
  }
  h.drainTimers();
  return myPicks;
}

// ── 한 시즌 진행: 프리시즌 → 전반기 → 올스타·드래프트 → 후반기 ──
function playRegular() {
  g(`G.phase='preseason'; showPreseason(); G.phase='first_half';`);
  g(`__playHalf(FIRST_HALF_END);`);
  g(`G.phase='allstar'; showAllStarBreak(); _startRookieDraft();`);
  const picks = runDraftChain();
  g(`__playHalf(TOTAL_REGULAR);`);
  return { picks, gameNum: g('G.gameNum') };
}

// ── 오프시즌: 포스트시즌 → 시상식(은퇴) → GM회의 → 스토브(정산) → 롤오버 ──
// 정산(수익·사치세·플로어 벌과금·급여 차감)은 showStoveLeague 안에서 일어나므로,
// 그 직전 상태를 따로 찍어 "정산 입력"이 무엇이었는지 남긴다.
function playOffseason() {
  g(`G.phase='postseason'; showPostseason();
     if(typeof _runPostseason==='function' && G.postseasonBracket && G.postseasonBracket.round==='semifinal'
        && _sortByWinPct().indexOf(G.myTeam)<POSTSEASON_TEAMS){ _runPostseason(); }`);
  const preAwards = snapshot();   // 은퇴 처리 직전 — showAwards가 은퇴를 집행한다
  g(`G.phase='awards'; showAwards();`);
  g(`G.phase='gm_meeting'; showGMMeeting();`);
  const preStove = snapshot();
  g(`G.phase='stove_league'; showStoveLeague();`);
  // ⚠️ 반드시 _startNextSeason() **전에** 찍는다 — 그 함수가 G.faBiddingLog를 리셋하므로
  //    (season-flow.js:439) 나중에 읽으면 AI 낙찰 건수가 항상 0으로 관측된다.
  const postStove = snapshot();
  g(`_startNextSeason();`);
  // 유저 팀은 오프시즌 자동 보충 대상이 아니다(AI 전용) — 실제 유저의 FA 계약 행동을 대신한다.
  g(`__harnessUserSignFA();`);
  return { preStove, postStove, preAwards };
}

// ── 집계 ────────────────────────────────────────────────────
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const f1 = (v) => v.toFixed(1);

const rows = [];
let err = null;
let annualBase = null;   // 직전 시즌 개막 스냅샷 (연간 순환 계산 기준)

console.log(`시드 ${SEED} · ${SEASONS}시즌 롤아웃 · 리그 8팀` + (ROUNDS == null ? '' : ` · 드래프트 ${ROUNDS}라운드`) + (PKG ? ` · 패키지[${PKG}]` : ''));
console.log('계측 중...');

// 시드 고정 후 신규 리그 생성 — srand()를 initTeams보다 먼저 불러야 초기 로스터까지 재현된다.
g(`srand(${SEED}); G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0;
   if(typeof generateMarket==='function') generateMarket();`);
annualBase = snapshot();   // S1 개막 기준선

for (let s = 1; s <= SEASONS; s++) {
  try {
    const reg = playRegular();
    const endRegular = snapshot();
    if (reg.gameNum !== g('TOTAL_REGULAR')) {
      const diag = g(`(function(){
        const t=G.myTeam, v=validateActiveRoster(t);
        return {phase:G.phase, gameNum:G.gameNum, draftState:!!G._draftState,
                poolLeft:(G.draftPool||[]).length, org:t.roster.length,
                active:getActiveCount(t), ok:v.ok, violations:v.violations};
      })()`);
      err = `시즌 ${s}: 정규시즌 미완주 (${reg.gameNum}) — ${JSON.stringify(diag)}`;
      break;
    }

    const { preStove, postStove, preAwards } = playOffseason();
    const nextPre = snapshot();

    // 정산 입력 기준 플로어/사치세
    const floor = preStove.floor;
    const fails = preStove.teams.filter((t) => t.payroll < floor);
    const fineTotal = sum(fails.map((t) => floor - t.payroll));
    const luxTotal = sum(preStove.teams.map((t) => t.luxTax));

    // 오프시즌 유입/유출 (정규시즌 종료 → 다음 시즌 개막 전)
    const before = new Map(endRegular.players.map((p) => [p.uid, p]));
    const after = new Map(nextPre.players.map((p) => [p.uid, p]));
    const leavers = endRegular.players.filter((p) => !after.has(p.uid));
    const joiners = nextPre.players.filter((p) => !before.has(p.uid));

    // 잔류 선수의 연봉 변화 — H1(중간 대역 동결) 직접 측정
    const stayers = nextPre.players.filter((p) => before.has(p.uid));
    const frozen = stayers.filter((p) => p.salary === before.get(p.uid).salary);
    const raised = stayers.filter((p) => p.salary > before.get(p.uid).salary);
    const cut = stayers.filter((p) => p.salary < before.get(p.uid).salary);

    // H1 판정: 동결률을 **OVR 대역별**로 쪼갠다.
    // season-flow.js의 게이트가 `pOvr>=70 ? 1.2 : pOvr<31 ? 0.8 : 0`이므로,
    // 중간 대역(31~69)만 동결률이 압도적으로 높으면 그 게이트가 원인으로 확정된다.
    const bandOf = (o) => (o >= 70 ? 'hi' : o < 31 ? 'lo' : 'mid');
    const ovrBands = { lo: { n: 0, frozen: 0 }, mid: { n: 0, frozen: 0 }, hi: { n: 0, frozen: 0 } };
    // 계약 기간이 남은 선수는 애초에 재산정 대상이 아니다(`if(_contractYears>0) return`).
    // 전체 잔류자로 동결률을 재면 "계약 유효"와 "게이트 동결"이 섞여 H1을 판정할 수 없으므로,
    // preStove 시점 _contractYears<=1 (스토브의 -1 감소 후 0이 되는) 선수로 한정한다.
    const preS = new Map(preStove.players.map((p) => [p.uid, p]));
    const expiring = stayers.filter((p) => preS.has(p.uid) && preS.get(p.uid).years <= 1);
    expiring.forEach((p) => {
      const b = ovrBands[bandOf(before.get(p.uid).ovr)];
      b.n++;
      if (p.salary === before.get(p.uid).salary) b.frozen++;
    });

    // 연간 순환 (드래프트 포함) — 오프시즌 창만 보면 시즌 중 드래프트 유입 48명이 통째로 빠진다.
    const aBefore = new Map(annualBase.players.map((p) => [p.uid, p]));
    const annualIn = nextPre.players.filter((p) => !aBefore.has(p.uid));
    const annualOut = annualBase.players.filter((p) => !after.has(p.uid));
    // FA 자격 신규 진입 = 서비스 6년을 이번 시즌에 넘긴 인원 (공급측). 소멸·은퇴가 유출측.
    const gradIn = nextPre.players.filter((p) => p.st >= 6 && aBefore.has(p.uid) && aBefore.get(p.uid).st < 6);
    const grad = { n: gradIn.length, avgAge: avg(gradIn.map((x) => x.age)), avgOvr: avg(gradIn.map((x) => x.ovr)) };
    annualBase = nextPre;

    // FA 파이프라인 — 방출 → 미계약 적체 → 2오프시즌 후 영구 삭제
    const poolBefore = new Map(preStove.faPool.map((p) => [p.uid, p]));
    const poolAfter = new Map(nextPre.faPool.map((p) => [p.uid, p]));
    const rosterAfter = new Map(nextPre.players.map((p) => [p.uid, p]));
    // preStove 로스터에 있었는데 nextPre엔 FA 풀에 있는 선수 = 이번 오프시즌 방출
    const releasedToFA = preStove.players.filter((p) => poolAfter.has(p.uid));
    // preStove 풀에 있었는데 nextPre엔 풀에도 로스터에도 없음 = 미계약 한계 도달로 영구 삭제
    const vanished = preStove.faPool.filter((p) => !poolAfter.has(p.uid) && !rosterAfter.has(p.uid));
    const faPipe = {
      poolBefore: preStove.faPool.length, poolAfter: nextPre.faPool.length,
      released: releasedToFA.length, relAvgOvr: avg(releasedToFA.map((x) => x.ovr)),
      signed: postStove.bidLog,
      vanished: vanished.length, vanAvgOvr: avg(vanished.map((x) => x.ovr)),
      vanAvgSalary: avg(vanished.map((x) => x.salary)),
    };
    // 은퇴 배수구 — showAwards 전후 로스터 차집합. 방출(FA행)·소멸(미계약 삭제)과 겹치지 않는다.
    const preAw = new Map(preAwards.players.map((p) => [p.uid, p]));
    const postAw = new Map(preStove.players.map((p) => [p.uid, p]));
    const retired = preAwards.players.filter((p) => !postAw.has(p.uid));
    const retiredFA = retired.filter((p) => p.st >= 6);
    const retInfo = { n: retired.length, avgOvr: avg(retired.map((x) => x.ovr)),
                      avgSalary: avg(retired.map((x) => x.salary)),
                      faN: retiredFA.length, faSalary: sum(retiredFA.map((x) => x.salary)) };

    // ── FA 깔때기 게이트별 손실 ──────────────────────────────
    // 임계값 정렬: 51 = 소속팀 재계약 자격선(season-flow), 59 = AI 입찰 진입선(contracts-fa GATE A),
    //              67/75/84 = interest 티어. 이 버킷으로 나누면 어느 게이트가 후보를 삼키는지 보인다.
    const BK = ['<51', '51~58', '59~66', '67~74', '75+'];
    const bucket = (o) => (o < 51 ? 0 : o < 59 ? 1 : o < 67 ? 2 : o < 75 ? 3 : 4);
    const hist = (arr) => { const c = [0, 0, 0, 0, 0]; arr.forEach((x) => c[bucket(x.ovr)]++); return c; };

    // AI가 FA 풀을 거치지 않고 즉시 삭제한 선수 (_aiOptimizeRoster §2 정원정리 / §3 고액정리).
    // 은퇴는 showAwards(=preStove 이전)에서 끝나므로 여기 섞이지 않는다.
    const purged = preStove.players.filter((p) => !rosterAfter.has(p.uid) && !poolAfter.has(p.uid));
    const funnel = {
      poolAtBid: hist(preStove.faPool),      // 입찰 직전 풀 구성 = AI가 실제로 마주하는 후보
      released: hist(releasedToFA),
      vanished: hist(vanished),
      purged: purged.length, purgedHist: hist(purged),
      purgedSalary: sum(purged.map((x) => x.salary)),
    };

    // ── 반사실 사이징: "뎁스 기반 니즈" 규칙이면 몇 명이 흡수되는가 ──
    // 제안 규칙 = FA의 OVR이 어떤 팀의 해당 포지션 그룹 **주전 최하위**보다 높으면 그 팀에 니즈가 있다.
    // 그룹별 주전 수는 라인업 구조에서 온다 (C1 / MIF2 / CIF2+DH / OF3 / SP5 / RP6).
    const STARTERS = { C: 1, MIF: 2, CIF: 3, OF: 3, SP: 5, RP: 6 };
    const depthByTeam = {};
    preStove.players.filter((p) => p.active).forEach((p) => {
      (depthByTeam[p.team] = depthByTeam[p.team] || {});
      (depthByTeam[p.team][p.grp] = depthByTeam[p.team][p.grp] || []).push(p.ovr);
    });
    Object.values(depthByTeam).forEach((t) => Object.values(t).forEach((a) => a.sort((x, y) => y - x)));
    const myTeamName = g('G.myTeam.name');
    const wouldFit = preStove.faPool.map((fa) => {
      let n = 0;
      Object.entries(depthByTeam).forEach(([tn, grps]) => {
        if (tn === myTeamName) return;              // AI 팀만 (유저 팀은 수동 영입)
        const need = STARTERS[fa.grp] || 3;
        const arr = grps[fa.grp] || [];
        const worstStarter = arr.length >= need ? arr[need - 1] : -1;  // 인원 미달이면 무조건 니즈
        if (fa.ovr > worstStarter) n++;
      });
      return { ovr: fa.ovr, teams: n };
    });
    const sizing = {
      total: wouldFit.length,
      fits: wouldFit.filter((x) => x.teams > 0).length,
      avgTeams: avg(wouldFit.filter((x) => x.teams > 0).map((x) => x.teams)),
      fitsBelow59: wouldFit.filter((x) => x.teams > 0 && x.ovr < 59).length,
    };

    // 1군 슬롯 vs 팜 — 서비스 적립은 1군 등록 경기 기준이라, 팜이 팽창하면 적립이 굶는다.
    const activeN = nextPre.players.filter((p) => p.active).length;
    const farmP = nextPre.players.filter((p) => !p.active);
    const actP = nextPre.players.filter((p) => p.active);
    const slots = { active: activeN, farm: farmP.length, total: nextPre.players.length,
      farmAge: avg(farmP.map((x) => x.age)), farmOvr: avg(farmP.map((x) => x.ovr)),
      actAge: avg(actP.map((x) => x.age)), actOvr: avg(actP.map((x) => x.ovr)),
      // 팜에 갇힌 채 나이만 먹는 인원 — 1군 진입 없이 26세를 넘긴 선수
      farmStuck: farmP.filter((x) => x.age >= 26).length,
      farmSvc0: farmP.filter((x) => x.st < 1).length };

    // 서비스타임 분포 — FA 자격자(>=6)가 실제로 줄어드는지
    const svc = { rookie: 0, arb: 0, faElig: 0 };
    nextPre.players.forEach((p) => { if (p.st >= 6) svc.faElig++; else if (p.st >= 3) svc.arb++; else svc.rookie++; });

    const bands = {};
    ['pre', 'arb', 'fa'].forEach((b) => {
      const ps = nextPre.players.filter((p) => p.band === b);
      bands[b] = { n: ps.length, total: sum(ps.map((p) => p.salary)) };
    });

    rows.push({
      season: s,
      payAvg: avg(preStove.teams.map((t) => t.payroll)),
      payMin: Math.min(...preStove.teams.map((t) => t.payroll)),
      payMax: Math.max(...preStove.teams.map((t) => t.payroll)),
      budAvg: avg(nextPre.teams.map((t) => t.budget)),
      floor, fails: fails.length, fineTotal, luxTotal,
      inN: joiners.length, inAvg: avg(joiners.map((p) => p.salary)),
      outN: leavers.length, outAvg: avg(leavers.map((p) => p.salary)),
      stayN: stayers.length, frozenN: frozen.length, raisedN: raised.length, cutN: cut.length,
      ovrBands,
      aInN: annualIn.length, aInAvg: avg(annualIn.map((p) => p.salary)),
      aOutN: annualOut.length, aOutAvg: avg(annualOut.map((p) => p.salary)),
      bands, faPipe, svc, retInfo, funnel, sizing, grad, slots,
      bidDetail: postStove.bids || [],
      picks: reg.picks,
    });
    process.stdout.write(`  S${s} `);
  } catch (e) {
    err = `시즌 ${s}: ${e.message} @phase=${g('G.phase')}`;
    break;
  }
}
console.log('\n');

if (rows.length === 0) { console.error('계측 실패:', err); process.exit(1); }

// ── 리포트 ──────────────────────────────────────────────────
console.log('═══ 1. 페이롤 · 예산 궤적 (정산 입력 기준) ═══');
console.log('  S | 리그평균  최소   최대 | 예산평균 | 플로어 미달 벌과금 | 사치세');
rows.forEach((r) => {
  console.log(`  ${String(r.season).padStart(2)} | ${f1(r.payAvg).padStart(7)} ${f1(r.payMin).padStart(6)} ${f1(r.payMax).padStart(6)} | ${f1(r.budAvg).padStart(8)} | ${String(r.floor).padStart(4)} ${String(r.fails).padStart(3)}팀 ${f1(r.fineTotal).padStart(7)} | ${f1(r.luxTotal).padStart(6)}`);
});

console.log('\n═══ 2. 연간 유입 vs 유출 평균 연봉 (H2 — 일방향 치환) ═══');
console.log('  ※ 드래프트(시즌 중 유입)를 포함한 개막→개막 1년 순환. 맨 오른쪽은 오프시즌 창만.');
console.log('  S | 유입 인원 평균연봉 | 유출 인원 평균연봉 | 순효과(억) | 오프시즌 유입/유출');
rows.forEach((r) => {
  const net = r.aInN * r.aInAvg - r.aOutN * r.aOutAvg;
  console.log(`  ${String(r.season).padStart(2)} | ${String(r.aInN).padStart(4)}명 ${f1(r.aInAvg).padStart(7)} | ${String(r.aOutN).padStart(4)}명 ${f1(r.aOutAvg).padStart(7)} | ${f1(net).padStart(10)} | ${String(r.inN).padStart(4)}/${String(r.outN).padStart(4)}명`);
});

console.log('\n═══ 3. 잔류 선수 연봉 동결률 — OVR 대역별 (H1 판정) ═══');
console.log('  ※ season-flow 게이트: OVR>=70 ×1.2 / OVR<31 ×0.8 / 그 외 배율 0(=조기 return)');
console.log('  S | 잔류   동결   인상   삭감 | OVR<31 동결 | OVR31~69 동결 | OVR>=70 동결');
rows.forEach((r) => {
  const b = r.ovrBands;
  const pc = (x) => (x.n ? (x.frozen / x.n * 100).toFixed(1) : '-');
  console.log(`  ${String(r.season).padStart(2)} | ${String(r.stayN).padStart(4)} ${String(r.frozenN).padStart(6)} ${String(r.raisedN).padStart(6)} ${String(r.cutN).padStart(6)} | ${String(b.lo.frozen).padStart(3)}/${String(b.lo.n).padStart(3)} ${pc(b.lo).padStart(6)}% | ${String(b.mid.frozen).padStart(3)}/${String(b.mid.n).padStart(3)} ${pc(b.mid).padStart(6)}% | ${String(b.hi.frozen).padStart(3)}/${String(b.hi.n).padStart(3)} ${pc(b.hi).padStart(6)}%`);
});

console.log('\n═══ 4. 연봉 밴드 분포 (다음 시즌 개막 기준) ═══');
console.log('  S |  프리Arb n/총액  |    Arb n/총액   |     FA n/총액');
rows.forEach((r) => {
  const b = r.bands;
  console.log(`  ${String(r.season).padStart(2)} | ${String(b.pre.n).padStart(4)}명 ${f1(b.pre.total).padStart(7)} | ${String(b.arb.n).padStart(4)}명 ${f1(b.arb.total).padStart(7)} | ${String(b.fa.n).padStart(4)}명 ${f1(b.fa.total).padStart(7)}`);
});

console.log('');
console.log('═══ 5. FA 파이프라인 (H2·H4 — 베테랑 배수구) ═══');
console.log('  ※ 방출: 재계약 실패로 FA 풀行 / 낙찰: AI가 실제 영입 / 소멸: 2오프시즌 미계약으로 영구 삭제');
console.log('  S | 풀(전→후) | 방출 평균OVR | 낙찰 | 소멸 평균OVR 평균연봉 | 서비스 신인/Arb/FA자격');
rows.forEach((r) => {
  const f = r.faPipe, v = r.svc;
  console.log(`  ${String(r.season).padStart(2)} | ${String(f.poolBefore).padStart(3)}→${String(f.poolAfter).padStart(3)} | ${String(f.released).padStart(4)}명 ${f1(f.relAvgOvr).padStart(5)} | ${String(f.signed).padStart(4)} | ${String(f.vanished).padStart(4)}명 ${f1(f.vanAvgOvr).padStart(5)} ${f1(f.vanAvgSalary).padStart(7)} | ${String(v.rookie).padStart(4)}/${String(v.arb).padStart(4)}/${String(v.faElig).padStart(4)}`);
});

console.log('');
console.log('═══ 6. 베테랑 배수구 귀속 (은퇴 vs 미계약 소멸) ═══');
console.log('  S | 은퇴 평균OVR 평균연봉 | 그중 FA자격 인원/연봉합 | 소멸 | 배수구 합계 연봉');
rows.forEach((r) => {
  const t = r.retInfo, f = r.faPipe;
  const drain = t.n * t.avgSalary + f.vanished * f.vanAvgSalary;
  console.log(`  ${String(r.season).padStart(2)} | ${String(t.n).padStart(4)}명 ${f1(t.avgOvr).padStart(5)} ${f1(t.avgSalary).padStart(7)} | ${String(t.faN).padStart(4)}명 ${f1(t.faSalary).padStart(8)} | ${String(f.vanished).padStart(4)}명 | ${f1(drain).padStart(8)}억`);
});

console.log('');
console.log('═══ 7. FA 깔때기 게이트별 손실 (OVR 버킷) ═══');
console.log('  ※ 게이트: 51=소속팀 재계약 자격선 / 59=AI 입찰 진입선(GATE A) / 67·75=interest 티어');
console.log('  구분        |  <51  51~58 | 59~66 67~74  75+ | AI가 볼 수 있는 비율');
const agg = (key) => rows.reduce((a, r) => a.map((v, i) => v + r.funnel[key][i]), [0, 0, 0, 0, 0]);
[['입찰직전 풀', 'poolAtBid'], ['방출(풀行)', 'released'], ['소멸(삭제)', 'vanished']].forEach(([label, key]) => {
  const c = agg(key), tot = c.reduce((a, x) => a + x, 0);
  const visible = c[2] + c[3] + c[4];
  console.log(`  ${label.padEnd(11)} | ${String(c[0]).padStart(5)} ${String(c[1]).padStart(6)} | ${String(c[2]).padStart(5)} ${String(c[3]).padStart(5)} ${String(c[4]).padStart(4)} | ${tot ? (visible / tot * 100).toFixed(1) : '0.0'}% (${visible}/${tot})`);
});
const pc = rows.reduce((a, r) => a.map((v, i) => v + r.funnel.purgedHist[i]), [0, 0, 0, 0, 0]);
const pTot = pc.reduce((a, x) => a + x, 0);
console.log(`  ${'즉시삭제'.padEnd(11)} | ${String(pc[0]).padStart(5)} ${String(pc[1]).padStart(6)} | ${String(pc[2]).padStart(5)} ${String(pc[3]).padStart(5)} ${String(pc[4]).padStart(4)} | 총 ${pTot}명 · 연봉 ${f1(sum(rows.map((r) => r.funnel.purgedSalary)))}억`);
console.log('  ※ 즉시삭제 = _aiOptimizeRoster §2(정원>59) · §3(페이롤>캡)의 roster.splice — FA 풀을 아예 거치지 않는다');

console.log('');
console.log('═══ 8. 반사실 사이징 — 뎁스 기반 니즈로 바꾸면? ═══');
console.log('  ※ 규칙: FA OVR > 그 팀 해당 포지션 그룹의 주전 최하위 OVR → 니즈 성립 (AI 7팀 대상)');
console.log('  S | 풀 인원 | 니즈 성립 | 성립률 | 평균 경쟁팀수 | 그중 OVR<59 (현행 GATE A가 막는 인원)');
rows.forEach((r) => {
  const z = r.sizing;
  const rate = z.total ? (z.fits / z.total * 100) : 0;
  console.log(`  ${String(r.season).padStart(2)} | ${String(z.total).padStart(6)} | ${String(z.fits).padStart(8)} | ${rate.toFixed(1).padStart(5)}% | ${f1(z.avgTeams).padStart(11)} | ${String(z.fitsBelow59).padStart(4)}명`);
});
const zt = rows.reduce((a, r) => ({ total: a.total + r.sizing.total, fits: a.fits + r.sizing.fits, below: a.below + r.sizing.fitsBelow59 }), { total: 0, fits: 0, below: 0 });
console.log(`  누계 | ${String(zt.total).padStart(6)} | ${String(zt.fits).padStart(8)} | ${(zt.fits / zt.total * 100).toFixed(1).padStart(5)}% |             | ${String(zt.below).padStart(4)}명`);

console.log('');
console.log('═══ 9. FA 자격 인구 수지 (공급 vs 유출) ═══');
console.log('  S | 신규진입 평균나이 평균OVR | 은퇴(FA자격) | 소멸 | 순증감 | 기말 인구');
rows.forEach((r) => {
  const gd = r.grad, net = gd.n - r.retInfo.faN - r.faPipe.vanished;
  console.log(`  ${String(r.season).padStart(2)} | ${String(gd.n).padStart(6)}명 ${f1(gd.avgAge).padStart(7)} ${f1(gd.avgOvr).padStart(7)} | ${String(r.retInfo.faN).padStart(9)}명 | ${String(r.faPipe.vanished).padStart(3)}명 | ${String(net > 0 ? '+' + net : net).padStart(6)} | ${String(r.svc.faElig).padStart(6)}명`);
});

console.log('');
console.log('═══ 10. 낙찰 상세 — 과열 가드 ═══');
const allBids = rows.flatMap((r) => r.bidDetail);
if (allBids.length) {
  const multi = allBids.filter((x) => x.bidders >= 3).length;
  console.log(`  총 낙찰 ${allBids.length}건 · 평균 경쟁 ${f1(avg(allBids.map((x) => x.bidders)))}팀 · 3팀 이상 경쟁 ${multi}건 (${(multi / allBids.length * 100).toFixed(1)}%)`);
  console.log(`  평균 낙찰 연봉 ${f1(avg(allBids.map((x) => x.salary)))}억 · 최고 ${f1(Math.max(...allBids.map((x) => x.salary)))}억 · 평균 OVR ${f1(avg(allBids.map((x) => x.ovr)))}`);
  console.log('  ※ 평균 경쟁이 3팀을 넘으면 프리미엄 1.25배가 상시화 = 과열. 목표 1.5~2.5팀');
} else { console.log('  낙찰 0건'); }

console.log('');
console.log('═══ 11b. 팜 정체 — 유망주가 1군에 도달하는가 ═══');
console.log('  S |  팜  평균나이 평균OVR | 1군 평균나이 평균OVR | 26세+ 팜 | 서비스<1년 팜');
rows.forEach((r) => {
  const s2 = r.slots;
  console.log(`  ${String(r.season).padStart(2)} | ${String(s2.farm).padStart(3)} ${f1(s2.farmAge).padStart(8)} ${f1(s2.farmOvr).padStart(8)} | ${f1(s2.actAge).padStart(11)} ${f1(s2.actOvr).padStart(8)} | ${String(s2.farmStuck).padStart(7)}명 | ${String(s2.farmSvc0).padStart(9)}명`);
});

console.log('');
console.log('═══ 11. 슬롯 수지 — 1군 정원 vs 유입 (드래프트 밸런스) ═══');
console.log('  S | 리그인원  1군  팜 | 연간유입 | 1인당 활동시즌 a=1군/유입 | FA(6년) 도달 가능?');
rows.forEach((r) => {
  const sl = r.slots, E = r.aInN, a = E ? sl.active / E : 0;
  console.log(`  ${String(r.season).padStart(2)} | ${String(sl.total).padStart(7)} ${String(sl.active).padStart(4)} ${String(sl.farm).padStart(4)} | ${String(E).padStart(7)}명 | ${f1(a).padStart(21)} | ${a >= 6 ? 'O' : 'X (a<6)'}`);
});
const avgActive = avg(rows.map((r) => r.slots.active));
const avgE = avg(rows.map((r) => r.aInN));
console.log(`  평균: 1군 ${f1(avgActive)}슬롯 / 유입 ${f1(avgE)}명 = 1인당 ${f1(avgActive / avgE)}시즌`);
console.log(`  ※ FA 자격에 필요한 1군 시즌 = ${g('FA_SERVICE_TIME_THRESHOLD')}. a가 이보다 작으면 평균적인 선수는 FA에 도달할 수 없다.`);
console.log(`  ※ 목표 a = 6 + (원하는 FA 잔여 시즌). 필요 유입 E = 1군슬롯 / a`);
[6, 8, 9, 10].forEach((a) => {
  const need = avgActive / a;
  console.log(`     a=${String(a).padStart(2)} (FA 잔여 ${a - 6}시즌) → 필요 유입 ${f1(need)}명/시즌 → 드래프트 ${f1(need - (avgE - g('DRAFT_ROUNDS') * 8))}명 = ${f1((need - (avgE - g('DRAFT_ROUNDS') * 8)) / 8)}라운드`);
});

const first = rows[0], last = rows[rows.length - 1];
console.log('\n═══ 요약 ═══');
console.log(`  리그 평균 페이롤 : ${f1(first.payAvg)}억 (S${first.season}) → ${f1(last.payAvg)}억 (S${last.season})  [${f1((last.payAvg / first.payAvg - 1) * 100)}%]`);
console.log(`  구단 평균 예산   : ${f1(first.budAvg)}억 → ${f1(last.budAvg)}억`);
console.log(`  플로어 미달 팀시즌: ${sum(rows.map((r) => r.fails))} / ${rows.length * 8} (${(sum(rows.map((r) => r.fails)) / (rows.length * 8) * 100).toFixed(1)}%)`);
console.log(`  누적 벌과금      : ${f1(sum(rows.map((r) => r.fineTotal)))}억`);
console.log(`  누적 사치세      : ${f1(sum(rows.map((r) => r.luxTotal)))}억`);
console.log(`  드래프트 픽(내팀): ${rows.map((r) => r.picks).join(',')}  ← 0이 섞이면 드래프트 함정에 빠진 것`);
if (err) console.log(`\n  ⚠️ 조기 종료: ${err}`);
