// ===================== PLAYER TRAITS (P3-2 특성 엔진) =====================
// 설계: Notion "자연 특성"/"인공 특성" 페이지. 보정은 Tier3(statEff/hiddenEff) 전용 —
// OVR·TV·표시에 무영향 (확정 설계 결정 3). 스택 상한은 utils-stats._traitBonus에서 적용.
// p._traits = [{id, slot(1=자연|2~3=인공), season}]
//
// 스탯 매핑 주의: 설계 "부상위험도 -N" → _durability +N (현행 내구성은 높을수록 강골),
// "멘탈" → clutch, "수비범위+포구" → fielding 통합 근사 (3분할 수비 스탯은 구종 시스템과 함께).
// 조건 감지 시스템이 없는 특성(퍼펙트/노히터/끝내기/PS 개인 성적/홀드/사이클링/연속 안타/
// wRC+/에이스 확립)은 카탈로그에서 보류 — workflow/8_feat 백로그 참조.

const TRAITS={
  // ── 자연: 공통 순수 긍정 (7) ──
  iron:         {kind:'nat',cat:'pos', who:'all',name:'철인',           fx:{_durability:8},                               desc:'부상 위험이 낮다. 풀시즌 가동.'},
  clutchGene:   {kind:'nat',cat:'pos', who:'all',name:'클러치 히터',    fx:{_clutchHidden:8},                             desc:'득점권·접전·큰 경기에서 강하다.'},
  indomitable:  {kind:'nat',cat:'pos', who:'all',name:'불굴',           fx:{_consistency:8},                              desc:'기복 없이 매 시리즈 안정적.'},
  leadership:   {kind:'nat',cat:'pos', who:'all',name:'리더십',         fx:{_workEthic:8},                                desc:'훈련 효율과 성장이 빠르고 노화가 늦다.'},
  bornLeader:   {kind:'nat',cat:'pos', who:'all',name:'타고난 리더',    fx:{_loyalty:5,_temperament:5},                   desc:'팀에 헌신적이고 침착하다.'},
  allround:     {kind:'nat',cat:'pos', who:'all',name:'올어라운드',     fx:{_versatility:8},                              desc:'포지션·보직 전환 적응이 빠르다.'},
  gamer:        {kind:'nat',cat:'pos', who:'all',name:'승부사',         fx:{_clutchHidden:5,_workEthic:3},                desc:'큰 경기에 강하고 자기 관리가 철저하다.'},
  // ── 자연: 공통 양날의 검 (4) ──
  ambitiousGene:{kind:'nat',cat:'edge',who:'all',name:'야심가',         fx:{_ambition:8,_temperament:-5},                 desc:'성장 욕심이 크지만 요구도 공격적이다.'},
  franchiseGene:{kind:'nat',cat:'edge',who:'all',name:'프랜차이즈',     fx:{_loyalty:8,_workEthic:3},                     desc:'팀의 상징. 잔류에 우호적이다.'},
  spirited:     {kind:'nat',cat:'edge',who:'all',name:'패기',           fx:{_ambition:5,_clutchHidden:3,_temperament:-8}, desc:'승부욕이 넘치지만 벤치엔 불만이 폭발한다.'},
  easygoing:    {kind:'nat',cat:'edge',who:'all',name:'느긋한 성격',    fx:{_temperament:8,_ambition:-3,_workEthic:-3},   desc:'불만이 없지만 성장 동기도 약하다.'},
  // ── 자연: 공통 약한 부정 (2) ──
  slowStarter:  {kind:'nat',cat:'neg', who:'all',name:'느린 스타터',    fx:{_consistency:-3},                             desc:'시즌 초반 다소 부진하다.'},
  oneTrack:     {kind:'nat',cat:'neg', who:'all',name:'한 우물형',      fx:{_versatility:-5},                             desc:'포지션 전환이 어렵다.'},
  // ── 자연: 타자 전용 (7) ──
  batMachine:   {kind:'nat',cat:'pos', who:'bat',name:'배팅머신',       fx:{power:2,contact:2},                           desc:'타격 전반이 우수하다.'},
  goldenEye:    {kind:'nat',cat:'pos', who:'bat',name:'천부적 선구안',  fx:{eye:5},                                       desc:'출루 머신. 투구수를 소모시킨다.'},
  defWizard:    {kind:'nat',cat:'pos', who:'bat',name:'수비 스페셜리스트',fx:{fielding:4},                                desc:'수비범위와 포구가 뛰어나다.'},
  speedsterGene:{kind:'nat',cat:'pos', who:'bat',name:'스피드스터',     fx:{speed:5},                                     desc:'도루·내야안타·진루가 압도적이다.'},
  cannonArm:    {kind:'nat',cat:'pos', who:'bat',name:'캐논암',         fx:{arm:5},                                       desc:'강견. 보살과 도루 저지에 기여한다.'},
  fiveTool:     {kind:'nat',cat:'pos', who:'bat',name:'5툴 플레이어',   fx:{power:1,contact:1,speed:1,fielding:1,arm:1},  desc:'모든 영역이 고르게 뛰어나다. 희귀.'},
  fullSwing:    {kind:'nat',cat:'edge',who:'bat',name:'풀스윙어',       fx:{power:4,contact:-2,eye:-2},                   desc:'홈런 아니면 삼진. 올 오어 낫싱.'},
  // ── 자연: 투수 전용 (5) ──
  fireballer:   {kind:'nat',cat:'pos', who:'pit',name:'파이어 볼러',    fx:{velocity:5},                                  desc:'압도적 구속.'},
  untouchable:  {kind:'nat',cat:'pos', who:'pit',name:'언터쳐블',       fx:{movement:5},                                  desc:'그라운드볼 유도, 홈런 억제.'},
  artistGene:   {kind:'nat',cat:'pos', who:'pit',name:'아티스트',       fx:{control:5},                                   desc:'볼넷 극소, 투구수 효율.'},
  poised:       {kind:'nat',cat:'pos', who:'pit',name:'평정심',         fx:{clutch:5},                                    desc:'위기에도 흔들리지 않는다.'},
  inningEater:  {kind:'nat',cat:'pos', who:'pit',name:'이닝 이터',      fx:{stamina:5},                                   desc:'선발 내구성의 표본.'},

  // ── 인공 S랭크 ──
  tcBat:      {kind:'art',rank:'S',prio:5,who:'bat',name:'트리플 크라운',    fx:{power:5,contact:5,_clutchHidden:5},desc:'타율·홈런·타점 동시 1위.'},
  legendBat:  {kind:'art',rank:'S',prio:2,who:'bat',name:'레전드 타자',      fx:{power:4,contact:4,_consistency:5}, desc:'통산 300홈런 + 타율 .290.'},
  club4040:   {kind:'art',rank:'S',prio:1,who:'bat',name:'40-40 클럽',       fx:{power:5,speed:5,contact:3},        desc:'단일 시즌 40홈런-40도루.'},
  legendPit:  {kind:'art',rank:'S',prio:2,who:'pit',name:'레전드 투수',      fx:{control:5,clutch:5,_consistency:6},desc:'통산 200승 또는 300세이브.'},
  endgame:    {kind:'art',rank:'S',prio:2,who:'pit',name:'엔드게임',         fx:{clutch:5,control:5,_consistency:5},desc:'단일 시즌 60세이브.'},
  // ── 인공 A랭크 ──
  mvpTrait:   {kind:'art',rank:'A',prio:5,who:'bat',name:'MVP',              fx:{power:3,contact:3,_clutchHidden:5},desc:'시즌 MVP 수상.'},
  cyTrait:    {kind:'art',rank:'A',prio:4,who:'pit',name:'사이영',           fx:{control:3,movement:3,_workEthic:5},desc:'투수상 수상.'},
  club3030:   {kind:'art',rank:'A',prio:4,who:'bat',name:'30-30 클럽',       fx:{power:3,speed:3,_ambition:2},      desc:'단일 시즌 30홈런-30도루.'},
  c200hr:     {kind:'art',rank:'A',prio:3,who:'bat',name:'통산 200홈런',     fx:{power:4,_clutchHidden:3},          desc:'통산 홈런 200개.'},
  tcPit:      {kind:'art',rank:'A',prio:3,who:'pit',name:'트리플 크라운(투)',fx:{control:3,velocity:3,movement:3},  desc:'다승·방어율·탈삼진 동시 석권.'},
  c2000h:     {kind:'art',rank:'A',prio:2,who:'bat',name:'통산 2000안타',    fx:{contact:3,_consistency:4},         desc:'통산 안타 2000개.'},
  c150w:      {kind:'art',rank:'A',prio:2,who:'pit',name:'통산 150승',       fx:{stamina:3,_consistency:5},         desc:'통산 150승.'},
  finisher:   {kind:'art',rank:'A',prio:2,who:'pit',name:'끝판왕',           fx:{clutch:4,_clutchHidden:4},         desc:'시즌 50세이브 또는 통산 200세이브.'},
  craftsman:  {kind:'art',rank:'A',prio:1,who:'bat',name:'정교함의 장인',    fx:{contact:4,_consistency:3},         desc:'통산 3000타수 이상 타율 .300 유지.'},
  dr2000k:    {kind:'art',rank:'A',prio:1,who:'pit',name:'닥터K',            fx:{velocity:2,movement:4},            desc:'통산 2000탈삼진.'},
  // ── 인공 B랭크 ──
  streak3AS:  {kind:'art',rank:'B',prio:4,who:'bat',name:'연속 올스타',      fx:{contact:2,power:2},                desc:'올스타 3회 연속 선정.'},
  club2020:   {kind:'art',rank:'B',prio:3,who:'bat',name:'호타준족',         fx:{power:1,speed:2,contact:1},        desc:'단일 시즌 20홈런-20도루.'},
  champBat:   {kind:'art',rank:'B',prio:2,who:'bat',name:'우승 멤버',        fx:{_clutchHidden:3,_consistency:2},   desc:'챔피언십 우승 팀 소속.'},
  streak3ASP: {kind:'art',rank:'B',prio:2,who:'pit',name:'연속 올스타 투수', fx:{control:2,movement:2},             desc:'올스타 3회 연속 선정.'},
  champPit:   {kind:'art',rank:'B',prio:1,who:'pit',name:'우승 투수',        fx:{clutch:2,_clutchHidden:3},         desc:'챔피언십 우승 팀 소속.'},
  no1Pick:    {kind:'art',rank:'B',prio:1,who:'all',name:'전체 1순위',       fx:{_workEthic:4,_ambition:3,_temperament:-2},desc:'드래프트 전체 1번 지명.'},
  // ── 인공 C랭크 ──
  avgKing:    {kind:'art',rank:'C',prio:5,who:'bat',name:'타격왕',           fx:{contact:2},                        desc:'시즌 타율 1위.'},
  hrKingT:    {kind:'art',rank:'C',prio:4,who:'bat',name:'홈런왕',           fx:{power:2},                          desc:'시즌 홈런 1위.'},
  sbKing:     {kind:'art',rank:'C',prio:3,who:'bat',name:'도루왕',           fx:{speed:2},                          desc:'시즌 도루 1위.'},
  asBat:      {kind:'art',rank:'C',prio:1,who:'bat',name:'올스타',           fx:{contact:1,power:1},                desc:'올스타 선정.'},
  eraKing:    {kind:'art',rank:'C',prio:4,who:'pit',name:'방어율 1위',       fx:{control:2},                        desc:'시즌 방어율 1위.'},
  kKing:      {kind:'art',rank:'C',prio:3,who:'pit',name:'탈삼진 1위',       fx:{velocity:1,movement:1},            desc:'시즌 탈삼진 1위.'},
  svKing:     {kind:'art',rank:'C',prio:3,who:'pit',name:'세이브왕',         fx:{clutch:2},                         desc:'시즌 세이브 1위.'},
  winKing:    {kind:'art',rank:'C',prio:2,who:'pit',name:'다승왕',           fx:{stamina:1,clutch:1},               desc:'시즌 다승 1위.'},
  lockdown:   {kind:'art',rank:'C',prio:2,who:'pit',name:'락다운',           fx:{clutch:1,_clutchHidden:1},         desc:'시즌 30세이브 이상.'},
  royTrait:   {kind:'art',rank:'C',prio:2,who:'all',name:'신인왕',           fx:{_workEthic:2,_consistency:2},      desc:'신인왕 수상.'},
  workhorse:  {kind:'art',rank:'C',prio:1,who:'pit',name:'더블 스토퍼',      fx:{stamina:1,clutch:1},               desc:'시즌 60경기 이상 등판.'},
  asPit:      {kind:'art',rank:'C',prio:1,who:'pit',name:'올스타 투수',      fx:{control:1,velocity:1},             desc:'올스타 선정.'},
  rd1Pick:    {kind:'art',rank:'C',prio:1,who:'all',name:'1라운더',          fx:{_workEthic:2,_ambition:2},         desc:'드래프트 1라운드 지명.'},
};
const _RANK_ORDER={S:4,A:3,B:2,C:1};
const _RANK_COLOR={S:'#a855f7',A:'#10b981',B:'#f59e0b',C:'#9ca3af'};

// ── 자연 특성 롤 (생성 시 15%: 순수 긍정 45 / 양날 40 / 약한 부정 15) ──
function rollNaturalTrait(p){
  if(Array.isArray(p._traits)&&p._traits.length)return; // 재롤 경로에서 기존(인공 포함) 특성 파괴 방지
  if(rand(1,100)>15)return;
  const roll=rand(1,100);
  const cat=roll<=45?'pos':roll<=85?'edge':'neg';
  const who=p.isPitcher?'pit':'bat';
  const pool=Object.keys(TRAITS).filter(id=>{
    const t=TRAITS[id];
    return t.kind==='nat'&&t.cat===cat&&(t.who==='all'||t.who===who);
  });
  if(pool.length===0)return;
  p._traits=[{id:pick(pool),slot:1,season:(typeof G!=='undefined'&&G.season)||1}];
}

// ── 인공 특성 부여 (설계 교체 플로우) ──
// STEP1 빈 슬롯 삽입 → STEP2 최저 결정(랭크→우선순위→선획득) → STEP3/4 랭크·우선순위 비교 교체
// 반환: {added,rank,replaced}|null (null = 미부여)
function awardTrait(p,id){
  const t=TRAITS[id];
  if(!t||t.kind!=='art')return null;
  if(!Array.isArray(p._traits))p._traits=[];
  // 카탈로그 미등록 id(구세이브 잔재·id 개명) 자가 정리 — 아래 랭크 비교에서 크래시 방지
  p._traits=p._traits.filter(e=>e.slot===1||TRAITS[e.id]);
  if(p._traits.some(e=>e.id===id))return null; // 동일 특성 중복 방지
  const season=(typeof G!=='undefined'&&G.season)||1;
  const arts=p._traits.filter(e=>e.slot>=2);
  if(arts.length<2){
    const slot=arts.some(e=>e.slot===2)?3:2;
    p._traits.push({id,slot,season});
    return {added:t.name,rank:t.rank,replaced:null};
  }
  const low=arts.slice().sort((a,b)=>{
    const ta=TRAITS[a.id],tb=TRAITS[b.id];
    if(_RANK_ORDER[ta.rank]!==_RANK_ORDER[tb.rank])return _RANK_ORDER[ta.rank]-_RANK_ORDER[tb.rank];
    if((ta.prio||0)!==(tb.prio||0))return (ta.prio||0)-(tb.prio||0);
    return (a.season||0)-(b.season||0); // 선획득이 최저
  })[0];
  const tl=TRAITS[low.id];
  const nr=_RANK_ORDER[t.rank],lr=_RANK_ORDER[tl.rank];
  if(!(nr>lr||(nr===lr&&(t.prio||0)>(tl.prio||0))))return null;
  p._traits[p._traits.indexOf(low)]={id,slot:low.slot,season};
  return {added:t.name,rank:t.rank,replaced:tl.name};
}

// ── 시상식 시점 일괄 평가 — season-awards.showAwards에서 호출 ──
// winners: {mvp,cyYoung,rookie,hrKing,pitTriple} ({p,team}|null)
function evaluateSeasonTraits(winners){
  // 재진입 멱등 가드 — 시상식 페이즈로 저장 후 리로드 시 showAwards가 재호출되어
  // _allStarStreak 등이 중복 증가하는 것 방지 (H2/H3 멱등성 버그와 동일 계열)
  if(G._traitsEvaluatedSeason===G.season)return [];
  G._traitsEvaluatedSeason=G.season;

  const results=[];
  const give=(p,id)=>{
    const r=awardTrait(p,id);
    if(r)results.push({p,name:p.name,text:`${r.added}(${r.rank})${r.replaced?' · 기존 '+r.replaced+' 대체':''}`});
  };
  // 1. 어워드 직결 (홈런왕은 0홈런 리더 방지 가드)
  if(winners.mvp)give(winners.mvp.p,'mvpTrait');
  if(winners.cyYoung)give(winners.cyYoung.p,'cyTrait');
  if(winners.rookie)give(winners.rookie.p,'royTrait');
  if(winners.hrKing&&(winners.hrKing.p.ss.hr||0)>0)give(winners.hrKing.p,'hrKingT');

  // 2. 추가 리그 타이틀 (시상 규정 기준)
  const allB=[],allP=[];
  G.teams.forEach(t=>t.roster.forEach(p=>{
    if(!p.ss)return;
    if(!p.isPitcher&&qualifyBatter(p,QUALIFY_RATIO_AWARDS))allB.push(p);
    if(p.isPitcher&&qualifyPitcher(p,QUALIFY_RATIO_AWARDS))allP.push(p);
  }));
  const top=(arr,fn,asc)=>arr.length?arr.slice().sort((a,b)=>asc?fn(a)-fn(b):fn(b)-fn(a))[0]:null;
  const avgK=top(allB,p=>ssAvg(p));         if(avgK)give(avgK,'avgKing');
  const hrK =top(allB,p=>p.ss.hr||0);
  const rbiK=top(allB,p=>p.ss.rbi||0);
  const sbK =top(allB,p=>p.ss.sb||0);       if(sbK&&(sbK.ss.sb||0)>0)give(sbK,'sbKing');
  const eraK=top(allP,p=>ssERA(p),true);    if(eraK)give(eraK,'eraKing');
  const kK  =top(allP,p=>p.ss.pk||0);       if(kK&&(kK.ss.pk||0)>0)give(kK,'kKing');
  const wK  =top(allP,p=>p.ss.w||0);        if(wK&&(wK.ss.w||0)>0)give(wK,'winKing');
  const svAll=G.teams.flatMap(t=>t.roster).filter(p=>p.isPitcher&&p.ss);
  const svK =top(svAll,p=>p.ss.sv||0);      if(svK&&(svK.ss.sv||0)>0)give(svK,'svKing');
  // 트리플 크라운(타): 타율·홈런·타점 동시 1위
  if(avgK&&avgK===hrK&&avgK===rbiK)give(avgK,'tcBat');
  // 트리플 크라운(투): 다승·방어율·탈삼진 "동시" 1위만 (합성 점수 수상자 자동 지급 금지 — tcBat과 동일 엄격성)
  if(wK&&(wK.ss.w||0)>0&&wK===eraK&&wK===kK)give(wK,'tcPit');

  // 3. 개인 시즌 기록 + 통산 (통산은 스토브 합산 전이므로 careerStats + 당해 ss 합으로 판정)
  G.teams.forEach(t=>t.roster.forEach(p=>{
    const s=p.ss;if(!s)return;
    const c=p._careerStats||{};
    const tot=k=>(c[k]||0)+(s[k]||0);
    if(!p.isPitcher){
      if((s.hr||0)>=40&&(s.sb||0)>=40)give(p,'club4040');
      else if((s.hr||0)>=30&&(s.sb||0)>=30)give(p,'club3030');
      else if((s.hr||0)>=20&&(s.sb||0)>=20)give(p,'club2020');
      const cAb=tot('ab'),cH=tot('h'),cHr=tot('hr');
      const cAvg=cAb>0?cH/cAb:0;
      if(cHr>=300&&cAb>=1500&&cAvg>=0.290)give(p,'legendBat');
      else if(cHr>=200)give(p,'c200hr');
      if(cH>=2000)give(p,'c2000h');
      if(cAb>=3000&&cAvg>=0.300)give(p,'craftsman');
    }else{
      if((s.sv||0)>=60)give(p,'endgame');
      else if((s.sv||0)>=50)give(p,'finisher');
      else if((s.sv||0)>=30)give(p,'lockdown');
      if((s.gp||0)>=60)give(p,'workhorse');
      const cW=tot('w'),cSv=tot('sv'),cK2=tot('pk');
      if(cW>=200||cSv>=300)give(p,'legendPit');
      else if(cW>=150)give(p,'c150w');
      if(cK2>=2000)give(p,'dr2000k');
      if(cSv>=200)give(p,'finisher');
    }
  }));

  // 4. 올스타 (당해 선정 + 3연속 추적)
  // 이름 조합이 900개뿐이라 동명이인이 흔함 → 이름+팀 키로 매칭 (G.allStars는 팀명 보유)
  // 연속성은 직전 시즌 선정 기록(_allStarLastSeason)으로 판정 — FA 풀 체류 등 공백 시즌 자동 단절
  const asKeys=new Set((G.allStars||[]).map(a=>a.name+'|'+a.team));
  G.teams.forEach(t=>t.roster.forEach(p=>{
    if(asKeys.has(p.name+'|'+t.name)){
      p._allStarStreak=(p._allStarLastSeason===G.season-1)?(p._allStarStreak||0)+1:1;
      p._allStarLastSeason=G.season;
      give(p,p.isPitcher?'asPit':'asBat');
      if(p._allStarStreak>=3)give(p,p.isPitcher?'streak3ASP':'streak3AS');
    }
  }));

  // 5. 우승 멤버 — 챔피언 엔트리는 G.postseasonBracket "객체"의 .results 배열 안에 있음
  //    1군 소속 기준: IL 등재자 포함, 2군/육성만 제외
  const champEntry=((G.postseasonBracket&&G.postseasonBracket.results)||[]).find(e=>e&&e.champion)||null;
  if(champEntry){
    const ct=G.teams.find(t=>t.name===champEntry.winner);
    if(ct)ct.roster.forEach(p=>{
      if(p.status==='futures'||p.status==='developmental')return;
      give(p,p.isPitcher?'champPit':'champBat');
    });
  }
  return results;
}

// ── UI: 특성 뱃지 HTML (스카우트 리포트 등) ──
// 스탯 한국어 명칭 단일 소스 (roster-active 가중치 힌트 등과 공유)
const STAT_KN={contact:'컨택',power:'파워',eye:'선구',speed:'주력',fielding:'수비',arm:'어깨',
  stuff:'구위',control:'제구',velocity:'구속',movement:'무브',stamina:'지구력',clutch:'위기',
  _durability:'내구성',_consistency:'일관성',_clutchHidden:'클러치',_workEthic:'프로의식',
  _versatility:'다재다능',_ambition:'야망',_loyalty:'충성심',_temperament:'참을성',
  _recovery:'연투회복',_pullTendency:'당김성향'};

// revealFx: 정확 보정 수치 노출 여부 — 히든 게이팅(분석팀 Lv.60+ / 테스트 모드)과 정합.
// 미공개 시 서술만 노출해 뱃지 툴팁으로 히든 수치를 역산하는 우회 차단.
function traitBadges(p,revealFx){
  if(!Array.isArray(p._traits)||p._traits.length===0)return '';
  return p._traits.map(e=>{
    const t=TRAITS[e.id];if(!t)return '';
    const color=t.kind==='nat'?'#67e8f9':_RANK_COLOR[t.rank];
    const label=t.kind==='nat'?t.name:`${t.name} ${t.rank}`;
    const fxText=revealFx?' ['+Object.keys(t.fx).map(k=>{
      const v=t.fx[k];return `${STAT_KN[k]||k} ${v>0?'+':''}${v}`;
    }).join(', ')+']':'';
    return `<span title="${t.desc}${fxText} — 경기력·협상 반응에 반영 (OVR·TV·연봉 공식 무영향)" style="background:${color}22;color:${color};border:1px solid ${color}55;font-size:0.6rem;padding:1px 6px;border-radius:3px;margin-right:4px;cursor:help;">${t.kind==='nat'?'★':''}${label}</span>`;
  }).join('');
}
