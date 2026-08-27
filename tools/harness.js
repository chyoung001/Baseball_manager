'use strict';
// ===================== DUGOUT 헤드리스 하네스 =====================
// 스모크 테스트(tools/smoke-test.js)와 계측 프로브(tools/probe-*.js)가 공유하는 부트스트랩.
//
// 추출 동기 (미해결 이슈 E-1): 프로브가 스모크의 부트스트랩 약 205줄을 복사해 쓰고 있었다.
// 계측을 추가할 때마다 같은 분량이 복제되고, DOM 스텁이나 로스터 보수 규칙이 갈리면
// "스모크는 통과하는데 프로브만 다른 결과"가 나와 원인 추적이 불가능해진다.
//
// ⚠️ 이 모듈은 **게임 코드를 일절 수정하지 않는다**. DOM/localStorage/타이머를 스텁으로 흡수하고
//    index.html의 <script> 순서 그대로 전 모듈을 하나의 vm 컨텍스트에 로드해 전역 스코프를 재현할 뿐이다.
//
// 사용 예:
//   const H = require('./harness');
//   const h = H.createHarness();          // DOM 스텁 + vm 컨텍스트
//   const load = H.loadModules(h);        // index.html 순서대로 전 모듈 로드
//   H.installHelpers(h);                  // __harnessFixRoster · __playHalf 주입
//   h.g(`initTeams(0)`);                  // 컨텍스트 안에서 평가

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

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
// setTimeout은 큐잉만 한다 (AI 드래프트 체인 등 비동기 연출은 drainTimers로 명시 소비).
function createHarness() {
  const elCache = new Map();
  const getEl = (id) => {
    if (!elCache.has(id)) elCache.set(id, makeFakeEl('div'));
    return elCache.get(id);
  };

  const timeouts = [];
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

  const h = {
    ctx, sandbox, timeouts, elCache, getEl,
    g(expr) { return vm.runInContext(expr, ctx); },
    run(code, filename) { return vm.runInContext(code, ctx, filename ? { filename } : undefined); },
    drainTimers(cap) { return drainTimers(timeouts, cap); },
  };
  return h;
}

// ── 모듈 로드 (index.html 순서 = 의존성 순서) ───────────────
// 빌드 툴이 없으므로 <script> 선언 순서가 유일한 의존성 계약이다. 그 순서를 그대로 재현한다.
// 반환: {srcs, loadErrors, errors:[{src,message}]} — 호출부가 리포팅 방식을 정한다
//       (스모크는 check()로 어서션, 프로브는 즉시 throw 등).
// `transform(code, src)`를 주면 로드 직전에 소스를 바꿔치기할 수 있다 — **밸런스 반사실 전용**이다.
// 상수가 `const`라 vm 컨텍스트에서 재대입할 수 없으므로(예: DRAFT_ROUNDS), "값을 바꿨을 때
// 리그가 어떻게 달라지는가"를 재려면 로드 시점에 갈아끼우는 수밖에 없다.
// ⚠️ 스모크는 절대 transform을 쓰지 않는다 — 실제 소스 그대로를 검증해야 하기 때문.
function loadModules(h, transform) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const errors = [];
  for (const src of srcs) {
    const file = path.join(ROOT, src);
    try {
      let code = fs.readFileSync(file, 'utf8');
      if (transform) code = transform(code, src);
      h.run(code, src);
    } catch (e) {
      errors.push({ src, message: e.message });
    }
  }
  return { srcs, loadErrors: errors.length, errors };
}

// ── 큐잉된 타이머 소비 ──────────────────────────────────────
function drainTimers(timeouts, cap = 20000) {
  let n = 0;
  while (timeouts.length && n++ < cap) { const fn = timeouts.shift(); try { fn(); } catch (e) { /* 연출 코드 무시 */ } }
  return n;
}

// ── 하네스 전용 헬퍼 주입 ───────────────────────────────────
// 게임 코드는 무변경. 유저가 UI에서 손으로 하는 행동(콜업·포지션 변경·다음 경기 버튼)의 대체물이다.
//   __harnessFixRoster() — 부상(IL) 등으로 라인업이 무너졌을 때 유저의 로스터 탭 수동 보수를 흉내
//   __playHalf(limit)    — 각 페이즈 "버튼 onclick"이 하던 경기 진행 전이를 대신 수행
function installHelpers(h) {
  h.run(`
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
`);

  h.run(`
  // 유저 팀의 "정원 초과 시 방출 후 지명" 행동 대체물.
  // draftPick()은 로스터가 FUTURES_ORG_MAX에 차면 안내 토스트만 띄우고 **거부**한다
  // (season-core.js:315 — AI는 같은 상황에서 자동 방출하지만 유저는 직접 정리해야 한다).
  // 사람은 토스트를 보고 방출하면 되지만 하네스는 그대로 멈춰버려, 은퇴가 적은 시나리오에서
  // 드래프트 체인이 영구 정지했다. 합리적 유저처럼 최저 가치 2군 선수를 먼저 정리한다.
  function __harnessMakeDraftRoom(){
    const t=G.myTeam;
    if(t.roster.length<FUTURES_ORG_MAX) return false;
    const cut=t.roster
      .filter(p=>p.status==='futures'||p.status==='developmental')
      .sort((a,b)=>_aiPlayerValue(a)-_aiPlayerValue(b))[0];
    if(!cut) return false;
    t.roster.splice(t.roster.indexOf(cut),1);
    return true;
  }
`);

  h.run(`
  // 유저 팀의 FA 영입 행동 대체물 — 조직 인원이 하한에 가까우면 FA 풀에서 보충한다.
  // 오프시즌 조직 하한 보충(season-flow)은 \`G.teams.filter(t=>t!==G.myTeam)\`이라 **AI 전용**이다.
  // 유저 팀은 시장에서 직접 계약해 채우는 것이 정상 플레이인데, 하네스는 콜업만 흉내내므로
  // 드래프트 유입을 줄이는 반사실에서 유저 팀만 인원 부족으로 경기를 못 치르고 롤아웃이 끊겼다
  // (관측: 4라운드 시나리오가 S6에서 "정규시즌 미완주"). 그 비대칭을 메운다.
  // ⚠️ 게임 코드는 무변경. 스모크는 이 함수를 호출하지 않는다(현행 6라운드에선 불필요).
  // ⚠️ 총원만 보고 채우면 안 된다 — 조직 42명인데도 "타자 부족 11/12"로 시즌이 멈춘 적이 있다.
  //    카테고리(타자/투수)별 목표를 먼저 채우고, 그다음 총원을 채운다.
  function __harnessUserSignFA(target){
    const t=G.myTeam; target=target||ORG_MIN_TOTAL+6;
    const nBat=()=>t.roster.filter(p=>!p.isPitcher).length;
    const nPit=()=>t.roster.filter(p=>p.isPitcher).length;
    const BAT_TARGET=ACTIVE_MIN_BATTERS+7;   // 1군 12 + 2군 여유
    const PIT_TARGET=ACTIVE_MIN_PITCHERS+6;  // 1군 11 + 2군 여유
    const take=(wantPit)=>{
      let cands=(G.faPool||[]).filter(p=>!!p.isPitcher===wantPit);
      if(cands.length===0)return false;
      cands.sort((a,b)=>ovr(b)-ovr(a));      // 합리적 유저: 가용 최고 선수
      const add=cands[0];
      G.faPool.splice(G.faPool.indexOf(add),1);
      add.salary=Math.max(SALARY_MIN,+(add.salary||SALARY_MIN));
      add._contractYears=Math.max(1,add._contractYears||1);
      add._faYears=0;
      add.status='futures';
      add.role=add.isPitcher?'bullpen':'bench';
      add._teamTenure=0;
      t.roster.push(add);
      if(!add.ss)initSeasonStats(add);
      t.budget=+((t.budget||0)-(add.price||0)).toFixed(1);
      return true;
    };
    let guard=0;
    while(guard++<80){
      if(nBat()<BAT_TARGET){ if(!take(false))break; continue; }
      if(nPit()<PIT_TARGET){ if(!take(true))break; continue; }
      if(t.roster.length<target){ if(!take(nPit()<nBat()))break; continue; }
      break;
    }
  }
`);

  h.run(`
  // 한 시즌 완주: 프리시즌 → 전반기 → 올스타·드래프트 → 후반기 → 포스트시즌 → 시상식 → GM회의 → 스토브 → 다음시즌
  // 각 페이즈의 "버튼 onclick"이 하던 전이를 하네스가 대신한다(게임 코드 무변경).
  function __playHalf(limit){
    let guard=0;
    while(G.gameNum<limit && guard++<200){
      __harnessFixRoster();
      const before=G.gameNum;
      _simMyGame();
      if(G.gameNum===before) break; // 로스터 미달 등으로 진행 불가
    }
    return G.gameNum;
  }
`);
}

module.exports = { ROOT, createHarness, loadModules, installHelpers, drainTimers, makeFakeEl, makeStorage };
