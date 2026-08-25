// ===================== STATE INIT (Team Initialization) =====================
function initTeams(myIdx){
  // 리그를 짓는 동안에는 직전 리그가 OVR 상대평가로 새어 들어오지 않도록 비워 둔다.
  // genTeamRoster→genBatter/genPitcher가 생성 중에 ovr()(리그 평균 대비 Z-score)을 읽어
  // 연봉·인기도 분기를 타는데, G.teams 대입이 map 완료 후라 그때까지 참조되는 건 '직전 리그'였다.
  // 신규 게임은 G.teams가 이미 []라 raw 폴백을 타므로, 이 리셋은 2회차 이후를 첫 게임과 같게 맞춘다.
  G.teams=[]; invalidateOvrCalib();
  const built=TEAMS_DATA.map((td,i)=>{
    return{
      ...td,
      roster:genTeamRoster(td.concept,i===myIdx),
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
      slumpCareLevel:0,   // P2-5 슬럼프 완화 시설 (0~4)
      mentalCoachLevel:0, // P2-5 멘탈 코칭 룸 (0~4)
      coachStaff:{batting:0,eye:0,defense:0,speed:0,pitching:0,control:0,movement:0,stamina:0,medical:0},
      scoutCampUsed:0,
      approval:APPROVAL_START,   // P6 구단주 신임도 (0~100, 평가·경질은 myTeam만 대상)
      _seasonGoalRank:null,      // 이번 시즌 구단주 제시 목표 순위 (프리시즌에 설정)
    };
  });
  G.teams=built;
  G.myTeam=G.teams[myIdx];

  // 새 리그로 교체됐으니 캐시를 다시 버린다. 캐시 키가 season:gameNum:총인원이라
  // 새 게임도 '1:0:320'으로 직전 게임과 같은 키를 만들어, 무효화하지 않으면 직전 리그의
  // 평균으로 새 리그의 OVR이 산출된다. 세이브 로드 경로는 이미 같은 이유로 무효화하고 있었다.
  invalidateOvrCalib();

  // Init season stats & new fields for all players
  G.teams.forEach(t=>t.roster.forEach(p=>{
    initSeasonStats(p);
    if(p._serviceTime===undefined)p._serviceTime=0;
    if(p.canDebutYear===undefined)p.canDebutYear=null;
    if(p._careerStats===undefined)p._careerStats=null;
  }));
}
