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
check('P1b: OVR 분포 확장 (S급 84+ & 하위 <34 공존)', g(`(function(){const o=G.teams.flatMap(t=>t.roster.map(p=>ovr(p)));return o.some(x=>x>=84)&&o.some(x=>x<34);})()`));
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
  const t0=all.find(p=>ovr(p)>=30&&ovr(p)<=70);
  const base=ovr(t0);
  t0._subPos=['2B'];const tax1=base-ovr(t0);
  t0._subPos=['2B','3B'];const tax2=base-ovr(t0);
  delete t0._subPos;
  return {means:JSON.stringify(means),allOk,splitOk,tax1,tax2};
})()`);
check(`전 그룹 1군 평균 OVR ≈50 (46~54): ${zProbe.means}`, zProbe.allOk);
check('ovrRaw/ovr 분리 (유한 + 상이 선수 존재)', zProbe.splitOk);
check(`다재다능 세금 (서브1 −1 / 서브2 −2): ${zProbe.tax1}/${zProbe.tax2}`, zProbe.tax1 === 1 && zProbe.tax2 === 2);

// ── 리포트 ──────────────────────────────────────────────────
function report() {
  console.log('\n══════════════════════════════════');
  console.log(`  통과 ${passed} / 실패 ${failed}`);
  if (failures.length) { console.log('  실패 목록:'); failures.forEach((f) => console.log(`   • ${f}`)); }
  console.log('══════════════════════════════════');
}
report();
process.exit(failed === 0 ? 0 : 1);
