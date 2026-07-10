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

function saveGame(){
  try{
    const snap={
      _v:3, season:G.season, gameNum:G.gameNum, totalGames:G.totalGames,
      teamIdx:G.teamIdx, trainingCooldown:G.trainingCooldown||0, matchSpeed:G.matchSpeed,
      currentMarketTab:G.currentMarketTab, fanEventUsedThisGame:G.fanEventUsedThisGame,
      testMode:G.testMode,
      phase:G.phase,
      _stoveSettledSeason:G._stoveSettledSeason||0,
      previousSeasonStandings:G.previousSeasonStandings,
      draftPool:(G.draftPool||[]).map(_compressPlayer),
      postseasonBracket:G.postseasonBracket,
      allStars:G.allStars,
      awards:G.awards,
      teams:G.teams.map(_compressTeam),
      marketPlayers:G.marketPlayers.map(_compressPlayer),
    };
    localStorage.setItem(SAVE_KEY,JSON.stringify(snap));
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
  G.previousSeasonStandings=d.previousSeasonStandings||[];
  G.postseasonBracket=d.postseasonBracket||null;
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
  // v3→v4 마이그레이션: 트레이드/옵션 필드 초기화
  G.teams.forEach(t=>t.roster.forEach(p=>{
    if(p._teamTenure===undefined)p._teamTenure=p._serviceTime||0;
    if(p._optionYearsUsed===undefined)p._optionYearsUsed=0;
    if(p._contractYears===undefined)p._contractYears=1;
    if(p.age===undefined)p.age=18+(p._seasonsPlayed||0);
    if(p._contractEvent===undefined)p._contractEvent=null;
    if(p.isMedicalTreated===undefined)p.isMedicalTreated=false;
    if(p.agingImmunityYears===undefined)p.agingImmunityYears=0;
    if(p.isForeign===undefined)p.isForeign=false;
    if(p._workEthic===undefined)p._workEthic=_genHidden?_genHidden():rand(7,20);
    if(p._slumpGames===undefined)p._slumpGames=0;
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
  });
  return true;
}

function clearSave(){localStorage.removeItem(SAVE_KEY);sessionStorage.removeItem(SAVE_KEY);}

// ── 내보내기 (JSON 파일 다운로드) ──
function exportGame(){
  try{
    const snap={
      _v:3, _exportDate:new Date().toISOString(),
      season:G.season, gameNum:G.gameNum, totalGames:G.totalGames,
      teamIdx:G.teamIdx, trainingCooldown:G.trainingCooldown||0, matchSpeed:G.matchSpeed,
      currentMarketTab:G.currentMarketTab, fanEventUsedThisGame:G.fanEventUsedThisGame,
      testMode:G.testMode,
      phase:G.phase,
      _stoveSettledSeason:G._stoveSettledSeason||0,
      previousSeasonStandings:G.previousSeasonStandings,
      draftPool:(G.draftPool||[]).map(_compressPlayer),
      postseasonBracket:G.postseasonBracket,
      allStars:G.allStars,
      awards:G.awards,
      teams:G.teams.map(_compressTeam),
      marketPlayers:G.marketPlayers.map(_compressPlayer),
    };
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
