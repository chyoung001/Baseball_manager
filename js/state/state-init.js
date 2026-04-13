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
