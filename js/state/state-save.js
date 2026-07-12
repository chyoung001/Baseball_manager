// ===================== STATE SAVE (Save/Load/Export + Migration) =====================
// ===================== SAVE / LOAD (localStorage) =====================
const SAVE_KEY='dugout_save';
// 팀 정적 데이터 키 (TEAMS_DATA에서 복원 가능 → 저장 불필요)
const _TEAM_STATIC_KEYS=['name','emoji','desc','concept','conceptLabel','conceptColor','basePop','baseBudget','baseFacility','baseDevLevel'];
// 선수 기본값 (이 값이면 저장 생략)
const _P_DEFAULTS={xp:0,cooldown:0,isOnIL:false,ilGamesLeft:0,rehabGamesLeft:0,overseasUntil:null,prevRole:null,canDebutYear:null,_serviceTime:0,_careerStats:null,_teamTenure:0,_optionYearsUsed:0,_contractYears:1,_contractEvent:null,age:22,isMedicalTreated:false,agingImmunityYears:0,isForeign:false,_naturalPos:null,_overseasCount:0,_slumpGames:0};

function _compressPlayer(p){
  const c={};
  for(const k in p){
    if(k==='ss'){
      // ss: 모든 값이 0이면 생략
      const s=p.ss;if(s&&Object.values(s).some(v=>v!==0))c.ss=s;
      continue;
    }
    if(k in _P_DEFAULTS && p[k]===_P_DEFAULTS[k])continue; // 기본값 생략
    c[k]=p[k];
  }
  return c;
}
function _expandPlayer(c){
  const p=Object.assign({},_P_DEFAULTS,c);
  if(!p._uid)p._uid=Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  if(!p.ss)initSeasonStats(p);
  return p;
}
function _compressTeam(t){
  const c={};
  for(const k in t){
    if(k==='roster'){c.roster=t.roster.map(_compressPlayer);continue;}
    if(_TEAM_STATIC_KEYS.includes(k))continue; // 정적 데이터 생략
    c[k]=t[k];
  }
  return c;
}
function _expandTeam(c,idx){
  const base=TEAMS_DATA[idx]||{};
  const t=Object.assign({},base,c);
  t.roster=c.roster.map(_expandPlayer);
  return t;
}

// 저장/내보내기 공통 스냅샷 빌더 — save·export가 수기 중복되며 필드 드리프트를 유발하던 것을 단일화.
// (이전엔 exportGame이 _lastSeasonRev·_lastReserveDrain을 누락 → export→import 시 결산 표시 스테일)
function _buildSnapshot(){
  return {
    _v:5, season:G.season, gameNum:G.gameNum, totalGames:G.totalGames,
    teamIdx:G.teamIdx, trainingCooldown:G.trainingCooldown||0, matchSpeed:G.matchSpeed,
    currentMarketTab:G.currentMarketTab, fanEventUsedThisGame:G.fanEventUsedThisGame,
    testMode:G.testMode,
    phase:G.phase,
    _stoveSettledSeason:G._stoveSettledSeason||0,
    _traitsEvaluatedSeason:G._traitsEvaluatedSeason||0, // P3-2 시상 특성 평가 멱등 가드
    previousSeasonStandings:G.previousSeasonStandings,
    draftPool:(G.draftPool||[]).map(_compressPlayer),
    postseasonBracket:G.postseasonBracket,
    seasonModifiers:G.seasonModifiers||{},
    allStars:G.allStars,
    awards:G.awards,
    teams:G.teams.map(_compressTeam),
    marketPlayers:G.marketPlayers.map(_compressPlayer),
    _lastSeasonRev:G._lastSeasonRev||null, // 스토브 결산 스냅샷 (재로드 시 표시 정합)
    _lastReserveDrain:G._lastReserveDrain||0, // 준비금 감가 스냅샷 (결산 화면 재로드 정합)
  };
}

function saveGame(){
  try{
    localStorage.setItem(SAVE_KEY,JSON.stringify(_buildSnapshot()));
  }catch(e){
    console.warn('saveGame failed:',e);
    if(typeof showToast==='function') showToast('⚠️ 저장 실패! 용량 초과일 수 있습니다. 파일 내보내기를 권장합니다.');
  }
}

function loadGame(){
  try{
    // sessionStorage → localStorage 마이그레이션 (일회성)
    const _legacy=sessionStorage.getItem(SAVE_KEY);
    if(_legacy&&!localStorage.getItem(SAVE_KEY)){
      localStorage.setItem(SAVE_KEY,_legacy);
      sessionStorage.removeItem(SAVE_KEY);
    }
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return false;
    const d=JSON.parse(raw);
    if(!d.teams||!Array.isArray(d.teams)||d.teams.length===0)return clearSave(),false;
    if(d.teamIdx==null||d.teamIdx<0||d.teamIdx>=d.teams.length)return clearSave(),false;
    return _restoreFromData(d);
  }catch(e){console.warn('loadGame failed:',e);clearSave();return false;}
}

function _restoreFromData(d){
  G.season=d.season||1; G.gameNum=d.gameNum||0; G.totalGames=d.totalGames||TOTAL_REGULAR;
  G.teamIdx=d.teamIdx||0; G.trainingCooldown=d.trainingCooldown||0;
  G.matchSpeed=d.matchSpeed||500; G.currentMarketTab=d.currentMarketTab||'bat';
  G.fanEventUsedThisGame=d.fanEventUsedThisGame||false; G.testMode=d.testMode!=null?d.testMode:false;
  G.matchInProgress=false;
  // Phase & new fields 복원
  G.phase=d.phase||'preseason';
  G._stoveSettledSeason=d._stoveSettledSeason||0;
  G._traitsEvaluatedSeason=d._traitsEvaluatedSeason||0;
  G._lastSeasonRev=d._lastSeasonRev||null; // 미보유 세이브 로드 시 이전 게임 잔재도 초기화
  G._lastReserveDrain=d._lastReserveDrain||0; // 준비금 감가 스냅샷 복원 (미보유 세이브는 0)
  G.previousSeasonStandings=d.previousSeasonStandings||[];
  G.postseasonBracket=d.postseasonBracket||null;
  G.seasonModifiers=d.seasonModifiers||{};
  G.allStars=d.allStars||[];
  G.awards=d.awards||[];
  // v2+ 압축 포맷 vs v1 원본 포맷 호환
  if(d._v>=2){
    G.teams=d.teams.map((c,i)=>_expandTeam(c,i));
    G.marketPlayers=(d.marketPlayers||[]).map(_expandPlayer);
    G.draftPool=(d.draftPool||[]).map(_expandPlayer);
  }else{
    // v1: 원본 그대로 (하위 호환)
    G.teams=d.teams;
    G.marketPlayers=d.marketPlayers||[];
    G.draftPool=[];
    G.teams.forEach(t=>t.roster.forEach(p=>{if(!p.ss)initSeasonStats(p);}));
  }
  G.myTeam=G.teams[G.teamIdx];
  // RP→MR 마이그레이션 (구버전 세이브 호환)
  G.teams.forEach(t=>t.roster.forEach(p=>{if(p.pos==='RP')p.pos='MR';}));
  // v4 스케일 마이그레이션: 일반 능력치 20-80 → 1~100 (선형 매핑, 구세이브 1회 변환)
  if(!d._v||d._v<4){
    const _SCALE_KEYS=['contact','power','eye','speed','fielding','arm','stuff','control','velocity','movement','stamina','clutch'];
    const _to100=x=>clamp(Math.round(1.65*x-32),STAT_MIN,STAT_MAX); // 20→1, 50→51, 80→100
    const _scale=p=>_SCALE_KEYS.forEach(k=>{if(typeof p[k]==='number')p[k]=_to100(p[k]);});
    G.teams.forEach(t=>t.roster.forEach(_scale));
    (G.marketPlayers||[]).forEach(_scale);
    (G.draftPool||[]).forEach(_scale);
  }
  // v5 히든 스탯 마이그레이션: 7~20 → 1~100 (×5 선형 매핑, P2-2)
  if(!d._v||d._v<5){
    const _HIDDEN_KEYS=['_potential','_durability','_consistency','_clutchHidden','_workEthic'];
    const _hidScale=p=>_HIDDEN_KEYS.forEach(k=>{
      if(typeof p[k]==='number'&&p[k]<=20)p[k]=clamp(p[k]*5,1,100);
    });
    G.teams.forEach(t=>t.roster.forEach(_hidScale));
    (G.marketPlayers||[]).forEach(_hidScale);
    (G.draftPool||[]).forEach(_hidScale);
  }
  // v2→v3 마이그레이션: phase명 매핑, 신규 선수 필드 초기화
  if(!d._v||d._v<3){
    if(G.phase==='spring_camp')G.phase='preseason';
    if(G.phase==='expanded')G.phase='second_half';
    G.teams.forEach(t=>t.roster.forEach(p=>{
      if(p._serviceTime===undefined)p._serviceTime=p._seasonsPlayed||0;
      if(p.canDebutYear===undefined)p.canDebutYear=null;
      if(p._careerStats===undefined)p._careerStats=null;
    }));
  }
  // 필드 보강 마이그레이션 (전 버전 공통 — undefined 필드 기본값 채움)
  G.teams.forEach(t=>t.roster.forEach(p=>{
    if(p._teamTenure===undefined)p._teamTenure=p._serviceTime||0;
    if(p._optionYearsUsed===undefined)p._optionYearsUsed=0;
    if(p._contractYears===undefined)p._contractYears=1;
    if(p.age===undefined)p.age=18+(p._seasonsPlayed||0);
    if(p._contractEvent===undefined)p._contractEvent=null;
    if(p.isMedicalTreated===undefined)p.isMedicalTreated=false;
    if(p.agingImmunityYears===undefined)p.agingImmunityYears=0;
    if(p.isForeign===undefined)p.isForeign=false;
    if(p._workEthic===undefined)p._workEthic=_genHidden?_genHidden():rand(35,100);
    if(p._slumpGames===undefined)p._slumpGames=0;
    // P2-2 신규 히든 6종 백필 (구세이브)
    if(p._versatility===undefined)p._versatility=_genHidden();
    if(p._ambition===undefined)p._ambition=_genHidden();
    if(p._loyalty===undefined)p._loyalty=_genHidden();
    if(p._temperament===undefined)p._temperament=_genHidden();
    if(p.isPitcher&&p._recovery===undefined)p._recovery=_genHidden();
    if(!p.isPitcher&&p._pullTendency===undefined)p._pullTendency=_genPullTendency();
    // P2-1 서브 포지션 백필 (타자): 본 포지션 기록 + 생성 분포 롤
    if(!p.isPitcher){
      if(p._naturalPos==null&&p.pos!=='DH')p._naturalPos=p.pos;
      if(p._subPos===undefined)p._subPos=_rollSubPos(p._naturalPos||p.pos);
    }
    // P2-3 서비스타임 경기 카운터 백필: 구세이브 중간 로드 시 이미 치른 경기만큼 크레딧
    // (미백필 시 로드 시점부터만 적립되어 마이그레이션 시즌 서비스타임이 리그 전체 과소 계상)
    if(p._svcGames===undefined)
      p._svcGames=((p.status||'active')==='active'&&p.role!=='overseas')?(G.gameNum||0):0;
  }));
  // 팀 필드 마이그레이션
  G.teams.forEach(t=>{
    if(t.scoutCampUsed===undefined)t.scoutCampUsed=0;
    // rdLevel → scoutingLevel + analyticsLevel 분리 마이그레이션
    if(t.rdLevel!==undefined){
      if(t.scoutingLevel===undefined) t.scoutingLevel=t.rdLevel;
      if(t.analyticsLevel===undefined) t.analyticsLevel=t.rdLevel;
      delete t.rdLevel;
    }
    if(t.scoutingLevel===undefined) t.scoutingLevel=0;
    if(t.analyticsLevel===undefined) t.analyticsLevel=0;
    if(t.slumpCareLevel===undefined) t.slumpCareLevel=0;   // P2-5 백필
    if(t.mentalCoachLevel===undefined) t.mentalCoachLevel=0;
  });
  // OVR Z-score 보정 캐시 무효화 — 로드/마이그레이션으로 스탯이 변해도
  // 캐시 키(시즌:경기:인원합)가 동일하면 낡은 보정치를 쓰는 문제 방지
  invalidateOvrCalib();
  return true;
}

function clearSave(){localStorage.removeItem(SAVE_KEY);sessionStorage.removeItem(SAVE_KEY);}

// ── 내보내기 (JSON 파일 다운로드) ──
function exportGame(){
  try{
    const snap={..._buildSnapshot(), _exportDate:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(snap)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`dugout_${G.myTeam.name}_S${G.season}_G${G.gameNum}.json`;
    a.click();URL.revokeObjectURL(url);
    showToast('💾 세이브 파일 다운로드 완료');
  }catch(e){alert('내보내기 실패: '+e.message);}
}

// ── 불러오기 (JSON 파일 업로드) ──
function importGame(){
  const input=document.createElement('input');
  input.type='file';input.accept='.json';
  input.onchange=function(){
    const file=input.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=function(){
      try{
        const d=JSON.parse(reader.result);
        if(!d.teams||!Array.isArray(d.teams)||d.teams.length===0)throw new Error('유효하지 않은 세이브 파일');
        if(d.teamIdx==null||d.teamIdx<0||d.teamIdx>=d.teams.length)throw new Error('팀 인덱스 오류');
        _restoreFromData(d);
        saveGame();
        $('titleScreen').classList.remove('active');
        $('gameHeader').style.display='block';
        updateHeader();switchTab('dashboard');
        showToast('📂 세이브 파일 불러오기 완료');
      }catch(e){alert('불러오기 실패: '+e.message);}
    };
    reader.readAsText(file);
  };
  input.click();
}

// ── 새 게임 ──
function newGame(){
  if(!confirm('현재 진행 상황이 모두 삭제됩니다. 새 게임을 시작하시겠습니까?'))return;
  clearSave();
  location.reload();
}
