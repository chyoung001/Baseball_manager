#!/usr/bin/env node
// ===================== DUGOUT 헤드리스 스모크 테스트 =====================
// 실행: node tools/smoke-test.js
// 목적: 대규모 리팩터(스탯 스케일 전환 등) 전후로 "게임이 여전히 돌아간다"를 자동 검증.
//  - index.html의 <script> 순서 그대로 전 모듈을 Node vm 컨텍스트에 로드 (전역 스코프 재현)
//  - DOM/localStorage는 Proxy 스텁이 흡수, 게임 로직은 실제 코드 그대로 실행
//  - 회귀 가드: H2(스토브 멱등)·H3(연봉 멱등)·H4(테스트 잔재)·H5(예산 밸런스)

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./harness');

const ROOT = H.ROOT;

// ── 결과 수집 ───────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(title) { console.log(`\n━━ ${title} ━━`); }
// 소스 검사 가드용 — Function.prototype.toString()은 **주석까지 포함**한다.
// "구 코드가 사라졌는가"를 볼 땐 주석을 벗기고 봐야 한다
// (실제로 구 규칙을 설명하는 주석이 매칭돼 T47 가드가 오탐한 적이 있다).
const _noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ── 부트스트랩 (DOM 스텁 · vm 컨텍스트 · 모듈 로더 · 하네스 헬퍼) ──
// 구현은 tools/harness.js — 계측 프로브(tools/probe-*.js)와 공유한다.
// 예전엔 이 205줄이 스모크에만 있어서 프로브가 통째로 복사해 썼고, 스텁이나 로스터 보수 규칙이
// 갈리면 "스모크는 통과하는데 프로브만 다른 결과"가 나와 원인 추적이 불가능했다 (미해결 이슈 E-1).
const h = H.createHarness();
const { ctx, timeouts } = h;

// ── 모듈 로드 (index.html 순서) ─────────────────────────────
section('T1. 모듈 로드');
const { srcs, loadErrors, errors } = H.loadModules(h);
check(`index.html에서 스크립트 ${srcs.length}개 발견 (>=50)`, srcs.length >= 50, `발견: ${srcs.length}`);
errors.forEach((e) => console.log(`  ❌ 로드 실패: ${e.src} → ${e.message}`));
check('전 모듈 로드 에러 0건', loadErrors === 0, `${loadErrors}건 실패`);

const g = h.g;
const REQUIRED_GLOBALS = ['G','TEAMS_DATA','initTeams','_simMyGame','showStoveLeague','_showSalaryNegotiation','validateActiveRoster','ovr','saveGame','loadGame','getPayroll','TOTAL_REGULAR','FIRST_HALF_END'];
for (const name of REQUIRED_GLOBALS) {
  check(`전역 심볼 존재: ${name}`, g(`typeof ${name}!=='undefined'`));
}
if (failed > 0) { report(); process.exit(1); } // 로드 실패 시 이후 무의미

// 하네스 전용 헬퍼 주입 (__harnessFixRoster · __playHalf) — 유저의 UI 조작을 대신하는 대체물.
// 함수 선언만 하므로 여기서 미리 주입해도 호출 시점 동작은 이전(각 섹션 직전 주입)과 동일하다.
H.installHelpers(h);

// ── T2. 신규 게임 초기화 ────────────────────────────────────
section('T2. 초기화 & 테스트 잔재 회귀 (H4/H5)');
vm.runInContext(`
  G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0;
  if(typeof generateMarket==='function') generateMarket();
`, ctx);
check('8팀 생성', g('G.teams.length') === 8);
check('전 팀 로스터 30명 이상', g('G.teams.every(t=>t.roster.length>=30)'), `크기: ${g('JSON.stringify(G.teams.map(t=>t.roster.length))')}`);
check('내 팀 최소 로스터 규정 충족', g('validateActiveRoster(G.myTeam).ok'), g('JSON.stringify(validateActiveRoster(G.myTeam).violations)'));
check('전 팀 예산 유한값', g('G.teams.every(t=>Number.isFinite(t.budget))'));
check('H4 회귀: 테스트 선수 강두기 부재', g(`G.teams.every(t=>t.roster.every(p=>p.name!=='강두기'))`));
check('H4 회귀: testMode 기본 false', g('G.testMode') === false);
check('H5 회귀: 세이버스 baseBudget=160', g('TEAMS_DATA[1].baseBudget') === 160);
check('전 선수 OVR 유한값(1~100)', g('G.teams.every(t=>t.roster.every(p=>{const o=ovr(p);return Number.isFinite(o)&&o>=1&&o<=100;}))'));
// P1b 스케일 회귀: 스탯·OVR이 1~100 전 구간 사용 (구 20-80 압축 아님)
check('P1b: 스탯 원값 1~100 범위', g(`(function(){const v=G.teams.flatMap(t=>t.roster.flatMap(p=>p.isPitcher?[p.stuff,p.control,p.velocity]:[p.contact,p.power,p.speed]));return Math.min(...v)>=1&&Math.max(...v)<=100;})()`));
// S급(84+, 상위 ~1%) 존재는 확률적(리그당 기대 ~3명, 0명 확률 ~3%)이라 플레이크 유발 — 분포 폭 검증 목적에 맞게 완화
check('P1b: OVR 분포 확장 (상위 80+ & 하위 <38 공존)', g(`(function(){const o=G.teams.flatMap(t=>t.roster.map(p=>ovr(p)));return o.some(x=>x>=80)&&o.some(x=>x<38);})()`));
// ② 재보정: 1군(active) OVR 중앙값 ~50 (farm 제외). 유저가 기용하는 선수 평균이 50 근처
const activeMed = g(`(function(){const o=G.teams.flatMap(t=>t.roster).filter(p=>(p.status||'active')==='active').map(p=>ovr(p)).sort((a,b)=>a-b);return o[o.length>>1];})()`);
check(`② 1군 OVR 중앙값 ~50 (48~55): ${activeMed}`, activeMed >= 48 && activeMed <= 55);

// ── T3. 정규시즌 전체 자동 시뮬 ─────────────────────────────
section(`T3. 정규시즌 ${g('TOTAL_REGULAR')}경기 자동 시뮬`);
// 라인업이 무너졌을 때 유저의 로스터 탭 수동 보수를 흉내내는 __harnessFixRoster는
// tools/harness.js의 installHelpers()가 이미 주입해 두었다 (게임 코드는 무변경).
const t0 = Date.now();
const simResult = vm.runInContext(`
  (function(){
    G.phase='first_half';
    let simmed=0, guard=0, fixes=0;
    while(G.gameNum<TOTAL_REGULAR && guard<TOTAL_REGULAR*3){
      guard++;
      if(G.phase==='first_half' && G.gameNum>=FIRST_HALF_END) G.phase='second_half'; // 올스타 수동 스킵
      // 부상 등으로 라인업 붕괴 시 유저 개입을 흉내내 자동 보수
      if(!validateActiveRoster(G.myTeam).ok){
        fixes++;__harnessFixRoster();
        const re=validateActiveRoster(G.myTeam);
        if(!re.ok){
          const bats=G.myTeam.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active').length;
          const fut=G.myTeam.roster.filter(p=>p.status==='futures').length;
          return {ok:false, simmed, fixes, gameNum:G.gameNum, reason:'보수 후에도 위반', violations:re.violations, activeBats:bats, futures:fut};
        }
      }
      // 주의: _simMyGame은 성공 시 myWon(패배=false)을 반환하므로, 실패 판정은 gameNum 증가 여부로 한다
      const before=G.gameNum;
      _simMyGame();
      if(G.gameNum===before) return {ok:false, simmed, fixes, gameNum:G.gameNum, reason:'gameNum 미증가(시뮬 거부)', violations:validateActiveRoster(G.myTeam).violations};
      simmed++;
    }
    return {ok:true, simmed, fixes, gameNum:G.gameNum};
  })()
`, ctx);
const simMs = Date.now() - t0;
check(`시즌 시뮬 완주 (${simResult.simmed}경기, 로스터 보수 ${simResult.fixes}회, ${simMs}ms)`, simResult.ok && simResult.gameNum === g('TOTAL_REGULAR'), JSON.stringify(simResult));
check('내 팀 승+패 = 총경기수', g('G.myTeam.wins+G.myTeam.losses') === g('TOTAL_REGULAR'), `${g('G.myTeam.wins')}승 ${g('G.myTeam.losses')}패`);
check('리그 총 승수 = 총 패수', g('G.teams.reduce((s,t)=>s+t.wins,0)') === g('G.teams.reduce((s,t)=>s+t.losses,0)'));
// 투수 기용 회귀: 간이 경로 _simNP=투구수 추정 정합 → 선발 완투 방지, 불펜 이닝 점유 현실 범위
// (구버전 _simNP=PA면 선발이 maxNp(투구수)에 절대 도달 못해 완투 → 불펜 점유 ~5%로 실패)
const bpUsage = g(`(function(){let rot=0,bp=0;G.teams.forEach(t=>t.roster.forEach(p=>{if(!p.isPitcher||!p.ss)return;const o=p.ss.outs||0;if(p.role==='rotation')rot+=o;else if(p.role==='bullpen')bp+=o;}));return {rot,bp,share:(rot+bp)>0?bp/(rot+bp):0};})()`);
check(`불펜 이닝 점유 현실 범위(선발 완투 방지): ${(bpUsage.share*100).toFixed(1)}%`, bpUsage.share>=0.15 && bpUsage.share<=0.60, JSON.stringify(bpUsage));
check('전 팀 예산 유한값 유지', g('G.teams.every(t=>Number.isFinite(t.budget))'));
check('시즌 스탯 NaN 없음', g(`G.teams.every(t=>t.roster.every(p=>{const s=p.ss||{};return Object.values(s).every(v=>typeof v!=='number'||Number.isFinite(v));}))`));
const lgAvg = g(`(function(){let h=0,ab=0;G.teams.forEach(t=>t.roster.forEach(p=>{if(!p.isPitcher&&p.ss){h+=p.ss.h||0;ab+=p.ss.ab||0;}}));return ab>0?h/ab:0;})()`);
check(`리그 타율 온건 범위(0.15~0.40): ${lgAvg.toFixed(3)}`, lgAvg > 0.15 && lgAvg < 0.40);
// ── 매치엔진 리그 총합 앵커 (P4 1단계) — 시즌 시뮬 후 리그 rate를 실측 베이스라인 밴드로 가드.
// MLB2024 앵커(K22.6/BB8.2/HR-PA3.0/BABIP.298/OPS.711/ERA4.08) 델타는 비실패 정보로 인쇄.
// 엔진이 HOT(AVG~.276·ERA~5.1)이라 밴드는 현행 실측 기준 — 다음 Logit/Softmax PR에서 MLB 앵커로 재타겟.
const anchor = g(`(function(){
  let AB=0,H=0,HR=0,BB=0,K=0,XBH=0,OUTS=0,ER=0;
  G.teams.forEach(t=>t.roster.forEach(p=>{const s=p.ss;if(!s)return;
    if(!p.isPitcher){AB+=s.ab||0;H+=s.h||0;HR+=s.hr||0;BB+=s.bb||0;K+=s.k||0;XBH+=s.xbh||0;}
    if(p.isPitcher){OUTS+=s.outs||0;ER+=s.er||0;}}));
  const PA=AB+BB, b1=H-XBH-HR, TB=b1+2*(XBH*0.85)+3*(XBH*0.15)+4*HR;
  return {Kpct:K/PA, BBpct:BB/PA, HRpa:HR/PA, BABIP:(H-HR)/(AB-K-HR),
          OPS:((H+BB)/PA)+(TB/AB), ERA:OUTS>0?ER*27/OUTS:0, PA};
})()`);
const _MLB={Kpct:0.226,BBpct:0.082,HRpa:0.030,BABIP:0.298,OPS:0.711,ERA:4.08};
const _dp=(a,b)=>((a-b)*100).toFixed(1); // %p 델타
console.log(`  [앵커 MLB2024 델타] K%${_dp(anchor.Kpct,_MLB.Kpct)}p · BB%${_dp(anchor.BBpct,_MLB.BBpct)}p · HR/PA${_dp(anchor.HRpa,_MLB.HRpa)}p · BABIP${_dp(anchor.BABIP,_MLB.BABIP)}p · OPS${(anchor.OPS-_MLB.OPS).toFixed(3)} · ERA${(anchor.ERA-_MLB.ERA).toFixed(2)} (PA=${anchor.PA})`);
check(`리그 K% 베이스라인 밴드 0.15~0.21: ${anchor.Kpct.toFixed(4)}`, anchor.Kpct>=0.15 && anchor.Kpct<=0.21);
check(`리그 BB% 베이스라인 밴드 0.075~0.115: ${anchor.BBpct.toFixed(4)}`, anchor.BBpct>=0.075 && anchor.BBpct<=0.115);
check(`리그 HR/PA 베이스라인 밴드 0.018~0.042: ${anchor.HRpa.toFixed(4)}`, anchor.HRpa>=0.018 && anchor.HRpa<=0.042);
check(`리그 BABIP 베이스라인 밴드 0.295~0.340: ${anchor.BABIP.toFixed(4)}`, anchor.BABIP>=0.295 && anchor.BABIP<=0.340);
check(`리그 OPS 베이스라인 밴드 0.70~0.86: ${anchor.OPS.toFixed(4)}`, anchor.OPS>=0.70 && anchor.OPS<=0.86);
check(`리그 ERA 베이스라인 밴드 3.9~6.3: ${anchor.ERA.toFixed(3)}`, anchor.ERA>=3.9 && anchor.ERA<=6.3);
// ① 개인 성적 현실성 가드 — 스프레드 확대 후에도 비현실 값(타율 0.5·홈런 폭주) 방지
const realism = g(`(function(){
  const all=G.teams.flatMap(t=>t.roster);
  const qual=all.filter(p=>!p.isPitcher&&p.ss&&(p.ss.ab||0)>=100);
  const avg=p=>(p.ss.h||0)/(p.ss.ab||1);
  const maxAVG=qual.length?Math.max(...qual.map(avg)):0;
  let hrLeader=null;
  all.forEach(p=>{if(p.ss&&(!hrLeader||(p.ss.hr||0)>(hrLeader.ss.hr||0)))hrLeader=p;});
  const maxHR=hrLeader?(hrLeader.ss.hr||0):0;
  return {maxAVG,maxHR,nQual:qual.length,hrAB:hrLeader?(hrLeader.ss.ab||0):0,hrPow:hrLeader?(hrLeader.power||0):0};
})()`);
check(`① 개인 최고타율 현실성(<0.430): ${realism.maxAVG.toFixed(3)} (100타수+ ${realism.nQual}명)`, realism.maxAVG < 0.430);
check(`① 개인 최다홈런 현실성(${g('TOTAL_REGULAR')}경기 <38): ${realism.maxHR} (ab=${realism.hrAB}, pow=${realism.hrPow})`, realism.maxHR < 38);

// ── T3b. 시리즈 구조 (3연전 상대 고정) ──────────────────────
section('T3b. 시리즈 구조 — 21시리즈 × 3연전');
const seriesProbe = vm.runInContext(`
  (function(){
    const save=G.gameNum;
    const oppAt=gn=>{G.gameNum=gn;return G.teams.indexOf(getOpponent());};
    const csAt=gn=>{G.gameNum=gn;return getCurrentSeries();};
    const s0=[oppAt(0),oppAt(1),oppAt(2)];
    const s1=oppAt(3);
    const cs={g0:csAt(0),g2:csAt(2),g3:csAt(3)};
    const homeConsistent=(function(){G.gameNum=0;const h0=isMyTeamHome();G.gameNum=2;const h2=isMyTeamHome();return h0===h2;})();
    G.gameNum=save;
    return {s0, s1, sameInSeries:s0[0]===s0[1]&&s0[1]===s0[2], cs, homeConsistent};
  })()
`, ctx);
check('시리즈 내 3경기 상대 동일 (3연전)', seriesProbe.sameInSeries, JSON.stringify(seriesProbe.s0));
check('다음 시리즈 상대 변경', seriesProbe.s1 !== seriesProbe.s0[0]);
check('getCurrentSeries: g0→0, g2→0, g3→1', seriesProbe.cs.g0 === 0 && seriesProbe.cs.g2 === 0 && seriesProbe.cs.g3 === 1, JSON.stringify(seriesProbe.cs));
check('시리즈 내 홈/원정 고정', seriesProbe.homeConsistent);

// ── T3c. 포스트시즌 4팀 균형 토너먼트 ───────────────────────
section('T3c. 포스트시즌 4팀 균형 토너먼트');
const pssProbe = vm.runInContext(`
  (function(){
    const sorted=[...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
    const top4=sorted.slice(0,POSTSEASON_TEAMS);
    const s=_simSeries(top4[0],top4[1],SEMI_WINS_NEEDED);
    const seriesOk=(s.a===SEMI_WINS_NEEDED||s.b===SEMI_WINS_NEEDED)&&Math.min(s.a,s.b)<SEMI_WINS_NEEDED&&(s.winner===top4[0]||s.winner===top4[1]);
    G.postseasonBracket={teams:[],round:'semifinal',results:[]};
    _simPostseasonAI(top4);
    const r=G.postseasonBracket.results;
    const champName=(r.find(x=>x.champion)||{}).winner;
    const champInTop4=top4.some(t=>t.name===champName);
    return {teams:POSTSEASON_TEAMS, seriesOk, rounds:r.length, champName, champInTop4};
  })()
`, ctx);
check('진출팀 4팀 (POSTSEASON_TEAMS)', pssProbe.teams === 4);
check('best-of-5 시리즈 종료 조건 정상 (한쪽만 3승)', pssProbe.seriesOk);
check('브래킷 3라운드 + 우승팀 존재', pssProbe.rounds === 3 && !!pssProbe.champName);
check('우승팀이 top4 소속', pssProbe.champInTop4, pssProbe.champName);

// ── T3d. GM 회의 (8페이즈, SeasonModifiers) ──────────────────
section('T3d. GM 회의 — 8페이즈 & 룰 투표');
const gmProbe = vm.runInContext(`
  (function(){
    const picks=_pickGMProposals();
    const distinct=picks.length===2&&picks[0].id!==picks[1].id;
    const luxProp=GM_PROPOSALS.find(p=>p.effect.key==='luxuryLineBonus'&&p.effect.value>0);
    const before=getLuxuryTaxLine();
    applyGMModifiers([luxProp]);
    const applied=getLuxuryTaxLine()===before+luxProp.effect.value;
    const r=_resolveGMProposal(luxProp,true);
    const tallyOk=r.yes>=1&&r.yes<=8&&r.no===8-r.yes&&(r.passed===(r.yes>=5));
    const savePhase=G.phase;G.phase='gm_meeting';const pi=getPhaseInfo().id;G.phase=savePhase;
    applyGMModifiers([]);
    return {distinct, applied, tallyOk, phaseOk:pi==='gm_meeting'};
  })()
`, ctx);
check('안건 2개 무중복 선정', gmProbe.distinct);
check('가결 안건 effect가 seasonModifiers로 적용(사치세 라인)', gmProbe.applied);
check('개표 집계(유저1+AI7=8, 과반5) 정상', gmProbe.tallyOk);
check('getPhaseInfo가 gm_meeting 인식 (8페이즈)', gmProbe.phaseOk);

// ── T4. H2 회귀: 스토브리그 정산 멱등성 ─────────────────────
section('T4. H2 회귀 — showStoveLeague 재진입 멱등성');
vm.runInContext(`G.myTeam.budget=Math.max(G.myTeam.budget,200);`, ctx); // 파산 게임오버 회피
const b1 = g('JSON.stringify(G.teams.map(t=>Math.round(t.budget*100)))');
vm.runInContext('showStoveLeague()', ctx);
const b2 = g('JSON.stringify(G.teams.map(t=>Math.round(t.budget*100)))');
vm.runInContext('showStoveLeague()', ctx); // 재진입 (돌아가기 시나리오)
const b3 = g('JSON.stringify(G.teams.map(t=>Math.round(t.budget*100)))');
check('1회차 정산 발생 (예산 변동)', b1 !== b2);
check('2회차 재진입 시 예산 불변 (멱등)', b2 === b3, `2회차 예산 변동 감지`);
check('_stoveSettledSeason 기록', g('G._stoveSettledSeason') === g('G.season'));

// ── T5. H3 회귀: 연봉조정 멱등성 ────────────────────────────
section('T5. H3 회귀 — _showSalaryNegotiation 재진입 멱등성');
vm.runInContext('_showSalaryNegotiation()', ctx);
const p2 = g('Math.round(getPayroll(G.myTeam)*100)');
vm.runInContext('_showSalaryNegotiation()', ctx); // 재진입
const p3 = g('Math.round(getPayroll(G.myTeam)*100)');
check('2회차 재진입 시 페이롤 불변 (멱등)', p2 === p3, `${p2 / 100} → ${p3 / 100}`);

// ── T6. 세이브 라운드트립 ───────────────────────────────────
section('T6. 세이브 라운드트립');
vm.runInContext("G.seasonModifiers={luxuryLineBonus:20};", ctx); // GM 회의 룰 지속 테스트용
const beforeSave = { season: g('G.season'), gameNum: g('G.gameNum'), stove: g('G._stoveSettledSeason'), wins: g('G.myTeam.wins'), rosterN: g('G.myTeam.roster.length') };
vm.runInContext('saveGame()', ctx);
vm.runInContext('G.teams=[];G.myTeam=null;G._stoveSettledSeason=0;G.seasonModifiers={};', ctx); // 상태 파괴 후 복원
const loaded = g('loadGame()');
check('loadGame() 성공', loaded === true);
check('season/gameNum 복원', g('G.season') === beforeSave.season && g('G.gameNum') === beforeSave.gameNum);
check('_stoveSettledSeason 지속 (H2 세이브 회귀)', g('G._stoveSettledSeason') === beforeSave.stove, `${g('G._stoveSettledSeason')} vs ${beforeSave.stove}`);
check('seasonModifiers 지속 (GM 회의 룰 세이브)', g('G.seasonModifiers && G.seasonModifiers.luxuryLineBonus') === 20);
check('내 팀 승수 복원', g('G.myTeam.wins') === beforeSave.wins);
check('로스터 인원 복원', g('G.myTeam.roster.length') === beforeSave.rosterN, `${g('G.myTeam.roster.length')} vs ${beforeSave.rosterN}`);

// ── T7. P1b 스케일 마이그레이션 (구 v3 20-80 세이브 → 1~100 자동 변환) ──
section('T7. P1b 스케일 마이그레이션 — 구세이브(v3) 20-80→1~100');
vm.runInContext('saveGame()', ctx);
const migProbe = vm.runInContext(`
  (function(){
    const d=JSON.parse(localStorage.getItem(SAVE_KEY));
    d._v=3;                                   // 구버전 세이브로 위장
    const c=d.teams[0].roster[0];
    c.contact=50; c.power=80; c.eye=20;       // 구 20-80 스탯 주입 (50→51,80→100,20→1 기대)
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    G.teams=[]; G.myTeam=null;
    const ok=loadGame();
    const p=G.teams[0].roster[0];
    return {ok, contact:p.contact, power:p.power, eye:p.eye};
  })()
`, ctx);
check('구세이브(v3) 로드 성공', migProbe.ok === true);
check('스탯 변환 50→51 (선형 매핑 중앙)', migProbe.contact === 51, `contact=${migProbe.contact}`);
check('스탯 변환 80→100 (상한)', migProbe.power === 100, `power=${migProbe.power}`);
check('스탯 변환 20→1 (하한)', migProbe.eye === 1, `eye=${migProbe.eye}`);

// ── T8. 1b-3 표시 스케일 포그오브워 (L0~L3) ──────────────────
section('T8. 표시 스케일 — 프론트오피스 레벨별 4단계 (L0~L3)');
const fog = g(`(function(){
  const tiers=[_displayTier(0),_displayTier(19),_displayTier(20),_displayTier(39),_displayTier(40),_displayTier(59),_displayTier(60),_displayTier(100)];
  return {
    tierMap: JSON.stringify(tiers),
    tierOk: tiers.join(',')==='0,0,1,1,2,2,3,3',
    gradeOk: _statGrade(84)==='S'&&_statGrade(67)==='A'&&_statGrade(51)==='B'&&_statGrade(34)==='C'&&_statGrade(10)==='D',
    l0: fmtStatFog(84,0), l1: fmtStatFog(84,1), l2: fmtStatFog(84,2), l3: fmtStatFog(84,3),
  };
})()`);
check('레벨→티어 매핑 (20/40/60 경계)', fog.tierOk, fog.tierMap);
check('스탯→등급문자 (84=S..10=D)', fog.gradeOk);
check(`L0 등급표시: ${fog.l0}`, fog.l0==='S');
check(`L1 5단위 버킷: ${fog.l1}`, fog.l1==='80~84');
check(`L2 ±추정: ${fog.l2}`, fog.l2==='81~87');
check(`L3 정확: ${fog.l3}`, fog.l3==='84');
// market 렌더 무결성 — 각 티어에서 예외 없이 렌더
const marketRender = g(`(function(){
  if(typeof generateMarket==='function')generateMarket();
  if(typeof renderMarket!=='function')return {skip:true};
  let ok=true, err='';
  for(const lv of [0,25,45,65]){ G.myTeam.analyticsLevel=lv; try{ renderMarket(); }catch(e){ ok=false; err=lv+':'+e.message; break; } }
  G.myTeam.analyticsLevel=0;
  return {ok, err};
})()`);
check('market 전 티어 렌더 무예외', marketRender.skip || marketRender.ok, marketRender.err);

// ── T9. P2-1 OVR Z-score 상대평가 엔진 ───────────────────────
section('T9. P2-1 OVR — Z-score 상대평가 + 역할 가중치 + 다재다능 세금');
const zProbe = g(`(function(){
  const acc={};
  G.teams.forEach(t=>t.roster.forEach(p=>{
    if((p.status||'active')!=='active')return;
    const gr=_ovrCalibGroup(p);(acc[gr]=acc[gr]||[]).push(ovr(p));
  }));
  const means={};let allOk=true;
  for(const gr in acc){
    const a=acc[gr];const m=a.reduce((s,x)=>s+x,0)/a.length;
    means[gr]=Math.round(m*10)/10;
    if(m<46||m>54)allOk=false;
  }
  // raw vs 상대 분리: 두 값이 다른 선수 존재 + 양쪽 다 유한
  const all=G.teams.flatMap(t=>t.roster);
  const splitOk=all.every(p=>Number.isFinite(ovrRaw(p))&&Number.isFinite(ovr(p)))&&all.some(p=>ovrRaw(p)!==ovr(p));
  // 다재다능 세금: _subPos 1개 → −1, 2개 → −2
  // (플레이크 방지: 샘플 선수가 이미 서브 보유 시 base에 세금이 선반영되므로 비우고 측정, 원복)
  const t0=all.find(p=>!p.isPitcher&&ovr(p)>=30&&ovr(p)<=70)||all[0];
  const savedSub=t0._subPos;
  t0._subPos=[];const base=ovr(t0);
  t0._subPos=['2B'];const tax1=base-ovr(t0);
  t0._subPos=['2B','3B'];const tax2=base-ovr(t0);
  t0._subPos=savedSub;
  return {means:JSON.stringify(means),allOk,splitOk,tax1,tax2};
})()`);
check(`전 그룹 1군 평균 OVR ≈50 (46~54): ${zProbe.means}`, zProbe.allOk);
check('ovrRaw/ovr 분리 (유한 + 상이 선수 존재)', zProbe.splitOk);
check(`다재다능 세금 (서브1 −1 / 서브2 −2): ${zProbe.tax1}/${zProbe.tax2}`, zProbe.tax1 === 1 && zProbe.tax2 === 2);

// ── T10. P2-2 히든 스탯 10종 — 1~100 스케일 + 마이그레이션 + 협상 연동 ──
section('T10. P2-2 히든 스탯 — 10종 · 1~100 스케일 · v4→v5 마이그레이션 · 협상 연동');
const hidProbe = g(`(function(){
  const all=G.teams.flatMap(t=>t.roster);
  const OLD5=['_potential','_durability','_consistency','_clutchHidden','_workEthic'];
  const NEW4=['_versatility','_ambition','_loyalty','_temperament'];
  // ① 전 선수 히든 1~100 범위
  let rangeOk=true;
  all.forEach(p=>{
    OLD5.concat(NEW4).forEach(k=>{const v=p[k];if(typeof v!=='number'||v<1||v>100)rangeOk=false;});
    const ext=p.isPitcher?p._recovery:p._pullTendency;
    if(typeof ext!=='number'||ext<1||ext>100)rangeOk=false;
  });
  // ② 리그 프로의식 평균 ≈52.5 (45~60)
  const weMean=all.reduce((s,p)=>s+p._workEthic,0)/all.length;
  // ③ POT 천장: 50→59, 100→100
  const capOk=maxOvrFromPot(50)===59&&maxOvrFromPot(100)===100;
  return {rangeOk,weMean:Math.round(weMean*10)/10,weOk:weMean>=45&&weMean<=60,capOk};
})()`);
check('전 선수 히든 10종 존재 + 1~100 범위', hidProbe.rangeOk);
check(`리그 프로의식 평균 ≈52.5 (45~60): ${hidProbe.weMean}`, hidProbe.weOk);
check('maxOvrFromPot 재보정 (50→59, 100→100)', hidProbe.capOk);

// v4 세이브(히든 7~20) → v5 마이그레이션 (×5 변환 + 신규 6종 백필)
vm.runInContext('saveGame()', ctx);
const hidMig = vm.runInContext(`
  (function(){
    const d=JSON.parse(localStorage.getItem(SAVE_KEY));
    d._v=4;                                    // v4 세이브로 위장
    const c=d.teams[0].roster[0];
    c._potential=10; c._durability=20; c._workEthic=7; // 구 7~20 히든 주입
    delete c._versatility; delete c._ambition; delete c._loyalty;
    delete c._temperament; delete c._recovery; delete c._pullTendency;
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    G.teams=[]; G.myTeam=null;
    const ok=loadGame();
    const p=G.teams[0].roster[0];
    const ext=p.isPitcher?p._recovery:p._pullTendency;
    return {ok, pot:p._potential, dur:p._durability, we:p._workEthic,
      backfillOk:[p._versatility,p._ambition,p._loyalty,p._temperament,ext].every(v=>typeof v==='number'&&v>=1&&v<=100)};
  })()
`, ctx);
check('v4 세이브 로드 성공', hidMig.ok === true);
check(`히든 ×5 변환 (10→50, 20→100, 7→35): ${hidMig.pot}/${hidMig.dur}/${hidMig.we}`, hidMig.pot === 50 && hidMig.dur === 100 && hidMig.we === 35);
check('신규 히든 6종 백필 (1~100)', hidMig.backfillOk);

// 협상 연동: 야망 프리미엄 / 충성심 재계약 디스카운트 (결정적 헬퍼 검증)
const negoProbe = g(`(function(){
  const mk=(amb,loy,tenure)=>({_ambition:amb,_loyalty:loy,_teamTenure:tenure});
  const m=(p,ctx)=>_contractHiddenMod(p,ctx);
  return {
    ambUp:   m(mk(100,50,0),'fa'),        // 야망 만점 → >1
    ambDown: m(mk(35,50,0),'fa'),         // 야망 최저 → <1
    loyDisc: m(mk(50,90,5),'renewal'),    // 충성심 90 재계약 → 할인 (<1)
    loyNoTenure: m(mk(50,90,1),'renewal'),// 재적 3년 미만 → 할인 없음 (=1)
    ambOffset: m(mk(100,90,5),'renewal'), // 야망>충성심 → 할인 축소 (loyDisc보다 큼)
  };
})()`);
check(`야망 협상 공격성 (만점 ×${negoProbe.ambUp.toFixed(2)} / 최저 ×${negoProbe.ambDown.toFixed(2)})`, negoProbe.ambUp > 1 && negoProbe.ambDown < 1);
check(`충성심 재계약 디스카운트 (충90·재적5 ×${negoProbe.loyDisc.toFixed(3)})`, negoProbe.loyDisc < 1);
check('재적 3년 미만 → 디스카운트 없음', negoProbe.loyNoTenure === 1);
check('야망>충성심 → 할인 상쇄', negoProbe.ambOffset > negoProbe.loyDisc);

// ── T11. P2-1 서브 포지션 — 생성 분포 · 전환 페널티 · 유효 수비 · L3 시뮬 ──
section('T11. P2-1 서브 포지션 — 분포 · 비대칭 전환 페널티 · 유효 수비 · 백필');
const subProbe = g(`(function(){
  const bats=G.teams.flatMap(t=>t.roster).filter(p=>!p.isPitcher);
  let n0=0,n12=0,valid=true;
  bats.forEach(p=>{
    if(!Array.isArray(p._subPos)){valid=false;return;}
    const n=p._subPos.length;
    if(n===0)n0++;else if(n<=2)n12++;else valid=false;
    p._subPos.forEach(s=>{if(s==='C'||s==='DH')valid=false;});
    if((p._naturalPos||p.pos)==='C'&&p._subPos.length>0)valid=false;
  });
  const tot=Math.max(1,n0+n12);
  return {valid,r0:Math.round(n0/tot*100),n:tot};
})()`);
check('서브 포지션 구조 유효 (배열·최대2·C/DH 제외·포수 서브 없음)', subProbe.valid);
check(`서브 0개 비율 ≈60~68% (관측 ${subProbe.r0}%, 허용 45~85, n=${subProbe.n})`, subProbe.r0 >= 45 && subProbe.r0 <= 85);
const penProbe = g(`(function(){
  const mk=(nat,vers,subs)=>({_naturalPos:nat,pos:nat,_versatility:vers,_subPos:subs||[],isPitcher:false,fielding:80,arm:60});
  const base5=getPosSwitchPenalty(mk('2B',50),'SS');
  const base12=getPosSwitchPenalty(mk('SS',50),'3B');
  const base22=getPosSwitchPenalty(mk('LF',50),'SS');
  const toC=getPosSwitchPenalty(mk('1B',50),'C');
  const toDH=getPosSwitchPenalty(mk('SS',50),'DH');
  const subHalf=getPosSwitchPenalty(mk('2B',50,['SS']),'SS');
  const versCut=getPosSwitchPenalty(mk('2B',100),'SS');
  const dhOut=getPosSwitchPenalty(mk('DH',50),'SS');  // 본 포지션 DH → 수비 전환 어려움 22
  const dhToC=getPosSwitchPenalty(mk('DH',50),'C');   // DH 출신도 →C 불가
  const pe=mk('2B',50); pe.pos='SS';
  const eff=effFielding(pe); // 80×0.95=76
  const pSim=mk('2B',50);
  const simC=simulatePosOvr(pSim,'C');
  const simSS=simulatePosOvr(pSim,'SS');
  const pure=pSim.pos==='2B'&&pSim.fielding===80&&pSim.arm===60;
  return {base5,base12,base22,toC,toDH,subHalf,versCut,dhOut,dhToC,eff,simC,simSSOk:Number.isFinite(simSS),pure};
})()`);
check(`전환 페널티 테이블 (쉬움5/보통12/어려움22): ${penProbe.base5}/${penProbe.base12}/${penProbe.base22}`, penProbe.base5 === 5 && penProbe.base12 === 12 && penProbe.base22 === 22);
check('→C 전환 불가(null) · →DH 무페널티(0)', penProbe.toC === null && penProbe.toDH === 0);
check(`본 포지션 DH: 수비 전환 22% · →C 불가 (${penProbe.dhOut}/${penProbe.dhToC})`, penProbe.dhOut === 22 && penProbe.dhToC === null);
check(`서브 경험 → 절반(${penProbe.subHalf}) · 다재다능 100 → 절반(${penProbe.versCut})`, penProbe.subHalf === 2.5 && penProbe.versCut === 2.5);
check(`유효 수비 반영: 2B→SS 수비80 → ${penProbe.eff} (기대 76)`, penProbe.eff === 76);
check('L3 전환 시뮬: C는 null · 타 포지션 유한 · 원본 무변이', penProbe.simC === null && penProbe.simSSOk && penProbe.pure);
// 구세이브 백필: _subPos/_naturalPos 없는 타자 → 로드 시 자동 생성
vm.runInContext('saveGame()', ctx);
const subMig = vm.runInContext(`
  (function(){
    const d=JSON.parse(localStorage.getItem(SAVE_KEY));
    const idx=d.teams[0].roster.findIndex(p=>!p.isPitcher&&p.pos&&p.pos!=='C'&&p.pos!=='DH');
    const c=d.teams[0].roster[idx];
    delete c._subPos; delete c._naturalPos;
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
    G.teams=[]; G.myTeam=null;
    const ok=loadGame();
    const p=G.teams[0].roster[idx];
    return {ok, natOk:p._naturalPos===p.pos, subOk:Array.isArray(p._subPos)&&p._subPos.length<=2};
  })()
`, ctx);
check('구세이브 백필: _naturalPos=현 포지션 + _subPos 롤', subMig.ok === true && subMig.natOk && subMig.subOk);

// ── T12. P2-4 사치세 3단계 — 누진 · 연속 초과 체증 · 플로어 · 연봉 절대화 ──
section('T12. P2-4 재정 — 3단계 사치세 · 체증 · 샐러리 플로어 · 연봉 스케일');
const taxProbe = g(`(function(){
  const mods=G.seasonModifiers; G.seasonModifiers={}; // 라인 200 고정
  const mk=(pay,streak)=>({roster:[{salary:pay}],_luxOverStreak:streak||0});
  const r={
    line:getLuxuryTaxLine(), floor:getSalaryFloor(),
    t210:getLuxuryTax(mk(210)),        // 10×20% = 2
    t230:getLuxuryTax(mk(230)),        // 20×20%+10×40% = 8
    t260:getLuxuryTax(mk(260)),        // 20×20%+30×40%+10×60% = 22
    tUnder:getLuxuryTax(mk(190)),      // 0
    tRepeat1:getLuxuryTax(mk(230,1)),  // +10%p → 20×30%+10×50% = 11
    tRepeatCap:getLuxuryTax(mk(230,5)),// 상한 +20%p → 20×40%+10×60% = 14
  };
  G.seasonModifiers=mods;
  return r;
})()`);
check(`소프트캡 200 / 플로어 50 (과도기, 설계 목표 80)`, taxProbe.line === 200 && taxProbe.floor === 50);
check(`누진 과세 (210→${taxProbe.t210} / 230→${taxProbe.t230} / 260→${taxProbe.t260} / 190→${taxProbe.tUnder})`,
  taxProbe.t210 === 2 && taxProbe.t230 === 8 && taxProbe.t260 === 22 && taxProbe.tUnder === 0);
check(`연속 초과 체증 (+10%p→${taxProbe.tRepeat1} / 상한 +20%p→${taxProbe.tRepeatCap})`,
  taxProbe.tRepeat1 === 11 && taxProbe.tRepeatCap === 14);
const streakProbe = g(`(function(){
  return G.teams.every(t=>typeof t._luxOverStreak==='number'||typeof t._luxUnderStreak==='number');
})()`);
check('정산 시 전 팀 연속 초과/미만 카운터 기록', streakProbe === true);
const salProbe = g(`(function(){
  let faOk=true,arbOk=true,preOk=true;
  for(let i=0;i<40;i++){
    const fa=_calcSalary(90,7); if(fa<20||fa>30)faOk=false;
    const arb=_calcSalary(70,5); if(arb<2||arb>3)arbOk=false;
    const pre=_calcSalary(90,2); if(pre>0.8)preOk=false;
  }
  return {faOk,arbOk,preOk};
})()`);
check('연봉 절대화: FA 90 OVR 20~30억 / Arb 70 OVR 2~3억 / 프리Arb ≤0.8억', salProbe.faOk && salProbe.arbOk && salProbe.preOk);
const payProbe = g(`(function(){
  const pays=G.teams.map(t=>getPayroll(t)).sort((a,b)=>a-b);
  const avg=pays.reduce((s,x)=>s+x,0)/pays.length;
  const underFloor=pays.filter(x=>x<getSalaryFloor()).length;
  return {min:Math.round(pays[0]),max:Math.round(pays[pays.length-1]),avg:Math.round(avg),underFloor,finite:pays.every(Number.isFinite)};
})()`);
check(`리그 페이롤 유한값 (min ${payProbe.min} / avg ${payProbe.avg} / max ${payProbe.max} / 플로어 미달 ${payProbe.underFloor}팀)`, payProbe.finite);
check(`페이롤 평균 온건 범위 (40~220억): ${payProbe.avg}`, payProbe.avg >= 40 && payProbe.avg <= 220);
check(`플로어 미달 팀 소수 (≤5팀): ${payProbe.underFloor}`, payProbe.underFloor <= 5);

// ── T13. P2-3 서비스타임 — 경계 · 슈퍼2 · 시리즈 비례 적립 · Arb 인상률 · 신인 슬롯 ──
section('T13. P2-3 서비스타임 — 경계·슈퍼2·비례 적립·Arb 인상률·신인 슬롯');
const svcProbe = g(`(function(){
  const phase=st=>getContractPhase({_serviceTime:st});
  return {
    p2:phase(2),p3:phase(3),p5:phase(5),p6:phase(6),
    s2:getContractPhase({_serviceTime:2,_super2:true}),
    g63:_serviceGainFromGames(63), g45:_serviceGainFromGames(45),
    g30:_serviceGainFromGames(30), g2:_serviceGainFromGames(2),
    slot1:_rookieSlotSalary(1), slot2:_rookieSlotSalary(2), slot8:_rookieSlotSalary(8),
    slot9:_rookieSlotSalary(9), slot16:_rookieSlotSalary(16), slot48:_rookieSlotSalary(48),
  };
})()`);
check(`계약 단계 경계 (서비스 2=pre / 3=arb / 5=arb / 6=fa): ${svcProbe.p2}/${svcProbe.p3}/${svcProbe.p5}/${svcProbe.p6}`,
  svcProbe.p2 === 'pre' && svcProbe.p3 === 'arb' && svcProbe.p5 === 'arb' && svcProbe.p6 === 'fa');
check('슈퍼2: 서비스 2년차 조기 Arb 자격 (FA 시기 동일)', svcProbe.s2 === 'arb');
check(`시리즈 비례 적립 (63경기→${svcProbe.g63} / 45→${svcProbe.g45} / 30→${svcProbe.g30} / 2→${svcProbe.g2})`,
  svcProbe.g63 === 1 && svcProbe.g45 === 1 && svcProbe.g30 === 0.48 && svcProbe.g2 === 0);
check(`신인 슬롯 연봉 (전체1→${svcProbe.slot1} / 8→${svcProbe.slot8} / 9→${svcProbe.slot9} / 16→${svcProbe.slot16} / 48→${svcProbe.slot48})`,
  svcProbe.slot1 === 1.5 && svcProbe.slot2 === 1.2 && svcProbe.slot8 === 0.8 && svcProbe.slot9 === 0.7 && svcProbe.slot16 === 0.5 && svcProbe.slot48 === 0.3);
const arbProbe = g(`(function(){
  // _arbYears 명시 카운터 기반 (floor(서비스타임) 파생의 슈퍼2 플립·소수 정체 버그 수정 반영)
  const mk=(st,sal,ay)=>{const p={_serviceTime:st,salary:sal,_arbYears:ay,isPitcher:false,pos:'1B',contact:60,power:60,eye:60,speed:60,fielding:60,arm:60};initSeasonStats(p);return p;};
  const a2=[],a3=[];
  for(let i=0;i<30;i++){a2.push(_calcNewSalary(mk(4,3,2)));a3.push(_calcNewSalary(mk(5,3,3)));}
  // 슈퍼2 수정 검증: st=3(과거 arbStart 플립 지점)이라도 카운터가 2면 인상률 경로 (베이스라인 재롤 아님)
  const s2=[];for(let i=0;i<20;i++){const p=mk(3,6,2);p._super2=true;s2.push(_calcNewSalary(p));}
  return {a2min:Math.min(...a2),a2max:Math.max(...a2),a3min:Math.min(...a3),a3max:Math.max(...a3),
    s2min:Math.min(...s2),s2max:Math.max(...s2)};
})()`);
check(`Arb 2년차 인상률 120~180% (3억 → ${arbProbe.a2min}~${arbProbe.a2max})`, arbProbe.a2min >= 3.5 && arbProbe.a2max <= 5.8);
check(`Arb 3년차 인상률 110~150% (3억 → ${arbProbe.a3min}~${arbProbe.a3max})`, arbProbe.a3min >= 3.2 && arbProbe.a3max <= 4.8);
check(`슈퍼2 fy=3 Arb2 인상 보장 (6억 → ${arbProbe.s2min}~${arbProbe.s2max}, 삭감 없음)`, arbProbe.s2min >= 7.0);

// ── T14. P2-5 특수 시설 4레벨 — 비용 · 유지비 · 업그레이드 · 백필 ──
section('T14. P2-5 특수 시설 4레벨 — 슬럼프케어·멘탈코칭');
const facProbe = g(`(function(){
  const initOk=G.teams.every(t=>typeof t.slumpCareLevel==='number'&&typeof t.mentalCoachLevel==='number');
  const up0=calcAnnualUpkeep({coachStaff:{},stadiumLevel:0,slumpCareLevel:0,mentalCoachLevel:0}).facilityCost;
  const up34=calcAnnualUpkeep({coachStaff:{},stadiumLevel:0,slumpCareLevel:3,mentalCoachLevel:4}).facilityCost;
  const t=G.myTeam;const b0=t.budget=500;const l0=t.slumpCareLevel;
  t.slumpCareLevel=0;
  investUpgradeSlumpCare();investUpgradeSlumpCare();
  const lvOk=t.slumpCareLevel===2&&Math.abs((b0-t.budget)-17)<0.01;
  t.slumpCareLevel=l0;
  return {initOk,diff:+(up34-up0).toFixed(1),lvOk,
    costsOk:JSON.stringify(FACILITY4_COSTS)==='[5,12,25,40]'&&SLUMP_CARE_RELIEF[4]===0.5&&MENTAL_COACH_AMP[4]===0.5};
})()`);
check('전 팀 신규 시설 필드 초기화/백필 (slumpCare·mentalCoach)', facProbe.initOk);
check('설계 상수 (비용 5/12/25/40억 · 완화 50% · 증폭 50%)', facProbe.costsOk);
check(`4레벨 유지비 L3+L4 = +${facProbe.diff} (기대 8.5 = 25×10% + 40×15%)`, facProbe.diff === 8.5);
check('업그레이드 2회: Lv.2 도달 + 17억(5+12) 차감', facProbe.lvOk);

// ── T15. P3-1 3-Tier 스탯 계층 — pass-through · 소프트캡 압축 · 매치엔진 전환 ──
section('T15. P3-1 3-Tier 스탯 — Raw/Roster/Effective 계층');
const tierProbe = g(`(function(){
  const p={contact:80};
  const passOk=statRaw(p,'contact')===80&&statRoster(p,'contact')===80&&statEff(p,'contact')===80;
  const fbOk=statRaw(p,'power')===50; // 미보유 스탯 폴백 50 (리그 평균)
  const c120=_tier3Compress(120), c125=_tier3Compress(125);
  const c126=+_tier3Compress(126).toFixed(1); // 평탄부 회귀 가드: 125+log10(2) ≈ 125.3 (구식은 125로 붕괴)
  const c130=+_tier3Compress(130).toFixed(1); // 125+log10(6) ≈ 125.8
  const mono=_tier3Compress(125.5)>125&&_tier3Compress(126)>_tier3Compress(125.5); // 순단조
  // 특성 보정 훅 주입 시 소프트캡 경유 확인 (P3-2 선행 검증) — try/finally로 전역 복원 보장
  const orig=_traitBonus;
  let capped;
  try{
    _traitBonus=function(){return 30;};
    capped=+statEff({contact:100},'contact').toFixed(1); // 100+30 → 125+log10(6) ≈ 125.8
  }finally{
    _traitBonus=orig;
  }
  return {passOk,fbOk,c120,c125,c126,c130,mono,capped};
})()`);
check('Tier1=2=3 pass-through (팀 DNA·특성 미도입 상태) + 폴백 50', tierProbe.passOk && tierProbe.fbOk);
check(`소프트캡 125 log₁₀(1+over) 압축 (120→${tierProbe.c120} / 125→${tierProbe.c125} / 126→${tierProbe.c126} / 130→${tierProbe.c130}) + 순단조`, tierProbe.c120 === 120 && tierProbe.c125 === 125 && tierProbe.c126 === 125.3 && tierProbe.c130 === 125.8 && tierProbe.mono);
check(`특성 보정 훅 → 압축 경유 (100+30 → ${tierProbe.capped})`, tierProbe.capped === 125.8);

// ── T16. P3-2 특성 엔진 — 자연 롤 · 스택 상한 · 교체 플로우 · Tier3 반영 ──
section('T16. P3-2 특성 엔진 — 자연/인공 특성');
const traitProbe = g(`(function(){
  const all=G.teams.flatMap(t=>t.roster);
  // ① 자연 특성 보유율 ≈15% + 카탈로그 유효성
  let natN=0, valid=true;
  all.forEach(p=>{
    if(!Array.isArray(p._traits))return;
    p._traits.forEach(e=>{if(!TRAITS[e.id])valid=false;});
    if(p._traits.some(e=>e.slot===1))natN++;
  });
  const natPct=Math.round(natN/all.length*100);
  // ② 스택 상한 (합성 특성 주입 후 제거)
  TRAITS._tA={kind:'art',rank:'S',prio:8,who:'all',name:'tA',fx:{power:7}};
  TRAITS._tB={kind:'art',rank:'S',prio:9,who:'all',name:'tB',fx:{power:6}};
  TRAITS._tN={kind:'nat',cat:'pos',who:'all',name:'tN',fx:{power:6}};
  let artCap,fullCap,eff,ovrSame;
  try{
    const pArt={power:80,_traits:[{id:'_tA',slot:2},{id:'_tB',slot:3}]};
    artCap=_traitBonus(pArt,'power');                    // 7+6=13 → 10
    const pFull={power:80,pos:'1B',isPitcher:false,contact:50,eye:50,speed:50,fielding:50,arm:50,
      _traits:[{id:'_tN',slot:1},{id:'_tA',slot:2},{id:'_tB',slot:3}]};
    fullCap=_traitBonus(pFull,'power');                  // 6+10=16 → 12
    eff=statEff(pFull,'power');                          // 80+12=92
    ovrSame=ovrRaw(pFull)===ovrRaw(Object.assign({},pFull,{_traits:[]})); // 특성은 OVR 무영향
  }finally{
    delete TRAITS._tA; delete TRAITS._tB; delete TRAITS._tN;
  }
  // ③ 교체 플로우 (설계 케이스: 빈슬롯→C+C에 B 진입→낮은 우선순위 거부→중복 방지)
  const q={isPitcher:false,_traits:[]};
  awardTrait(q,'asBat'); awardTrait(q,'hrKingT');
  const r1=awardTrait(q,'club2020');                     // B가 최저 C(올스타,prio1) 교체
  const r2=awardTrait(q,'asBat');                        // C(prio1) vs 최저 C(홈런왕,prio4) → 거부
  const r3=awardTrait(q,'club2020');                     // 중복 → 거부
  // ④ hiddenEff: 철인 → 부상 임계 감소
  const pIron={_durability:60,_traits:[{id:'iron',slot:1}]};
  const durEff=hiddenEff(pIron,'_durability');           // 68
  const thrRaw=_injuryThreshold(statRaw(pIron,'_durability')), thrEff=_injuryThreshold(durEff);
  // ⑤ 시상 평가 통합 실행 — 실제 브래킷 형태(champion이 .results 안)로 우승 특성 발동 + 재호출 멱등
  let evalOk=true,evalN=0,champOk=false,idemOk=false;
  const savedBracket=G.postseasonBracket, savedFlag=G._traitsEvaluatedSeason;
  try{
    G._traitsEvaluatedSeason=0;
    G.postseasonBracket={teams:[],round:99,results:[{round:'챔피언십',winner:G.teams[0].name,champion:true}]};
    evalN=evaluateSeasonTraits({mvp:null,cyYoung:null,rookie:null,hrKing:null,pitTriple:null}).length;
    champOk=G.teams[0].roster.some(p=>Array.isArray(p._traits)&&p._traits.some(e=>e.id==='champBat'||e.id==='champPit'));
    idemOk=evaluateSeasonTraits({mvp:null,cyYoung:null,rookie:null,hrKing:null,pitTriple:null}).length===0;
  }catch(e){evalOk=false;}
  finally{G.postseasonBracket=savedBracket;G._traitsEvaluatedSeason=savedFlag;}
  return {natPct,valid,artCap,fullCap,eff,ovrSame,
    r1ok:!!(r1&&r1.replaced==='올스타'), r2ok:r2===null, r3ok:r3===null,
    durEff,thrRaw,thrEff,evalOk,evalN,champOk,idemOk};
})()`);
check(`자연 특성 보유율 ≈15% (관측 ${traitProbe.natPct}%, 허용 8~22) + 카탈로그 유효`, traitProbe.natPct >= 8 && traitProbe.natPct <= 22 && traitProbe.valid);
check(`스택 상한 — 인공 동일 스탯 13→${traitProbe.artCap} (max 10), 자연+인공 16→${traitProbe.fullCap} (max 12)`, traitProbe.artCap === 10 && traitProbe.fullCap === 12);
check(`Tier3 반영 (statEff 80→${traitProbe.eff}) + OVR 무영향`, traitProbe.eff === 92 && traitProbe.ovrSame);
check('교체 플로우 (B가 최저 C 대체 / 낮은 우선순위 거부 / 중복 방지)', traitProbe.r1ok && traitProbe.r2ok && traitProbe.r3ok);
check(`철인 특성 → 부상 임계 감소 (내구 60→유효 ${traitProbe.durEff}, 임계 ${traitProbe.thrRaw}→${traitProbe.thrEff})`, traitProbe.durEff === 68 && traitProbe.thrEff < traitProbe.thrRaw);
check(`시상 특성 평가 무예외 (리그 ${traitProbe.evalN}건) + 우승 멤버 발동(.results 경로) + 재호출 멱등`, traitProbe.evalOk && traitProbe.champOk && traitProbe.idemOk);

// ── T17. UI 렌더 가드 — 선수 상세·로스터·협상 템플릿 무예외 (feat/#9 디자인 개선 회귀 방지) ──
section('T17. UI 렌더 가드 — 선수 상세·로스터·협상');
const uiProbe = g(`(function(){
  const r={scout:true,roster:true,nego:true,err:''};
  try{showScoutReport(0);showScoutReport(G.myTeam.roster.findIndex(p=>p.isPitcher));}catch(e){r.scout=false;r.err+='scout:'+e.message+' ';}
  try{if(typeof renderRoster==='function')renderRoster();}catch(e){r.roster=false;r.err+='roster:'+e.message+' ';}
  try{
    const cand=G.myTeam.roster.find(p=>(p.status||'active')==='active');
    showNegotiationModal(cand,'renewal',function(){},function(){});
    _cancelNegotiation();
  }catch(e){r.nego=false;r.err+='nego:'+e.message;}
  return r;
})()`);
check('선수 상세(타자·투수) 렌더 무예외', uiProbe.scout, uiProbe.err);
check('로스터 렌더 무예외 (특성 마커 포함)', uiProbe.roster, uiProbe.err);
check('협상 모달 렌더 무예외 (특성 마커 포함)', uiProbe.nego, uiProbe.err);

// ── T18. 로스터 자동 배치 — 파괴 상태에서 규정 자동 해소 ──
section('T18. 로스터 자동 배치 — 규정 위반 자동 해소');
const arrProbe = g(`(function(){
  const t=G.myTeam;
  // 자원 보장: 이 테스트는 "자원이 있을 때 autoArrange가 편성하는가"를 검증한다. 시즌 시뮬로 누적된
  // 부상(IL·시즌아웃)을 치유해 org를 완전 가용 상태로 되돌린다 — 실게임의 자원 부족은 autoArrange가
  // 잔여 위반을 보고하는 정상 동작이며, 그 시나리오는 이 기능 테스트의 대상이 아님(부상 심도 통일 후 결정성 확보).
  t.roster.forEach(p=>{ if(p.status==='il'){p.status='futures';p.isOnIL=false;p.ilGamesLeft=0;} p.cooldown=0;p.rehabGamesLeft=0;p._recentILReturn=0; });
  // 가용 자연 포수(1군 또는 즉시 콜업 가능)가 부족하면 2군에 주입 — natPos 콜업 수정으로 이 콜업 경로가 결정적으로 동작
  const usableC=()=>t.roster.filter(p=>!p.isPitcher&&(p._naturalPos||p.pos)==='C'
    &&(((p.status||'active')==='active')||((p.status==='futures'||p.status==='developmental')&&(p.cooldown||0)<=0&&(p.rehabGamesLeft||0)<=0))).length;
  while(usableC()<2){
    const c=genBatter('C','B');c.status='futures';c.canDebutYear=null;c.cooldown=0;c.rehabGamesLeft=0;initSeasonStats(c);t.roster.push(c);
  }
  // 파괴: 1군 전원 벤치/불펜化 (라인업 0명, 로테이션 0명)
  t.roster.forEach(p=>{if((p.status||'active')==='active')p.role=p.isPitcher?'bullpen':'bench';});
  const before=validateActiveRoster(t).ok;
  const r=autoArrangeRoster();
  const st=getStartingBatters(t);
  const posSet=new Set(st.map(p=>p.pos));
  return {before, after:r.ok, viol:r.violations.join(';'),
    lineup:st.length,
    posOk:['C','1B','2B','3B','SS','LF','CF','RF'].every(x=>posSet.has(x)),
    dhOk:st.filter(p=>p.pos==='DH').length===1,
    rotOk:countActiveSP(t)>=ACTIVE_MIN_SP, bpOk:countActiveBullpen(t)>=ACTIVE_MIN_BULLPEN};
})()`);
check('파괴 상태 감지(위반) → 자동 배치 후 전 규정 충족', arrProbe.before === false && arrProbe.after === true, arrProbe.viol);
check(`타선 9명(${arrProbe.lineup}) + 8포지션 커버 + DH 1명`, arrProbe.lineup === 9 && arrProbe.posOk && arrProbe.dhOk);
check('로테이션·불펜 최소 정원 충족', arrProbe.rotOk && arrProbe.bpOk);

// T18b. 외야 최소 정원 보호 (결정적 회귀) — 자연 외야수가 정확 4명일 때, 그리디가
// 최고 OVR 외야수를 내야 슬롯에 전용하면 벤치 예비가 사라져 countActiveOF 3/4 위반.
// 가드: 남은 자연 외야수 ≤ (미충원 외야 슬롯 + 벤치 예비)이면 타 슬롯 전용 금지
const ofProbe = g(`(function(){
  const t=G.myTeam;
  // 기존 타자 전원 강등 + 쿨다운 차단 (외부 충원 경로 봉쇄 → 시나리오 결정성)
  t.roster.forEach(p=>{if(!p.isPitcher){if((p.status||'active')==='active')p.status='futures';p.cooldown=3;}});
  // 타자 코프스 16명 주입: 포수 2(B급) + 내야 10(D급) + 외야 4 = S급 스타 1 + D급 3
  const mk=(pos,gr)=>{const b=genBatter(pos,gr);b.status='active';b.role='bench';b.cooldown=0;
    b.canDebutYear=null;b._subPos=null;b._traits=[];initSeasonStats(b);t.roster.push(b);return b;};
  mk('C','B');mk('C','B');
  ['SS','2B','3B','1B','SS','2B','3B','1B','SS','1B'].forEach(pos=>mk(pos,'D'));
  const star=mk('CF','S');
  ['contact','power','eye','speed','fielding','arm'].forEach(k=>{star[k]=80;});
  star._versatility=99; // 전환 페널티 최소화 → 가드 없으면 SS 슬롯 탈취가 그리디 최적해
  mk('LF','D');mk('CF','D');mk('RF','D');
  invalidateOvrCalib();
  const r=autoArrangeRoster();
  const benchOF=t.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active'
    &&p.role==='bench'&&['LF','CF','RF'].includes(p.pos)).length;
  return {ok:r.ok, viol:(r.violations||[]).join(';'), ofCount:countActiveOF(t),
    starPos:star.pos, benchOF};
})()`);
check(`외야 4명 희소 시 그리디 전용 차단 → OF 정원 유지(${ofProbe.ofCount}/${4})`, ofProbe.ok === true && ofProbe.ofCount >= 4, ofProbe.viol);
check(`스타 외야수 외야 슬롯 유지(${ofProbe.starPos}) + 벤치 예비 ${ofProbe.benchOF}명`, ['LF','CF','RF'].includes(ofProbe.starPos) && ofProbe.benchOF >= 1);

// T18c. 포지션 전환된 자연 포수 콜업 (결정적 회귀) — natPos='C'·pos≠'C' 자연 포수만 2군에 있고 활성 포수 0일 때,
// runCallups가 natPos 기준으로 콜업해야 greedy가 C 슬롯을 채운다(구버전 pos 기준 콜업은 실패 → "포수 없음").
const catchProbe = g(`(function(){
  G.teamIdx=0; initTeams(0); invalidateOvrCalib();
  const t=G.myTeam;
  // 자연 포수 전원을 pos='1B'로 전환(natPos='C' 유지) + 2군行 → 활성 포수 0, 2군에 natPos-C만 존재
  t.roster.filter(p=>!p.isPitcher&&(p._naturalPos||p.pos)==='C').forEach(p=>{
    p._naturalPos='C'; p.pos='1B'; p.status='futures'; p.role='bench'; p.cooldown=0; p.rehabGamesLeft=0; p.canDebutYear=null;
  });
  const activeCBefore=t.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active'&&p.pos==='C').length;
  const natCFutures=t.roster.filter(p=>!p.isPitcher&&p.status==='futures'&&(p._naturalPos||p.pos)==='C').length;
  t.roster.forEach(p=>{if((p.status||'active')==='active')p.role=p.isPitcher?'bullpen':'bench';}); // 파괴
  const r=autoArrangeRoster();
  const st=getStartingBatters(t);
  return { activeCBefore, natCFutures, ok:r.ok, cInLineup:st.filter(p=>p.pos==='C').length,
    activeCAfter:t.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active'&&p.pos==='C').length,
    viol:(r.violations||[]).join(';') };
})()`);
check('T18c: 시나리오 성립(활성 C=0 · 2군 natPos-C≥2)', catchProbe.activeCBefore===0 && catchProbe.natCFutures>=2, JSON.stringify(catchProbe));
check('T18c: natPos 콜업 → C 슬롯 배치 + 규정 충족', catchProbe.cInLineup===1 && catchProbe.activeCAfter>=2 && catchProbe.ok===true, JSON.stringify(catchProbe));

// ── T19. 실사용 버그 묶음 회귀 (A 드래프트 팀컬럼 · B AI IL 회복 · C IL 진행바 · D 서브탭 · E 확대엔트리 토스트) ──
section('T19. 실사용 버그 묶음 회귀 (A~E)');
// 앞선 T18b가 myTeam 로스터를 훼손하므로 깨끗한 상태로 재초기화
vm.runInContext(`G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0; G.phase='second_half'; invalidateOvrCalib();`, ctx);

// A. 드래프트 결과 "팀" 컬럼이 팀명(r.team)을 쓴다 (선수명 아님)
const bugA = g(`(function(){
  G._draftResult=[{round:1,pick:1,team:'검증팀',emoji:'🦁',name:'검증선수',pos:'SS',ovr:70,isPitcher:false}];
  try{ renderDraftResult(); }catch(e){ return {err:e.message}; }
  const html=document.getElementById('draftContent').innerHTML||'';
  return { teamCell: html.includes('🦁 검증팀'), player: html.includes('검증선수') };
})()`);
check('A: 드래프트 "팀" 컬럼에 팀명 표시(🦁 검증팀)', bugA.teamCell===true, JSON.stringify(bugA));
check('A: "선수" 컬럼 선수명 유지', bugA.player===true, JSON.stringify(bugA));

// B. AI 팀 IL 카운트다운 — _aiILCountdown 3회 → 복귀(futures) + simulateOtherGames 배선
const bugB = g(`(function(){
  const t=G.teams.find(x=>x!==G.myTeam);
  const p=t.roster.find(x=>(x.status||'active')==='active');
  p.status='il'; p.isOnIL=true; p.ilGamesLeft=3;
  _aiILCountdown(t); const after1=p.ilGamesLeft;
  _aiILCountdown(t); _aiILCountdown(t);
  return { after1, status:p.status, il:p.ilGamesLeft, isOnIL:p.isOnIL,
           wired: simulateOtherGames.toString().includes('_aiILCountdown') };
})()`);
check('B: AI IL 매 경기 1씩 감소(3→2)', bugB.after1===2, JSON.stringify(bugB));
check('B: 3경기 후 IL 복귀(futures)+isOnIL 해제', bugB.status==='futures' && bugB.isOnIL===false, JSON.stringify(bugB));
check('B: simulateOtherGames가 _aiILCountdown 배선', bugB.wired===true);

// C. IL 진행바 — 장기부상(63경기 시즌아웃)에서도 음수 width 없음
const bugC = g(`(function(){
  const p=G.myTeam.roster.find(x=>(x.status||'active')==='active');
  p.status='il'; p.isOnIL=true; p.ilGamesLeft=63;
  let html='';
  try{ renderFutures(); html=document.getElementById('rosterFutures').innerHTML||''; }catch(e){ return {err:e.message}; }
  return { neg: html.includes('width:-'), rendered: html.length>0 };
})()`);
check('C: 장기부상 IL 진행바 음수 width 없음', bugC.err?false:(bugC.neg===false && bugC.rendered===true), JSON.stringify(bugC));

// D. 서브탭 복원 tabMap 라벨이 실제 탭 텍스트('2군','IL')와 일치 (소스 회귀 가드)
const bugD = g(`(function(){
  const s=_restoreRosterTab.toString();
  return { futures:s.includes("futures:'2군'"), il:s.includes("il:'IL'"),
           noStale: !s.includes("'퓨처스'") && !s.includes("il:'부상'") };
})()`);
check("D: tabMap futures→'2군' · il→'IL' (구 라벨 제거)", bugD.futures && bugD.il && bugD.noStale, JSON.stringify(bugD));

// E. 확대 엔트리 토스트 — 경로 무관 시즌당 정확히 1회 (멱등 가드)
const bugE = g(`(function(){
  G.phase='second_half'; G.expandedEntryNotified=false;
  let c=0; const orig=showToast;
  showToast=function(m){ if((''+m).indexOf('확대 엔트리')>=0) c++; };
  try{
    G.gameNum=42; processPostGame(); const c42=c;
    G.gameNum=43; processPostGame(); const c43=c;
    G.gameNum=44; processPostGame(); const c44=c;
    return { c42, c43, c44, flag:G.expandedEntryNotified };
  }catch(e){ return {err:e.message}; }
  finally{ showToast=orig; }
})()`);
check('E: 확대엔트리 gameNum<43 미발화', bugE.err?false:(bugE.c42===0), JSON.stringify(bugE));
check('E: gameNum>=43 최초 1회 발화 + 멱등(재발화 없음)', bugE.err?false:(bugE.c43===1 && bugE.c44===1 && bugE.flag===true), JSON.stringify(bugE));

// ── T20. 엔진 비대칭/밸런스 수정 회귀 (F erMod · G condFactor · H stamina · I 부상심도 · J 재정렬) ──
section('T20. 엔진 비대칭 수정 회귀 (F~J)');

// F. erMod — 저ERA 자격 투수에 1.20, 그 외 1.0 (엔진) + 3경로 resolvePA 배선(feat/#17 단일화)
// P4 1단계: erMod·condFactor·stamFactor·피로가 resolvePA 단일 엔진에 있고 3경로가 이를 경유 → 균일 보장.
const bugF = g(`(function(){
  const bat=G.myTeam.roster.find(p=>!p.isPitcher)||{ss:null};
  const mk=(role,outs,er)=>({role,ss:{outs,er,ab:0,h:0}});
  return {
    low: _calcRegression(bat, mk('rotation',60,2)).erMod,    // era=0.90<1.80 → 1.20
    high: _calcRegression(bat, mk('rotation',60,10)).erMod,   // era=4.50 → 1.0
    fewIP: _calcRegression(bat, mk('rotation',10,0)).erMod,   // outs<45 → 1.0
    engineErMod: resolvePA.toString().includes('regression.erMod'), // 통합 엔진이 erMod 적용
    wiredWatch: simulatePlay.toString().includes('resolvePA('),
    wiredAI: _simAIGame.toString().includes('resolvePA('),
    wiredMy: _simMyGame.toString().includes('resolvePA('),
  };
})()`);
check('F: 저ERA 자격 투수 erMod=1.20', bugF.low===1.20, JSON.stringify(bugF));
check('F: 정상 ERA·IP 미달 erMod=1.0', bugF.high===1.0 && bugF.fewIP===1.0, JSON.stringify(bugF));
check('F: erMod 통합 엔진 적용 + 3경로 resolvePA 배선(관전·AI·자동)', bugF.engineErMod && bugF.wiredWatch && bugF.wiredAI && bugF.wiredMy, JSON.stringify(bugF));

// G. condFactor — 통합 엔진 resolvePA가 condFactor를 effStuff·effControl에 반영 (3경로 공통)
const bugG = g(`(function(){
  const e=resolvePA.toString();
  return { def:e.includes('condFactor=Math.min'), stuff:/effStuff=.*condFactor/.test(e), ctrl:/effControl=.*condFactor/.test(e) };
})()`);
check('G: 통합 엔진 condFactor 반영(정의+effStuff+effControl)', bugG.def && bugG.stuff && bugG.ctrl, JSON.stringify(bugG));

// F2. resolvePA 통합 엔진 — 필드·확률 범위 유효 + 상황보정(피로 NP) 배선 확인 (공정성 기반)
const rpaProbe = g(`(function(){
  const b=G.myTeam.roster.find(p=>!p.isPitcher), p=G.myTeam.roster.find(x=>x.isPitcher);
  let freshBB=0, tiredBB=0;
  for(let i=0;i<300;i++){ freshBB+=resolvePA(b,p,{np:0}).pBB; tiredBB+=resolvePA(b,p,{np:110}).pBB; }
  const r=resolvePA(b,p,{});
  return {
    fields:['pHR','pK','pBB','babip','pError','gbRate','xbhRate','tripleRate','batSpeed'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])),
    ranges:r.pHR>=0.005&&r.pHR<=0.08 && r.pK>=0.04&&r.pK<=0.30 && r.pBB>=0.02&&r.pBB<=0.15 && r.babip>=0.20&&r.babip<=0.38,
    fatigueWired:(tiredBB/300)>(freshBB/300), // 피로 → 제구 저하 → 볼넷 확률 상승
  };
})()`);
check('F2: resolvePA 필드·확률범위 유효 + 피로 상황보정 배선(피로→볼넷↑)', rpaProbe.fields && rpaProbe.ranges && rpaProbe.fatigueWired, JSON.stringify(rpaProbe));

// H. currentStamina 초기화 통일 — 세 경로 =100, 구 statEff 초기화 제거 (소스 가드)
const bugH = g(`(function(){
  const my=_simMyGame.toString(), ai=_simAIGame.toString(), watch=startMatch.toString();
  return {
    all100: my.includes('p.currentStamina=100') && ai.includes('p.currentStamina=100') && watch.includes('p.currentStamina=100'),
    noStale: !my.includes("statEff(p,'stamina')+rand(0,10)") && !ai.includes("statEff(p,'stamina')+rand(0,10)"),
  };
})()`);
check('H: 관전·AI·자동 초기화 currentStamina=100', bugH.all100===true, JSON.stringify(bugH));
check('H: 구 statEff 스태미나 초기화 제거', bugH.noStale===true, JSON.stringify(bugH));

// I. 부상 심도 — 자동 경로가 rollInjuryDuration 사용(중증·시즌아웃 도달 가능)
const bugI = g(`(function(){
  let over15=0, seasonOut=0; const types={};
  for(let i=0;i<4000;i++){ const r=rollInjuryDuration(); if(r.games>15)over15++; if(r.games===TOTAL_REGULAR)seasonOut++; types[r.type]=1; }
  return { over15, seasonOut, typeCount:Object.keys(types).length,
           wired:_simMyGame.toString().includes('rollInjuryDuration') && !_simMyGame.toString().includes('rand(5,15)') };
})()`);
check('I: rollInjuryDuration 중증(>15경기) 발생', bugI.over15>0, JSON.stringify({over15:bugI.over15}));
check('I: 시즌아웃(=TOTAL_REGULAR) 발생 + 4종 심도', bugI.seasonOut>0 && bugI.typeCount>=4, JSON.stringify(bugI));
check('I: 자동 경로 rollInjuryDuration 배선(rand(5,15) 제거)', bugI.wired===true);

// J. 부상 교체가 타석 판정(resolvePA) 前에 확정 (소스 순서 가드 — 교체된 투수로 피로/유효스탯 계산)
// feat/#17: 피로 계수(stamFactor)가 resolvePA로 이동 → 교체가 resolvePA 호출보다 앞서는지로 검사.
const bugJ = g(`(function(){
  const s=simulatePlay.toString();
  return { swap:s.indexOf('pitcher=bpEmg[0]'), resolve:s.indexOf('resolvePA(') };
})()`);
check('J: 부상 교체(pitcher=bpEmg[0])가 타석 판정(resolvePA)보다 앞섬',
  bugJ.swap>=0 && bugJ.resolve>=0 && bugJ.swap<bugJ.resolve, JSON.stringify(bugJ));

// T21. 트레이드 데드라인 재확정 (#2) — 설계 v2 후반기 G39 (구 84경기 산식 56 잔재 제거)
const dl = g(`(function(){
  G.phase='second_half';
  // 실사용 경로인 getTradeWindowStatus()로 검증 (死함수 isTradeWindowOpen 제거)
  G.gameNum=39; const at39=getTradeWindowStatus().open;
  G.gameNum=40; const at40=getTradeWindowStatus().open;
  return { val:TRADE_DEADLINE_GAME, at39, at40 };
})()`);
check('T21: TRADE_DEADLINE_GAME=39 (설계 v2 G39)', dl.val===39, JSON.stringify(dl));
check('T21: 트레이드 창 G39 열림 · G40 닫힘', dl.at39===true && dl.at40===false, JSON.stringify(dl));

// T22. 8구장 파크팩터 (P3, A) — getParkFactor·중립 폴백·엔진 곱셈·리그 중립·3경로 배선
const pkProbe = g(`(function(){
  const known=getParkFactor({name:'데빌즈'});
  const neutral=getParkFactor({name:'없는팀xyz'});
  const undef=getParkFactor(undefined);
  const vals=Object.values(PARK_FACTORS);
  const hrAvg=vals.reduce((s,v)=>s+v.hr,0)/vals.length;
  const hitAvg=vals.reduce((s,v)=>s+v.hit,0)/vals.length;
  // 파크팩터 park.hr 곱셈이 resolvePA의 pHR에 반영되는지 — 죽은 코드 _ttoSimAB 대신 엔진 직접 호출
  let hrHi=0,hrLo=0;
  const _pkBat={power:80,contact:50,eye:50,speed:50,fielding:50};
  const _pkPit={stuff:50,control:50,movement:50,velocity:50,stamina:50,clutch:50,currentStamina:100,condition:100,role:'rotation'};
  for(let i=0;i<4000;i++){
    hrHi+=resolvePA(_pkBat,_pkPit,{park:{hr:2.0,hit:1},avgFielding:50}).pHR;
    hrLo+=resolvePA(_pkBat,_pkPit,{park:{hr:0.5,hit:1},avgFielding:50}).pHR;
  }
  return { knownHr:known.hr, neutralHr:neutral.hr, neutralHit:neutral.hit, undefHr:undef.hr,
    hrAvg:+hrAvg.toFixed(3), hitAvg:+hitAvg.toFixed(3), hrHi, hrLo, parkCount:vals.length,
    wiredWatch: simulatePlay.toString().includes('getParkFactor'),
    wiredAI: _simAIGame.toString().includes('getParkFactor'),
    wiredMy: _simMyGame.toString().includes('getParkFactor') };
})()`);
check('T22: getParkFactor 알려진 팀 값·미상/undefined 중립 폴백',
  pkProbe.knownHr===1.05 && pkProbe.neutralHr===1 && pkProbe.neutralHit===1 && pkProbe.undefHr===1, JSON.stringify(pkProbe));
check('T22: 8구장·평균 HR·Hit ≈1.0 (리그 중립)',
  pkProbe.parkCount===8 && pkProbe.hrAvg>=0.98 && pkProbe.hrAvg<=1.02 && pkProbe.hitAvg>=0.98 && pkProbe.hitAvg<=1.02, JSON.stringify(pkProbe));
check('T22: 엔진 park.hr 곱셈 반영 (2.0 > 0.5 HR율)', pkProbe.hrHi>pkProbe.hrLo, JSON.stringify({hrHi:pkProbe.hrHi,hrLo:pkProbe.hrLo}));
check('T22: 파크팩터 3경로 배선 (관전·AI·자동)', pkProbe.wiredWatch && pkProbe.wiredAI && pkProbe.wiredMy, JSON.stringify(pkProbe));

// T23. 세이버 지표 + 시상 (P3, B) — FIP/wOBA/SLG/WAR 함수·투수 MVP 가능·렌더 가드
const sbProbe = g(`(function(){
  const bat={isPitcher:false,pos:'CF',ss:{ab:200,h:70,hr:15,xbh:20,rbi:50,bb:30,k:40,sb:5}};
  const ace={isPitcher:true,pos:'SP',ss:{outs:180,er:10,pk:80,pbb:15,ha:40,phr:3,w:8,l:1,sv:0,gp:10}};
  const bad={isPitcher:true,pos:'SP',ss:{outs:180,er:50,pk:30,pbb:40,ha:90,phr:20,w:2,l:8,sv:0,gp:10}};
  const slg=ssSLG(bat), ops=ssOPS(bat);
  return {
    slgGtAvg: slg>ssAvg(bat),
    opsEq: Math.abs(ops-(ssOBP(bat)+slg))<0.001,
    fipOrder: ssFIP(ace)<ssFIP(bad),
    warOrder: warPitcher(ace)>warPitcher(bad),
    dispatch: warSaber(ace)===warPitcher(ace) && warSaber(bat)===warBatter(bat) };
})()`);
check('T23: SLG>AVG · OPS=OBP+SLG (장타 반영)', sbProbe.slgGtAvg && sbProbe.opsEq, JSON.stringify(sbProbe));
check('T23: FIP 에이스<부진 · WAR 에이스>부진', sbProbe.fipOrder && sbProbe.warOrder, JSON.stringify(sbProbe));
check('T23: warSaber 투수/타자 디스패치', sbProbe.dispatch, JSON.stringify(sbProbe));

const awProbe = g(`(function(){
  G.teamIdx=0; initTeams(0); G.season=2; G.gameNum=60; invalidateOvrCalib();
  let ace=null;
  G.teams.forEach(t=>t.roster.forEach(p=>{ initSeasonStats(p); if(p.isPitcher && !ace && p.pos==='SP')ace=p; }));
  ace.ss={outs:200,er:8,pk:110,pbb:12,ha:35,phr:2,w:12,l:1,sv:0,gp:12}; ace._seasonsPlayed=3;
  const myBat=G.myTeam.roster.find(p=>!p.isPitcher);
  if(myBat) myBat.ss={ab:120,h:38,hr:6,xbh:10,rbi:22,bb:18,k:25,sb:3};
  G.myTeam.wins=1;
  const allQ=[]; G.teams.forEach(t=>t.roster.forEach(p=>{ if(p.ss&&((!p.isPitcher&&qualifyBatter(p,QUALIFY_RATIO_AWARDS))||(p.isPitcher&&qualifyPitcher(p,QUALIFY_RATIO_AWARDS))))allQ.push({p,team:t}); }));
  allQ.sort((a,b)=>warSaber(b.p)-warSaber(a.p));
  const topIsPitcher = allQ.length>0 && allQ[0].p.isPitcher;
  let renderErr=null;
  try{ renderAnalysisBatters(); renderAnalysisPitchers(); renderLeagueLeaders(); }catch(e){renderErr=e.message;}
  return { aceWar:warPitcher(ace), topIsPitcher, renderErr };
})()`);
check('T23: 지배적 투수가 WAR 최상위 (투수 MVP 가능)', awProbe.topIsPitcher===true && awProbe.aceWar>0, JSON.stringify(awProbe));
check('T23: 분석·리더보드 세이버 렌더 무예외', awProbe.renderErr===null, JSON.stringify(awProbe));

// T24. 특성 노출 강화 (P1 팝오버 · P2 도감 · P3 평문화)
const trProbe = g(`(function(){
  const t=TRAITS['tcBat']; // fx {power:5,contact:5,_clutchHidden:5}
  const q=_traitFxText(t,false), x=_traitFxText(t,true);
  let popErr=null,popHtml='';
  try{ showTraitInfo('iron'); popHtml=document.getElementById('traitModalBody').innerHTML||''; }catch(e){popErr=e.message;}
  let codexErr=null,codexHtml='';
  try{ renderTraitCodex(); codexHtml=document.getElementById('analysisContent').innerHTML||''; }catch(e){codexErr=e.message;}
  const natN=Object.keys(TRAITS).filter(id=>TRAITS[id].kind==='nat').length;
  const artN=Object.keys(TRAITS).filter(id=>TRAITS[id].kind==='art').length;
  const pmini={_traits:[{id:'iron',slot:1,season:1}]};
  const miniHtml=traitMini(pmini), badgeHtml=traitBadges(pmini,false);
  return {
    qHasBand: q.includes('파워')&&(q.includes('소폭')||q.includes('뚜렷')||q.includes('강력'))&&q.includes('↑'),
    qNoNum: !/\\(\\+?\\d/.test(q), xHasNum: /\\(\\+5\\)/.test(x),
    popErr, popOk: popHtml.includes('철인')&&popHtml.includes('숨은 가치'),
    codexErr, codexCount:(codexHtml.match(/showTraitInfo\\(/g)||[]).length, natN, artN,
    miniClickable: miniHtml.includes('showTraitInfo(')&&badgeHtml.includes('showTraitInfo(') };
})()`);
check('T24-P3: 효과 평문화 (구간+방향·비공개 수치 은닉·공개 시 수치)', trProbe.qHasBand && trProbe.qNoNum && trProbe.xHasNum, JSON.stringify(trProbe));
check('T24-P1: 특성 팝오버 무예외 + 숨은가치 안내', trProbe.popErr===null && trProbe.popOk, JSON.stringify(trProbe));
check(`T24-P2: 특성 도감 렌더 (자연${trProbe.natN}·인공${trProbe.artN}=${trProbe.natN+trProbe.artN} 카드)`, trProbe.codexErr===null && trProbe.codexCount>=trProbe.natN+trProbe.artN, JSON.stringify(trProbe));
check('T24: 뱃지·마커 클릭 배선(showTraitInfo)', trProbe.miniClickable, JSON.stringify(trProbe));

// ── T25. fix/#14 경제 유계화 회귀 — 준비금 감가 · 급여 실차감 · 유지비 싱크 · 유계 인베리언트 ──
section('T25. 경제 유계화 (fix/#14) — 준비금 감가·급여 실차감·유지비 싱크');
const decayProbe = g(`(function(){
  const R={cap:(typeof RESERVE_SOFT_CAP!=='undefined')?RESERVE_SOFT_CAP:null,
           rate:(typeof RESERVE_DECAY_RATE!=='undefined')?RESERVE_DECAY_RATE:null};
  const decay=(b)=> b>R.cap ? b-Math.floor((b-R.cap)*R.rate) : b;
  R.boundary = decay(R.cap)===R.cap;                          // 경계(=cap): 감가 0
  R.below    = decay(120)===120;                              // 캡 아래: 무영향
  R.prop     = decay(R.cap+200)===(R.cap+200)-Math.floor(200*R.rate); // 초과분 비례
  R.noBankrupt = decay(100000)>R.cap;                         // 결과가 캡 초과 유지 → 감가는 파산 유발 불가
  return R;
})()`);
check(`준비금 감가 상수 (소프트캡 ${decayProbe.cap} / 감가율 ${decayProbe.rate})`, decayProbe.cap===300 && decayProbe.rate===0.30);
check('감가 공식: 경계=0 · 캡아래 무영향 · 초과분 비례 · 파산 유발 불가', decayProbe.boundary && decayProbe.below && decayProbe.prop && decayProbe.noBankrupt, JSON.stringify(decayProbe));

const sinkProbe = g(`(function(){
  const mk=()=>({coachStaff:{},stadiumLevel:0,slumpCareLevel:0,mentalCoachLevel:0,medicalLevel:0,devLevel:0,scoutingLevel:0,analyticsLevel:0,facilityLevel:0,roster:[]});
  const u0=calcAnnualUpkeep(mk()).total;
  const t=mk(); t.stadiumLevel=5; t.slumpCareLevel=4; t.coachStaff={batting:5};
  const u1=calcAnnualUpkeep(t).total;
  return {u0,u1,rise:u1>u0};
})()`);
check(`유지비 싱크: 인프라 투자↑ → 연 유지비↑ (${sinkProbe.u0}→${sinkProbe.u1}, AI 재투자 잉여 흡수 근거)`, sinkProbe.rise, JSON.stringify(sinkProbe));

const settleProbe = g(`(function(){
  try{
    G.myTeam.budget=Math.max(G.myTeam.budget,500); // 파산 게임오버 회피
    const sorted=[...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
    const team=sorted[0]; // 1위팀: 하위4 분배·(대개)플로어 벌과금 영향 최소
    const B=team.budget, rev=calcSeasonRevenue(team,1).net, upkeep=calcAnnualUpkeep(team).total, pay=getPayroll(team);
    let e=B+rev;                                    // 정산 순서 복제: 수익
    const sf=+(getSalaryFloor()-pay).toFixed(1); if(sf>0) e=+(e-sf).toFixed(1); // 플로어 벌과금
    e=Math.floor(e-upkeep-pay);                     // 유지비 + 급여 실차감
    if(e>RESERVE_SOFT_CAP) e-=Math.floor((e-RESERVE_SOFT_CAP)*RESERVE_DECAY_RATE); // 준비금 감가
    G._stoveSettledSeason=-1; showStoveLeague();    // 실제 정산 구동
    return {exp:e, act:team.budget, pay:Math.round(pay), diff:Math.abs(team.budget-e)};
  }catch(err){return {err:err.message};}
})()`);
check(`급여 실차감 정산 공식 정합 (1위팀 예산=수익-유지비-급여-감가, 페이롤 ${settleProbe.pay}억 차감)`, settleProbe.diff!=null && settleProbe.diff<=1, JSON.stringify(settleProbe));

const boundProbe = g(`(function(){
  try{
    G.myTeam.budget=Math.max(G.myTeam.budget,500);
    G.teams.forEach(t=>{t.budget=2000;});          // 전 팀 예산 폭등
    G._stoveSettledSeason=-1; showStoveLeague();    // 1회 정산
    const a=G.teams.map(t=>t.budget);
    return {finite:a.every(Number.isFinite), reduced:a.every(b=>b<2000), noNeg:a.every(b=>b>=0), max:Math.round(Math.max(...a))};
  }catch(err){return {err:err.message};}
})()`);
check(`유계 인베리언트: 예산 2000억 폭등 → 정산 후 감소·유한·비음수 (max ${boundProbe.max})`, boundProbe.finite && boundProbe.reduced && boundProbe.noNeg, JSON.stringify(boundProbe));

// ── T26. P6 구단주 신임도 — 목표 제시 · 증감 공식 · clamp · 경질 · 영속 ──
section('T26. P6 구단주 신임도 — 목표·증감·경질·세이브');
const apConstProbe = g(`(function(){
  const goal=_proposeSeasonGoal();
  return {start:APPROVAL_START, warn:APPROVAL_WARN, dismiss:APPROVAL_DISMISS, goal, goalOk:goal>=1&&goal<=G.teams.length};
})()`);
check(`신임도 상수 (시작 ${apConstProbe.start} / 경고 ${apConstProbe.warn} / 경질 ${apConstProbe.dismiss})`, apConstProbe.start===50 && apConstProbe.warn===20 && apConstProbe.dismiss===0);
check(`구단주 목표 순위 자동 제시 유효 (1~${g('G.teams.length')}): ${apConstProbe.goal}`, apConstProbe.goalOk);

const apDeltaProbe = g(`(function(){
  const mk=(goal,ap)=>({_seasonGoalRank:goal,approval:ap});
  const d=(t,rank,champ,net)=>{_applyApprovalDelta(t,rank,champ,net);return t.approval;};
  return {
    over:  d(mk(4,50),1,false,100),  // (4-1)*4=12 +포스트5 = +17 → 67
    under: d(mk(4,50),8,false,100),  // (4-8)*4=-16 → 34
    champ: d(mk(4,50),1,true,100),   // (4-1)*4=12 +우승15(포스트 배타) → 77
    fin:   d(mk(4,50),4,false,-10),  // 0 +포스트5 -적자3 = +2 → 52
    clampLo:d(mk(1,5),8,false,-10),  // -31 → clamp 0
    clampHi:d(mk(8,98),1,true,100),  // +43 → clamp 100
  };
})()`);
check(`증감 공식: 목표상회 +17(${apDeltaProbe.over}) / 미달 -16(${apDeltaProbe.under}) / 우승 +15(${apDeltaProbe.champ}) / 적자 -3(${apDeltaProbe.fin})`,
  apDeltaProbe.over===67 && apDeltaProbe.under===34 && apDeltaProbe.champ===77 && apDeltaProbe.fin===52, JSON.stringify(apDeltaProbe));
check(`신임도 clamp 0~100 (하한 ${apDeltaProbe.clampLo} / 상한 ${apDeltaProbe.clampHi})`, apDeltaProbe.clampLo===0 && apDeltaProbe.clampHi===100);

const apDismissProbe = g(`(function(){
  const saved=G.myTeam.approval;
  G.myTeam.approval=0;  const fired=checkApprovalDismissal();
  G.myTeam.approval=50; const notFired=checkApprovalDismissal();
  G.myTeam.approval=saved; const nb=document.getElementById('btnNavAdvance'); if(nb)nb.disabled=false;
  return {fired, notFired};
})()`);
check('경질 판정: 신임도 0 → 게임오버 발동 / >0 → 미발동', apDismissProbe.fired===true && apDismissProbe.notFired===false, JSON.stringify(apDismissProbe));

const apPersistProbe = g(`(function(){
  try{
    G.myTeam.approval=37; G.myTeam._seasonGoalRank=5; G._goalSetSeason=G.season; G._approvalEvalSeason=G.season;
    saveGame();
    G.myTeam.approval=99; G.myTeam._seasonGoalRank=1; G._goalSetSeason=0;
    loadGame();
    return {ap:G.myTeam.approval, goal:G.myTeam._seasonGoalRank, guard:G._goalSetSeason===G.season, allInit:G.teams.every(t=>typeof t.approval==='number'), err:null};
  }catch(e){return {err:e.message};}
})()`);
check('save→load 신임도·목표·멱등가드 보존 + 전 팀 approval 수치', apPersistProbe.ap===37 && apPersistProbe.goal===5 && apPersistProbe.guard===true && apPersistProbe.allInit===true, JSON.stringify(apPersistProbe));

const apPreseasonProbe = g(`(function(){
  try{
    G._goalSetSeason=0; G.myTeam._seasonGoalRank=null;
    showPreseason(); // 실제 프리시즌 구동 → 구단주 목표 자동 설정
    const first=G.myTeam._seasonGoalRank;
    showPreseason(); // 재진입 — 멱등 가드로 목표 불변
    return {goal:first, set:G._goalSetSeason===G.season, valid:first>=1&&first<=G.teams.length, idem:G.myTeam._seasonGoalRank===first, err:null};
  }catch(e){return {err:e.message};}
})()`);
check('프리시즌: 구단주 목표 자동 설정 + 멱등(재진입 불변)', apPreseasonProbe.set && apPreseasonProbe.valid && apPreseasonProbe.idem, JSON.stringify(apPreseasonProbe));

// ── T27. 투수 기용 경로 대칭 — 관전 NP 단위 · 불펜 로테이션 · 이닝 중 교체 전파 ──
// 기존 T20/T22는 `simulatePlay.toString()` 배선 문자열만 검사해 관전 경로를 한 번도 "실행"하지 않았고,
// 그래서 관전 경로가 투구수를 타석당 +1로 세던 단위 오류(A)를 통과시켰다. 여기서는 실제로 경기를 돌린다.
section('T27. 투수 기용 경로 대칭 (NP 단위 · 불펜 로테이션 · 교체 전파)');

// ── A. 관전 경로(startMatch→simulatePlay) 실제 구동 ──
// NP는 getMaxPitches(투구수)·_fatigueDebuff(50구~)와 같은 단위여야 한다. 타석당 +1이면 NP/IP≈4로 붕괴.
const watchProbe = g(`(function(){
  try{
    G.teamIdx=0; initTeams(0); G.season=1; G.phase='first_half'; G.matchInProgress=false;
    G.teams.forEach(t=>t.roster.forEach(p=>initSeasonStats(p)));
    let sp=[], relPerGame=[], games=0;
    // 표본 12경기(24선발)는 cgRate 가드에 비해 작다 — 실제 분포는 평균 0.07·최대 0.21인데
    // 임계가 0.30이라 드문 극단 표본이 임계를 넘어 플레이크가 났다(관측 1/42회).
    // 28경기(56선발)로 늘려 표준편차를 ~1.5배 줄인다.
    for(let gi=0; gi<28; gi++){
      G.gameNum=gi; G.phase='first_half'; G.matchInProgress=false;
      __harnessFixRoster();
      startMatch();
      if(!G.matchInProgress) continue;
      const spH=matchState.startingPitcher.home, spA=matchState.startingPitcher.away;
      let guard=0;
      while(G.matchInProgress && guard++<5000) simulatePlay();
      games++;
      [spH,spA].forEach(p=>{ if(!p||!p.today) return;
        sp.push({np:p.today.np||0, outs:p.today.outs||0}); });
      relPerGame.push((matchState.relieversUsed.home||[]).length+(matchState.relieversUsed.away||[]).length);
    }
    const ip=sp.reduce((s,x)=>s+x.outs,0)/3, np=sp.reduce((s,x)=>s+x.np,0);
    return {games, starts:sp.length,
      npPerIP:+(np/Math.max(1,ip)).toFixed(2),
      avgNP:+(np/Math.max(1,sp.length)).toFixed(1),
      avgIP:+(ip/Math.max(1,sp.length)).toFixed(2),
      cgRate:+(sp.filter(x=>x.outs>=24).length/Math.max(1,sp.length)).toFixed(2),
      relPerGame:+(relPerGame.reduce((a,b)=>a+b,0)/Math.max(1,relPerGame.length)).toFixed(2), err:null};
  }catch(e){return {err:e.message};}
})()`);
check('A: 관전 경로 실제 구동 (경기 완주 + 무예외)',
  !watchProbe.err && watchProbe.games >= 8, JSON.stringify(watchProbe));
// 실투구수라면 이닝당 12~22구. 타석당 +1(구 버그)이면 ≈4 → 실패.
check(`A: 관전 NP가 투구수 단위 (이닝당 12~22구): ${watchProbe.npPerIP}`,
  watchProbe.npPerIP >= 12 && watchProbe.npPerIP <= 22, JSON.stringify(watchProbe));
// 투구수 강판이 실제로 작동하는가 — 구 버그에선 8이닝+ 67%
check(`A: 선발 완투 억제 (8이닝+ 비율 ≤0.30): ${watchProbe.cgRate}`,
  watchProbe.cgRate <= 0.30, JSON.stringify(watchProbe));
check(`A: 관전 경기당 불펜 등판(양팀 합) ≥2.0: ${watchProbe.relPerGame}`,
  watchProbe.relPerGame >= 2.0, JSON.stringify(watchProbe));

// ── B. _pickReliever가 등판 확정을 마킹하는가 (`_pitchedThisGame` 사문화 회귀) ──
const pickProbe = g(`(function(){
  try{
    const T=G.teams[1];
    getPitchers(T).forEach(p=>{p._pitchedThisGame=false;p._simNP=0;p.currentStamina=100;p._consecutiveDaysPitched=0;p.condition=100;});
    const picks=[]; for(let i=0;i<5;i++){ const r=_pickReliever(T,8,1); picks.push(r?r._uid:null); }
    const real=picks.filter(Boolean);
    return {n:real.length, uniq:new Set(real).size, marked:getBullpen(T).filter(p=>p._pitchedThisGame).length, err:null};
  }catch(e){return {err:e.message};}
})()`);
check(`B: _pickReliever 5연속 호출이 서로 다른 투수 반환 (uniq=${pickProbe.uniq}/${pickProbe.n})`,
  !pickProbe.err && pickProbe.n >= 4 && pickProbe.uniq === pickProbe.n, JSON.stringify(pickProbe));
check('B: 선택 즉시 _pitchedThisGame 마킹 (등판 확정 = 후보 제외)',
  pickProbe.marked === pickProbe.n, JSON.stringify(pickProbe));

// ── B. 시뮬 경로 풀시즌 불펜 분산 + GP 집계 정합 ──
const simBpProbe = g(`(function(){
  try{
    G.teams.forEach(t=>t.roster.forEach(p=>initSeasonStats(p)));
    const A=G.teams[3], B=G.teams[4];
    for(let i=0;i<63;i++){
      _simAIGame(A,B);
      G.teams.forEach(t=>{const r=getRotation(t).length; if(r>0)t.rotationIdx=(t.rotationIdx+1)%r;});
    }
    const bp=getBullpen(A);
    // 등판당 평균 이닝(=IP/GP)이 핵심 지표. 구 버그에선 동일 투수가 무한 재선택돼 SU가 등판당 8이닝을
    // 던졌다. 최댓값은 '불펜 소진 시 마지막 투수가 계속 던진다'는 정상 폴백을 잡아 플레이크라 쓰지 않는다.
    const short=bp.filter(p=>p.pos!=='LR'&&(p.ss.gp||0)>0);
    const shortIP=short.reduce((s,p)=>s+(p.ss.outs||0),0)/3;
    const shortGP=short.reduce((s,p)=>s+(p.ss.gp||0),0);
    const bpGP=bp.reduce((s,p)=>s+(p.ss.gp||0),0);
    return {bpTotal:bp.length, used:bp.filter(p=>(p.ss.outs||0)>0).length,
      bpAppPerGame:+(bpGP/63).toFixed(2),
      shortIPperApp:+(shortIP/Math.max(1,shortGP)).toFixed(2),
      gpGap:getPitchers(A).filter(p=>(p.ss.outs||0)>0&&(p.ss.gp||0)===0).length, err:null};
  }catch(e){return {err:e.message};}
})()`);
check('B: 시즌 시뮬 무예외', !simBpProbe.err, JSON.stringify(simBpProbe));
// NOTE: 시즌 단위 분산 지표(등판 인원·경기당 등판 횟수)는 실측 변동폭이 커(인원 6~8 · 횟수 1.4~3.2)
// 밴드로 고정하면 플레이크가 된다. 상한이 잔여 결함 D(AI 투수 피로 미적용 — `_consecutiveDaysPitched`가
// 내 팀 전용이라 보직 우선순위가 정적)에 묶여 있기 때문. B 회귀는 아래 결정적 지표 3종으로 충분히 잡힌다.
// 밴드 4.0 = 실측 분포(1.6~2.7) 위 여유 + 구 버그 8.0의 절반 → 플레이크 없이 회귀만 잡는다.
check(`B: 단기 계투 등판당 평균 이닝 (CP/SU/MR ≤4.0IP — 구 버그 8.0): ${simBpProbe.shortIPperApp}`,
  simBpProbe.shortIPperApp <= 4.0, JSON.stringify(simBpProbe));
check('B: GP 집계 정합 (IP>0인데 GP=0인 투수 0명)',
  simBpProbe.gpGap === 0, JSON.stringify(simBpProbe));

// ── C. 이닝 중 교체 전파 · 실이닝 전달 (bullpen 컨셉 팀이 최악 케이스) ──
// 구 버그: simHalfFull이 `shouldHookPitcher(p, 7, 0, ...)`로 이닝을 7 고정 → bullpen 컨셉의
// '6회부터 선발 교체' 규칙이 1번 타자부터 참 → 자동 진행 시 선발 0이닝 · 불펜 점유 100%.
// 또한 교체된 투수가 호출부에 전파되지 않아 다음 하프이닝에 강판된 투수가 되돌아왔다.
check('C: simHalfFull이 실이닝·당일실점을 전달 (7/0 하드코딩 부재)',
  !/shouldHookPitcher\(\s*pitcher\s*,\s*7\s*,\s*0\s*,/.test(g('_simMyGame.toString()')));
check('C: 시뮬 경로가 pitRef로 교체를 호출부에 전파',
  g('_simMyGame.toString()').includes('pitRef'));

const bullpenConceptProbe = g(`(function(){
  try{
    const idx=TEAMS_DATA.findIndex(t=>t.concept==='bullpen');
    G.teamIdx=idx; initTeams(idx); G.season=1; G.gameNum=0; G.phase='first_half';
    G.teams.forEach(t=>t.roster.forEach(p=>initSeasonStats(p)));
    let n=0;
    for(let i=0;i<20;i++){
      __harnessFixRoster();
      const before=G.gameNum;
      _simMyGame(); // 반환값은 승/패 boolean이라 성공 판정에 쓸 수 없음 — gameNum 전진으로 판정
      if(G.gameNum===before) break;
      n++;
      if(G.gameNum>=FIRST_HALF_END&&G.phase==='first_half')G.phase='second_half';
    }
    const T=G.myTeam;
    const spIP=getRotation(T).reduce((s,p)=>s+(p.ss.outs||0),0)/3;
    const bpIP=getBullpen(T).reduce((s,p)=>s+(p.ss.outs||0),0)/3;
    return {concept:TEAMS_DATA[idx].concept, games:n, spIP:+spIP.toFixed(1), bpIP:+bpIP.toFixed(1),
      bpShare:+(bpIP/Math.max(1,spIP+bpIP)*100).toFixed(1), err:null};
  }catch(e){return {err:e.message};}
})()`);
// bullpen 컨셉은 불펜 편중이 정상이나 선발이 사라지면 안 된다 (구 버그: 선발 0IP · 점유 100%).
check(`C: bullpen 컨셉 팀 자동 진행 — 선발이 실제로 던짐 (불펜 점유 ≤75%): ${bullpenConceptProbe.bpShare}%`,
  !bullpenConceptProbe.err && bullpenConceptProbe.games >= 5 && bullpenConceptProbe.bpShare <= 75,
  JSON.stringify(bullpenConceptProbe));
check(`C: bullpen 컨셉 선발 이닝 > 0 (구 버그: 0IP): ${bullpenConceptProbe.spIP}IP`,
  bullpenConceptProbe.spIP > 0, JSON.stringify(bullpenConceptProbe));
check('C: _simAIGame 현재투수가 이닝 간 유지 (curPit 선언이 루프 밖)',
  !/for\s*\(let inn[^)]*\)\s*\{\s*let curPit/.test(g('_simAIGame.toString()')));

// ── D. AI 투수 피로 — 컨디션·연투가 내 팀 전용이 아니어야 한다 ──
// 구 버그: 컨디션/연투 갱신이 `G.myTeam.roster`로만 한정돼 AI 투수는 condition이 생성 시
// 초깃값에 영구 고정되고 `_consecutiveDaysPitched`가 항상 0 → `_pickReliever`의 필터 2종
// (3연투 금지 · 컨디션 20 이상)이 AI에겐 사문화되고 resolvePA의 condFactor가 비대칭이 된다.
check('D: _aiPitcherRest가 simulateOtherGames에 배선',
  g('simulateOtherGames.toString()').includes('_aiPitcherRest'));
const aiRestProbe = g(`(function(){
  try{
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0; G.phase='first_half';
    G.teams.forEach(t=>t.roster.forEach(p=>initSeasonStats(p)));
    for(let i=0;i<25;i++){
      if(G.gameNum>=FIRST_HALF_END&&G.phase==='first_half')G.phase='second_half';
      __harnessFixRoster(); const b=G.gameNum; _simMyGame(); if(G.gameNum===b) break;
    }
    const ai=G.teams.filter(t=>t!==G.myTeam);
    const stat=t=>{const ps=getPitchers(t).filter(p=>(p.status||'active')==='active');
      return {consec:ps.filter(p=>(p._consecutiveDaysPitched||0)>0).length,
              full:ps.filter(p=>(p.condition||100)>=100).length,
              tired:ps.filter(p=>(p.condition||100)<80).length};};
    const s=ai.map(stat);
    return {teams:s.length,
      consecTeams:s.filter(x=>x.consec>0).length,   // 연투 카운터가 갱신되는 팀 수
      fullTeams:s.filter(x=>x.full>0).length,       // 휴식으로 100까지 회복한 투수를 가진 팀 수
      tiredTeams:s.filter(x=>x.tired>0).length, err:null};
  }catch(e){return {err:e.message};}
})()`);
check(`D: AI 투수 연투 카운터가 갱신됨 (${aiRestProbe.consecTeams}/${aiRestProbe.teams}팀 — 구 버그 0팀)`,
  !aiRestProbe.err && aiRestProbe.consecTeams >= 4, JSON.stringify(aiRestProbe));
check(`D: AI 투수 컨디션이 등판/휴식에 반응 (회복 ${aiRestProbe.fullTeams}팀 · 소모 ${aiRestProbe.tiredTeams}팀)`,
  aiRestProbe.fullTeams >= 4 && aiRestProbe.tiredTeams >= 1, JSON.stringify(aiRestProbe));
// 관전 경로도 `_simNP`를 갱신해야 경기 후 정산이 경로와 무관하게 동작한다
check('D: 관전 경로가 _simNP를 미러링 (AI today는 스테일이라 사용 불가)',
  g('simulatePlay.toString()').includes('_simNP=pt.np'));

// ── G. simulateOtherGames의 오늘 일정 타이밍 ──
// 구 버그: 내부에서 getOpponent()를 호출했는데 관전(endMatch)은 G.gameNum++ 뒤에,
// 자동(_simMyGame)은 앞에 호출한다. 시리즈 경계(3경기 중 1회)에서 관전 경로만 '내일 상대'를
// 제외해 오늘 상대가 2경기(내 경기+AI 경기), 내일 상대가 0경기를 치렀다.
// fix/#22: 상대 하나가 아니라 **오늘의 시리즈 인덱스**를 넘겨 대진표 전체를 단일 소스로 만든다.
check('G: simulateOtherGames가 오늘 시리즈를 인자로 받음',
  /function simulateOtherGames\(\s*todaySeries\s*\)/.test(g('simulateOtherGames.toString()')));
check('G: endMatch가 matchState 기반으로 오늘 시리즈를 전달 (gameNum 증가 후라 getCurrentSeries 사용 불가)',
  /simulateOtherGames\(\s*s\._seriesIdx\s*\)/.test(g('endMatch.toString()')) &&
  /_seriesIdx\s*:\s*getCurrentSeries\(\)/.test(g('startMatch.toString()')));
const schedProbe = g(`(function(){
  try{
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0; G.phase='first_half';
    G.teams.forEach(t=>{t.wins=0;t.losses=0;t.roster.forEach(p=>initSeasonStats(p));});
    let played=0;
    for(let i=0;i<7;i++){ // 시리즈 경계(G2→G3, G5→G6)를 반드시 포함
      __harnessFixRoster();
      G.matchInProgress=false;
      const before=G.gameNum;
      startMatch();
      if(!G.matchInProgress){ if(G.gameNum===before) break; else continue; }
      let guard=0; while(G.matchInProgress&&guard++<5000) simulatePlay();
      if(G.gameNum===before) break;
      played++;
    }
    const gp=G.teams.map(t=>t.wins+t.losses);
    return {played, gp, min:Math.min(...gp), max:Math.max(...gp), err:null};
  }catch(e){return {err:e.message};}
})()`);
// 하루에 8팀이 4경기를 치르므로 전 구단 소화 경기 수는 항상 같아야 한다
check(`G: 관전 ${schedProbe.played}경기 후 전 구단 소화 경기 수 균등 (편차 ${schedProbe.max - schedProbe.min})`,
  !schedProbe.err && schedProbe.played >= 5 && schedProbe.max === schedProbe.min,
  JSON.stringify(schedProbe));

// ── T28. 시즌 사이클 end-to-end (오프시즌 페이즈 실구동) ──
// 기존 스모크는 인게임 루프만 돌리고 오프시즌 페이즈 함수를 한 번도 실행하지 않았다
// (showAllStarBreak·_startRookieDraft·showAwards·showPostseason·showGMMeeting·_startNextSeason = 0회 호출.
//  포스트시즌/GM회의 테스트는 G.postseasonBracket을 직접 조작하는 합성 테스트였다).
// 그 공백 때문에 "드래프트가 유저 지명에서 멈춘다"는 사실이 드러나지 않았고, 로스터·예산 수지를
// 6명/시즌 유입이 빠진 채로 오진할 수 있었다. 여기서는 실제 버튼 전이를 그대로 재현해 사이클을 완주한다.
section('T28. 시즌 사이클 end-to-end (오프시즌 페이즈 실구동)');

// setTimeout 큐를 실제로 실행 (드래프트 AI 픽 체인은 setTimeout 재귀로 진행됨) — 구현은 tools/harness.js
const drainTimers = (cap) => h.drainTimers(cap);

const cycle = g(`(function(){
  const rec={phases:[], err:null};
  try{
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0;
    const snap=(tag)=>rec.phases.push({tag, season:G.season, gameNum:G.gameNum, phase:G.phase,
      rosters:G.teams.map(t=>t.roster.length), budgets:G.teams.map(t=>Math.round(t.budget))});

    G.phase='preseason'; showPreseason(); G.phase='first_half'; snap('preseason');
    __playHalf(FIRST_HALF_END); snap('first_half');

    // 올스타 → 드래프트 (유저 지명 차례에서 체인이 멈추므로 하네스가 자동 지명)
    G.phase='allstar'; showAllStarBreak();
    const rosterBeforeDraft=G.teams.map(t=>t.roster.length);
    _startRookieDraft();
    rec.draftStarted=!!G._draftState;
    return {rec, rosterBeforeDraft};
  }catch(e){ rec.err=e.message+' @'+G.phase; return {rec}; }
})()`);
check('T28: 프리시즌·전반기·올스타·드래프트 개시 무예외',
  !cycle.rec.err && cycle.rec.draftStarted === true, JSON.stringify(cycle.rec.err || cycle.rec.phases.slice(-1)));

// 드래프트 체인 구동 — AI 픽은 setTimeout, 내 픽은 draftPick() 호출로 이어준다
let draftGuard = 0, myPicks = 0;
while (draftGuard++ < 200) {
  drainTimers();
  const stalled = g(`(function(){const ds=G._draftState;
    return !!(ds && ds.round<=ds.totalRounds && G.draftPool.length>0 && ds.order[ds.pickInRound]===G.myTeam);})()`);
  if (!stalled) break;
  vm.runInContext(`draftPick(G.draftPool[0]._uid);`, ctx);
  myPicks++;
}
drainTimers();
const draftRes = g(`(function(){
  return {phase:G.phase, poolLeft:(G.draftPool||[]).length,
    picked:(G._draftResult||[]).length, // _finishDraft가 _draftState.log를 _draftResult로 옮기고 state를 정리
    rosters:G.teams.map(t=>t.roster.length)};
})()`);
// 6라운드 × 8팀 = 48픽. 유저 지명이 UI 대기(_processDraftPick이 renderDraft만 하고 반환)라
// 하네스가 draftPick()으로 이어주지 않으면 첫 내 차례에서 체인이 멈춘다.
const draftExpected = g('DRAFT_ROUNDS') * g('G.teams.length');
check(`T28: 드래프트 ${draftExpected}픽 완주 (관측 ${draftRes.picked}픽 · 내 지명 ${myPicks}회 · 풀 잔여 ${draftRes.poolLeft})`,
  draftRes.picked === draftExpected && draftRes.poolLeft === 0, JSON.stringify(draftRes));
check(`T28: 드래프트 후 second_half 전이 (관측 ${draftRes.phase})`,
  draftRes.phase === 'second_half', JSON.stringify(draftRes));
const inflow = draftRes.rosters.map((n, i) => n - cycle.rosterBeforeDraft[i]);
check(`T28: 전 구단 드래프트 유입 = ${g('DRAFT_ROUNDS')}명 (관측 ${JSON.stringify(inflow)})`,
  inflow.every(x => x === g('DRAFT_ROUNDS')), JSON.stringify(inflow));

// 후반기 → 포스트시즌 → 시상식(은퇴) → GM회의 → 스토브 → 다음시즌
const rest = g(`(function(){
  const out={err:null};
  try{
    __playHalf(TOTAL_REGULAR);
    out.regularDone=G.gameNum;
    out.beforeRetire=G.teams.map(t=>t.roster.length);

    G.phase='postseason'; showPostseason();
    if(typeof _runPostseason==='function' && G.postseasonBracket && G.postseasonBracket.round==='semifinal'
       && _sortByWinPct().indexOf(G.myTeam)<POSTSEASON_TEAMS){ _runPostseason(); }
    out.bracket=!!(G.postseasonBracket&&(G.postseasonBracket.results||[]).length>0);

    G.phase='awards'; showAwards();
    out.afterRetire=G.teams.map(t=>t.roster.length);
    out.awards=(G.awards||[]).length;

    G.phase='gm_meeting'; showGMMeeting();
    out.gmProposals=!!(G._gmState||G.seasonModifiers);

    G.phase='stove_league'; showStoveLeague();
    out.faPoolLeft=(G.faPool||[]).length;
    out.afterStove=G.teams.map(t=>t.roster.length);

    _startNextSeason();
    out.faPoolAfterRollover=(G.faPool||[]).length;
    out.nextSeason=G.season; out.nextPhase=G.phase; out.nextGameNum=G.gameNum;
    out.afterRollover=G.teams.map(t=>t.roster.length);
    out.budgets=G.teams.map(t=>Math.round(t.budget));
    out.statsReset=G.teams.every(t=>t.roster.every(p=>!p.ss||((p.ss.ab||0)===0&&(p.ss.outs||0)===0)));
    out.recordReset=G.teams.every(t=>t.wins===0&&t.losses===0);
    return out;
  }catch(e){ out.err=e.message+' @'+G.phase; return out; }
})()`);
check('T28: 후반기~포스트시즌~시상식~GM회의~스토브~롤오버 무예외',
  !rest.err, rest.err || '');
check(`T28: 정규시즌 완주 (${rest.regularDone}/${g('TOTAL_REGULAR')})`,
  rest.regularDone === g('TOTAL_REGULAR'), JSON.stringify({done:rest.regularDone}));
check('T28: 포스트시즌 시리즈 실제 진행 (bracket.results 채워짐)', rest.bracket === true, JSON.stringify(rest.bracket));
check(`T28: 시즌 롤오버 (season ${rest.nextSeason} · phase ${rest.nextPhase} · gameNum ${rest.nextGameNum})`,
  rest.nextSeason === 2 && rest.nextPhase === 'preseason' && rest.nextGameNum === 0, JSON.stringify(rest));
check('T28: 롤오버 시 시즌 스탯·전적 초기화', rest.statsReset === true && rest.recordReset === true,
  JSON.stringify({statsReset:rest.statsReset, recordReset:rest.recordReset}));
// 미계약 FA는 롤오버에서 소멸하지 않고 다음 스토브리그로 이월된다 (_faYears 한계까지).
// 구 버그는 `G.faPool=[]`로 배열을 통째로 비우는 것이었으므로 그 부재를 직접 확인한다.
// (롤오버 중 AI 최소 인원 보충이 풀에서 일부를 흡수하므로 수치 동일성은 성립하지 않는다)
check('T28: _startNextSeason이 faPool을 비우지 않음 (미계약 FA 소멸 방지)',
  !/G\.faPool\s*=\s*\[\]/.test(g('_startNextSeason.toString()')));
check(`T28: 미계약 FA 롤오버 이월 (스토브 잔여 ${rest.faPoolLeft}명 → 롤오버 후 ${rest.faPoolAfterRollover}명 · 보충 흡수분 제외)`,
  rest.faPoolLeft === 0 ? rest.faPoolAfterRollover === 0 : rest.faPoolAfterRollover >= Math.max(0, rest.faPoolLeft - 40),
  JSON.stringify({before:rest.faPoolLeft, after:rest.faPoolAfterRollover}));
check(`T28: FA 이월 한계 상수 정의 (FA_UNSIGNED_MAX_YEARS=${g('FA_UNSIGNED_MAX_YEARS')})`,
  g('typeof FA_UNSIGNED_MAX_YEARS') === 'number' && g('FA_UNSIGNED_MAX_YEARS') >= 1);
// 은퇴 기능이 실제로 동작하는지(=0이 아님)와 로스터를 붕괴시키지 않는지만 본다.
// 비율 자체는 밸런스 사안이라 밴드로 고정하지 않는다 — 초기 로스터는 `_seasonsPlayed=age-18`로
// 생성돼 30세 58% / 32세 82% / 34세 100% 곡선에 걸리는 베테랑 비중이 커서 첫 오프시즌 유출이 크다.
// (롤오버 후 조직 인원·예산 건전성은 아래 별도 어서션이 담보)
const retired = rest.beforeRetire.map((n, i) => n - rest.afterRetire[i]);
check(`T28: 은퇴 처리 동작 (전 구단 발생 · 관측 ${JSON.stringify(retired)})`,
  retired.every(x => x >= 0) && retired.some(x => x > 0), JSON.stringify(retired));
// 은퇴 곡선을 나이 기반(RETIRE_MIN_AGE)으로 재조정한 뒤 본래 기준(1군 최소 정원)으로 조였다.
// 구 곡선에서는 첫 오프시즌에 팀당 12~17명이 은퇴해 조직 26명까지 떨어지는 팀이 나왔다.
const rollMin = Math.min(...rest.afterRollover);
check(`T28: 롤오버 후 전 구단 조직 인원 ≥ 1군 최소 정원(${g('ACTIVE_MIN_TOTAL')}) — 최소 ${rollMin}`,
  rest.afterRollover.every(n => n >= g('ACTIVE_MIN_TOTAL')), JSON.stringify(rest.afterRollover));
check(`T28: 은퇴는 ${g('RETIRE_MIN_AGE')}세 미만에서 발생하지 않음`,
  g(`(function(){
    // 곡선 자체를 직접 검증 — 32세 이하 0% / 33세 ${'RETIRE_BASE_PROB'} / 나이에 따라 단조 증가
    const f=a=>a<RETIRE_MIN_AGE?0:RETIRE_BASE_PROB+(a-RETIRE_MIN_AGE)*RETIRE_PROB_PER_SEASON;
    return f(RETIRE_MIN_AGE-1)===0 && f(RETIRE_MIN_AGE)===RETIRE_BASE_PROB && f(40)>f(35) && f(35)>f(33);
  })()`));
check(`T28: 롤오버 후 전 구단 예산 유한·비음수 — 관측 ${JSON.stringify(rest.budgets)}`,
  rest.budgets.every(b => Number.isFinite(b) && b >= 0), JSON.stringify(rest.budgets));

// ── T29. 상황 보정 3경로 대칭 (고레버리지 bigGame · 멘탈코칭 증폭) ──
// resolvePA로 확률식은 단일화됐지만 `isHighLeverage`와 멘탈코칭 앰프는 관전 경로에서만 전달됐다.
// 시뮬 2경로는 `isHighLeverage:false` 고정 + 앰프 미전달이라
//  ① 자동 진행·AI 경기엔 클러치 승부가 없고
//  ② P2-5 멘탈 코칭 룸(L1~L4, 클러치 보정 +15~50%)이 관전할 때만 듣는 시설이 된다.
section('T29. 상황 보정 3경로 대칭 (고레버리지 · 멘탈코칭)');

check('T29: 시뮬 경로에 isHighLeverage 하드코딩 false 부재',
  !/isHighLeverage:\s*false/.test(g('_simAIGame.toString()')) &&
  !/isHighLeverage:\s*false/.test(g('_simMyGame.toString()')));
check('T29: 시뮬 2경로가 멘탈코칭 앰프를 전달',
  g('_simAIGame.toString()').includes('batMentalAmp') &&
  g('_simMyGame.toString()').includes('batMentalAmp'));
check('T29: 시뮬 2경로가 관전과 동일한 고레버리지 공식(이닝≥7 · 점수차≤3 · RISP · 동점주자)',
  /inning\|\|1\)>=7/.test(g('_simAIGame.toString()')) &&
  /inning\|\|1\)>=7/.test(g('_simMyGame.toString()')));

// 엔진 레벨 수치 검증 — _consistency=100으로 랜덤 스윙을 0으로 만들어 결정적으로 비교
const levProbe = g(`(function(){
  try{
    const mk=(o)=>Object.assign({contact:50,power:50,eye:50,speed:50,fielding:50,arm:50,
      stuff:50,control:50,velocity:50,movement:50,stamina:50,clutch:50,
      _consistency:100,_clutchHidden:100,condition:100,currentStamina:100,role:'rotation'},o||{});
    const bat=mk(), pit=mk({_clutchHidden:50});
    const base=resolvePA(bat,pit,{avgFielding:50,isHighLeverage:false});
    const hi  =resolvePA(bat,pit,{avgFielding:50,isHighLeverage:true});
    const amp =resolvePA(bat,pit,{avgFielding:50,isHighLeverage:true,batMentalAmp:1.5});
    return {base:+base.adjContact.toFixed(3), hi:+hi.adjContact.toFixed(3), amp:+amp.adjContact.toFixed(3), err:null};
  }catch(e){return {err:e.message};}
})()`);
// _clutchHidden 100 → bigGame = (100-50)*0.12 = +6, 앰프 1.5 → +9
check(`T29: 고레버리지가 타자 유효 컨택을 올림 (${levProbe.base} → ${levProbe.hi}, 기대 +6)`,
  !levProbe.err && Math.abs((levProbe.hi - levProbe.base) - 6) < 0.01, JSON.stringify(levProbe));
check(`T29: 멘탈코칭 앰프가 클러치 보정을 증폭 (${levProbe.hi} → ${levProbe.amp}, 기대 +3)`,
  Math.abs((levProbe.amp - levProbe.hi) - 3) < 0.01, JSON.stringify(levProbe));

// 시뮬 경로에서 실제로 고레버리지가 발생하는가 (7회 이후 접전이 시즌 중 반드시 나온다)
const levWireProbe = g(`(function(){
  try{
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0; G.phase='first_half';
    let hi=0, total=0;
    const orig=resolvePA;
    resolvePA=function(b,p,ctx){ total++; if(ctx&&ctx.isHighLeverage)hi++; return orig(b,p,ctx); };
    for(let i=0;i<12;i++){ __harnessFixRoster(); const before=G.gameNum; _simMyGame(); if(G.gameNum===before) break; }
    resolvePA=orig;
    return {hi, total, rate:+(hi/Math.max(1,total)).toFixed(4), err:null};
  }catch(e){return {err:e.message};}
})()`);
// 12경기(내 경기 + AI 3경기/일)면 7회 이후 접전 타석이 반드시 다수 발생한다
check(`T29: 시뮬 경로에서 고레버리지 타석이 실제 발생 (${levProbe.err?'-':levWireProbe.hi}/${levWireProbe.total} = ${(levWireProbe.rate*100).toFixed(1)}%)`,
  !levWireProbe.err && levWireProbe.hi > 0 && levWireProbe.rate < 0.5, JSON.stringify(levWireProbe));

// ── T30. 주루·아웃 단일 소스 (resolveBaserunning) ──
// resolvePA는 확률만 단일화했고 주루는 3중 복제로 남아 규칙이 갈려 있었다.
// 시뮬 경로엔 송구 페널티·희생플라이·자책/비자책 분리·단타 시 1루→3루가 통째로 없었다.
section('T30. 주루·아웃 단일 소스 (resolveBaserunning)');

check('T30: 3경로가 resolveBaserunning을 사용',
  g('simulatePlay.toString()').includes('resolveBaserunning') &&
  g('_simAIGame.toString()').includes('resolveBaserunning') &&
  g('_simMyGame.toString()').includes('resolveBaserunning'));
check('T30: 시뮬 경로가 송구 페널티(armPenalty)를 산출·전달',
  /avgArm[\s\S]*armPenalty/.test(g('_simAIGame.toString()')) &&
  /avgArm[\s\S]*armPenalty/.test(g('_simMyGame.toString()')));

// 규칙 단위 검증 — 각 결과 종류가 베이스/득점/아웃을 규정대로 바꾸는가
const brProbe = g(`(function(){
  try{
    const P=(spd,err)=>({contact:50,power:50,eye:50,speed:spd,fielding:50,arm:50,_errorRunner:!!err,name:'R'+spd});
    const out={};
    // 만루 홈런 = 4득점 4자책
    let b=[P(50),P(50),P(50)];
    out.grandSlam=resolveBaserunning('HR',b,P(50),{});
    // 만루 볼넷 = 1득점 (밀어내기)
    b=[P(50),P(50),P(50)];
    out.walkForce=resolveBaserunning('BB',b,P(50),{});
    // 주자 없는 볼넷 = 0득점, 타자 1루
    b=[null,null,null];
    const bw=P(50); out.walkEmpty=resolveBaserunning('BB',b,bw,{}); out.walkEmptyBase=(b[0]===bw);
    // 에러 출루 타자는 _errorRunner 마킹 → 이후 득점해도 비자책
    b=[null,null,null];
    const be=P(50); resolveBaserunning('ERROR',b,be,{});
    out.errMark=be._errorRunner===true;
    const b2=[be,null,null];
    out.errScore=resolveBaserunning('HR',b2,P(50),{}); // 2득점이지만 자책은 1
    // 3루 주자 + 뜬공 → 희생플라이 가능 (gbRate 0 = 항상 뜬공)
    const N=2000;
    let sf=0, gbLeak=0;
    for(let i=0;i<N;i++){ const bb=[null,null,P(80)];
      const r=resolveBaserunning('OUT',bb,P(50),{outs:0,gbRate:0,batSpeed:50,dpBase:0.09});
      if(r.type==='SF')sf++;
      if(r.type==='GB'||r.type==='DP')gbLeak++; }
    out.sfRate=+(sf/N).toFixed(3);
    out.gbLeakAt0=gbLeak;   // gbRate:0인데 땅볼이 나오면 falsy-zero 폴백이 살아있다는 뜻
    // 2아웃에서는 희생플라이 불가 (아웃 카운트로 이닝 종료)
    let sf2=0;
    for(let i=0;i<N;i++){ const bb=[null,null,P(80)];
      const r=resolveBaserunning('OUT',bb,P(50),{outs:2,gbRate:0,batSpeed:50,dpBase:0.09});
      if(r.type==='SF')sf2++; }
    out.sfAt2Outs=sf2;
    // 1루 주자 + 땅볼 → 병살 가능 (gbRate 1 = 항상 땅볼)
    let dp=0, fbLeak=0;
    for(let i=0;i<N*2;i++){ const bb=[P(50),null,null];
      const r=resolveBaserunning('OUT',bb,P(50),{outs:0,gbRate:1,batSpeed:50,dpBase:0.09});
      if(r.type==='DP'&&r.outsAdded===2)dp++;
      if(r.type==='FB'||r.type==='SF')fbLeak++; }
    out.dpRate=+(dp/(N*2)).toFixed(3);
    out.fbLeakAt1=fbLeak;   // gbRate:1인데 뜬공이 나오면 안 된다
    // dpBase:0 → 병살 0건 (0이 유효값으로 취급되는지)
    let dp0=0;
    for(let i=0;i<N;i++){ const bb=[P(50),null,null];
      const r=resolveBaserunning('OUT',bb,P(50),{outs:0,gbRate:1,batSpeed:50,dpBase:0});
      if(r.type==='DP')dp0++; }
    out.dpAtBase0=dp0;
    return Object.assign(out,{err:null});
  }catch(e){return {err:e.message};}
})()`);
check('T30: 만루 홈런 = 4득점 4자책',
  !brProbe.err && brProbe.grandSlam.runs === 4 && brProbe.grandSlam.earned === 4, JSON.stringify(brProbe.grandSlam));
check('T30: 만루 볼넷 = 1득점 · 주자 없으면 0득점(타자 1루)',
  brProbe.walkForce.runs === 1 && brProbe.walkEmpty.runs === 0 && brProbe.walkEmptyBase === true,
  JSON.stringify({f:brProbe.walkForce, e:brProbe.walkEmpty}));
check('T30: 에러 출루 주자는 비자책 (2득점 중 자책 1)',
  brProbe.errMark === true && brProbe.errScore.runs === 2 && brProbe.errScore.earned === 1,
  JSON.stringify(brProbe.errScore));
check(`T30: 3루 주자 뜬공 → 희생플라이 발생 (${(brProbe.sfRate*100).toFixed(0)}%) · 2아웃선 불가(${brProbe.sfAt2Outs}건)`,
  brProbe.sfRate > 0.2 && brProbe.sfRate < 0.7 && brProbe.sfAt2Outs === 0, JSON.stringify(brProbe));
check(`T30: 1루 주자 땅볼 → 병살 발생 (${(brProbe.dpRate*100).toFixed(0)}%, 2아웃 처리)`,
  brProbe.dpRate > 0.03 && brProbe.dpRate < 0.25, JSON.stringify(brProbe));
// ctx 수치 0이 기본값으로 되돌아가지 않는가 (`||` → `!=null` 규약).
// 구 버그: `ctx.gbRate||0.45`가 gbRate:0을 0.45로 되돌려 "항상 뜬공" 계약이 깨졌고,
// 그 탓에 위 희생플라이 가드가 표본마다 통과/실패를 오갔다(참 SF율 0.227 vs 임계 0.2).
check(`T30: gbRate:0 → 땅볼 0건 (falsy-zero 폴백 부재, 관측 ${brProbe.gbLeakAt0}건)`,
  brProbe.gbLeakAt0 === 0, JSON.stringify(brProbe));
check(`T30: gbRate:1 → 뜬공 0건 (관측 ${brProbe.fbLeakAt1}건)`,
  brProbe.fbLeakAt1 === 0, JSON.stringify(brProbe));
check(`T30: dpBase:0 → 병살 0건 (관측 ${brProbe.dpAtBase0}건)`,
  brProbe.dpAtBase0 === 0, JSON.stringify(brProbe));

// ── T31. 리그 일정 라운드로빈 (fix/#22) ─────────────────────
// 구 버그: simulateOtherGames가 `teams.filter(...)`의 배열 인접 인덱스로 짝을 지어
// 28대진 중 9개만 성립했다(관측: 데빌즈-타이거즈 45경기 = 시즌의 71%, 홈 배정 세이버스 54 / 드림즈 9).
// AI 순위표가 실력이 아니라 '누구와 묶였는가'로 결정됐고, 드래프트 순서·리그 분배금·
// 구단주 신임도 목표 순위가 전부 그 순위표를 참조한다.
section('T31. 리그 일정 라운드로빈 (getSeriesPairings)');
const schedTable = g(`(function(){
  try{
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0;
    const meet={}, home={}, roundSizes=[];
    let oppOk=true, homeOk=true;
    G.teams.forEach(t=>home[t.name]=0);
    for(let s=0;s<TOTAL_SERIES;s++){
      const ps=getSeriesPairings(s);
      const seen=new Set();
      ps.forEach(pr=>{
        seen.add(pr.home.name); seen.add(pr.away.name);
        meet[[pr.home.name,pr.away.name].sort().join('|')]=(meet[[pr.home.name,pr.away.name].sort().join('|')]||0)+SERIES_LENGTH;
        home[pr.home.name]+=SERIES_LENGTH;
      });
      roundSizes.push(seen.size);
      // 회귀: 내 대진이 기존 getOpponent()/isMyTeamHome()과 완전히 일치해야 한다
      G.gameNum=s*SERIES_LENGTH;
      const mine=ps.find(pr=>pr.home===G.myTeam||pr.away===G.myTeam);
      if(!mine){oppOk=false;return;}
      const opp=(mine.home===G.myTeam)?mine.away:mine.home;
      if(opp!==getOpponent())oppOk=false;
      if((mine.home===G.myTeam)!==isMyTeamHome())homeOk=false;
    }
    const mv=Object.values(meet), hv=Object.values(home);
    return {pairs:Object.keys(meet).length, meetMin:Math.min(...mv), meetMax:Math.max(...mv),
            homeMin:Math.min(...hv), homeMax:Math.max(...hv),
            allEight:roundSizes.every(x=>x===G.teams.length), oppOk, homeOk, err:null};
  }catch(e){return {err:e.message};}
})()`);
check('T31: 매 시리즈 8팀 전원이 정확히 한 대진에 배정',
  !schedTable.err && schedTable.allEight === true, JSON.stringify(schedTable));
check(`T31: 28개 대진 전부 성립 (관측 ${schedTable.pairs}/28)`,
  schedTable.pairs === 28, JSON.stringify(schedTable));
check(`T31: 대진별 경기 수 균등 9경기 (관측 ${schedTable.meetMin}~${schedTable.meetMax})`,
  schedTable.meetMin === 9 && schedTable.meetMax === 9, JSON.stringify(schedTable));
check(`T31: 팀별 홈경기 균형 30~33/63 (관측 ${schedTable.homeMin}~${schedTable.homeMax})`,
  schedTable.homeMin >= 30 && schedTable.homeMax <= 33, JSON.stringify(schedTable));
// 내 팀 일정은 한 경기도 바뀌면 안 된다 — circle method의 고정축이 곧 getOpponent()이기 때문
check('T31: 회귀 — 내 대진이 getOpponent()와 전 시리즈 일치',
  schedTable.oppOk === true, JSON.stringify(schedTable));
check('T31: 회귀 — 내 홈/원정이 isMyTeamHome()과 전 시리즈 일치',
  schedTable.homeOk === true, JSON.stringify(schedTable));
// 배선: 자동 진행이 실제로 대진표를 따르는가 (구 버그에선 9경기 동안 3개 대진에 고정)
const schedLive = g(`(function(){
  try{
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0; G.phase='first_half';
    G.teams.forEach(t=>{t.wins=0;t.losses=0;});
    const seenPairs=new Set();
    const orig=_simAIGame;
    globalThis._simAIGame=function(a,b){seenPairs.add([a.name,b.name].sort().join('|'));return orig(a,b);};
    let played=0;
    for(let i=0;i<12;i++){ __harnessFixRoster(); const before=G.gameNum; _simMyGame(); if(G.gameNum===before)break; played++; }
    globalThis._simAIGame=orig;
    const gp=G.teams.map(t=>t.wins+t.losses);
    return {played, distinctAIPairs:seenPairs.size, gpMin:Math.min(...gp), gpMax:Math.max(...gp), err:null};
  }catch(e){return {err:e.message};}
})()`);
check(`T31: 자동 진행 ${schedLive.played}경기 후 전 구단 소화 경기 수 균등 (편차 ${schedLive.gpMax - schedLive.gpMin})`,
  !schedLive.err && schedLive.played >= 9 && schedLive.gpMin === schedLive.gpMax, JSON.stringify(schedLive));
check(`T31: 12경기 동안 AI 대진이 회전 (구 버그 3개 고정 → 관측 ${schedLive.distinctAIPairs}개)`,
  schedLive.distinctAIPairs >= 8, JSON.stringify(schedLive));

// ── T32. AI 로스터 편성 정합 (fix/#22) ──────────────────────
// 구 버그: _aiOptimizeRoster가 상위 13명 타자를 전원 role='starting'으로 두고
// _aiMaintainLineup은 <9일 때만 채워 줄이는 경로가 없었다 → AI가 13인 타순으로 경기.
// 주전 타석 희석 · 수비 평균 오염 · _teamStrength 과대계상의 공통 원인.
section('T32. AI 로스터 편성 정합 (9인 타순 · 5인 로테)');
const aiRoster = g(`(function(){
  try{
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0;
    G.teams.filter(t=>t!==G.myTeam).forEach(t=>_aiOptimizeRoster(t));
    const ai=G.teams.filter(t=>t!==G.myTeam);
    const lineups=ai.map(t=>getStartingBatters(t).length);
    const rots=ai.map(t=>getRotation(t).length);
    // 자가 치유: 인위로 13인 타순 · 7인 로테를 만든 뒤 _aiMaintainLineup 1회
    const t0=ai[0];
    t0.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active').slice(0,13).forEach(p=>p.role='starting');
    t0.roster.filter(p=>p.isPitcher&&(p.status||'active')==='active').slice(0,7).forEach(p=>p.role='rotation');
    const before={lineup:getStartingBatters(t0).length, rot:getRotation(t0).length};
    _aiMaintainLineup(t0);
    const after={lineup:getStartingBatters(t0).length, rot:getRotation(t0).length};
    return {lineups, rots, before, after, err:null};
  }catch(e){return {err:e.message};}
})()`);
check(`T32: 전 AI 구단 타순 정확히 9명 (관측 ${JSON.stringify(aiRoster.lineups)})`,
  !aiRoster.err && aiRoster.lineups.every(x=>x===9), JSON.stringify(aiRoster));
check(`T32: 전 AI 구단 로테이션 정확히 5명 (관측 ${JSON.stringify(aiRoster.rots)})`,
  !aiRoster.err && aiRoster.rots.every(x=>x===5), JSON.stringify(aiRoster));
// 축소 경로 덕분에 구세이브도 첫 경기 진행 시 자가 치유된다 (마이그레이션 불필요)
check(`T32: _aiMaintainLineup 자가 치유 — 타순 ${aiRoster.before&&aiRoster.before.lineup}→${aiRoster.after&&aiRoster.after.lineup} · 로테 ${aiRoster.before&&aiRoster.before.rot}→${aiRoster.after&&aiRoster.after.rot}`,
  !aiRoster.err && aiRoster.before.lineup > 9 && aiRoster.before.rot > 5
  && aiRoster.after.lineup === 9 && aiRoster.after.rot === 5, JSON.stringify(aiRoster));

// ── T33. 전력 지표는 인원 수에 반응하지 않는다 (fix/#22) ─────
// 구 버그: _teamStrength가 starting+rotation OVR **합**이라 1군 편성 인원이 많을수록 강해졌다
// (AI 18명 vs 내 팀 14명 → 시리즈 승률 5~11%p 기울음).
section('T33. _teamStrength 인원 비민감성');
const strProbe = g(`(function(){
  try{
    G.teamIdx=0; initTeams(0);
    const mk=(n)=>({wins:0,losses:0,roster:Array.from({length:n},(_,i)=>({
      name:'P'+i, isPitcher:i>=14, pos:i>=14?'SP':'LF', status:'active', role:i<9?'starting':(i>=14?'rotation':'bench'),
      contact:60,power:60,eye:60,speed:60,fielding:60,arm:60,
      stuff:60,control:60,velocity:60,movement:60,stamina:60,clutch:60,
    }))});
    const small=mk(19), big=mk(34); // 평균 OVR 동일, 1군 인원만 다름
    const sS=_teamStrength(small), sB=_teamStrength(big);
    let wins=0; for(let i=0;i<4000;i++){ if(_simSeries(small,big,SEMI_WINS_NEEDED).winner===small)wins++; }
    return {sS:+sS.toFixed(2), sB:+sB.toFixed(2), winPct:+(wins/40).toFixed(1), err:null};
  }catch(e){return {err:e.message};}
})()`);
check(`T33: 인원만 다른 동일 전력 팀의 strength 동일 (${strProbe.sS} vs ${strProbe.sB})`,
  !strProbe.err && Math.abs(strProbe.sS - strProbe.sB) < 0.01, JSON.stringify(strProbe));
check(`T33: 시리즈 승률이 인원 수에 반응하지 않음 (관측 ${strProbe.winPct}% — 기대 ~50%)`,
  !strProbe.err && strProbe.winPct > 44 && strProbe.winPct < 56, JSON.stringify(strProbe));

// ── T34. AI 연봉 조정 하한·계약 존중 (fix/#22) ──────────────
// 구 버그: `Math.round(salary*1.2)`가 최저 연봉 0.3억을 0으로 만들었고(관측 2명),
// 전 로스터에 매 시즌 적용돼 신인 슬롯·Arb 산정액을 계약 기간 중에 덮어썼다.
// 페이롤은 사치세·샐러리 플로어 판정의 입력이라 재정 규칙까지 함께 어긋난다.
section('T34. AI 연봉 조정 — 하한 보장 · 계약 기간 존중');
const salAdjProbe = g(`(function(){
  try{
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=TOTAL_REGULAR; G.phase='stove_league';
    G.teams.forEach(t=>{t.wins=32;t.losses=31;});
    G._stoveSettledSeason=0; showStoveLeague();
    // showStoveLeague가 _contractYears를 감산한 **뒤** 스냅샷 → _startNextSeason의 조정만 관측
    const snap=[];
    G.teams.filter(t=>t!==G.myTeam).forEach(t=>t.roster.forEach(p=>{
      if((p._contractYears||0)>0) snap.push({p, sal:p.salary});
    }));
    _startNextSeason();
    const zero=[], moved=[];
    G.teams.forEach(t=>t.roster.forEach(p=>{ if((p.salary||0)<SALARY_MIN) zero.push(t.name+'/'+p.name+'='+p.salary); }));
    snap.forEach(s=>{ if(G.teams.some(t=>t.roster.includes(s.p)) && s.p.salary!==s.sal) moved.push(s.p.name+' '+s.sal+'→'+s.p.salary); });
    return {belowMin:zero.length, belowMinEx:zero.slice(0,4), contracted:snap.length, moved:moved.length, movedEx:moved.slice(0,4), err:null};
  }catch(e){return {err:e.message};}
})()`);
check(`T34: 전 선수 연봉 >= SALARY_MIN (하한 미달 ${salAdjProbe.belowMin}명)`,
  !salAdjProbe.err && salAdjProbe.belowMin === 0, JSON.stringify(salAdjProbe));
check(`T34: 계약 기간이 남은 선수의 연봉 불변 (대상 ${salAdjProbe.contracted}명 · 변동 ${salAdjProbe.moved}명)`,
  !salAdjProbe.err && salAdjProbe.contracted > 0 && salAdjProbe.moved === 0, JSON.stringify(salAdjProbe));

// ── T35~T38. FA 시장·의료센터 무결성 (fix/#23) ───────────────
section('T35. FA 영입 시 faPool 동시 제거 (중복 보유 방지)');
const FA_SETUP = `G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=TOTAL_REGULAR; G.phase='stove_league';
  G.faPool=[]; G._faMarketSeason=0; G.marketPlayers=[];
  G.teams.forEach(t=>{t.wins=32;t.losses=31;}); G._stoveSettledSeason=0; showStoveLeague();`;
// 구 버그: _showFAMarket이 faPool 원소를 **참조로** marketPlayers에 싣는데 buyPlayer는
// marketPlayers에서만 제거해, 영입한 선수가 풀에 남아 다음 스토브의 AI 입찰이 같은 객체를
// 다른 구단에 계약시켰다 → 동일 선수가 두 팀 로스터에 동시 존재(role·ss 공유·페이롤 이중 계상).
const faDup = g(`(function(){try{
  ${FA_SETUP}
  _showFAMarket();
  const target=G.faPool.find(p=>G.marketPlayers.includes(p));
  if(!target) return {err:'faPool 원소가 시장에 없음(전제 불성립)'};
  target.salary=5; target._contractYears=3;
  G.myTeam.roster.push(target); _removeFromMarket(target);   // buyPlayer(onAccept)와 동일 경로
  const stillPool=G.faPool.includes(target);
  _startNextSeason(); G.gameNum=TOTAL_REGULAR; G.phase='stove_league';
  G.teams.forEach(t=>{t.wins=32;t.losses=31;}); G._stoveSettledSeason=0; showStoveLeague();
  const owners=G.teams.filter(t=>t.roster.includes(target)).map(t=>t.name);
  return {name:target.name, stillPool, owners, err:null};
}catch(e){return {err:e.message}}})()`);
check('T35: 영입 즉시 faPool에서 제거',
  !faDup.err && faDup.stillPool === false, JSON.stringify(faDup));
check(`T35: 다음 시즌 중복 보유 없음 (보유 구단 ${faDup.owners ? faDup.owners.length : '?'}곳)`,
  !faDup.err && faDup.owners.length === 1, JSON.stringify(faDup));
check('T35: buyPlayer가 _removeFromMarket 경유 (faPool 제거 배선)',
  g('buyPlayer.toString()').includes('_removeFromMarket'));

section('T36. FA 시장 재개장 멱등 (AI 로스터 유출·리롤 방지)');
// 구 버그: 개장마다 AI 로스터를 다시 훑어 20%씩 유출 + 신규 FA 5명 생성. 게다가 유출 선수를
// marketPlayers(매 개장 초기화)에만 담아 재개장 시 게임에서 소멸했다(관측: 5회 개장에 AI 5명 감소).
const faIdem = g(`(function(){try{
  ${FA_SETUP}
  const tot=()=>G.teams.filter(t=>t!==G.myTeam).reduce((s,t)=>s+t.roster.length,0);
  const uids=()=>new Set(G.faPool.map(p=>p._uid));
  _showFAMarket(); const a1=tot(), u1=uids(), m1=G.marketPlayers.length;
  _showFAMarket(); const a2=tot(), u2=uids(), m2=G.marketPlayers.length;
  _showFAMarket(); const a3=tot(), m3=G.marketPlayers.length;
  return {ai:[a1,a2,a3], pool:[u1.size,u2.size], lost:[...u1].filter(u=>!u2.has(u)).length,
          mkt:[m1,m2,m3], err:null};
}catch(e){return {err:e.message}}})()`);
check(`T36: 재개장해도 AI 조직 인원 불변 (관측 ${faIdem.ai})`,
  !faIdem.err && faIdem.ai[0] === faIdem.ai[1] && faIdem.ai[1] === faIdem.ai[2], JSON.stringify(faIdem));
check(`T36: 재개장 시 FA 소멸 0건 (관측 ${faIdem.lost})`,
  !faIdem.err && faIdem.lost === 0, JSON.stringify(faIdem));
check(`T36: 재개장 리롤 없음 — 시장 구성 동일 (관측 ${faIdem.mkt})`,
  !faIdem.err && faIdem.mkt[0] === faIdem.mkt[1] && faIdem.mkt[1] === faIdem.mkt[2], JSON.stringify(faIdem));

section('T37. 의료센터 — 표시 테이블과 실제 효과 단일 소스');
// 구 버그: 확률표는 +2/+5/-3, 실제 적용은 +3/+8/-5, 잠재력 증가는 아예 미표기.
// MEDICAL_OUTCOMES 상수로 단일화했으므로 각 결과 구간을 결정론적으로 강제해 대조한다.
const medProbe = g(`(function(){try{
  ${FA_SETUP}
  G.phase='preseason';
  const _rand=rand; const rows=[];
  let acc=0;
  for(const o of MEDICAL_OUTCOMES){
    const lo=acc+1; acc+=o.chance; const roll=lo;      // 해당 구간의 첫 값으로 고정
    const t=G.myTeam;
    const p=t.roster.find(x=>!x.isMedicalTreated&&((x.age||22)>=MEDICAL_MIN_AGE||x.status==='il'));
    if(!p){rows.push({key:o.key,skip:true});continue;}
    const key=p.isPitcher?'stuff':'contact';
    const b=p[key], bp=p._potential||50;
    globalThis.rand=(a,z)=>(a===1&&z===100)?roll:_rand(a,z);  // roll만 고정, 나머지는 원본
    t.budget=99999; t.medicalUsedThisSeason=0;
    executeMedicalCenter(t.roster.indexOf(p));
    globalThis.rand=_rand;
    rows.push({key:o.key, dStat:p[key]-b, wantStat:o.stat,
               dPot:(p._potential||50)-bp, wantPot:o.pot,
               imm:p.agingImmunityYears||0, wantImm:o.immunity||0});
  }
  return {rows, err:null};
}catch(e){globalThis.rand=undefined;return {err:e.message}}})()`);
const medOk = !medProbe.err && medProbe.rows.length > 0
  && medProbe.rows.every(r => r.skip || (r.dStat === r.wantStat && r.dPot === r.wantPot && r.imm === r.wantImm));
check(`T37: 4개 결과 구간의 스탯·잠재력·면역이 MEDICAL_OUTCOMES와 일치`,
  medOk, JSON.stringify(medProbe));
// 표시 테이블이 상수에서 생성되는가 (수치 하드코딩 재발 차단)
check('T37: 확률표가 MEDICAL_OUTCOMES에서 렌더 (수치 하드코딩 부재)',
  g('renderInvestMedicalCenter.toString()').includes('MEDICAL_OUTCOMES'));

section('T38. faPool 세이브 라운드트립 (미계약 FA 이월 영속화)');
// 구 버그: _buildSnapshot에 faPool이 아예 없어 재로드마다 미계약 FA가 통째로 사라졌다
// — fix/#20이 _faYears로 만든 '이월'이 저장을 거치는 순간 무효화됐다.
const faSave = g(`(function(){try{
  ${FA_SETUP}
  _showFAMarket();
  const before=G.faPool.map(p=>p._uid).sort();
  saveGame();
  G.faPool=[]; G.marketPlayers=[]; G._faMarketSeason=0;   // 페이지 재로드 흉내
  const ok=loadGame();
  const after=G.faPool.map(p=>p._uid).sort();
  return {ok, n:[before.length,after.length], same:JSON.stringify(before)===JSON.stringify(after),
          shared:G.marketPlayers.filter(m=>G.faPool.includes(m)).length, mkt:G.marketPlayers.length,
          guard:G._faMarketSeason, err:null};
}catch(e){return {err:e.message}}})()`);
check(`T38: 로드 후 faPool 보존 (${faSave.n} · uid 동일 ${faSave.same})`,
  !faSave.err && faSave.ok && faSave.n[0] > 0 && faSave.same === true, JSON.stringify(faSave));
// 저장된 marketPlayers를 따로 복원하면 같은 선수가 두 객체로 갈라진다 — 참조를 재사용해야 한다
check(`T38: marketPlayers가 faPool과 동일 객체 참조 (${faSave.shared}/${faSave.mkt})`,
  !faSave.err && faSave.shared === faSave.mkt, JSON.stringify(faSave));
check(`T38: 시장 구성 멱등 가드도 복원 (관측 ${faSave.guard})`,
  !faSave.err && faSave.guard === 1, JSON.stringify(faSave));

// ── T39~T40. AI 라인업 포지션 배치 · FA 이탈 입단 (fix/#24) ──
section('T39. AI 타순 포지션 유효성 (8포지션 + DH)');
// 구 버그: AI가 OVR 상위 9명을 그대로 세워 포수 2명·1루수 0명 같은 라인업이 나왔다
// (관측: 오프시즌 편성 후 7/7 구단 전부 규정 위반, 시즌 내내 유지).
// 내 팀은 autoArrangeRoster의 greedy가 8포지션+DH를 보장하므로 같은 규칙을 AI에도 적용.
const aiLineup = g(`(function(){try{
  G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0;
  const REQ=['C','1B','2B','3B','SS','LF','CF','RF'];
  const audit=()=>{
    const bad=[];
    G.teams.filter(t=>t!==G.myTeam).forEach(t=>{
      const st=getStartingBatters(t); const c={};
      st.forEach(p=>{c[p.pos]=(c[p.pos]||0)+1;});
      const miss=REQ.filter(x=>!c[x]), dup=REQ.filter(x=>(c[x]||0)>1);
      if(st.length!==9||miss.length||dup.length)
        bad.push(t.name+'(n='+st.length+' 결손'+miss.length+' 중복'+dup.length+')');
    });
    return bad;
  };
  G.teams.filter(t=>t!==G.myTeam).forEach(t=>_aiOptimizeRoster(t));
  const optBad=audit();
  // 인위로 라인업을 망가뜨린 뒤 _aiMaintainLineup 1회 → 자가 치유되는가
  const t0=G.teams.find(t=>t!==G.myTeam);
  t0.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active').slice(0,12)
    .forEach(p=>{p.role='starting';p.pos='SS';});
  const brokeN=getStartingBatters(t0).length;
  _aiMaintainLineup(t0);
  const healed=_aiLineupValid(t0);
  // 시즌 진행 후에도 유지되는가
  G.phase='first_half';
  for(let i=0;i<24;i++){ __harnessFixRoster(); const gn=G.gameNum; _simMyGame(); if(G.gameNum===gn)break; }
  const seasonBad=audit();
  return {optBad, brokeN, healed, seasonBad, err:null};
}catch(e){return {err:e.message}}})()`);
check(`T39: 오프시즌 편성 후 전 AI 구단 타순 규정 충족 (위반 ${aiLineup.optBad ? aiLineup.optBad.length : '?'}팀)`,
  !aiLineup.err && aiLineup.optBad.length === 0, JSON.stringify(aiLineup));
check(`T39: 망가진 라인업 자가 치유 (주전 ${aiLineup.brokeN}명·전원 SS → _aiMaintainLineup 1회)`,
  !aiLineup.err && aiLineup.brokeN > 9 && aiLineup.healed === true, JSON.stringify(aiLineup));
check(`T39: 시즌 진행 중에도 유지 (위반 ${aiLineup.seasonBad ? aiLineup.seasonBad.length : '?'}팀)`,
  !aiLineup.err && aiLineup.seasonBad.length === 0, JSON.stringify(aiLineup));

section('T40. FA 협상 이탈 시 실제 입단 (연출↔상태 정합)');
// 구 버그: "다른 구단이 더 좋은 조건을 제시했습니다"라고 알리고는 시장에서 지우기만 해
// 선수가 어느 로스터에도 없이 사라졌다.
const snatch = g(`(function(){try{
  ${FA_SETUP}
  _showFAMarket();
  const p=G.marketPlayers[0]; if(!p)return {err:'시장 비어 있음'};
  const w=_snatchFAWinner(p);
  _removeFromMarket(p);
  const owners=G.teams.filter(t=>t.roster.includes(p)).map(t=>t.name);
  return {name:p.name, winner:w?w.name:null, owners,
          inMkt:G.marketPlayers.includes(p), inPool:(G.faPool||[]).includes(p), err:null};
}catch(e){return {err:e.message}}})()`);
check(`T40: 이탈 선수가 실제로 AI 구단에 입단 (${snatch.winner || '?'})`,
  !snatch.err && snatch.owners.length === 1 && snatch.owners[0] === snatch.winner, JSON.stringify(snatch));
check('T40: 시장·FA 풀에서는 제거 (중복 보유 없음)',
  !snatch.err && snatch.inMkt === false && snatch.inPool === false, JSON.stringify(snatch));

// ── T41. 포스트시즌 전력비 — 매치엔진 정합 (fix/#25) ─────────
section('T41. _simSeries 로지스틱 — 매치엔진 실측 기울기 정합');
// 구 공식 strA/(strA+strB)는 전력을 '비율'로 봐서, 평균 OVR 55~65 구간에선 4점 차가
// 경기당 1.6%p(시리즈 3%p)로 뭉개졌다. 같은 두 팀을 _simAIGame으로 붙이면 58%가 나온다
// — 정규시즌과 포스트시즌이 서로 다른 답을 내던 정합성 결함.
const psProbe = g(`(function(){try{
  G.teamIdx=0; initTeams(0);
  // 평균 OVR만 다른 합성 팀 (인원 동일 — T33이 인원 비민감성을 별도로 검증)
  const mkT=(v)=>({wins:0,losses:0,roster:Array.from({length:20},(_,i)=>{
    const p={name:'P'+i,isPitcher:i>=14,pos:i>=14?'SP':'LF',status:'active',
             role:i<9?'starting':(i>=14?'rotation':'bench')};
    ['contact','power','eye','speed','fielding','arm','stuff','control','velocity','movement','stamina','clutch']
      .forEach(k=>p[k]=v);
    return p;})});
  const run=(A,B,w,n)=>{let x=0;for(let i=0;i<n;i++){if(_simSeries(A,B,w).winner===A)x++;}return x/n;};
  const seriesP=(p,w)=>{let s=0;const C=(a,k)=>{let r=1;for(let i=0;i<k;i++)r=r*(a-i)/(i+1);return r;};
    for(let k=0;k<w;k++)s+=C(w-1+k,k)*Math.pow(p,w)*Math.pow(1-p,k);return s;};
  const out={rows:[]};
  // Δ=0 (동일 전력) → 시리즈 승률 50%
  const E=mkT(60);
  out.even=+run(E,mkT(60),SEMI_WINS_NEEDED,6000).toFixed(3);
  // 여러 전력차에서 실측 승률이 로지스틱 예측과 일치하는가
  [[60,64],[60,68],[64,60]].forEach(([va,vb])=>{
    const A=mkT(va), B=mkT(vb);
    const d=_teamStrength(A)-_teamStrength(B);
    const pGame=1/(1+Math.pow(10,-d/POSTSEASON_SPREAD));
    out.rows.push({d:+d.toFixed(2), pGame:+pGame.toFixed(3),
      semiObs:+run(A,B,SEMI_WINS_NEEDED,6000).toFixed(3), semiExp:+seriesP(pGame,SEMI_WINS_NEEDED).toFixed(3),
      finalObs:+run(A,B,FINAL_WINS_NEEDED,6000).toFixed(3), finalExp:+seriesP(pGame,FINAL_WINS_NEEDED).toFixed(3)});
  });
  // 엔진 실측 기울기(0.0664/OVR ≈ 경기당 1.66%p)를 상수가 재현하는가
  out.slopePerOvr=+((1/(1+Math.pow(10,-1/POSTSEASON_SPREAD))-0.5)*100).toFixed(2);
  // MLB 대조: 실제 대진 평균 Δ≈3.8에서 7전 승률
  out.mlbCheck=+(seriesP(1/(1+Math.pow(10,-3.8/POSTSEASON_SPREAD)),FINAL_WINS_NEEDED)*100).toFixed(1);
  return Object.assign(out,{err:null});
}catch(e){return {err:e.message}}})()`);
check(`T41: 동일 전력 팀은 시리즈 승률 50% (관측 ${psProbe.even})`,
  !psProbe.err && Math.abs(psProbe.even - 0.5) < 0.03, JSON.stringify(psProbe));
check('T41: 시뮬 승률이 로지스틱 예측과 일치 (오차 <3%p, 방향 대칭 포함)',
  !psProbe.err && psProbe.rows.every(r =>
    Math.abs(r.semiObs - r.semiExp) < 0.03 && Math.abs(r.finalObs - r.finalExp) < 0.03),
  JSON.stringify(psProbe));
// 구 공식은 이 기울기가 0.4%p였다 — 4배 차이가 회귀의 핵심
check(`T41: 전력 1점당 경기 승률 기울기가 엔진 실측(1.66%p) 근방 (관측 ${psProbe.slopePerOvr}%p)`,
  !psProbe.err && psProbe.slopePerOvr > 1.3 && psProbe.slopePerOvr < 2.0, JSON.stringify(psProbe));
// Lopez/Matthews/Baumer(2018): MLB 7전 시리즈 강팀 승률 "just above 60%"
check(`T41: 평균 대진(Δ≈3.8) 7전 승률이 MLB 밴드 55~70% (관측 ${psProbe.mlbCheck}%)`,
  !psProbe.err && psProbe.mlbCheck > 55 && psProbe.mlbCheck < 70, JSON.stringify(psProbe));
check('T41: _simSeries가 POSTSEASON_SPREAD 사용 (구 비율식 부재)',
  g('_simSeries.toString()').includes('POSTSEASON_SPREAD') &&
  !/strA\s*\/\s*\(\s*strA\s*\+\s*strB/.test(g('_simSeries.toString()')));

section('T42. 시드 RNG 결정론 가드 (refactor/#26)');
// 전 난수가 Math.random() 직결이던 동안에는 "고쳤다"를 증명할 수 없었다 — 수정 전후 차이가
// 표본 흔들림과 구분되지 않는다. rand/pick/randGauss/randomGaussian이 모두 rnd()를 경유하므로
// srand(N)이 리그 생성부터 시즌 완주까지를 재현 가능하게 만든다.
vm.runInContext(`
  // 시드 하나로 팀 생성 → 정규시즌 완주까지 돌리고 리그 총계 지문을 뽑는다.
  // (드래프트는 UI 대기라 T28/aiRestProbe처럼 페이즈만 넘겨 63경기를 무중단 진행)
  function __seasonFingerprint(seed){
    srand(seed);
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=0; G.phase='first_half';
    let guard=0;
    while(G.gameNum<TOTAL_REGULAR && guard++<200){
      if(G.gameNum>=FIRST_HALF_END && G.phase==='first_half') G.phase='second_half';
      __harnessFixRoster();
      const b=G.gameNum; _simMyGame(); if(G.gameNum===b) break;
    }
    let W=0,AB=0,H=0,HR=0,BB=0,K=0,OUTS=0,ER=0;
    G.teams.forEach(t=>{W+=t.wins; t.roster.forEach(p=>{const s=p.ss; if(!s)return;
      if(!p.isPitcher){AB+=s.ab||0;H+=s.h||0;HR+=s.hr||0;BB+=s.bb||0;K+=s.k||0;}
      else {OUTS+=s.outs||0;ER+=s.er||0;}});});
    return {g:G.gameNum,W:W,AB:AB,H:H,HR:HR,BB:BB,K:K,OUTS:OUTS,ER:ER,ERA:OUTS>0?ER*27/OUTS:0};
  }
`, ctx);

const det = g(`(function(){try{
  const a=__seasonFingerprint(20260814);
  const b=__seasonFingerprint(20260814);   // 같은 시드 재실행
  const c=__seasonFingerprint(99991);      // 다른 시드
  return {a:a,b:b,c:c,err:null};
}catch(e){return {err:e.message}}})()`);
const _sameFp = (x, y) => JSON.stringify(x) === JSON.stringify(y);
check(`T42: 동일 시드 2회 → 시즌 지문 완전 일치 (${det.a ? det.a.g+'경기 · '+det.a.W+'승 · '+det.a.AB+'타수 · '+det.a.HR+'홈런 · ERA '+det.a.ERA.toFixed(3) : '—'})`,
  !det.err && det.a.g === g('TOTAL_REGULAR') && _sameFp(det.a, det.b), JSON.stringify(det));
// 시드를 바꿔도 같으면 치환이 아니라 난수가 죽은 것 — 가드가 자기 자신을 속이지 않게 하는 대조군
check('T42: 다른 시드 → 지문 불일치 (난수가 실제로 결과를 좌우)',
  !det.err && !_sameFp(det.a, det.c), JSON.stringify({a:det.a, c:det.c}));

// 단일 funnel 가드 — rand/randomGaussian이 rnd()를 경유해야 265개 호출부가 함께 결정론이 된다
check('T42: rand·randomGaussian이 rnd() 경유 (Math.random 직결 부재)',
  g('rand.toString()').includes('rnd()') && g('randomGaussian.toString()').includes('rnd()') &&
  !g('rand.toString()').includes('Math.random') && !g('randomGaussian.toString()').includes('Math.random'));

// 소스 스캔 — 게임플레이 경로에 Math.random 직접 호출이 되살아나면 결정론이 조용히 깨진다.
// _uid 생성 3건만 예외(Date.now()와 결합, 게임 결과 미영향)로 허용한다.
const _mrHits = [];
(function scanMR(dir){
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scanMR(p);
    else if (e.name.endsWith('.js')) fs.readFileSync(p, 'utf8').split('\n').forEach((ln, i) => {
      if (ln.includes('Math.random')) _mrHits.push(path.relative(ROOT, p).split(path.sep).join('/') + ':' + (i+1) + (ln.includes('_uid') ? ' [uid]' : ' [!]'));
    });
  });
})(path.join(ROOT, 'js'));
check(`T42: 게임플레이 경로에 Math.random 직접 호출 없음 (잔존 ${_mrHits.length}건 = _uid 생성)`,
  _mrHits.length === 3 && _mrHits.every((h) => h.endsWith('[uid]')), JSON.stringify(_mrHits));

// Fisher-Yates 균등성 — 구 sort(()=>Math.random()-0.5)는 비일관 비교자라 균등 순열을 만들지 않았다
// (V8에서 앞쪽 원소가 앞에 남는 편향). 드래프트 풀 블라인드와 1년차 드래프트 순서가 여기 걸려 있었다.
const shuf = g(`(function(){
  srand(7);
  const N=6, TRIALS=12000, pos=Array.from({length:N},()=>0);
  for(let i=0;i<TRIALS;i++){ const a=shuffle([0,1,2,3,4,5]); pos[a.indexOf(0)]++; }
  return {pos:pos, exp:TRIALS/N};
})()`);
check(`T42: shuffle 균등 순열 — 원소 0의 착지 분포가 균등 (기대 ${shuf.exp} · 관측 ${JSON.stringify(shuf.pos)})`,
  shuf.pos.every((c) => Math.abs(c - shuf.exp) / shuf.exp < 0.10), JSON.stringify(shuf));
check('T42: 편향 셔플 소스 부재 (generateDraftPool·_startRookieDraft가 shuffle 사용)',
  !g('generateDraftPool.toString()').includes('Math.random()-0.5') &&
  g('generateDraftPool.toString()').includes('shuffle(') &&
  g('_startRookieDraft.toString()').includes('shuffle('));

section('T43. AI 재투자 — 육성 티어 돌파 (fix/#27)');
// 결함 C(전력 런어웨이): floor(devLevel/30) 성장티어가 baseDevLevel 그대로 12시즌 고정돼
// 최종 전력 순위가 티어와 완전히 일치했다(전력SD 3.45→11.14 발산). 원인은 코치 9종×5레벨
// (완주 1,080억)이 재투자 루프의 첫 분기를 독점해 육성·시설 분기에 영구 미도달한 것.
// 티어 경계가 사정권일 때 육성을 최우선으로 집행해 뒤처진 팀이 스스로 인양되게 한다.
const reinv = g(`(function(){try{
  const out=[];
  [4242, 777, 31337].forEach(function(sd){
    srand(sd);
    G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=TOTAL_REGULAR; G.phase='stove_league';
    const ai=G.teams.filter(t=>t!==G.myTeam);
    ai.forEach(t=>{ t.budget=300; });   // war=(300-120)*0.45=81억 — 육성 투자 6~10억을 충분히 감당
    ai[0].devLevel=55;                  // 경계 60까지 5p → 사정권 → 티어 1→2로 올라야 한다
    _startNextSeason();
    const a0=G.teams.filter(t=>t!==G.myTeam)[0];
    out.push({dev:a0.devLevel, tier:Math.floor(a0.devLevel/30)});
  });
  return {out:out, err:null};
}catch(e){return {err:e.message}}})()`);
check(`T43: 티어 경계 사정권(dev 55) 팀이 육성 투자를 집행 — 3시드 모두 티어 1→2 (관측 ${reinv.out ? reinv.out.map(o=>o.dev+'/'+o.tier).join(' · ') : '—'})`,
  !reinv.err && reinv.out.length === 3 && reinv.out.every(o => o.dev >= 60 && o.tier >= 2), JSON.stringify(reinv));
// 순서가 핵심이다 — 코치 분기 뒤에 두면 1,080억을 다 쓸 때까지 도달하지 못해 처방이 무효가 된다
const _sf = g('_startNextSeason.toString()');
const _iEdge = _sf.indexOf('_edge'), _iCoach = _sf.indexOf('Object.keys(team.coachStaff)');
check('T43: 육성 티어 분기가 코치 분기보다 앞 (순서가 뒤집히면 처방이 무효)',
  _iEdge >= 0 && _iCoach >= 0 && _iEdge < _iCoach, JSON.stringify({edge:_iEdge, coach:_iCoach}));
// 사정권 밖(경계까지 25~30p)은 종전 순서를 타야 한다 — 무제한 우선이면 AI 전 팀이 dev 90으로
// 몰려 '육성 명가' 컨셉이 사라지고 절대능력 인플레가 커진다(계측: raw 41.9 → 47.9).
check('T43: 사정권 상한 12p·경계 90 유지 (무제한 육성 우선 아님)',
  /_edge\s*<=\s*90/.test(_sf) && /_edge\s*-\s*_dev\s*<=\s*12/.test(_sf));

section('T44. 상태 영속·불펜 경로 정합 (fix/#27 후속)');

// ── A-1. 스카우팅 티켓이 새 세션 로드 후 보존되는가 ──
// _scoutTickets가 스냅샷에 없어 새 세션에서 undefined가 됐고, 소비처가 둘 다 `||0`으로 읽어
// 0장이 됐다. renderDraft의 12장 폴백은 draftPool이 빈 경우에만 도는데 draftPool은 저장되므로
// 도달하지 않는다. ⚠️ 같은 컨텍스트에서 G를 비우지 않고 라운드트립하면 기존 값이 남아
// 가드가 그냥 통과해 버린다 — 반드시 필드를 지우고 복원해야 한다.
const tick = g(`(function(){try{
  srand(555); G.teamIdx=0; initTeams(0); G.season=1; G.gameNum=5; G.phase='first_half';
  G._scoutTickets=12; G.draftPool=generateDraftPool(); G._scoutTickets=3;   // 9장 소비
  const snap=JSON.parse(JSON.stringify(_buildSnapshot()));
  const inSnap=('_scoutTickets' in snap);
  delete G._scoutTickets; G.draftPool=[]; G.teams=[]; G.myTeam=null;        // 새 세션 흉내
  _restoreFromData(snap);
  const afterLoad=G._scoutTickets;
  renderDraft();
  const afterRender=G._scoutTickets, ui=(G._scoutTickets||0);
  // 구 세이브(필드 없음) 폴백 — 시즌 초 지급량으로 복원돼야 한다
  const old=JSON.parse(JSON.stringify(snap)); delete old._scoutTickets;
  delete G._scoutTickets; G.teams=[]; G.myTeam=null;
  _restoreFromData(old);
  return {inSnap:inSnap, afterLoad:afterLoad, afterRender:afterRender, ui:ui, legacy:G._scoutTickets, err:null};
}catch(e){return {err:e.message}}})()`);
check(`T44: _scoutTickets가 스냅샷에 포함 (관측 ${tick.inSnap})`, !tick.err && tick.inSnap === true, JSON.stringify(tick));
check(`T44: 새 세션 로드 후 잔여 티켓 보존 — 3장 (로드 ${tick.afterLoad} · 드래프트 진입 후 ${tick.afterRender} · UI ${tick.ui})`,
  !tick.err && tick.afterLoad === 3 && tick.afterRender === 3 && tick.ui === 3, JSON.stringify(tick));
check(`T44: 구 세이브(_scoutTickets 없음)는 12장 폴백 (관측 ${tick.legacy})`,
  !tick.err && tick.legacy === 12, JSON.stringify(tick));

// ── A-2. 불펜 선택이 단일 소스인가 ──
// 관전 경로에 45줄 인라인 규칙이 따로 있어, 상황별 '첫 역할'만 찾고 없으면 다음 규칙으로
// 흘러 폴백 bp[0](아무나)에 닿았다. _pickReliever는 역할 우선순위 배열로 순차 폴백한다.
const _sp = g('simulatePlay.toString()');
check('T44: 관전 경로가 _pickReliever를 사용 (인라인 역할 탐색 부재)',
  _sp.includes('_pickReliever(') && !/bp\.find\(\s*p\s*=>\s*p\.pos\s*===/.test(_sp),
  JSON.stringify({usesPick:_sp.includes('_pickReliever('), hasInline:/bp\.find\(\s*p\s*=>\s*p\.pos\s*===/.test(_sp)}));
// 같은 상황·같은 불펜이면 두 경로가 같은 투수를 골라야 한다 (SU 없이 MR만 있는 7회 동점)
const same = g(`(function(){try{
  srand(31337); G.teamIdx=0; initTeams(0);
  const t=G.teams[1];
  getPitchers(t).forEach(p=>{p._pitchedThisGame=false;p.condition=100;p._consecutiveDaysPitched=0;});
  const bp=getBullpen(t);
  bp.forEach(p=>{p.pos='MR';});          // SU·CP·LR 없음 — 인라인 규칙이 폴백으로 새던 조합
  const a=_pickReliever(t,7,0);          // 7회 동점
  bp.forEach(p=>{p._pitchedThisGame=false;});
  const b=_pickReliever(t,7,0);
  return {a:a?a.name:null, b:b?b.name:null, tag:_relieverTag(a,7,0), err:null};
}catch(e){return {err:e.message}}})()`);
check(`T44: 7회 동점·MR만 있는 불펜에서 결정론적 동일 선택 (관측 ${same.a} / ${same.b} · ${same.tag})`,
  !same.err && same.a !== null && same.a === same.b, JSON.stringify(same));

// ── A-3. AI 경기에도 이닝 중 강판이 있는가 ──
// 관전·자동시뮬은 타석마다 판정하는데 _simAIGame이 쓰는 simHalf에는 판정 자체가 없어,
// 한 이닝에 대량 실점이 나도 그 이닝이 끝날 때까지 같은 투수가 던졌다. 리그 8경기 중 7경기가
// 이 경로라 실점 분포·순위·전력지표가 다른 경로와 어긋나 있었다.
const _ai = g('_simAIGame.toString()');
const _iHalf = _ai.indexOf('function simHalf('), _iLoop = _ai.indexOf('for(let inn=1');
const _halfBody = (_iHalf >= 0 && _iLoop > _iHalf) ? _ai.slice(_iHalf, _iLoop) : '';
check('T44: simHalf(AI 반이닝) 안에 이닝 중 강판 판정 존재',
  _halfBody.includes('shouldHookPitcher') && _halfBody.includes('_pickReliever'),
  JSON.stringify({found:_iHalf>=0, hasHook:_halfBody.includes('shouldHookPitcher')}));
check('T44: 교체가 pitRef로 호출부에 전파 (값 전달이면 이닝 밖에서 유실)',
  _halfBody.includes('pitRef.p') && _ai.includes('pitRefA') && _ai.includes('pitRefB'));

// ══ T45. AI FA 영입 니즈 (fix/#28) ══════════════════════════
// 구 규칙 `needBat:batCount<11 / needPit:pitCount<10`은 리그 최소 정원(타자 12·투수 11)보다
// 낮아 **유효 로스터에서 도달 불가능한 死코드**였다. 그 결함이 오래 숨은 이유는 "값이 틀렸다"가
// 아니라 "임계가 다른 규칙과 모순됐다"는 형태였기 때문이다. 여기서는 값이 아니라 **도달 가능성**을
// 가드한다 — 니즈가 양방향으로 실제 성립/불성립하는지 본다.
section('T45. AI FA 영입 니즈 — 뎁스 기반 (fix/#28)');

check('T45: _faTeamNeed 존재 (인원수 기반 teamNeed 대체)', g(`typeof _faTeamNeed==='function'`));
const _faSrc = g('_runAIFreeAgentBidding.toString()');
check('T45: 인원수 기반 死코드 부재 (needBat/needPit/posMatch)',
  !/needBat|needPit|posMatch/.test(_noComments(_faSrc)), '입찰 함수에 구 심볼 잔존');
check('T45: 뎁스 니즈가 입찰 조건에 배선', _faSrc.includes('_faTeamNeed'));
check('T45: 슬롯 상한이 입찰 조건에 배선', _faSrc.includes('FA_AI_MAX_SIGNINGS'));

// 무인지대 회귀: AI 입찰 진입선이 원소속팀 재계약 자격선(51)보다 높으면
// "원소속팀은 방출하는데 아무도 볼 수 없는" OVR 구간이 다시 생긴다 (계측 110명 소멸).
const _renewGate = /pOvr>=(\d+)\s*&&\s*rand/.exec(g('showStoveLeague.toString()'));
check(`T45: 무인지대 부재 — AI 진입선(${g('FA_AI_MIN_OVR')}) <= 재계약 자격선(${_renewGate ? _renewGate[1] : '?'})`,
  !!_renewGate && g('FA_AI_MIN_OVR') <= Number(_renewGate[1]),
  JSON.stringify({ aiMin: g('FA_AI_MIN_OVR'), renew: _renewGate && _renewGate[1] }));

// 양방향 도달성: 약팀+강FA는 니즈 성립, 강팀+약FA는 불성립. 한쪽만 성립하면 게이트가 굳은 것.
const _needProbe = g(`(function(){
  const t=G.teams.find(x=>x!==G.myTeam);
  const grpOf=p=>_ovrCalibGroup(p);
  // 실재하는 그룹 하나를 골라 그 팀의 주전 최하위 OVR을 구한다
  const grp='OF', need=FA_NEED_STARTERS[grp];
  const depth=t.roster.filter(p=>(p.status||'active')==='active'&&grpOf(p)===grp)
    .map(p=>ovr(p)).sort((a,b)=>b-a);
  if(depth.length<need) return {skip:'그룹 인원 미달'};
  const worst=depth[need-1];
  // 가짜 FA 두 명 — 주전 최하위보다 확실히 위/아래
  const mk=o=>{const p=genBatter('LF',null);['contact','power','eye','speed','fielding','arm']
    .forEach(k=>{p[k]=o;});return p;};
  const strong=mk(Math.min(99,worst+30)), weak=mk(Math.max(1,worst-30));
  return {worst, strongOvr:ovr(strong), weakOvr:ovr(weak),
          strongNeed:_faTeamNeed(t,strong), weakNeed:_faTeamNeed(t,weak)};
})()`);
check(`T45: 니즈 양방향 도달 — 강FA(OVR ${_needProbe.strongOvr}) 성립 · 약FA(OVR ${_needProbe.weakOvr}) 불성립 (주전 최하위 ${_needProbe.worst})`,
  _needProbe.skip ? true : (_needProbe.strongNeed === true && _needProbe.weakNeed === false),
  JSON.stringify(_needProbe));

// 슬롯 상한 실효: 한 오프시즌의 팀별 낙찰이 상한을 넘지 않는다
const _slot = g(`(function(){
  const cnt={};
  (G.faBiddingLog||[]).forEach(b=>{cnt[b.team]=(cnt[b.team]||0)+1;});
  const over=Object.entries(cnt).filter(([k,v])=>v>FA_AI_MAX_SIGNINGS);
  return {max:FA_AI_MAX_SIGNINGS, counts:cnt, over:over.length};
})()`);
check(`T45: 팀당 오프시즌 영입이 상한 ${_slot.max}명 이내 (초과 팀 ${_slot.over})`,
  _slot.over === 0, JSON.stringify(_slot.counts));

// ══ T46. 도달 가능성 불변량 (fix/#28) ═══════════════════════
// 이번 작업에서 나온 결함 4종은 전부 같은 모양이었다 — **개별로는 타당한 상수가 서로
// 도달 불가능한 조합을 이루는 것**. 값이 틀린 게 아니라 관계가 정의되지 않은 형태라
// 단위 테스트로는 잡히지 않고, 다시즌 계측을 돌려야만 드러난다.
//   · needBat<11        vs ACTIVE_MIN_BATTERS=12          (FA 니즈 死코드)
//   · AI 진입선 59       vs 재계약 자격선 51                (무인지대 110명)
//   · a=S/E=4.3         vs FA_SERVICE_TIME_THRESHOLD=6    (FA 도달 불가)
// 여기서는 개별 값이 아니라 **관계**를 가드한다.
section('T46. 도달 가능성 불변량 (fix/#28)');

// ── I2: FA 도달 가능성 ──
// 적립 = a×1.0 + f×c ≥ FA_SERVICE_TIME_THRESHOLD
//   a = S/E  (1군 슬롯 / 연간 유입) — 선수 1인이 평균적으로 확보하는 1군 시즌
//   c        = 팜 1시즌 적립분 (게임 자체 함수로 계산 — 프로브가 규칙을 재구현하면 어긋난다)
//   f = 3    = 전형적 팜 체류 시즌 (계측 기반 가정)
const inv = g(`(function(){
  const S=G.teams.length*ACTIVE_ROSTER_MAX;
  const E=DRAFT_ROUNDS*G.teams.length+FA_OTHER_INFLOW_EST;
  const a=S/E;
  const c=_serviceGainFromGames(Math.round(TOTAL_REGULAR*FARM_SERVICE_CREDIT));
  const f=3;
  return {S:S, E:E, a:+a.toFixed(2), c:c, f:f, total:+(a+f*c).toFixed(2),
          need:FA_SERVICE_TIME_THRESHOLD, activeOnly:+a.toFixed(2)};
})()`);
check(`T46/I2: 평균 커리어가 FA 자격에 도달 — 1군 ${inv.a} + 팜 ${inv.f}×${inv.c} = ${inv.total} >= ${inv.need}`,
  inv.total >= inv.need,
  JSON.stringify(inv));
// 팜 적립이 없으면(구 동작) 도달 불가였음을 함께 기록 — 이 가드가 무엇을 막는지 남긴다
check(`T46/I2: 팜 적립 없이는 도달 불가였음을 확인 (1군만 ${inv.activeOnly} < ${inv.need})`,
  inv.activeOnly < inv.need, `${inv.activeOnly} — 슬롯만으로 충분하면 이 가드는 무의미해진다`);
// 팜 적립이 1군 풀타임을 넘어서면 1군 기용의 의미가 사라진다.
// ⚠️ 여기엔 **불연속 절벽**이 있다 — _serviceGainFromGames는 SERVICE_FULL_SERIES(15시리즈=45경기)
//    이상이면 계단식으로 1.0을 준다. TOTAL_REGULAR=63 기준 크레딧이 45/63 = 0.714를 넘으면
//    팜이 곧바로 1군과 동급이 된다. 0.65 → 0.72처럼 "조금만" 올려도 0.62 → 1.0으로 튄다.
const cliff = g(`Math.round(SERVICE_FULL_SERIES*SERIES_LENGTH)/TOTAL_REGULAR`);
check(`T46/I2: 팜 1시즌 적립(${inv.c})이 1군 풀타임(1.0) 미만`, inv.c > 0 && inv.c < 1.0);
check(`T46/I2: 팜 크레딧 ${g('FARM_SERVICE_CREDIT')}이 풀시즌 절벽(${cliff.toFixed(3)}) 아래`,
  g('FARM_SERVICE_CREDIT') < cliff,
  `절벽을 넘으면 팜 선수가 1군 풀타임과 동일하게 적립한다`);

// ── I3: 게이트 임계가 다른 규칙의 강제 하한과 모순 없을 것 ──
// FA 니즈가 인원수 임계로 되돌아가면 리그 최소 정원보다 낮게 잡히는 사고가 재발한다.
check('T46/I3: FA 니즈가 인원수 임계로 회귀하지 않음',
  !/batCount\s*<|pitCount\s*</.test(g('_runAIFreeAgentBidding.toString()')) &&
  !/batCount\s*<|pitCount\s*</.test(g('_faTeamNeed.toString()')));

// ── I4: 조직 정원이 연간 유입 + 최소 정원을 수용할 것 ──
const cap = g(`(function(){
  return {org:FUTURES_ORG_MAX, min:ORG_MIN_TOTAL, picks:DRAFT_ROUNDS,
          need:ORG_MIN_TOTAL+DRAFT_ROUNDS};
})()`);
check(`T46/I4: 조직 정원 ${cap.org} >= 최소 정원 ${cap.min} + 연간 지명 ${cap.picks}`,
  cap.org >= cap.need, JSON.stringify(cap));

// 정원이 찬 AI 팀은 드래프트에서 자동 방출로 자리를 만든다 (체인이 멈추지 않는다).
// 유저 팀은 의도적으로 거부 + 안내(season-core.js:315)라 대상이 아니다.
check('T46/I4: 정원 초과 AI 팀은 지명 시 자동 방출 경로 보유',
  /roster\.length>=FUTURES_ORG_MAX/.test(g('_processDraftPick.toString()')),
  'AI 픽 경로에 정원 처리가 없으면 체인이 정지한다');

// ── 팜 적립 실동작 (상수만 있고 배선이 빠지는 것을 막는다) ──
const accrue = g(`(function(){
  const t=G.myTeam;
  const a=t.roster.find(p=>(p.status||'active')==='active');
  const f=t.roster.find(p=>p.status==='futures');
  if(!a||!f)return {skip:true};
  const a0=a._svcGames||0, f0=f._svcGames||0;
  _accrueServiceDay();
  return {activeGain:+( (a._svcGames||0)-a0 ).toFixed(2),
          farmGain:  +( (f._svcGames||0)-f0 ).toFixed(2)};
})()`);
check(`T46: 1군 경기당 적립 1.0 · 팜 ${g('FARM_SERVICE_CREDIT')} (관측 ${accrue.activeGain} / ${accrue.farmGain})`,
  accrue.skip ? true : (accrue.activeGain === 1 && accrue.farmGain === g('FARM_SERVICE_CREDIT')),
  JSON.stringify(accrue));

// ══ T47. 연봉 재산정 · 플로어 실효화 (fix/#28) ══════════════
section('T47. 연봉 재산정 · 플로어 실효화 (fix/#28)');

// ── H1: AI 만료 계약 재산정이 유저와 같은 산정기를 쓴다 ──
// 구 규칙은 `mult = pOvr>=70 ? 1.2 : pOvr<31 ? 0.8 : 0`이고 배율 0이면 조기 return이라
// OVR 31~69 만료 계약자가 영구 동결됐다(동결률 83~97% · Arb 단가 1.02 → 0.56억 반토막).
const _sns = g('_startNextSeason.toString()');
const _snsCode = _noComments(_sns);
check('T47/H1: AI 재산정이 _calcNewSalary(유저와 동일 산정기)를 사용',
  _snsCode.includes('_calcNewSalary(p,team)'));
check('T47/H1: 구 OVR 배율 게이트 부재 (mult 0 → 영구 동결)',
  !/\(p\.salary\|\|SALARY_MIN\)\s*\*/.test(_snsCode),
  '구 배율 대입식이 남아 있으면 중간 대역이 다시 동결된다');
check('T47/H1: AI도 Arb 연차를 누적 (_arbYears)', _snsCode.includes('_arbYears'));
// 컨셉 배율이 팀 인자를 따르는지 — 이전엔 G.myTeam.concept 하드코딩이라 AI 선수에게
// 유저 팀 컨셉이 적용될 뻔했다.
check('T47/H1: _calcNewSalary 컨셉 배율이 선수 소속팀 기준',
  !/G\.myTeam\.concept/.test(_noComments(g('_calcNewSalary.toString()'))));

// 실동작: 중간 대역(OVR 31~69) 만료 계약자의 연봉이 실제로 재산정되는가.
// 값이 아니라 "동결되지 않는다"를 본다 — 이게 H1의 계약이다.
const reRate = g(`(function(){
  const t=G.teams.find(x=>x!==G.myTeam);
  const p=t.roster.find(x=>{const o=ovr(x);return o>=31&&o<70&&(x._serviceTime||0)>=ARB_MIN_SERVICE;});
  if(!p)return {skip:true};
  const before=p.salary;
  const after=_calcNewSalary(p,t);
  return {ovr:ovr(p), st:p._serviceTime, before:before, after:after, changed:after!==before};
})()`);
check(`T47/H1: 중간 대역 Arb 만료자가 재산정됨 (OVR ${reRate.ovr} · ${reRate.before} → ${reRate.after})`,
  reRate.skip ? true : reRate.changed, JSON.stringify(reRate));

// ── H3: 플로어가 현금 중립이 아니다 ──
// 배율 1.0이면 `페이롤 + 벌과금 = 플로어`로 지출 총액이 같아져 페이롤을 올릴 유인이 0이 된다.
// 실제로 12시즌 벌과금 539억을 내면서 예산은 118 → 250억으로 늘었다(현금만 순환).
check(`T47/H3: 플로어 벌과금 배율 ${g('SALARY_FLOOR_PENALTY_RATE')} > 1.0 (현금 중립 아님)`,
  g('SALARY_FLOOR_PENALTY_RATE') > 1.0,
  '1.0이면 덜 쓰는 쪽과 채우는 쪽의 지출이 같아져 벌금이 행동을 바꾸지 못한다');
check('T47/H3: 정산이 배율을 실제로 적용',
  /shortfall\s*\*\s*SALARY_FLOOR_PENALTY_RATE/.test(_noComments(g('showStoveLeague.toString()'))),
  '상수만 있고 배선이 빠지면 무의미하다');
// 부등식으로 확인: 미달 상태의 총지출(페이롤+벌과금) > 플로어를 채웠을 때의 지출
const floorMath = g(`(function(){
  const floor=getSalaryFloor(), payroll=floor*0.6, short=floor-payroll;
  return {underspend:+(payroll+short*SALARY_FLOOR_PENALTY_RATE).toFixed(1), meetFloor:floor};
})()`);
check(`T47/H3: 미달 시 총지출 ${floorMath.underspend} > 플로어 충족 시 ${floorMath.meetFloor}`,
  floorMath.underspend > floorMath.meetFloor, JSON.stringify(floorMath));

// ── 리포트 ──────────────────────────────────────────────────
function report() {
  console.log('\n══════════════════════════════════');
  console.log(`  통과 ${passed} / 실패 ${failed}`);
  if (failures.length) { console.log('  실패 목록:'); failures.forEach((f) => console.log(`   • ${f}`)); }
  console.log('══════════════════════════════════');
}
report();
process.exit(failed === 0 ? 0 : 1);
