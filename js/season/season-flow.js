// ===================== SEASON FLOW (Stove League + Next Season) =====================

// ── 파산 게임오버 판정 ──
// 내 팀 예산이 0 미만이면 단장 해임 화면을 표시하고 true 반환
function checkBankruptcy(){
  if(!G.myTeam||G.myTeam.budget>=0) return false;
  const deficit=Math.abs(G.myTeam.budget);
  $('modalTitle').textContent='📋 구단주 해고 통보';
  $('modalBody').innerHTML=`
    <div style="text-align:center;padding:24px 0;">
      <div style="font-size:3rem;margin-bottom:12px;">💸</div>
      <div style="font-size:1rem;color:#ef4444;font-weight:700;margin-bottom:8px;">예산 고갈 — 단장직 해임</div>
      <div style="font-size:0.8rem;color:var(--text-dim);line-height:1.8;margin-bottom:20px;">
        팀 예산이 <b style="color:#ef4444;">-${won(deficit)}</b> 적자 상태입니다.<br>
        구단주가 경영 악화를 이유로 당신을 해임했습니다.<br>
        <span style="font-size:0.7rem;color:#6b7280;">시즌 ${G.season} · ${G.myTeam.wins}승 ${G.myTeam.losses}패</span>
      </div>
      <button class="btn btn-primary" onclick="newGame();" style="width:100%;background:#ef4444;border-color:#ef4444;">🔄 새 게임 시작</button>
    </div>`;
  $('seasonModal').classList.add('active');
  // 버튼 비활성화 — 더 이상 게임 진행 불가
  const nb=$('btnNavAdvance');if(nb)nb.disabled=true;
  const pb=$('btnPlayMatch');if(pb)pb.disabled=true;
  return true;
}

// ===================== PHASE 7: STOVE LEAGUE =====================
function showStoveLeague(){
  const t=G.myTeam;
  const isFirstYear=(G.season===1 && G.gameNum===0 && (t.wins+t.losses)===0);
  const sorted=[...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
  const rank=sorted.indexOf(t)+1;

  // 전년도 순위 저장 (다음 시즌 드래프트용)
  G.previousSeasonStandings=sorted.map(team=>G.teams.indexOf(team));

  // 정산은 시즌당 1회만 (재진입/돌아가기 시 중복 정산으로 인한 예산·서비스타임·FA 붕괴 방지)
  if(!isFirstYear && G._stoveSettledSeason!==G.season){
    // 수익 정산 (모든 팀) — P2-4: 사치세 3단계 + 연대 기금 7% 풀 적립
    let _solidarityPool=0,_luxuryPool=0;
    G.teams.forEach(team=>{
      const tr=sorted.indexOf(team)+1;
      const rev=calcSeasonRevenue(team,tr);
      _solidarityPool+=rev.solidarity;
      _luxuryPool+=rev.luxTax;
      team.budget+=rev.net;
      if(team===G.myTeam)G._lastSeasonRev=rev; // 결산 화면 표시용 스냅샷
    });

    // P2-4 사치세 연속 초과 카운터 (과세 후 갱신 — 다음 시즌 체증 기준)
    // 리셋: 2시즌 연속 온전히 소프트캡 아래 체류 시에만 (설계 엄격 규칙)
    G.teams.forEach(team=>{
      if(getPayroll(team)>getLuxuryTaxLine()){
        team._luxOverStreak=(team._luxOverStreak||0)+1;
        team._luxUnderStreak=0;
      }else{
        team._luxUnderStreak=(team._luxUnderStreak||0)+1;
        if(team._luxUnderStreak>=2)team._luxOverStreak=0;
      }
    });

    // P2-4 샐러리 플로어 (탱킹 방지): 미달액 50% 선수 분배 + 50% 소각 → 전액 벌과금 지출
    const _floorLine=getSalaryFloor();
    const _floorFail=new Set();
    G.teams.forEach(team=>{
      const shortfall=+(_floorLine-getPayroll(team)).toFixed(1);
      if(shortfall>0){
        _floorFail.add(team);
        team.budget=+(team.budget-shortfall).toFixed(1);
        if(team===G.myTeam)showToast(`🚨 샐러리 플로어(${won(_floorLine)}) 미달! 벌과금 ${won(shortfall)} + 분배금 수령 박탈`);
      }
    });

    // P2-4 분배금: 연대 기금 + 사치세 → 하위 4팀 역순위 (8위 35% / 7위 30% / 6위 20% / 5위 15%)
    // 수령 자격: 샐러리 플로어 달성 팀만 (탱킹 먹튀 방지)
    const _distPool=+(_solidarityPool+_luxuryPool).toFixed(1);
    const _shares=[0.35,0.30,0.20,0.15];
    const _bottom4=sorted.slice(-4).reverse(); // [8위,7위,6위,5위]
    _bottom4.forEach((team,i)=>{
      if(_floorFail.has(team))return;
      const share=+(_distPool*_shares[i]).toFixed(1);
      team.budget=+(team.budget+share).toFixed(1);
      if(team===G.myTeam&&share>0)showToast(`🤝 리그 분배금 +${won(share)} (연대 기금+사치세)`);
    });

    // 연간 고정 지출 + 선수 급여 차감 (모든 팀) — 급여는 실지출(현금 차감). 이전엔 가용예산 제약으로만 쓰여
    // 예산에서 안 빠져 무한 흑자·사치세 사문화를 유발하던 버그 수정.
    G.teams.forEach(team=>{
      const upkeep=calcAnnualUpkeep(team);
      team.budget=Math.floor(team.budget-upkeep.total-getPayroll(team));
    });
    // 준비금 소프트캡 감가 (지속형 현금 싱크) — 인프라 재투자가 포화하면 흡수 못 하는 잉여를
    // 구단주 배당으로 소각해 예산을 영구 유계로. 초과분(>CAP)에만 적용 → 캡 아래 팀·파산은 무영향.
    G.teams.forEach(team=>{
      const excess=(team.budget||0)-RESERVE_SOFT_CAP;
      const drain=excess>0?Math.floor(excess*RESERVE_DECAY_RATE):0;
      if(drain>0)team.budget=(team.budget||0)-drain;
      if(team===G.myTeam)G._lastReserveDrain=drain; // 결산 표시용 스냅샷 (미발생 시 0 → 스테일 방지)
    });
    // 파산 체크: 유지비 차감 후 내 팀 예산이 음수면 게임오버
    if(checkBankruptcy()) return;

    // 서비스 타임 + 팀 재적 증가 + 계약 만료 처리
    G.faPool=[];
    G._aiRenewalLog=[];
    G.teams.forEach(team=>{
      team.roster.forEach(p=>{
        // P2-3 서비스타임 시리즈 비례 적립: 1군 등록 15시리즈+ = 1풀 시즌, 미만 비례
        // 신인왕 수상 시 자동 1풀 시즌 (크리스 브라이언트 룰)
        let svcGain;
        if(p._svcGames===undefined){
          svcGain=(p.status||'active')==='active'?1:0; // 구세이브 과도기: 등록 기록 없으면 기존 규칙
        }else{
          svcGain=_serviceGainFromGames(p._svcGames);
        }
        if(p._rookieFullCredit){svcGain=Math.max(svcGain,1);p._rookieFullCredit=false;}
        if(svcGain>0)p._serviceTime=+((p._serviceTime||0)+svcGain).toFixed(2);
        p._svcGames=0;
        p._teamTenure=(p._teamTenure||0)+1;
        p._contractYears=(p._contractYears||1)-1;
      });
      // 계약 만료 선수 처리 (소속 구단 우선 재계약)
      const expired=team.roster.filter(p=>(p._contractYears||0)<=0 && (p._serviceTime||0)>=FA_SERVICE_TIME_THRESHOLD);
      const released=[];  // 재계약 실패 → FA 방출 대상
      expired.forEach(p=>{
        if(p.isForeign) return; // 외국인: FA 없이 삭제 (귀국)
        if(team===G.myTeam){
          // 유저 팀: 재계약 대기 목록에 추가 (FA 직행 방지)
          if(!G._renewalCandidates) G._renewalCandidates=[];
          G._renewalCandidates.push(p);
        } else {
          // AI 팀: 소속 구단 우선 재계약 시도 (P2-4 절대 스케일 + 히든 보정 — 유저 협상과 동일 기준)
          const pOvr=ovr(p);
          const renewSalary=Math.max(SALARY_MIN,+(_calcSalary(pOvr,p._serviceTime||FA_SERVICE_TIME_THRESHOLD)*_contractHiddenMod(p,'renewal')).toFixed(1));
          const renewYears=_calcContractYears(pOvr);
          // 재계약 조건: OVR 50+ AND 팀 예산 여유 AND 50~80% 확률 (높은 OVR일수록 높음)
          const renewProb=pOvr>=84?80:pOvr>=75?70:pOvr>=67?60:pOvr>=51?50:20;
          const canAfford=team.budget>(renewSalary*renewYears);
          if(canAfford && pOvr>=51 && rand(1,100)<=renewProb){
            // 재계약 성공
            p.salary=renewSalary;
            p._contractYears=renewYears;
            p._contractEvent=null;
            G._aiRenewalLog.push({name:p.name,pos:p.pos,ovr:pOvr,age:p.age||22,team:team.name,emoji:team.emoji,salary:renewSalary,years:renewYears});
          } else {
            // 재계약 실패 → FA 풀로
            released.push(p);
          }
        }
      });
      // 재계약 실패한 선수만 FA 방출
      released.forEach(p=>{
        p._fromTeam=team.name;
        p._fromTeamEmoji=team.emoji;
        p._teamTenure=0;
        G.faPool.push(p);
      });
      // AI 팀은 FA 방출 선수만 로스터에서 제거, 유저 팀은 재계약 결정 후 제거
      if(team!==G.myTeam) team.roster=team.roster.filter(p=>!released.includes(p) && !(p.isForeign && (p._contractYears||0)<=0));
    });

    // P2-3 슈퍼2 선정: 서비스 2년차(2.0~2.99) 상위 22% → Arb 조기 자격 (Arb 4년, FA 시기 동일)
    const _s2Pool=[];
    G.teams.forEach(team=>team.roster.forEach(p=>{
      const st=p._serviceTime||0;
      if(st>=2&&st<ARB_MIN_SERVICE&&!p._super2)_s2Pool.push(p);
    }));
    _s2Pool.sort((a,b)=>(b._serviceTime||0)-(a._serviceTime||0));
    _s2Pool.slice(0,Math.ceil(_s2Pool.length*SUPER2_TOP_RATIO)).forEach(p=>{p._super2=true;});

    // AI 로스터 최적화 (승격/강등/방출/캡 정리)
    G.teams.filter(t=>t!==G.myTeam).forEach(t=>_aiOptimizeRoster(t));

    // AI 경쟁 입찰
    _runAIFreeAgentBidding();

    G._stoveSettledSeason=G.season;  // 정산 완료 표시 → 재진입 시 위 블록 스킵
  } else if(isFirstYear){
    G.faPool=G.faPool||[];
    G.faBiddingLog=[];
  }

  // 유저 팀 재계약 대상 선수
  const renewals=G._renewalCandidates||[];
  const renewalHTML=(!isFirstYear&&renewals.length>0)?`
    <div class="card" style="background:rgba(245,158,11,0.05);border:1px solid #f59e0b33;padding:10px;margin-bottom:10px;">
      <div style="font-size:0.72rem;color:#f59e0b;margin-bottom:6px;">📝 계약 만료 — 재계약 협상 대상 (${renewals.length}명)</div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-bottom:8px;">재계약하지 않으면 FA 시장으로 이동합니다.</div>
      <button class="btn btn-primary" onclick="_showRenewalNegotiation();" style="width:100%;">📝 재계약 협상</button>
    </div>`:'';

  // AI 재계약 결과
  const renewLog=G._aiRenewalLog||[];
  const renewLogHTML=(!isFirstYear&&renewLog.length>0)?`
    <div class="card" style="background:rgba(16,185,129,0.05);border:1px solid #10b98133;padding:10px;margin-bottom:10px;">
      <div style="font-size:0.72rem;color:#10b981;margin-bottom:6px;">🔄 소속 구단 재계약 (${renewLog.length}건)</div>
      <div style="max-height:100px;overflow-y:auto;scrollbar-width:none;font-size:0.68rem;color:var(--text-dim);line-height:1.7;">
        ${renewLog.map(r=>`${r.emoji} <b style="color:var(--text);">${r.team}</b> — <span style="color:${statColor(r.ovr)};">${r.name}</span>(${r.pos}, ${r.age}세, OVR ${r.ovr}) <b style="color:var(--accent);">${r.years}년 ${won(r.salary)}</b> 재계약`).join('<br>')}
      </div>
    </div>`:'';

  // AI 경쟁 입찰 결과
  const bidLog=G.faBiddingLog||[];
  const bidHTML=(!isFirstYear&&bidLog.length>0)?`
    <div class="card" style="background:rgba(245,158,11,0.05);border:1px solid #f59e0b33;padding:10px;margin-bottom:10px;">
      <div style="font-size:0.72rem;color:#f59e0b;margin-bottom:6px;">📰 FA 시장 속보 (${bidLog.length}건 계약)</div>
      <div style="max-height:120px;overflow-y:auto;font-size:0.68rem;color:var(--text-dim);line-height:1.7;">
        ${bidLog.map(b=>`${b.emoji} <b style="color:var(--text);">${b.team}</b>이(가) <span style="color:${statColor(b.ovr)};">${b.name}</span>(${b.pos}, ${b.age}세, OVR ${b.ovr})과(와) <b style="color:var(--accent);">${b.years}년 ${won(b.salary)}</b>에 계약${b.bidders>=3?' <span style="color:#a855f7;">🔥경쟁과열</span>':b.bidders>=2?' <span style="color:#f59e0b;">경쟁</span>':''}`).join('<br>')}
      </div>
    </div>`:'';

  // FA 풀 잔여 (유저가 영입 가능)
  const faRemain=(G.faPool||[]).length;
  const faInfo=faRemain>0?`<span style="color:#10b981;font-size:0.68rem;"> (잔여 FA ${faRemain}명)</span>`:'';

  // 유지비 정보
  const upkeep=calcAnnualUpkeep(t);
  const upkeepHTML=(!isFirstYear)?`
    <div class="card" style="background:rgba(239,68,68,0.03);border:1px solid #ef444422;padding:10px;margin-bottom:10px;">
      <div style="font-size:0.72rem;color:#ef4444;margin-bottom:6px;">💸 연간 유지비 (-${won(upkeep.total)})</div>
      <div style="font-size:0.68rem;color:var(--text-dim);line-height:1.6;">
        👔 코칭스태프 -${won(upkeep.staffCost)} · 🏟️ 경기장 -${won(upkeep.stadiumCost)} · 🏗️ 시설 -${won(upkeep.facilityCost)} · 🌱 퓨처스 -${won(upkeep.farmCost)}
      </div>
      ${(G._lastReserveDrain||0)>0?`<div style="font-size:0.68rem;color:#f59e0b;line-height:1.6;margin-top:4px;">🏦 구단주 배당 -${won(G._lastReserveDrain)} (준비금 ${won(RESERVE_SOFT_CAP)} 초과분 ${Math.round(RESERVE_DECAY_RATE*100)}% 회수 — 자금을 전력·시설에 쓰세요)</div>`:''}
    </div>`:'';

  // 수익 정보 (시즌 1 첫 시작 시에는 수익 정산 없음) — 정산 시점 스냅샷 우선 (재계산 오차 방지)
  const r=isFirstYear?null:(G._lastSeasonRev||calcSeasonRevenue(t,rank));
  const revenueHTML=isFirstYear?`
    <div class="card" style="background:var(--bg-card-hover);padding:12px;margin-bottom:12px;">
      <div style="font-size:0.72rem;color:var(--accent);margin-bottom:6px;">📋 팀 현황</div>
      <div style="font-size:0.78rem;color:var(--text-dim);line-height:1.8;">
        새로운 시즌을 시작합니다! FA 시장에서 선수를 영입하거나 시설에 투자하세요.
        <hr style="border-color:#333;margin:6px 0;">
        <span style="font-weight:700;color:var(--accent);">보유 자금: ${won(t.budget)}</span>
      </div>
    </div>`:`
    <div class="card" style="background:var(--bg-card-hover);padding:12px;margin-bottom:12px;">
      <div style="font-size:0.72rem;color:var(--accent);margin-bottom:6px;">💰 시즌 수익</div>
      <div style="font-size:0.78rem;color:var(--text-dim);line-height:1.8;">
        인기도 +${won(r.popRev)} | 승리 +${won(r.winB)} | 시설 +${won(r.facB)} | 스타 +${won(r.starB)} | 순위 +${won(r.rankB)}
        ${r.stadBonus>0?' | 구장 +'+won(r.stadBonus):''}
        ${r.luxTax>0?'<br><span style="color:#ef4444;">사치세 -'+won(r.luxTax)+' (3단계 누진)</span>':''}
        ${r.solidarity>0?'<br><span style="color:#f59e0b;">연대 기금 -'+won(r.solidarity)+' (수입 7%, 하위 4팀 분배)</span>':''}
        <hr style="border-color:#333;margin:6px 0;">
        <span style="font-weight:700;color:var(--accent);">최종 수익: +${won(r.net)} → 보유 자금: ${won(t.budget)}</span>
      </div>
    </div>`;

  $('modalTitle').textContent=isFirstYear?'🔥 시즌 준비':'🔥 스토브리그';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <p style="font-size:0.85rem;margin-bottom:8px;">${t.emoji} ${t.name} — ${isFirstYear?'시즌 1 준비':'시즌 '+G.season+' 결산'}</p>
      ${revenueHTML}
      ${upkeepHTML}
      ${renewalHTML}
      ${renewLogHTML}
      ${bidHTML}
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${isFirstYear?'':`<button class="btn btn-primary" onclick="_showSalaryNegotiation();" style="width:100%;">💰 연봉 협상</button>`}
        <button class="btn btn-secondary" onclick="_showFAMarket();" style="width:100%;">🔄 FA 시장${faInfo}</button>
        <button class="btn btn-secondary" onclick="$('seasonModal').classList.remove('active');switchTab('invest');" style="width:100%;">🏗️ 시설 투자</button>
        <button class="btn btn-secondary" onclick="$('seasonModal').classList.remove('active');switchTab('roster');" style="width:100%;">👥 로스터 확인</button>
        <button class="btn btn-primary" onclick="_startNextSeason();" style="width:100%;margin-top:8px;">▶ ${isFirstYear?'시즌 시작':'다음 시즌 준비 완료'}</button>
      </div>
    </div>`;
  $('seasonModal').classList.add('active');
}


// ===== AI 로스터 최적화 시스템 =====

// AI 가치 평가: OVR + 나이 + 연봉 → 종합 가치 점수
function _aiPlayerValue(p){
  const o=ovr(p);
  const age=p.age||22;
  const sal=p.salary||0;
  let val=o*2; // 기본: OVR 비례
  // 나이 보정: 25세 이하 유망주 가산, 34세 이상 노장 급감
  if(age<=23) val+=15;
  else if(age<=27) val+=8;
  else if(age<=31) val+=0;
  else if(age<=33) val-=10;
  else val-=25+(age-34)*5; // 34세: -25, 35세: -30, 36세: -35... (부호 오류 수정)
  // 잠재력 가산
  val+=((p._potential||50)-50)*0.4;
  // 연봉 효율 페널티: 고액+저능력 → 가치 급감
  if(sal>10&&o<59) val-=sal*2;
  else if(sal>20&&o<67) val-=sal;
  return val;
}

// AI 로스터 정리: OVR 기반 무한경쟁 + 명시적 방출 + 캡 정리
function _aiOptimizeRoster(team){
  if(team===G.myTeam)return;

  // ── 1. 1군-2군 무한 경쟁: 전체 로스터를 OVR 순 정렬 → 상위 29명만 active ──
  const healthy=team.roster.filter(p=>p.status!=='il'&&p.status!=='overseas');
  // 투수/타자 최소 비율 유지 (타자 최소 9, 투수 최소 5)
  const batters=healthy.filter(p=>!p.isPitcher).sort((a,b)=>ovr(b)-ovr(a));
  const pitchers=healthy.filter(p=>p.isPitcher).sort((a,b)=>ovr(b)-ovr(a));
  const minBat=Math.min(13,batters.length);
  const minPit=Math.min(10,pitchers.length);

  // 먼저 모든 건강한 선수 2군으로 리셋
  healthy.forEach(p=>{p.status='futures';p.role=p.isPitcher?'bullpen':'bench';});

  // 타자 상위 minBat명 1군
  let activeSlots=ACTIVE_ROSTER_MAX;
  batters.slice(0,minBat).forEach(p=>{
    if(activeSlots<=0)return;
    p.status='active';p.role='starting';activeSlots--;
  });
  // 투수 상위 minPit명 1군
  pitchers.slice(0,minPit).forEach(p=>{
    if(activeSlots<=0)return;
    p.status='active';p.role=p.pos==='SP'?'rotation':'bullpen';activeSlots--;
  });
  // 남은 슬롯: 전체 OVR 순으로 채움
  if(activeSlots>0){
    const remaining=healthy.filter(p=>p.status==='futures').sort((a,b)=>ovr(b)-ovr(a));
    remaining.slice(0,activeSlots).forEach(p=>{
      p.status='active';
      p.role=p.isPitcher?(p.pos==='SP'?'rotation':'bullpen'):'bench';
    });
  }

  // ── 2. 명시적 방출: 정원 60명 이상이면 선제 정리 (드래프트 6명 여유) ──
  const releaseThreshold=FUTURES_ORG_MAX-6; // 59명까지 정리
  if(team.roster.length>releaseThreshold){
    const candidates=team.roster
      .filter(p=>p.status==='futures'||p.status==='developmental')
      .sort((a,b)=>_aiPlayerValue(a)-_aiPlayerValue(b));
    let toCut=team.roster.length-releaseThreshold;
    while(toCut>0&&candidates.length>0){
      const cut=candidates.shift();
      // 25세 이상 + 잠재력 C/D급(12 미만) + 낮은 OVR 우선 방출
      const idx=team.roster.indexOf(cut);
      if(idx>=0){team.roster.splice(idx,1);toCut--;}
    }
  }

  // ── 3. 고액 연봉 정리: 페이롤 > 하드캡 90% 시 비효율 선수 방출 ──
  // P2-4: AI 정리 임계는 소프트캡(사치세 라인) 기준 — 하드캡 상향(280) 후 세금 구간 방치 방지
  const capThreshold=getLuxuryTaxLine()*1.05;
  if(getPayroll(team)>capThreshold){
    const expensive=team.roster
      .filter(p=>(p.salary||0)>5&&_aiPlayerValue(p)<80)
      .sort((a,b)=>(b.salary||0)/(ovr(b)||1)-(a.salary||0)/(ovr(a)||1));
    expensive.forEach(p=>{
      if(getPayroll(team)<=capThreshold)return;
      if((p._contractYears||0)<=0||(p.age||22)>=34){
        const idx=team.roster.indexOf(p);
        if(idx>=0)team.roster.splice(idx,1);
      }else{
        p.status='futures';p.role=p.isPitcher?'bullpen':'bench';
      }
    });
  }
}


// ── 다음 시즌 시작 ──────────────────────────────────────────────
function _startNextSeason(){
  $('seasonModal').classList.remove('active');
  G.season++;G.gameNum=0;G.phase='preseason';
  G.fanEventUsedThisGame=false;G.trainingCooldown=0;G.expandedEntryNotified=false;
  G.allStars=[];G.awards=[];G.postseasonBracket=null;
  G.faPool=[];G.faBiddingLog=[];G._draftResult=null;

  // 드래프트 풀 시즌 초 미리 생성 (48명) + 스카우팅 티켓 12장
  G._scoutTickets=12;
  const scLv=G.myTeam.scoutingLevel||0;
  G.draftPool=generateDraftPool();
  G.draftPool.forEach(dp=>{dp._scoutedOvr=getScoutedOvr(dp,scLv);});

  // AI 오프시즌 보강
  G.teams.filter(team=>team!==G.myTeam).forEach(team=>{
    // 잉여 현금 재투자 (경쟁 지출) — 준비금 120억 초과분의 45%를 인프라에 투입.
    // 유지비 기여 큰 항목(코치·구장·특수시설) 우선 → 전력↑ + 연 유지비↑(현금 싱크). 로스터 비대 없음.
    let war=Math.floor(Math.max(0,(team.budget||0)-120)*0.45);
    const spend=c=>{ if(war>=c){war-=c;team.budget=Math.floor((team.budget||0)-c);return true;} return false; };
    team.coachStaff=team.coachStaff||{};
    let guard=0;
    while(war>=8 && guard++<60){
      const cks=Object.keys(team.coachStaff).filter(k=>(team.coachStaff[k]||0)<5);
      if(cks.length){ const k=pick(cks),lv=team.coachStaff[k]||0; if(spend(8*(lv+1))){team.coachStaff[k]=lv+1;continue;} }
      if((team.slumpCareLevel||0)<4 && spend(FACILITY4_COSTS[team.slumpCareLevel||0])){team.slumpCareLevel=(team.slumpCareLevel||0)+1;continue;}
      if((team.mentalCoachLevel||0)<4 && spend(FACILITY4_COSTS[team.mentalCoachLevel||0])){team.mentalCoachLevel=(team.mentalCoachLevel||0)+1;continue;}
      if((team.stadiumLevel||0)<STADIUM_MAX_LEVEL && spend(Math.floor(Math.pow((team.stadiumLevel||0)+1,2)*8))){team.stadiumLevel=(team.stadiumLevel||0)+1;continue;}
      const lks=['devLevel','scoutingLevel','analyticsLevel','medicalLevel','facilityLevel'].filter(k=>(team[k]||0)<100);
      if(lks.length && spend(rand(6,10))){ const k=pick(lks); team[k]=clamp((team[k]||0)+rand(3,6),0,100); continue; }
      break;
    }
    if(team.budget>40){
      const np=rand(1,2)===1?genBatter(pick(BAT_POS),null,team.concept):genPitcher(pick(['SP','CP','SU','MR','LR']),null,team.concept);
      np.role=np.isPitcher?(np.pos==='SP'?'rotation':'bullpen'):'bench';
      team.roster.push(np);initSeasonStats(np);team.budget=+(team.budget-rand(10,25)).toFixed(1);
    }
    // AI 연봉 자동 조정
    team.roster.forEach(p=>{
      const pOvr=ovr(p);
      if(pOvr>=70)p.salary=Math.round((p.salary||3)*1.2);
      else if(pOvr<31)p.salary=Math.max(1,Math.round((p.salary||3)*0.8));
    });
  });

  // 시즌 리셋
  G.teams.forEach(t=>{
    t.wins=0;t.losses=0;t.rs=0;t.ra=0;t.rotationIdx=0;t.streak=0;t.recentResults=[];t.scoutCampUsed=0;t.overseasUsedThisSeason=0;t.medicalUsedThisSeason=0;
    if(t===G.myTeam){t.moralBoost=0;t.eventRevenue=0;}

    // 해외연수 강제 복귀 (스탯 부스트)
    t.roster.forEach(p=>{
      if(p.role==='overseas'){
        const boost=rand(OVERSEAS_BOOST_MIN,OVERSEAS_BOOST_MAX);
        if(p.isPitcher){const s=pick(['stuff','control','velocity','movement']);p[s]=clamp((p[s]||0)+boost,STAT_MIN,STAT_MAX);}
        else{const s=pick(['contact','power','eye','speed']);p[s]=clamp((p[s]||0)+boost,STAT_MIN,STAT_MAX);}
        p.role=p.prevRole||(p.isPitcher?'bullpen':'bench');p.overseasUntil=null;p.prevRole=null;
      }
    });

    // 커리어 스탯 누적 + 시즌 초기화
    t.roster.forEach(p=>{
      if(p.ss){
        if(!p._careerStats)p._careerStats={...p.ss};
        else Object.keys(p.ss).forEach(k=>{p._careerStats[k]=(p._careerStats[k]||0)+(p.ss[k]||0);});
      }
      p.xp=0;p.cooldown=0;p.rehabGamesLeft=0;
      initSeasonStats(p);
      if(p.status==='il'){p.status='futures';p.isOnIL=false;p.ilGamesLeft=0;}
    });
  });

  updateHeader();switchTab('dashboard');
  advancePhase(); // → preseason
  saveGame();
}
