// ===================== GAME STATE =====================
let G={season:1,gameNum:0,totalGames:TOTAL_REGULAR,teamIdx:0,myTeam:null,teams:[],marketPlayers:[],trainedBatter:false,trainedPitcher:false,matchInProgress:false,matchSpeed:500,currentMarketTab:'bat',fanEventUsedThisGame:false,testMode:true,
  // Season phase system (7-phase)
  phase:'preseason',            // current phase id
  draftPool:[],                // 신인 드래프트 풀
  postseasonBracket:null,      // 포스트시즌 대진
  allStars:[],                 // 올스타 선정 선수
  awards:[],                   // 시상 기록
  hallOfFame:[],               // 명예의 전당
  previousSeasonStandings:[],  // 전년도 최종 순위 (드래프트 순서용)
};

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
      teamIdx:G.teamIdx, trainedBatter:G.trainedBatter,trainedPitcher:G.trainedPitcher, matchSpeed:G.matchSpeed,
      currentMarketTab:G.currentMarketTab, fanEventUsedThisGame:G.fanEventUsedThisGame,
      testMode:G.testMode,
      phase:G.phase,
      hallOfFame:G.hallOfFame,
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
  G.teamIdx=d.teamIdx||0; G.trainedBatter=d.trainedBatter||false;G.trainedPitcher=d.trainedPitcher||false;
  G.matchSpeed=d.matchSpeed||500; G.currentMarketTab=d.currentMarketTab||'bat';
  G.fanEventUsedThisGame=d.fanEventUsedThisGame||false; G.testMode=d.testMode!=null?d.testMode:true;
  G.matchInProgress=false;
  // Phase & new fields 복원
  G.phase=d.phase||'preseason';
  G.hallOfFame=d.hallOfFame||[];
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
      teamIdx:G.teamIdx, trainedBatter:G.trainedBatter,trainedPitcher:G.trainedPitcher, matchSpeed:G.matchSpeed,
      currentMarketTab:G.currentMarketTab, fanEventUsedThisGame:G.fanEventUsedThisGame,
      testMode:G.testMode,
      phase:G.phase,
      hallOfFame:G.hallOfFame,
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

function initTeams(myIdx){
  G.teams=TEAMS_DATA.map((td,i)=>{
    const tier=i===myIdx?1:rand(0,2);
    return{
      ...td,
      roster:genTeamRoster(tier,td.concept,i===myIdx),
      wins:0,losses:0,rs:0,ra:0,
      streak:0,recentResults:[],  // streak: +N=연승,-N=연패 / recentResults: 최근5 ['W','L',...]
      budget:td.baseBudget,
      popularity:td.basePop,
      facilityLevel:td.baseFacility,
      devLevel:td.baseDevLevel,
      coachLevel:rand(30,60),
      rotationIdx:0,
      // Investment fields
      stadiumLevel:0,
      medicalLevel:0,
      scoutingLevel:0,
      analyticsLevel:0,
      coachStaff:{batting:0,eye:0,defense:0,speed:0,pitching:0,control:0,movement:0,stamina:0,medical:0},
      moralBoost:0,
      eventRevenue:0,
      scoutCampUsed:0,
    };
  });
  G.myTeam=G.teams[myIdx];

  // ── 테스트용 고정 선수 삽입 ──
  const vikings=G.teams[0]; // 바이킹스
  const testP=genPitcher('SP','S','power_hit');
  testP.name='강두기';
  testP.age=27;testP._seasonsPlayed=9;testP._serviceTime=9;testP._teamTenure=5;
  // OVR 78 목표로 스탯 강제 조정
  const _ts=['stuff','control','velocity','movement','stamina','clutch'];
  _ts.forEach(s=>{testP[s]=78;});
  let _tOvr=ovr(testP),_tAtt=0;
  while(Math.abs(_tOvr-78)>1&&_tAtt<30){const d=78-_tOvr;const s=pick(_ts);testP[s]=clamp(testP[s]+Math.round(d*0.5),20,80);_tOvr=ovr(testP);_tAtt++;}
  testP._potential=18;testP._contractYears=3;testP.salary=20;testP.condition=95;
  testP.role='rotation';testP.status='active';
  initSeasonStats(testP);
  vikings.roster.push(testP);

  // Init season stats & new fields for all players
  G.teams.forEach(t=>t.roster.forEach(p=>{
    initSeasonStats(p);
    if(p._serviceTime===undefined)p._serviceTime=0;
    if(p.canDebutYear===undefined)p.canDebutYear=null;
    if(p._careerStats===undefined)p._careerStats=null;
  }));
}

// Roster helper getters
function getBatters(team){return team.roster.filter(p=>!p.isPitcher);}
function getPitchers(team){return team.roster.filter(p=>p.isPitcher);}
// Active-only getters (status='active', role≠'overseas') — used in game simulation
function getStartingBatters(team){return getBatters(team).filter(p=>p.role==='starting'&&(p.status||'active')==='active');}
function getBenchBatters(team){return getBatters(team).filter(p=>p.role==='bench'&&(p.status||'active')==='active');}
function getRotation(team){return getPitchers(team).filter(p=>p.role==='rotation'&&(p.status||'active')==='active');}
function getBullpen(team){return getPitchers(team).filter(p=>p.role==='bullpen'&&(p.status||'active')==='active');}
// Organization-level getters
function getFuturesPlayers(team){return team.roster.filter(p=>p.status==='futures');}
function getDevPlayers(team){return team.roster.filter(p=>p.status==='developmental');}
function getILPlayers(team){return team.roster.filter(p=>p.status==='il');}
function getActiveCount(team){return team.roster.filter(p=>(p.status||'active')==='active'&&p.role!=='overseas').length;}
function canCallUp(team){const max=(G.phase==='second_half'&&G.gameNum>=EXPANDED_ENTRY_START)?EXPANDED_ROSTER_MAX:ACTIVE_ROSTER_MAX;return getActiveCount(team)<max;}
function canPlayerDebut(player){if(player.canDebutYear&&player.canDebutYear>G.season)return false;return true;}
function getActiveForeignCount(team){return team.roster.filter(p=>(p.status||'active')==='active'&&p.isForeign).length;}
function canAddForeign(team){return getActiveForeignCount(team)<FOREIGN_PLAYER_MAX;}

// ── Position counters for active roster ────────────────────
function getActiveRoster(team){return team.roster.filter(p=>(p.status||'active')==='active'&&p.role!=='overseas');}
function countActivePitchers(team){return getActiveRoster(team).filter(p=>p.isPitcher).length;}
function countActiveSP(team){return getActiveRoster(team).filter(p=>p.isPitcher&&p.role==='rotation').length;}
function countActiveBullpen(team){return getActiveRoster(team).filter(p=>p.isPitcher&&p.role==='bullpen').length;}
function countActiveBatters(team){return getActiveRoster(team).filter(p=>!p.isPitcher).length;}
function countActiveCatchers(team){return getActiveRoster(team).filter(p=>!p.isPitcher&&p.pos==='C').length;}
function countActiveIF(team){return getActiveRoster(team).filter(p=>!p.isPitcher&&['C','1B','2B','3B','SS'].includes(p.pos)).length;}
function countActiveOF(team){return getActiveRoster(team).filter(p=>!p.isPitcher&&['LF','CF','RF'].includes(p.pos)).length;}

// ── Validate active roster meets all minimums ──────────────
// Returns {ok:true} or {ok:false, violations:[...messages]}
function validateActiveRoster(team){
  const v=[];
  const ac=getActiveCount(team);
  if(ac<ACTIVE_MIN_TOTAL)        v.push(`1군 총원 부족: ${ac}/${ACTIVE_MIN_TOTAL}명`);
  if(countActivePitchers(team)<ACTIVE_MIN_PITCHERS) v.push(`투수 부족: ${countActivePitchers(team)}/${ACTIVE_MIN_PITCHERS}명`);
  if(countActiveSP(team)<ACTIVE_MIN_SP)             v.push(`선발투수(SP) 부족: ${countActiveSP(team)}/${ACTIVE_MIN_SP}명`);
  if(countActiveBullpen(team)<ACTIVE_MIN_BULLPEN)   v.push(`불펜(RP/CP) 부족: ${countActiveBullpen(team)}/${ACTIVE_MIN_BULLPEN}명`);
  if(countActiveBatters(team)<ACTIVE_MIN_BATTERS)   v.push(`타자 부족: ${countActiveBatters(team)}/${ACTIVE_MIN_BATTERS}명`);
  if(countActiveCatchers(team)<ACTIVE_MIN_CATCHERS) v.push(`포수(C) 부족: ${countActiveCatchers(team)}/${ACTIVE_MIN_CATCHERS}명`);
  if(countActiveIF(team)<ACTIVE_MIN_IF)             v.push(`내야수 부족: ${countActiveIF(team)}/${ACTIVE_MIN_IF}명`);
  if(countActiveOF(team)<ACTIVE_MIN_OF)             v.push(`외야수 부족: ${countActiveOF(team)}/${ACTIVE_MIN_OF}명`);
  // 선발 라인업 9명 체크 (DH 포함)
  const starters=getStartingBatters(team);
  const lineupCount=starters.length;
  if(lineupCount<9) v.push(`선발 라인업 미완성: ${lineupCount}/9명 (DH 지정 필요)`);

  // 포지션 중복 체크 (DH는 1명만, 수비 포지션은 각 1명씩)
  if(lineupCount>=2){
    const posCount={};
    starters.forEach(p=>{posCount[p.pos]=(posCount[p.pos]||0)+1;});
    const requiredPos=['C','1B','2B','3B','SS','LF','CF','RF'];
    requiredPos.forEach(pos=>{
      if(!posCount[pos]) v.push(`${ALL_POS_NAMES[pos]||pos} 없음 — 포지션 배치 필요`);
      if((posCount[pos]||0)>1) v.push(`${ALL_POS_NAMES[pos]||pos} ${posCount[pos]}명 중복 — 포지션 변경 필요`);
    });
    if((posCount['DH']||0)>1) v.push(`지명타자 ${posCount['DH']}명 중복`);
  }

  return v.length===0?{ok:true,violations:[]}:{ok:false,violations:v};
}

// ── Check if removing a player would violate minimums ──────
function canRemoveFromActive(team,player){
  // Simulate removal and check
  const oldStatus=player.status;player.status='_temp';
  const result=validateActiveRoster(team);
  player.status=oldStatus;
  return result.ok;
}
