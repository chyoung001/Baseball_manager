# DUGOUT - Baseball Manager Simulator

KBO(한국프로야구) 스타일의 야구 구단 경영 시뮬레이션 웹 게임

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **총 코드량** | ~8,257줄 (JS 18개 모듈 + HTML 1개 + CSS 1개) |
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
│   ├── Dreams.webp, Sabers.webp     # 팀 로고
│   └── ester.jpg, ester2.jpg        # 참고 이미지
└── pages/
    ├── index.html                   # 메인 HTML (단일 진입점)
    ├── style.css                    # 전역 스타일시트 (643줄)
    └── js/                          # 핵심 게임 로직 (18개 모듈)
        ├── constants.js    (189줄)  # 게임 상수, 팀 데이터
        ├── helpers.js      (640줄)  # 유틸리티 함수
        ├── players.js      (507줄)  # 선수 생성 시스템
        ├── state.js        (333줄)  # 게임 상태 관리
        ├── ui.js            (45줄)  # 탭 네비게이션
        ├── title.js         (74줄)  # 타이틀 화면
        ├── dashboard.js    (162줄)  # 대시보드 뷰
        ├── roster.js       (842줄)  # 로스터 관리 & 라인업
        ├── match.js       (1298줄)  # 경기 시뮬레이션 엔진
        ├── season.js         (4줄)  # 시즌 유틸리티 (stub)
        ├── season-flow.js (1327줄)  # 시즌 페이즈 관리
        ├── training.js      (87줄)  # 훈련 시스템
        ├── facility.js      (22줄)  # 시설 업그레이드
        ├── standings.js    (119줄)  # 리그 순위 & 통계
        ├── market.js       (154줄)  # FA 시장
        ├── trade.js        (335줄)  # 트레이드 시스템
        ├── analysis.js     (394줄)  # 선수 분석 & 스카우트
        ├── invest.js       (769줄)  # 재정 & 인프라 투자
        └── draft.js        (313줄)  # 드래프트 시스템
```

---

## 3. 핵심 시스템

### 3.1 시즌 시스템 (7 페이즈)
```
PRESEASON → FIRST_HALF (42경기) → ALLSTAR (드래프트) → SECOND_HALF (42경기)
→ POSTSEASON (플레이오프) → AWARDS (시상) → STOVE_LEAGUE (이적시장)
```

### 3.2 8개 팀 아키타입

| 팀 | 컨셉 | 강점 |
|---|---|---|
| 바이킹스 | power_hit | 투수 보너스, 장타력 |
| 세이버스 | pitching | 투수 +4, 고예산 |
| 드림즈 | prospect | 육성 +90 |
| 이글스 | bullpen | 불펜 +5 |
| 트윈스 | speed | 스피드/컨택 +4 |
| 앤젤스 | sabermetrics | 선구안/출루 |
| 데빌즈 | contact_hit | 컨택 +4 |
| 타이거즈 | defense | 수비/어깨 +4 |

### 3.3 선수 생성 (5단계 파이프라인)
1. 등급 분배: S(2%), A(13%), B(35%), C(35%), D(15%)
2. 나이 생성: 등급별 나이 분포
3. 스탯 생성: 정규분포 + 포지션 보정
4. 히든 스탯: potential, durability, consistency, clutch, workEthic
5. 팀 컨셉 보정: 아키타입별 스탯 보너스

### 3.4 데이터 모델
- **공개 스탯 (20-80 스케일)**: contact, power, eye, speed, fielding, arm / stuff, control, velocity, movement, stamina, clutch
- **히든 스탯 (7-20 스케일)**: _potential, _durability, _consistency, _clutchHidden, _workEthic
- **계약**: salary(억원), _contractYears, _serviceTime
- **잠재력 상한**: maxOVR = 30 + (potential × 2.5)

---

## 4. 문제점 분석

### 4.1 치명적 버그 (CRITICAL)

#### BUG-01: sessionStorage 사용으로 데이터 손실
- **위치**: `state.js:71,77`
- **문제**: sessionStorage는 탭/창을 닫으면 모든 데이터가 즉시 삭제됨
- **영향**: 사용자가 수십 시즌 진행한 데이터가 브라우저 닫기만으로 전부 소실
- **해결**: localStorage 또는 IndexedDB로 변경

#### BUG-02: 저장 실패 시 무음 처리
- **위치**: `state.js:72`
- **코드**: `catch(e){console.warn('saveGame failed:',e);}`
- **문제**: sessionStorage 용량 초과(5-10MB) 시 저장 실패해도 사용자에게 알림 없음
- **해결**: 저장 실패 시 showToast로 경고 표시

#### BUG-03: 확률 합 1.0 미보장
- **위치**: `match.js:280-291`
- **문제**: pHR+pXBH+pHit+pBB+pSO+pError의 합이 1.0을 넘을 수 있음
- **영향**: 범타(일반 아웃)가 거의 발생하지 않아 통계 왜곡
- **해결**: 확률 정규화 또는 상호 배타적 확률 구간 재설계

#### BUG-04: 패배 투수(L) 랜덤 할당
- **위치**: `match.js:633-636`
- **코드**: `if(lastRelief&&lastRelief.ss&&Math.random()<0.5)lastRelief.ss.l++;`
- **문제**: 야구 규칙상 패전 투수는 결정적 규칙으로 정해지는데, 50% 랜덤으로 배정
- **해결**: 실점 책임 기반 결정적 규칙 적용

#### BUG-05: 드래프트 풀 배열 인덱스 오류
- **위치**: `draft.js:306`
- **코드**: `const p=G.draftPool.splice(poolIdx,1)[0];`
- **문제**: AI가 순차 픽 시 splice 후 인덱스 불일치 → 중복 지명/누락 가능

---

### 4.2 심각한 버그 (HIGH)

#### BUG-06: 볼넷 시 주자 진루 불완전
- **위치**: `match.js:359-368`
- **문제**: 만루가 아닐 때 1루 주자 없이 2루에만 주자가 있으면 진루 무시
- **현실 규칙**: 볼넷은 Force Play → 1루부터 순서대로 밀어야 함

#### BUG-07: 2루 주자 단타 시 홈 도달 확률 과소
- **위치**: `match.js:341-343`
- **코드**: `batSpeed*armPenalty*0.6` → 예: 50 × 0.8 × 0.6 = 24%
- **현실**: 싱글에서 2루주자 홈 도달 확률은 75-85%
- **영향**: 전체 득점 환경이 비현실적으로 낮아짐

#### BUG-08: AI 경기 스태미나 초기화 누락
- **위치**: `match.js` AI 경기 섹션
- **문제**: 유저 경기는 투수 스태미나를 초기화하지만, AI 간 경기는 초기화 없음
- **영향**: AI 경기 결과 불공정, 순위 왜곡

#### BUG-09: 에러 시 RBI 미기록
- **위치**: `match.js:376-384`
- **문제**: 수비 에러로 3루 주자 홈인 시 `bs.rbi++` 처리 없음
- **영향**: 타자 RBI 통계 부정확

#### BUG-10: 트레이드 감가 불공정
- **위치**: `trade.js:117-126`
- **문제**: 유저 제안에는 Diminishing Returns(100%→50%→20%) 적용, AI에는 미적용
- **결과**: 유저가 여러 선수를 묶어 제안할수록 불리

---

### 4.3 현실성 문제 (REALISM)

#### REAL-01: 3루타 확률 과다
- **위치**: `match.js:317`
- **코드**: `tripleChance = batSpeed>65 ? 0.35 : ...`
- **현실**: 3루타는 전체 타석의 0.5-1% (매우 희귀)
- **현재**: 고속 타자 기준 장타의 35%가 3루타 → 비현실적

#### REAL-02: 병살타(DP) 확률 과다
- **위치**: `match.js:396`
- **코드**: `dpChance = fldTeam.concept==='defense' ? 0.22 : 0.17`
- **현실**: MLB DP 발생률은 전체 지상볼의 4-6%
- **현재**: 17-22% → 약 3-5배 과다

#### REAL-03: Save 조건 미달
- **위치**: `match.js:638`
- **문제**: Save = "승리팀 마지막 투수 + 선발 W" 조건만 체크
- **현실**: 세이브는 3점 이하 리드 진입, 동점/역전 주자 상황, 3이닝 이상 투구 등 복합 조건

#### REAL-04: 에이징 커브 비현실적
- **위치**: `season-flow.js:70-92`
- **문제**: 8시즌(약 26세)부터 하락 시작, KBO 현실은 27-30세 피크
- **베테랑 보너스(eye/control +0~2)**: 너무 작음

#### REAL-05: 연장전 규칙 미반영
- **위치**: `match.js:894-902`
- **문제**: 12회까지 동점이면 랜덤 승패 결정
- **KBO 현실**: 12회 이후 무승부, 2024년부터 타이브레이크(무주자 2루 스타트) 도입

#### REAL-06: CP(마무리) 포지션 가중치 과소
- **위치**: `constants.js:157-162`
- **현재**: CP = 0.8 (DH와 동일)
- **현실**: KBO에서 CP는 SP에 준하는 가치 (1.3-1.5)

---

### 4.4 밸런스 문제 (BALANCE)

#### BAL-01: 초기 예산 불균형
- **세이버스 초기 예산**: 9000억 → 매 시즌 무제한 선수 영입 가능
- **드림즈 초기 예산**: 상대적으로 매우 낮음
- **결과**: AI 간 격차가 시즌 진행할수록 극심해짐

#### BAL-02: 연봉조정 인플레이션
- **위치**: `season-flow.js:876-889`
- **문제**: OVR 65+ 선수 연봉 매년 1.4배 → 6시즌이면 원래의 7.5배
- **결과**: 페이롤 급증으로 대부분 팀 파산

#### BAL-03: 프리FA 연봉 억제 과도
- **위치**: `players.js:133-141`
- **문제**: OVR 70 프리FA(서비스타임 0-3) 연봉 최대 0.8억 vs FA(7+) 최대 25.2억
- **결과**: 신인 계약 기간이 극단적으로 저평가됨

#### BAL-04: 훈련 무한 성장 가능성
- **위치**: `training.js:70-76`
- **문제**: 매 경기마다 훈련으로 스탯 +1-3 → 시즌 84경기 × 평균 2 = +168
- **방어**: maxOvrFromPot 상한이 있지만, 배율이 높으면 빠르게 천장 도달

---

### 4.5 UI/UX 문제

#### UI-01: Z-인덱스 충돌
- **위치**: `style.css`
- **문제**: 게임메뉴(z:300) > 모달(z:200) → 모달 위에 메뉴가 나타남

#### UI-02: 경기 중 탭 전환 차단 (무알림)
- **위치**: `ui.js:43-44`
- **문제**: 경기 진행 중 탭 클릭 시 아무 반응 없음 (이유 알려주지 않음)

#### UI-03: 로스터 탭 항상 리셋
- **문제**: 다른 탭 갔다 돌아오면 항상 "1군 타자" 탭으로 리셋

#### UI-04: 반응형 디자인 모바일 깨짐
- **위치**: `style.css:322-323`
- **문제**: 700px 이하에서 스코어보드 폰트 0.55rem → 가독 불가

#### UI-05: 토스트 메시지 중복 생성
- **위치**: `invest.js:762-768`
- **문제**: 빠른 연속 동작 시 토스트 DOM 노드 누적 → 메모리 누수

---

### 4.6 코드 품질 문제

#### CODE-01: 전역 스코프 오염
- 모든 18개 JS 파일이 전역 변수/함수 사용 → 20개+ 전역 변수
- 변수명 충돌 위험, 디버깅 어려움

#### CODE-02: ES Modules 미사용
- `<script>` 태그 순서에 의존하는 모듈 로딩
- import/export 미사용

#### CODE-03: 테스트 코드 부재
- 단위/통합 테스트 없음
- 확률 시스템 검증 불가

#### CODE-04: Git 미설정
- 버전 관리 없음 → 코드 변경 이력 추적 불가

#### CODE-05: setTimeout 미정리
- **위치**: 여러 곳
- **문제**: clearTimeout 없이 setTimeout 사용 → 경기 중지 후에도 타이머 계속 실행

#### CODE-06: 선수 객체 참조 공유 위험
- **위치**: `state.js:50`
- **문제**: 로드 시 선수 객체가 여러 팀에서 참조 공유될 수 있음

---

## 5. 우선 수정 권장 순서

### Phase 1: 치명적 버그 (즉시)
1. sessionStorage → localStorage 변경 (BUG-01)
2. 저장 실패 알림 추가 (BUG-02)
3. 확률 합 정규화 (BUG-03)
4. 패전 투수 결정적 규칙 (BUG-04)

### Phase 2: 게임 플레이 (1주일)
1. 주자 진루 로직 수정 (BUG-06, BUG-07)
2. AI 경기 공정성 개선 (BUG-08)
3. 트레이드 감가 공정화 (BUG-10)
4. W/L/SV 규칙 현실화 (REAL-03)

### Phase 3: 밸런스 조정 (2주일)
1. 초기 예산 재조정 (BAL-01)
2. 연봉 인플레이션 억제 (BAL-02)
3. 확률 현실화: 3루타, DP, HR (REAL-01~02)
4. 에이징 커브 수정 (REAL-04)

### Phase 4: 코드 품질 (장기)
1. Git 초기화 (CODE-04)
2. ES Modules 전환 (CODE-02)
3. 테스트 코드 작성 (CODE-03)
4. 전역 변수 모듈화 (CODE-01)

---

## 6. 실행 방법

1. 웹 서버 실행 (예: VS Code Live Server, Python `http.server`)
2. `pages/index.html` 접속
3. 팀 선택 후 게임 시작

---

## 7. 스크립트 로딩 순서

```
constants.js → helpers.js → players.js → state.js → ui.js
→ dashboard.js → roster.js → match.js → training.js → facility.js
→ market.js → trade.js → standings.js → analysis.js
→ season.js → season-flow.js → invest.js → draft.js → title.js
```
