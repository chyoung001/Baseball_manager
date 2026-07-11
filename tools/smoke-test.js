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

const ROOT = path.join(__dirname, '..');

// ── 결과 수집 ───────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function section(title) { console.log(`\n━━ ${title} ━━`); }

// ── DOM 스텁 ────────────────────────────────────────────────
const NOOP_METHODS = new Set([
  'addEventListener','removeEventListener','setAttribute','removeAttribute','click','focus','blur',
  'remove','scrollIntoView','scrollTo','prepend','append','insertBefore','removeChild','select',
]);
function makeFakeEl(tag) {
  const store = {
    style: {}, dataset: {}, children: [], disabled: false,
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; }, replace(){} },
  };
  return new Proxy(store, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'innerHTML' || prop === 'textContent' || prop === 'value' || prop === 'className') return '';
      if (prop === 'querySelectorAll') return () => [];
      if (prop === 'querySelector') return () => null;
      if (prop === 'closest') return () => null;
      if (prop === 'appendChild') return (x) => x;
      if (prop === 'getBoundingClientRect') return () => ({ top:0,left:0,right:0,bottom:0,width:0,height:0 });
      if (prop === 'getAttribute') return () => null;
      if (prop === 'getContext') return () => new Proxy({}, { get: () => () => {} }); // canvas 흡수
      if (NOOP_METHODS.has(prop)) return () => {};
      return undefined;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}
const elCache = new Map();
function getEl(id) {
  if (!elCache.has(id)) elCache.set(id, makeFakeEl('div'));
  return elCache.get(id);
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    _map: m,
  };
}

// ── vm 컨텍스트 구성 ────────────────────────────────────────
const timeouts = []; // setTimeout은 큐잉만 (AI 드래프트 체인 등 비동기 연출은 스모크 범위 밖)
const sandbox = {
  console,
  document: {
    getElementById: getEl,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => makeFakeEl(tag),
    addEventListener: () => {},
    removeEventListener: () => {},
    body: makeFakeEl('body'),
    documentElement: makeFakeEl('html'),
  },
  localStorage: makeStorage(),
  sessionStorage: makeStorage(),
  alert: () => {},
  confirm: () => true,
  prompt: () => null,
  setTimeout: (fn) => { timeouts.push(fn); return timeouts.length; },
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: (fn) => { timeouts.push(fn); return timeouts.length; },
  navigator: { userAgent: 'smoke-test' },
  location: { reload: () => {}, href: '' },
  URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
  Blob: function Blob() {},
  FileReader: function FileReader() { this.readAsText = () => {}; },
  Image: function Image() {},
  performance: { now: () => Date.now() },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);

// ── 모듈 로드 (index.html 순서) ─────────────────────────────
section('T1. 모듈 로드');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
check(`index.html에서 스크립트 ${srcs.length}개 발견 (>=50)`, srcs.length >= 50, `발견: ${srcs.length}`);

let loadErrors = 0;
for (const src of srcs) {
  const file = path.join(ROOT, src);
  try {
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: src });
  } catch (e) {
    loadErrors++;
    console.log(`  ❌ 로드 실패: ${src} → ${e.message}`);
  }
}
check('전 모듈 로드 에러 0건', loadErrors === 0, `${loadErrors}건 실패`);

function g(expr) { return vm.runInContext(expr, ctx); }
const REQUIRED_GLOBALS = ['G','TEAMS_DATA','initTeams','_simMyGame','showStoveLeague','_showSalaryNegotiation','validateActiveRoster','ovr','saveGame','loadGame','getPayroll','TOTAL_REGULAR','FIRST_HALF_END'];
for (const name of REQUIRED_GLOBALS) {
  check(`전역 심볼 존재: ${name}`, g(`typeof ${name}!=='undefined'`));
}
if (failed > 0) { report(); process.exit(1); } // 로드 실패 시 이후 무의미

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
// 부상(IL) 등으로 라인업이 무너지면 유저가 로스터 탭에서 수동 보수하는 상황을 흉내내는
// 하네스 전용 자동 보수 로직 (게임 코드는 무변경 — 실제 유저 행동의 대체물)
vm.runInContext(`
  function __harnessFixRoster(){
    const t=G.myTeam;
    const REQ=['C','1B','2B','3B','SS','LF','CF','RF'];
    // 2군 → 육성 순으로 한 명 활성화 (유저의 콜업 행동 대체)
    const pull=(pred)=>{
      let c=t.roster.filter(p=>p.status==='futures'&&pred(p)).sort((a,b)=>ovr(b)-ovr(a))[0];
      if(!c)c=t.roster.filter(p=>p.status==='developmental'&&pred(p)).sort((a,b)=>ovr(b)-ovr(a))[0];
      if(c){c.status='active';c.role=c.isPitcher?'bullpen':'bench';c.isOnIL=false;c.ilGamesLeft=0;c.rehabGamesLeft=0;}
      return c;
    };
    // 1) 카테고리별 최소 인원 콜업 (타자12/투수11/총원27)
    let gd=0;
    while(countActiveBatters(t)<12&&gd++<50){if(!pull(p=>!p.isPitcher))break;}
    while(countActivePitchers(t)<11&&gd++<100){if(!pull(p=>p.isPitcher))break;}
    while(getActiveCount(t)<27&&gd++<150){if(!pull(()=>true))break;}
    // 2) 라인업 전면 재구성: 야수 전원 벤치로 → 포지션별 최적 배치 + DH
    const activeBat=()=>t.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active'&&p.role!=='overseas');
    activeBat().forEach(p=>{p.role='bench';});
    const pool=activeBat().sort((a,b)=>ovr(b)-ovr(a));
    const used=new Set();
    REQ.forEach(pos=>{
      let c=pool.find(p=>!used.has(p)&&p.pos===pos)||pool.find(p=>!used.has(p));
      if(c){c.pos=pos;c.role='starting';used.add(c);}
    });
    const dh=pool.find(p=>!used.has(p));
    if(dh){dh.pos='DH';dh.role='starting';used.add(dh);}
    // 3) 벤치 포지션 재지정으로 포수2/내야5/외야4 충족 (유저의 포지션 변경 대체)
    const benchBats=()=>activeBat().filter(p=>p.role!=='starting');
    // "그 선수를 다른 포지션으로 빼도 원 카테고리 최소치가 유지되는가" — 카테고리 간 상호 강탈 방지
    const canTake=(p)=>{
      if(p.pos==='C'&&countActiveCatchers(t)<=2)return false;
      if(['C','1B','2B','3B','SS'].includes(p.pos)&&countActiveIF(t)<=5)return false;
      if(['LF','CF','RF'].includes(p.pos)&&countActiveOF(t)<=4)return false;
      return true;
    };
    gd=0;
    // 벤치 후보가 없으면 2군/육성에서 콜업해서라도 충족 (pull 폴백)
    while(countActiveCatchers(t)<2&&gd++<20){let c=benchBats().find(p=>p.pos!=='C'&&canTake(p));if(!c)c=pull(p=>!p.isPitcher);if(!c)break;c.pos='C';}
    while(countActiveIF(t)<5&&gd++<40){let c=benchBats().find(p=>!['C','1B','2B','3B','SS'].includes(p.pos)&&canTake(p));if(!c)c=pull(p=>!p.isPitcher);if(!c)break;c.pos='2B';}
    while(countActiveOF(t)<4&&gd++<60){let c=benchBats().find(p=>!['LF','CF','RF'].includes(p.pos)&&canTake(p));if(!c)c=pull(p=>!p.isPitcher);if(!c)break;c.pos='LF';}
    // 4) 투수 role 밸런스: 로테이션 5 / 불펜 6
    const activePit=()=>t.roster.filter(p=>p.isPitcher&&(p.status||'active')==='active'&&p.role!=='overseas');
    const rot=()=>activePit().filter(p=>p.role==='rotation');
    const bp=()=>activePit().filter(p=>p.role==='bullpen');
    while(rot().length<5&&bp().length>6){bp().sort((a,b)=>ovr(b)-ovr(a))[0].role='rotation';}
    while(bp().length<6&&rot().length>5){rot().sort((a,b)=>ovr(a)-ovr(b))[0].role='bullpen';}
    activePit().filter(p=>p.role!=='rotation'&&p.role!=='bullpen').forEach(p=>{p.role='bullpen';});
  }
`, ctx);
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
check('전 팀 예산 유한값 유지', g('G.teams.every(t=>Number.isFinite(t.budget))'));
check('시즌 스탯 NaN 없음', g(`G.teams.every(t=>t.roster.every(p=>{const s=p.ss||{};return Object.values(s).every(v=>typeof v!=='number'||Number.isFinite(v));}))`));
const lgAvg = g(`(function(){let h=0,ab=0;G.teams.forEach(t=>t.roster.forEach(p=>{if(!p.isPitcher&&p.ss){h+=p.ss.h||0;ab+=p.ss.ab||0;}}));return ab>0?h/ab:0;})()`);
check(`리그 타율 온건 범위(0.15~0.40): ${lgAvg.toFixed(3)}`, lgAvg > 0.15 && lgAvg < 0.40);
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
  // 자원 보장: 시즌 경과로 "가용" 포수(1군 또는 즉시 콜업 가능)가 고갈됐을 수 있음(IL 등재 등) —
  // 기능 검증이 목적이므로 2군에 주입 (실게임의 자원 부족은 잔여 위반 메시지 경로가 정상 동작)
  const usableC=()=>t.roster.filter(p=>!p.isPitcher&&(p._naturalPos||p.pos)==='C'
    &&(((p.status||'active')==='active')
      ||((p.status==='futures'||p.status==='developmental')&&(p.cooldown||0)<=0&&(p.rehabGamesLeft||0)<=0))).length;
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

// ── 리포트 ──────────────────────────────────────────────────
function report() {
  console.log('\n══════════════════════════════════');
  console.log(`  통과 ${passed} / 실패 ${failed}`);
  if (failures.length) { console.log('  실패 목록:'); failures.forEach((f) => console.log(`   • ${f}`)); }
  console.log('══════════════════════════════════');
}
report();
process.exit(failed === 0 ? 0 : 1);
