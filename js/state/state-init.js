// ===================== STATE INIT (Team Initialization) =====================
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

  // Init season stats & new fields for all players
  G.teams.forEach(t=>t.roster.forEach(p=>{
    initSeasonStats(p);
    if(p._serviceTime===undefined)p._serviceTime=0;
    if(p.canDebutYear===undefined)p.canDebutYear=null;
    if(p._careerStats===undefined)p._careerStats=null;
  }));
}
