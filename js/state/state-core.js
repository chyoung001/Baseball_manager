// ===================== STATE CORE (Global State + Roster Getters) =====================
// ===================== GAME STATE =====================
let G={season:1,gameNum:0,totalGames:TOTAL_REGULAR,teamIdx:0,myTeam:null,teams:[],marketPlayers:[],trainingCooldown:0,matchInProgress:false,matchSpeed:500,currentMarketTab:'bat',fanEventUsedThisGame:false,testMode:false,
  seasonModifiers:{},           // GM 회의로 통과된 이번 시즌 룰 (SeasonModifiers)
  // Season phase system (8-phase: preseason·first_half·allstar·second_half·postseason·awards·gm_meeting·stove_league)
  phase:'preseason',            // current phase id
  draftPool:[],                // 신인 드래프트 풀
  postseasonBracket:null,      // 포스트시즌 대진
  allStars:[],                 // 올스타 선정 선수
  awards:[],                   // 시상 기록
  previousSeasonStandings:[],  // 전년도 최종 순위 (드래프트 순서용)
};

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
function canCallUp(team){const expStart=EXPANDED_ENTRY_START-((G.seasonModifiers&&G.seasonModifiers.expandedEarly)||0);const max=(G.phase==='second_half'&&G.gameNum>=expStart)?EXPANDED_ROSTER_MAX:ACTIVE_ROSTER_MAX;return getActiveCount(team)<max;}
function canPlayerDebut(player){if(player.canDebutYear&&player.canDebutYear>G.season)return false;return true;}
function getActiveForeignCount(team){return team.roster.filter(p=>(p.status||'active')==='active'&&p.isForeign).length;}
function canAddForeign(team){return getActiveForeignCount(team)<FOREIGN_PLAYER_MAX;}
