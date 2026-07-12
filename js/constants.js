// ===================== CONSTANTS =====================
const FN=['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','류','전','홍','고','문','양','손','배','백','허','유','남'];
const LN=['민수','준호','성현','재원','동현','지훈','현우','승민','태양','우진','정우','시우','도윤','은호','하준','건우','주원','서준','예준','수호','진우','민재','현준','유찬','세훈','태민','강현','지호','영재','상우'];
// 남미 외국인 이름
const LATIN_FN=['카를로스','미겔','루이스','호세','페드로','라파엘','디에고','마르코','안드레스','헥토르','로베르토','알레한드로','페르난도','에두아르도','다니엘','세바스찬','가브리엘','빅토르','리카르도','산티아고','마누엘','하비에르','오스카','라몬','아드리안','엔리케','크리스찬','파블로','이반','토마스'];
const LATIN_LN=['로드리게스','마르티네스','가르시아','에르난데스','로페스','곤잘레스','페레스','산체스','라미레스','토레스','플로레스','리베라','고메스','디아스','모랄레스','히메네스','루이스','레예스','크루스','오르티스','카스티요','멘도사','바르가스','로메로','알바레스','구에레로','실바','메디나','아길라르','델가도'];

// Batter positions
const BAT_POS=['C','1B','2B','3B','SS','LF','CF','RF','DH'];
const BAT_POS_NAMES={C:'포수','1B':'1루수','2B':'2루수','3B':'3루수',SS:'유격수',LF:'좌익수',CF:'중견수',RF:'우익수',DH:'지명타자'};

// Pitcher roles
const PITCH_ROLES=['SP','CP','SU','MR','LR']; // Starter, Closer, Setup, Middle Relief, Long Relief
const PITCH_ROLE_NAMES={SP:'선발',CP:'마무리',SU:'필승조',MR:'추격조',LR:'롱릴리프',RP:'중계'};
const ALL_POS_NAMES={...BAT_POS_NAMES,...PITCH_ROLE_NAMES};

const TEAMS_DATA=[
  {name:'바이킹스',emoji:'🪓',desc:'파이어볼러 에이스의 선발 왕국',concept:'power_hit',conceptLabel:'투수 왕국',conceptColor:'#f59e0b',basePop:65,baseBudget:100,baseFacility:60,baseDevLevel:65},
  {name:'세이버스',emoji:'⚔️',desc:'거대 자본의 악의 제국',concept:'pitching',conceptLabel:'악의 제국',conceptColor:'#8b5cf6',basePop:80,baseBudget:160,baseFacility:75,baseDevLevel:55},
  {name:'드림즈',emoji:'🌟',desc:'무한한 잠재력의 유망주 리빌딩',concept:'prospect',conceptLabel:'육성 명가',conceptColor:'#06b6d4',basePop:45,baseBudget:75,baseFacility:50,baseDevLevel:90},
  {name:'이글스',emoji:'🦅',desc:'6회부터 잠가버리는 철벽 불펜',concept:'bullpen',conceptLabel:'불펜 야구',conceptColor:'#ec4899',basePop:60,baseBudget:95,baseFacility:60,baseDevLevel:55},
  {name:'트윈스',emoji:'👯',desc:'도루·번트·히트앤런 스몰볼의 달인',concept:'speed',conceptLabel:'발야구',conceptColor:'#10b981',basePop:55,baseBudget:85,baseFacility:50,baseDevLevel:60},
  {name:'앤젤스',emoji:'😇',desc:'출루율과 FIP로 움직이는 세이버메트릭스',concept:'sabermetrics',conceptLabel:'세이버메트릭스',conceptColor:'#3b82f6',basePop:50,baseBudget:70,baseFacility:55,baseDevLevel:70},
  {name:'데빌즈',emoji:'😈',desc:'1번부터 9번까지 머신건 컨택 타선',concept:'contact_hit',conceptLabel:'머신건 타선',conceptColor:'#ef4444',basePop:70,baseBudget:110,baseFacility:65,baseDevLevel:60},
  {name:'타이거즈',emoji:'🐯',desc:'센터라인 수비로 점수를 틀어막는 질식 야구',concept:'defense',conceptLabel:'수비 군단',conceptColor:'#f97316',basePop:60,baseBudget:90,baseFacility:65,baseDevLevel:55},
];

const TRAININGS=[
  {icon:'🏏',name:'컨택 훈련',desc:'타자 컨택 상승',stat:'contact',target:'batter'},
  {icon:'💪',name:'파워 훈련',desc:'타자 파워 상승',stat:'power',target:'batter'},
  {icon:'👁️',name:'선구안 훈련',desc:'타자 선구안 상승',stat:'eye',target:'batter'},
  {icon:'🏃',name:'주루 훈련',desc:'타자 스피드 상승',stat:'speed',target:'batter'},
  {icon:'🧤',name:'수비 훈련',desc:'타자 수비 범위·포구 상승',stat:'fielding',target:'batter'},
  {icon:'💪',name:'송구 훈련',desc:'타자 어깨·송구 정확도 상승',stat:'arm',target:'batter'},
  {icon:'⚡',name:'구위 훈련',desc:'투수 구위·탈삼진 상승',stat:'stuff',target:'pitcher'},
  {icon:'🎯',name:'제구 훈련',desc:'투수 제구력 상승',stat:'control',target:'pitcher'},
  {icon:'🔥',name:'구속 훈련',desc:'투수 구속 상승',stat:'velocity',target:'pitcher'},
  {icon:'🌀',name:'변화구 훈련',desc:'투수 무브먼트 상승',stat:'movement',target:'pitcher'},
  {icon:'🔋',name:'체력 훈련',desc:'투수 지구력 상승',stat:'stamina',target:'pitcher'},
  {icon:'🧠',name:'멘탈 훈련',desc:'투수 위기관리 능력 상승',stat:'clutch',target:'pitcher'},
  {icon:'🧘',name:'컨디션 회복',desc:'전원 컨디션 +10~20',stat:'condition',target:'all'},
];

const FACILITIES=[
  {icon:'🏟️',name:'경기장 시설',desc:'관중 수입 증가',key:'facilityLevel'},
  {icon:'🌱',name:'육성 시스템',desc:'훈련 효과 증가',key:'devLevel'},
  {icon:'🧑‍🏫',name:'코치진 영입',desc:'훈련 보너스 추가',key:'coachLevel'},
];

// ===================== INVESTMENT CONSTANTS (단위: 억원) =====================
// ── P2-4 사치세 3단계 (설계: 계약/연봉 로직 — 소프트캡 200억 CBT) ──
const LUXURY_SOFT_CAP = 200;          // 소프트캡 (GM 회의로 유동)
const LUXURY_TIERS = [                // 초과분 구간별 세율: 200~220 20% / 220~250 40% / 250+ 60%
  {upTo:20, rate:0.20},
  {upTo:50, rate:0.40},
  {upTo:Infinity, rate:0.60},
];
const LUXURY_REPEAT_SURCHARGE = 0.10; // 연속 초과 시즌당 +10%p 체증
const LUXURY_REPEAT_CAP = 0.20;       // 체증 상한 +20%p (3시즌+ 고정)
const SALARY_FLOOR = 50;              // 샐러리 플로어 (탱킹 방지) — 설계 목표 80억은 P2-3 연봉 현실화(신인 슬롯·Arb 인상률) 후 상향 (현행 리그 평균 페이롤 ~60억 기준 과도기 값)
const HARD_CAP = 280;                 // AI 영입 가드 상한 (설계상 하드캡은 폐지 — 내부 안전장치)

// ── P2-5 신규 4레벨 시설 (설계: 재정 밸런스 — 7시설 체계 중 신규 2종 선행 도입) ──
// 기존 5축(구장/육성/스카우팅/의료/분석)의 0~100 → 4레벨 전면 전환은 P3 파크팩터와 함께 진행
const FACILITY4_COSTS = [5, 12, 25, 40];            // 레벨 1~4 업그레이드 비용 (슬럼프케어·멘탈코칭 공통)
const SLUMP_CARE_RELIEF = [0, 0.10, 0.25, 0.40, 0.50]; // 슬럼프 완화율 (L0~L4)
const MENTAL_COACH_AMP = [0, 0.15, 0.25, 0.35, 0.50];  // 클러치 보정 증폭률 (L0~L4)
const FACILITY4_UPKEEP = [0, 0, 0, 0.10, 0.15];     // 연 유지비 (해당 레벨 도달 비용 대비, L3+)

const STADIUM_REVENUE_BONUS = 0.12; // 레벨당 +12% 시즌 수익
const STADIUM_MAX_LEVEL = 5;
const STADIUM_COST_PER_LEVEL = 20;  // stadiumLevel * 20억

const OVERSEAS_COST = 15;       // 억
const OVERSEAS_DURATION = 5;    // 경기 수
const OVERSEAS_BOOST_MIN = 3;
const OVERSEAS_BOOST_MAX = 7;

const COACH_STAFF_COST_BASE = 8; // 레벨당 costBase*(lv+1)억
const COACH_TYPES = [
  // 타자 코치
  {key:'batting',  icon:'🏏', name:'타격 코치',   desc:'컨택·파워 훈련 배율', bonusStat:'contact', group:'batter'},
  {key:'eye',      icon:'👁️', name:'선구안 코치', desc:'선구안 훈련 배율',     bonusStat:'eye',     group:'batter'},
  {key:'defense',  icon:'🧤', name:'수비 코치',   desc:'수비·송구 훈련 배율', bonusStat:'fielding',group:'batter'},
  {key:'speed',    icon:'🏃', name:'주루 코치',   desc:'주루 훈련 배율',       bonusStat:'speed',   group:'batter'},
  // 투수 코치
  {key:'pitching', icon:'⚡', name:'투수 코치',   desc:'구위·구속 훈련 배율', bonusStat:'stuff',   group:'pitcher'},
  {key:'control',  icon:'🎯', name:'제구 코치',   desc:'제구 훈련 배율',       bonusStat:'control', group:'pitcher'},
  {key:'movement', icon:'🌀', name:'변화구 코치', desc:'무브먼트 훈련 배율',   bonusStat:'movement',group:'pitcher'},
  {key:'stamina',  icon:'🔋', name:'체력 코치',   desc:'지구력·위기 훈련 배율',bonusStat:'stamina', group:'pitcher'},
  // 공통
  {key:'medical',  icon:'💊', name:'트레이너',    desc:'컨디션 회복 배율',     bonusStat:'condition',group:'common'},
];

// ===================== MINOR LEAGUE / ROSTER MANAGEMENT =====================
const ACTIVE_ROSTER_MAX   = 29;   // 1군 최대 (IL 제외)
const FUTURES_ORG_MAX     = 65;   // 조직 전체 (1군+2군 합산) 최대
const CALLUP_COOLDOWN     = 5;    // 강등 후 콜업 불가 경기 수
const XP_ACTIVE_STARTER   = 10;   // 1군 선발/로테이션 경기당 XP
const XP_ACTIVE_BENCH     = 3;    // 1군 벤치/불펜 대기 경기당 XP
const XP_FUTURES          = 7;    // 2군 경기당 XP
const XP_DEVELOPMENTAL    = 5;    // 육성 경기당 XP
// XP_PER_LEVEL 삭제 — OVR 구간별 동적 요구량으로 대체 (match.js getRequiredXP 참조)
const FUTURES_PITCHER_DEBUFF = 0.80; // 2군 투수 스탯 20% 하향
const SLUMP_CONDITION_THRESHOLD = 40; // 컨디션 이하 → 슬럼프 디버프
const SLUMP_DEBUFF        = 12;   // 슬럼프 시 컨택·파워 패널티
const REHAB_DEBUFF        = 15;   // 재활 중 스탯 패널티
const IL_COOLDOWN_ON_RETURN = 5; // IL 복귀 후 콜업 쿨타임

// ── 규정타석/규정이닝 (리더보드 최소 기준) ──
const QUALIFY_PA_PER_GAME   = 2.0;  // 규정타석 계수 (PA/경기)
const QUALIFY_OUTS_PER_GAME = 1.0;  // 규정이닝 계수 (outs/경기)
const QUALIFY_RATIO_LEAGUE  = 0.50; // 리그 리더보드 (규정의 50%)
const QUALIFY_RATIO_AWARDS  = 0.70; // 시상 (규정의 70%)
const QUALIFY_RATIO_DASH    = 0.30; // 대시보드 (규정의 30%)

// ===================== SEASON LENGTH (v2: 63경기/21시리즈) =====================
// NOTE: 시즌 아웃 부상이 TOTAL_REGULAR를 참조하므로 INJURY_TYPES보다 먼저 정의.
const TOTAL_REGULAR=63;           // 정규시즌 총 경기 (21시리즈 × 3연전)
const FIRST_HALF_END=30;          // 전반기 종료 (G1~G30)
const EXPANDED_ENTRY_START=43;    // 확대 엔트리 시작 경기 (9월 확대, G43~)
const SERIES_LENGTH=3;            // 시리즈당 경기 수 (3연전 고정)
const TOTAL_SERIES=21;            // 시즌 총 시리즈 수

// ── 부상 유형 (가중 랜덤 선택) ──
const INJURY_TYPES = [
  { type:'minor',    weight:50, minGames:3,  maxGames:7,  label:'경미한 부상' },
  { type:'moderate', weight:35, minGames:8,  maxGames:18, label:'중등도 부상' },
  { type:'severe',   weight:12, minGames:20, maxGames:40, label:'중증 부상' },
  { type:'season',   weight:3,  minGames:TOTAL_REGULAR, maxGames:TOTAL_REGULAR, label:'시즌 아웃' },
];
function rollInjuryDuration(){
  const total=INJURY_TYPES.reduce((s,t)=>s+t.weight,0);
  let roll=rand(1,total);
  for(const t of INJURY_TYPES){
    roll-=t.weight;
    if(roll<=0) return {type:t.type, games:rand(t.minGames,t.maxGames), label:t.label};
  }
  return {type:'minor', games:rand(3,7), label:'경미한 부상'};
}
const FUTURES_COND_RECOVERY_MIN = 5;
const FUTURES_COND_RECOVERY_MAX = 8;

// ===================== MINIMUM ROSTER RULES =====================
const ACTIVE_MIN_TOTAL     = 27;  // 1군 최소 총원
const ACTIVE_MIN_PITCHERS  = 11;  // 투수 최소 (SP+RP+CP)
const ACTIVE_MIN_SP        = 5;   // 선발투수 최소
const ACTIVE_MIN_BULLPEN   = 6;   // 불펜 최소 (RP+CP)
const ACTIVE_MIN_BATTERS   = 12;  // 타자 최소
const ACTIVE_MIN_CATCHERS  = 2;   // 포수 최소
const ACTIVE_MIN_IF        = 5;   // 내야수 최소 (C,1B,2B,3B,SS)
const ACTIVE_MIN_OF        = 4;   // 외야수 최소 (LF,CF,RF)
const ORG_MIN_TOTAL        = 30;  // 조직 전체 최소 인원 (1군27 + 교체3)

// ===================== SEASON PHASE SYSTEM =====================
const SEASON_PHASES={
  PRESEASON:     {id:'preseason',     name:'프리시즌',         icon:'🌸'},
  FIRST_HALF:    {id:'first_half',    name:'전반기 시즌',      icon:'⚾'},
  ALLSTAR:       {id:'allstar',       name:'올스타 & 드래프트', icon:'⭐'},
  SECOND_HALF:   {id:'second_half',   name:'후반기 시즌',      icon:'⚾'},
  POSTSEASON:    {id:'postseason',    name:'포스트시즌',       icon:'🏆'},
  AWARDS:        {id:'awards',        name:'시상식 & 은퇴',    icon:'🏅'},
  GM_MEETING:    {id:'gm_meeting',    name:'GM 회의',          icon:'🗳️'},
  STOVE_LEAGUE:  {id:'stove_league',  name:'스토브리그',       icon:'🔥'},
};

// ── GM 회의 안건 풀 (다음 시즌 룰 재정의 — SeasonModifiers) ──
// effect.key → G.seasonModifiers[key]=value 로 적용. aiSupport = AI 단장 찬성 확률.
const GM_PROPOSALS=[
  {id:'salary_relax',  icon:'💰', name:'샐러리캡 완화',       desc:'사치세 라인 +20억 (부자 구단 유리)',    aiSupport:0.45, effect:{key:'luxuryLineBonus', value:20}},
  {id:'salary_tight',  icon:'📉', name:'샐러리캡 강화',       desc:'사치세 라인 -20억 (전력 평준화)',       aiSupport:0.50, effect:{key:'luxuryLineBonus', value:-20}},
  {id:'hardcap_up',    icon:'🏦', name:'하드캡 인상',         desc:'하드캡 +30억 (초고액 계약 허용)',       aiSupport:0.40, effect:{key:'hardCapBonus',   value:30}},
  {id:'floor_up',      icon:'🧱', name:'샐러리 플로어 인상',   desc:'플로어 +10억 (최소 지출 강제 강화)',    aiSupport:0.45, effect:{key:'salaryFloorBonus', value:10}},
  {id:'floor_down',    icon:'🪶', name:'샐러리 플로어 완화',   desc:'플로어 -10억 (리빌딩 구단 숨통)',       aiSupport:0.50, effect:{key:'salaryFloorBonus', value:-10}},
  {id:'expanded_early',icon:'📋', name:'확대 엔트리 조기 시행', desc:'9월 확대 엔트리를 5경기 앞당김',        aiSupport:0.60, effect:{key:'expandedEarly',  value:5}},
  {id:'champ_bonus',   icon:'🏆', name:'우승 상금 인상',       desc:'챔피언 상금 +30억',                    aiSupport:0.70, effect:{key:'champBonusExtra',value:30}},
  {id:'draft_bumper',  icon:'🌱', name:'드래프트 풍년',       desc:'다음 신인 풀 품질 소폭 상승',           aiSupport:0.65, effect:{key:'draftQualityBonus', value:3}},
];
// TOTAL_REGULAR / FIRST_HALF_END / EXPANDED_ENTRY_START 는 상단(SEASON LENGTH)에서 정의됨
const EXPANDED_ROSTER_MAX=32;     // 확대 엔트리 1군 최대 (TODO P2: v2 26→28로 조정)
const POSTSEASON_TEAMS=4;         // 포스트시즌 진출 팀 수 (v2 균형 토너먼트)
const SEMI_WINS_NEEDED=3;         // 준플레이오프 5전 3선승
const FINAL_WINS_NEEDED=4;        // 챔피언십 7전 4선승
const CHAMPIONSHIP_BONUS=50;      // 우승 상금 (억)
const RETIRE_MIN_AGE_PROXY=8;     // 시즌 수 기준 은퇴 가능 (생성 후 N시즌)

// ===================== DRAFT CONSTANTS =====================
const DRAFT_ROUNDS=6;             // 드래프트 라운드 수 (6라운드 × 8팀 = 48명)
const DRAFT_POOL_SIZE=32;         // 드래프트 풀 크기 (4라운드 × 8팀)

// ===================== FA & SALARY CONSTANTS (KBO-style, 단위: 억원) =====================
// P2-3 설계 정렬: 신인 계약 3년(서비스 0~2) → Arb 서비스 3~5 → FA 서비스 6+
const FA_SERVICE_TIME_THRESHOLD=6;   // FA 자격 서비스 타임
const PRE_ARB_MAX_SERVICE=2;         // 프리Arb: 서비스 0~2 (신인 계약 기간)
const ARB_MIN_SERVICE=3;             // 연봉조정 시작: 3시즌 (슈퍼2는 2시즌+상위 22%)
const ARB_MAX_SERVICE=5;             // 연봉조정 종료: 5시즌
const SUPER2_TOP_RATIO=0.22;         // 슈퍼2: 2년차 서비스 상위 22%에 Arb 조기 자격
const SERVICE_FULL_SERIES=15;        // 1풀 시즌 인정 최소 1군 등록 시리즈 (21시리즈 중)
const SALARY_MIN=0.3;               // 리그 최저 연봉 (3000만원)
const PRE_ARB_SALARY=SALARY_MIN;    // 프리Arb 최저 연봉 = 리그 최저 (별도 값 아님 — 결합 명시)

// ── 포지션별 계약 이벤트 그룹 ──
const POS_CONTRACT_GROUP={
  SP:'A', C:'A', SS:'A', CF:'A',     // 프리미엄 코어
  '2B':'B', '3B':'B', RF:'B',        // 스탠다드
  '1B':'C', LF:'C', DH:'C',          // 대체 용이
  CP:'D', SU:'D', MR:'D', LR:'D',    // 불펜 (변동성 높음)
};

// ===================== OPTION CONSTANTS =====================
const MAX_OPTION_YEARS=3;           // 마이너 옵션 최대 횟수

// ===================== TRADE CONSTANTS =====================
const TRADE_DEADLINE_GAME=56;       // 트레이드 데드라인 (84경기의 2/3)
const TRADE_MAX_PLAYERS=3;          // 한쪽 최대 교환 인원
const TRADE_AI_ACCEPT_RATIO=0.85;   // AI 수락 기본 임계값 (85%)
const TRADE_CONTENDER_BONUS=1.3;    // 윈나우 AI 즉전력 프리미엄
const TRADE_REBUILD_BONUS=1.5;      // 리빌딩 AI 유망주 프리미엄

// ===================== POSITION WEIGHT (Trade Value) =====================
const POS_WEIGHT={
  SP:1.5, C:1.3, SS:1.3, CF:1.3,
  '2B':1.1, '3B':1.1, RF:1.1,
  '1B':1.0, LF:1.0,
  DH:0.8, CP:0.8, SU:0.8, MR:0.8, LR:0.8
};

// ===================== RETIREMENT =====================
const RETIRE_BASE_PROB=10;        // 은퇴 기본 확률 (%)
const RETIRE_PROB_PER_SEASON=12;  // 초과 시즌당 추가 확률 (%)

// ===================== STAT SCALE (1~100) =====================
// NOTE: v2 설계는 내부 1~100 스케일. P1에서 STAT_MIN/STAT_MAX만 바꾸면
//       clamp(x,STAT_MIN,STAT_MAX) 전 사용처가 자동 반영되도록 중앙화됨.
const STAT_MIN=1;
const STAT_MAX=100;

// ===================== MATCH RULES =====================
const SP_WIN_MIN_OUTS=15;         // 선발 승리 자격 최소 아웃(=5이닝)

// ===================== SPECIAL FACILITIES =====================
const SCOUT_CAMP_COST=30;        // 중남미 스카우팅 캠프 비용 (억)
const SCOUT_CAMP_MAX_PER_SEASON=2; // 시즌당 최대 사용 횟수
const MEDICAL_CENTER_COST=15;    // 독일 의료 센터 비용 (억)
const MEDICAL_MIN_AGE=34;        // 의료 대상 최소 나이
const FOREIGN_PLAYER_MAX=3;      // 1군 외국인 선수 최대 등록 수

// ===================== POSTSEASON =====================
const POSTSEASON_TICKET_MULTIPLIER=2; // 포스트시즌 티켓 수익 배율
