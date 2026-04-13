# DUGOUT - Baseball Manager Simulator

웹 기반 야구 구단 경영 시뮬레이션 게임

[프론트엔드 라이브 데모](https://chyoung001.github.io/Baseball_manager/)

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **총 코드량** | ~8,000+ 줄 (JS 54개 모듈 + HTML 1개 + CSS 1개) |
| **기술 스택** | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| **외부 의존성** | 없음 (폰트만 Google Fonts CDN) |
| **데이터 저장** | localStorage (브라우저 로컬 스토리지) |
| **UI 언어** | 한국어 |
| **빌드 도구** | 없음 (직접 실행) |

---

## 2. 프로젝트 구조

```
Baseball_Manager/
├── image/                           # 이미지 에셋
│   ├── baseball_field.png           # 경기장 배경
│   ├── Eagles.png, Vikings.webp     # 팀 로고
│   └── Dreams.webp, Sabers.webp     # 팀 로고
├── pages/
│   ├── index.html                   # 메인 HTML (단일 진입점)
│   ├── style.css                    # 전역 스타일시트
│   └── js/                          # 핵심 게임 로직 (54개 모듈)
│       ├── constants.js             # 게임 상수, 팀 데이터, 밸런스 값
│       ├── ui.js                    # 탭 네비게이션
│       ├── dashboard.js             # 대시보드 뷰
│       ├── standings.js             # 리그 순위 & 통계
│       ├── training.js              # 훈련 시스템
│       ├── facility.js              # 시설 업그레이드
│       ├── market.js                # FA 자유계약 시장
│       ├── title.js                 # 타이틀 화면
│       ├── utils/                   # 공통 유틸리티 (4개)
│       │   ├── utils-core.js        # 핵심 헬퍼 (clamp, rand, OVR 계산)
│       │   ├── utils-stats.js       # 통계 공식, 연봉 계산
│       │   ├── utils-scout.js       # 스카우트 리포트 생성
│       │   ├── utils-economy.js     # 예산/페이롤/투자 비용 공식
│       │   └── negotiation.js       # 계약 협상 UI & 로직
│       ├── players/                 # 선수 시스템 (4개)
│       │   ├── player-core.js       # 선수 객체 구조, OVR 계산
│       │   ├── player-stats.js      # 시즌 스탯 누적
│       │   ├── player-factory.js    # 선수 생성 파이프라인
│       │   └── player-pools.js      # 유망주 풀, 드래프트 풀 관리
│       ├── state/                   # 게임 상태 관리 (4개)
│       │   ├── state-core.js        # 전역 상태 객체(G), 로스터 게터
│       │   ├── state-save.js        # 저장/불러오기 (localStorage)
│       │   ├── state-init.js        # 신규 게임 초기화, 팀 선택
│       │   └── state-validation.js  # 데이터 무결성 검증
│       ├── match/                   # 경기 시뮬레이션 (5개)
│       │   ├── match-state.js       # 경기 상태 객체, TTO 상수
│       │   ├── match-engine.js      # 핵심 확률 계산, 피로도, 회귀
│       │   ├── match-flow.js        # 이닝별 시뮬레이션, 주자, 투수 교체
│       │   ├── match-ui.js          # 실시간 UI 업데이트 (스코어보드, 중계)
│       │   └── match.js             # 경기 탭 진입점, 사용자 상호작용
│       ├── roster/                  # 로스터 관리 (4개)
│       │   ├── roster-logic.js      # 검증 규칙 (포지션별 최소/최대)
│       │   ├── roster-field.js      # 시각적 그라운드 뷰 (라인업 구성)
│       │   ├── roster-active.js     # 1군 라인업/벤치 관리
│       │   └── roster-reserve.js    # 2군, 육성, IL 관리
│       ├── season/                  # 시즌 시스템 (5개)
│       │   ├── season-core.js       # 시즌 기본 유틸리티
│       │   ├── season-finance.js    # 수입/비용 계산, 럭셔리 택스
│       │   ├── season-postseason.js # 포스트시즌 대진표, 시리즈 시뮬
│       │   ├── season-awards.js     # 시즌 시상, 은퇴, 명예의전당
│       │   └── season-flow.js       # 페이즈 전환, 시즌 종료 처리
│       ├── trade/                   # 트레이드 시스템 (3개)
│       │   ├── trade-logic.js       # 트레이드 가치 계산, AI 수락 로직
│       │   ├── trade-ui.js          # 트레이드 제안 UI
│       │   └── trade.js             # 트레이드 탭 진입점
│       ├── invest/                  # 투자 시스템 (5개)
│       │   ├── invest-finance.js    # 예산 현황, 럭셔리 택스 표시
│       │   ├── invest-infra.js      # 구장 업그레이드, 코치 영입
│       │   ├── invest-scout.js      # 해외 스카우트 캠프
│       │   ├── invest-players.js    # 선수 개발 시설, 해외 전지훈련
│       │   └── invest.js            # 투자 탭 통합 진입점
│       ├── analysis/                # 분석 & 리포트 (5개)
│       │   ├── analysis-batters.js  # 타자 시즌 성적 리더보드
│       │   ├── analysis-pitchers.js # 투수 시즌 성적 리더보드
│       │   ├── analysis-scout.js    # 상대팀 스카우트 리포트
│       │   ├── analysis-contracts.js# 계약 현황 & 만료 추적
│       │   └── analysis.js          # 분석 탭 통합 진입점
│       └── draft/                   # 드래프트 시스템 (5개)
│           ├── draft-logic.js       # 드래프트 픽 로직, AI 선택
│           ├── draft-preview.js     # 드래프트 전 유망주 미리보기
│           ├── draft-live.js        # 라이브 드래프트 진행 UI
│           ├── draft-result.js      # 드래프트 결과 요약
│           └── draft.js             # 드래프트 탭 진입점
├── README.md
├── BUGFIX_REPORT.md                 # 버그 수정 이력
└── UIFIX_PLAN.md                    # UI 개선 계획
```

---

## 3. 핵심 시스템

### 3.1 시즌 시스템 (7 페이즈)

```
PRESEASON → FIRST_HALF (42경기) → ALLSTAR (올스타+드래프트) → SECOND_HALF (42경기)
         → POSTSEASON (5팀 플레이오프) → AWARDS (시상+은퇴) → STOVE_LEAGUE (FA시장)
```

| 페이즈 | 내용 |
|--------|------|
| **PRESEASON** | 선수 평가, 로스터 정비 |
| **FIRST_HALF** | 전반기 42경기 |
| **ALLSTAR** | 올스타 + 신인 드래프트 |
| **SECOND_HALF** | 후반기 42경기 |
| **POSTSEASON** | 플레이오프 |
| **AWARDS** | MVP, 신인왕, 골든글러브 시상 / 은퇴 |
| **STOVE_LEAGUE** | FA 시장, 계약 협상, 로스터 정비 |

### 3.2 8개 팀 아키타입

| 팀 | 컨셉 | 강점 |
|---|---|---|
| 바이킹스 (Vikings) | power_hit | 선발 +4 |
| 세이버스 (Sabers) | pitching | 투수 +4 |
| 드림즈 (Dreams) | prospect | 육성 레벨 +90 |
| 이글스 (Eagles) | bullpen | 불펜 투수 +5 |
| 트윈스 (Twins) | speed | 스피드/컨택 +4 |
| 앤젤스 (Angels) | sabermetrics | 선구안/출루율 |
| 데빌즈 (Devils) | contact_hit | 컨택 +4 |
| 타이거즈 (Tigers) | defense | 수비/어깨 +4 |

### 3.3 선수 생성 (5단계 파이프라인)

1. **등급 분배**: S(2%), A(13%), B(35%), C(35%), D(15%)
2. **나이 생성**: 등급별 나이 분포
3. **스탯 생성**: 정규분포 + 포지션 보정
4. **히든 스탯**: potential, durability, consistency, clutch, workEthic
5. **팀 컨셉 보정**: 타입별 스탯 보너스

### 3.4 선수 데이터 모델

- **공개 스탯 (20-80 스케일)**
  - 타자: `contact, power, eye, speed, fielding, arm`
  - 투수: `stuff, control, velocity, movement, stamina, clutch`
- **히든 스탯 (1-20 스케일)**: `_potential, _durability, _consistency, _clutchHidden, _workEthic`
- **계약**: `salary(억원), _contractYears, _serviceTime`
- **잠재력 상한**: `maxOVR = 30 + (potential × 2.5)`

### 3.5 로스터 구조

| 구분 | 인원 |
|------|------|
| 1군 (Active) | 최대 29명 (최소 27명, IL 제외) |
| 2군 (Futures) | 개발 조직 |
| 육성 (Developmental) | 유망주 |
| IL (부상자 명단) | 재활 중 선수 |

### 3.6 경기 시뮬레이션 엔진

#### 3.6.1 TTO + BABIP 타석 판정

매 타석은 **TTO(Three True Outcomes) → 인플레이** 2단계 확률 모델로 처리.

```
[투구 전 도루 시도] → [1차 TTO 판정: /HR / K / BB] → (인플레이 시) [2차 판정: 에러 / 안타 / 범타]
```

**1차 TTO 확률:**

| 결과 | 공식 | 기본값 | 범위 |
|------|------|--------|------|
| 홈런 (HR) | `0.025 + (파워 - 무브먼트) / 100 × 0.16` | 2.5% | 0.5% ~ 8% |
| 삼진 (K) | `0.180 + (구위 - 컨택) / 100 × 0.15` | 18% | 4% ~ 30% |
| 볼넷 (BB) | `0.090 + (선구안 - 제구) / 100 × 0.12` | 9% | 2% ~ 15% |

HR+K+BB 합계 최대 53% → 인플레이 최소 47% 보장.

**2차 인플레이 판정:**

| 결과 | 확률 | 의존 스탯 |
|------|------|-----------|
| 수비 에러 | 0.5% ~ 4% | 수비 팀 평균 fielding |
| BABIP 안타 | 20% ~ 38% | 컨택 × 수비력 × 회귀 보정 |
| 범타 (아웃) | 나머지 | — |

안타 시 타구 유형: **3루타** (speed 의존) → **2루타** (power 의존) → **단타** (나머지)

#### 3.6.2 주루 시스템

주자는 **선수 객체 참조**로 저장되어 각 주자의 실제 speed 스탯이 진루 판정에 사용된다.

| 상황 | 확률 공식 | 근사치 |
|------|-----------|-----------|
| 단타 시 3루→홈 | 자동 득점 | ~95% |
| 단타 시 2루→홈 | `min(75, 주자speed × armPenalty × 1.5)` | ~60% |
| 단타 시 1루→3루 | `주자speed > 65: speed × armPenalty × 0.35` | ~28% |
| 2루타 시 1루→홈 | `주자speed > 55: speed × armPenalty × 0.55` | ~44% |
| 희생 플라이 | `0.50 + (주자speed - 50) / 200` (30~70%) | ~50% |

**도루:** TTO 판정 전에 독립적으로 시도. 주자 speed × 팀 컨셉 배율 × 포수 arm 보정.
- 1루→2루: 매 타석 30% 스케일
- 2루→3루: 12% 스케일 (더 희귀)
- speed 컨셉 팀: 0.55 배율 / 세이버 팀: 0.22 / 기본: 0.38

**병살타:** 땅볼 + 1루 주자 + 2아웃 미만 시 발동. 기본 9% (수비 컨셉 14%). 느린 타자(speed ≤ 45) 1.4배, 빠른 타자(≥ 65) 0.6배.

#### 3.6.3 자책점 / 비자책점 분리

에러로 출루한 주자에 `_errorRunner` 플래그가 설정된다. 이후 해당 주자가 득점할 때 투수 ER(자책점)에 가산되지 않는다. 안타/볼넷으로 정상 출루 시 플래그 리셋.

#### 3.6.4 투수 피로도

**투구수 피로 커브 (점진적):**

```
50구 미만:  디버프 없음
50~110구:  vel/ctrl/mov 선형 감산 (최대 -12/-12/-10)
```

| 투구수 | velocity | control | movement |
|--------|----------|---------|----------|
| 50 | 0 | 0 | 0 |
| 70 | -4 | -4 | -3 |
| 90 | -8 | -8 | -7 |
| 110+ | -12 | -12 | -10 |

**스태미나 팩터:** 잔여 스태미나에 따른 전체 능력치 배율.

| 스태미나 | 배율 |
|----------|------|
| 50~100% | ×1.00 |
| 25~49% | ×0.88 |
| 5~24% | ×0.75 |
| 0~4% | ×0.40 |

**최대 투구수 (stamina 기반):**
- 선발(SP): `stamina + 40` (50sta → 90구, 80sta → 120구)
- 불펜(RP): `stamina/2 + 10` (50sta → 35구)
- 롱릴리프(LR): `stamina/2 + 25` (50sta → 50구)

#### 3.6.5 투수 교체 로직

`shouldHookPitcher()` 판정 → 보직 우선순위 기반 불펜 선택:

| 상황 | 우선순위 |
|------|----------|
| 9회+, 1~3점 리드 (세이브) | CP → SU → MR → LR |
| 9회+, 4점+ 리드 | MR → LR → SU (CP 아낌) |
| 7~8회, 리드/동점 | SU → MR → CP → LR |
| 6~8회, 1~4점 뒤짐 | MR → LR → SU |
| 기타 (조기강판/대량점수차) | LR → MR → SU → CP |

가용 조건: 3연투 미만, 컨디션 ≥ 20, 해당 경기 미등판.

#### 3.6.6 히든 스탯 영향

| 히든 스탯 | 효과 |
|-----------|------|
| **Consistency** | 타석별 스윙 편차: `±(20 - consistency)` |
| **Clutch** | 7회+, 점수차 ≤3, 득점권 주자 시 `(clutch - 10) × 0.6` 보너스 |
| **Work Ethic** | 성장 배율: `0.5 + workEthic/20` (0.85x ~ 1.5x) |
| **Durability** | 부상 확률 감소, 컨디션 하락 완화 |
| **Potential** | 최대 OVR 천장: `30 + potential × 2.5` |

#### 3.6.7 동적 회귀 보정

시즌 중 비현실적 성적을 자동 보정:

| 조건 | 보정 |
|------|------|
| 타자 AVG > .380 (30AB+) | 안타 확률 -20% |
| 타자 AVG > .350 (30AB+) | 안타 확률 -10% |

---

### 3.7 부상 시스템

#### 3.7.1 부상 발생

**경기 중 투수 부상 (매 타석 체크):**

| 조건 | 확률 |
|------|------|
| 컨디션 < 60 | `(60 - condition) × 0.0003 × 투구수 가중` |
| 컨디션 ≥ 60 | 0.05% (돌발 부상) |

투구수 가중: `1 + max(0, 투구수 - 60) × 0.02` — 60구 이후 투구당 2%씩 위험 증가.

**경기 후 타자 부상 (컨디션 < 55):**

```
확률 = max(2, 20 - durability) / 300 × 재부상 배율
```

| durability | 기본 확률 | 재부상 직후 (×1.5) |
|------------|----------|-------------------|
| 7 (낮음) | 4.3% | 6.5% |
| 10 (평균) | 3.3% | 5.0% |
| 15 (높음) | 1.7% | 2.5% |
| 20 (최대) | 0.67% | 1.0% |

**경기 후 투수 부상 (컨디션 < 40):** 동일 공식, 분모 400.

#### 3.7.2 부상 유형 (가중 랜덤)

| 유형 | 확률 | 기간 |
|------|------|------|
| 경미한 부상 | 50% | 3~7 경기 |
| 중등도 부상 | 35% | 8~18 경기 |
| 중증 부상 | 12% | 20~40 경기 |
| 시즌 아웃 | 3% | 84 경기 |

#### 3.7.3 부상 회복 사이클

```
IL (부상자 명단) → 2군 재활 (3경기, -15 스탯 디버프) → 쿨다운 (3경기) → 콜업 가능
```

- IL 기간 중: 출전 불가, 매 경기 `ilGamesLeft--`
- 2군 재활 중: 컨디션 +5~8/경기 회복, REHAB_DEBUFF(-15) 적용
- 복귀 후 10경기: 재부상 위험 1.5배 (`_recentILReturn` 카운터)
- 긴급 복귀 옵션: 재활 5경기 + 쿨다운 5경기로 패널티 증가

---

### 3.8 컨디션 & 슬럼프

#### 컨디션 저하/회복

| 대상 | 변동 |
|------|------|
| 선발 타자 (매 경기) | -2~5 (의료시설/내구성으로 경감) |
| 벤치 타자 | +1~3 (미출전 회복) |
| 등판 투수 (투구 비율별) | ≤50%: -5~10 / ≤100%: -10~20 / >100%: -20~30 |
| 연투 패널티 | 2연투: +5 / 3연투+: +15 |
| 미등판 투수 | +15 + durability 보너스 |
| 2군 선수 | +5~8 (매 경기) |

#### 슬럼프 시스템

- **발동 조건:** 매 경기 `max(1, 15 - consistency)` % 확률
  - consistency 7: 8% / 10: 5% / 15: 1% (모든 선수 가능)
- **효과:** 컨디션 40 미만 시 contact/power에 -12 디버프
- **기간:** 3~7 경기 (자동 해제)

---

### 3.9 선수 성장 (XP 시스템)

**경기당 XP 부여:**

| 상태 | XP/경기 |
|------|---------|
| 1군 선발/로테이션 | 10 |
| 1군 벤치/불펜 | 3 |
| 2군 (Futures) | 7 |
| 육성 (Developmental) | 5 |

**레벨업 요구 XP (OVR 구간별):**

| OVR | 필요 XP |
|-----|---------|
| 70+ | 250 |
| 60~69 | 150 |
| 50~59 | 110 |
| 40~49 | 90 |
| ~39 | 70 |

**성장 공식:**
```
랜덤 스탯 1개 선택 → gain = rand(1,3) × workEthic 배율
스탯 = clamp(스탯 + gain, 20, 80)
OVR ≥ maxOvrFromPot(potential) → 성장 차단
```

---

### 3.10 리더보드 규정 기준

비율 스탯(AVG, OBP, ERA, WHIP, K/9)에는 **동적 최소 출전 기준**이 적용된다.
누적 스탯(HR, RBI, SB, W, K, SV)에는 기준 없음.

**규정 공식:**
```
규정타석 = 경기수 × 2.0 (PA 기준)
규정이닝 = 경기수 × 1.0 (outs 기준)
```

| 적용 위치 | 규정 비율 | 84경기 기준 타석 | 84경기 기준 이닝 |
|-----------|----------|-----------------|-----------------|
| 대시보드 (팀 리더) | 30% | 50 PA | 25 outs (8.1 IP) |
| 리그 리더 (순위표) | 50% | 84 PA | 42 outs (14.0 IP) |
| 시즌 시상 (MVP 등) | 70% | 117 PA | 58 outs (19.1 IP) |

시즌 초반에는 기준이 낮아 리더보드가 비지 않고, 시즌이 진행될수록 충분한 출전 실적이 필요해진다.

---

### 3.11 재정 시스템

| 항목 | 내용 |
|------|------|
| **팀 예산** | 팀 아키타입별 상이 |
| **럭셔리 택스 기준선** | 140억원 |
| **럭셔리 택스율** | 초과분 × 30% |
| **하드 캡** | 210억원 |
| **수입 산정** | 최종 순위 기반 시즌 수익 |

### 3.12 투자 옵션

- **구장 업그레이드**: 구단 수입 증가
- **코칭 스태프**: 8가지 전문 코치 라인
- **해외 스카우트 캠프**: 외국인 선수 스카우트
- **선수 개발 시설**: 육성 효율 향상
- **해외 전지훈련**: 단기 선수 성장 가속

---

## 4. 알려진 문제점

> **범례:**  ❌ 미수정 / N/A 해당없음

### 버그 통합 트래커

> **심각도:** 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW  
> **상태:** ❌ 미수정 / ✅ 수정됨 / ℹ️ 정상 동작 / N/A 해당없음

| ID | 심각도 | 분류 | 파일 | 내용 | 상태 |
|---|---|---|---|---|---|
| NEW-03 | 🟡 MEDIUM | 버그 | season-flow.js | 계약 연수 음수 가능 → FA 판정 누락 (구버전 세이브 마이그레이션) | ❌ 미수정 |
| BAL-02 | 🟡 MEDIUM | 밸런스 | season-finance.js | OVR65+ 연봉 매년 1.4배 → 6시즌 후 7.5배 인플레이션 | ❌ 미수정 |
| NEW-07 | 🟢 LOW | 버그 | season-flow.js | 연봉 갱신 시 SALARY_MIN 상수 하한 미적용 (OVR 50-59 구간) | ❌ 미수정 |
| BAL-03 | 🟢 LOW | 밸런스 | season-flow.js | 프리FA 연봉 억제 — OVR70 기준 FA 전 0.8억 vs FA 후 25.2억 단절 | ❌ 미수정 |
| REAL-03 | 🟢 LOW | 현실성 | match-flow.js | 세이브 조건 단순화 (KBO 복합 조건 미반영) | ❌ 미수정 |
| REAL-05 | 🟢 LOW | 현실성 | match-flow.js | 연장 12회 동점 시 랜덤 승패 (KBO 규칙: 무승부) | ❌ 미수정 |
| REAL-06 | 🟢 LOW | 현실성 | constants.js | CP 포지션 가중치 0.8 — DH와 동일 (현실 1.3-1.5) | ❌ 미수정 |
| UI-01 | 🟢 LOW | UI/UX | index.html | Z-인덱스 충돌: 게임메뉴(z:300)가 모달(z:200) 위에 표시 | ❌ 미수정 |
| UI-02 | 🟢 LOW | UI/UX | ui.js | 경기 중 탭 전환 시 무반응 — 이유 미표시 | ❌ 미수정 |
| UI-03 | 🟢 LOW | UI/UX | ui.js | 로스터 탭 항상 "1군 타자"로 리셋 | ❌ 미수정 |
| UI-04 | 🟢 LOW | UI/UX | index.html | 700px 이하 모바일 레이아웃 깨짐 | ❌ 미수정 |
| UI-05 | 🟢 LOW | UI/UX | ui.js | 토스트 메시지 빠른 연속 클릭 시 DOM 누적 (메모리 누수) | ❌ 미수정 |
| CODE-01 | 🟢 LOW | 코드품질 | (전체) | 전역 스코프 오염: 20개+ 전역 변수/함수 | ❌ 미수정 |
| CODE-02 | 🟢 LOW | 코드품질 | (전체) | ES Modules 미사용 — `<script>` 로딩 순서 의존 | ❌ 미수정 |
| CODE-03 | 🟢 LOW | 코드품질 | (전체) | 단위/통합 테스트 부재 | ❌ 미수정 |
| CODE-04 | 🟢 LOW | 코드품질 | ui.js | setTimeout/clearTimeout 미관리 → 타이머 누수 | ❌ 미수정 |
| CODE-05 | 🟢 LOW | 코드품질 | state-save.js | 선수 객체 참조 공유 위험 (load 시 shallow copy) | ❌ 미수정 |
| BUG-10 | 🟠 HIGH | 버그 | trade-logic.js | 트레이드 감가상각 유저에만 불공정 적용 | N/A — 트레이드 시스템 완전 재작성

---

## 6. 실행 방법

1. 웹 서버 실행 (VS Code Live Server, Python `http.server` 등)
2. `pages/index.html` 접속
3. 팀 선택 후 게임 시작
4. 저장: 게임 메뉴 `☰` → 💾 게임 저장 (localStorage)
5. 내보내기/가져오기: JSON 파일로 세이브 백업 가능

---

## 7. 스크립트 로딩 순서

```
constants.js
→ utils/utils-core.js, utils-stats.js, utils-scout.js, utils-economy.js, negotiation.js
→ players/player-core.js, player-stats.js, player-factory.js, player-pools.js
→ state/state-core.js, state-save.js, state-init.js, state-validation.js
→ ui.js, dashboard.js
→ roster/roster-logic.js, roster-field.js, roster-active.js, roster-reserve.js
→ match/match-state.js, match-engine.js, match-ui.js, match-flow.js, match.js
→ training.js, facility.js, market.js
→ trade/trade-logic.js, trade-ui.js, trade.js
→ standings.js
→ analysis/analysis-batters.js, analysis-pitchers.js, analysis-scout.js, analysis-contracts.js, analysis.js
→ season/season-finance.js, season-core.js, season-postseason.js, season-awards.js, season-flow.js
→ invest/invest-finance.js, invest-infra.js, invest-scout.js, invest-players.js, invest.js
→ draft/draft-logic.js, draft-preview.js, draft-live.js, draft-result.js, draft.js
→ title.js
```

> **주의:** 빌드 시스템 없이 `<script>` 태그 순서로 의존성을 관리하므로, 로딩 순서가 변경되면 오류가 발생할 수 있습니다.
