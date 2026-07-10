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

    // 연간 고정 지출 차감 (모든 팀)
    G.teams.forEach(team=>{
      const upkeep=calcAnnualUpkeep(team);
      team.budget=Math.floor(team.budget-upkeep.total);
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
          // AI 팀: 소속 구단 우선 재계약 시도 (P2-4: 절대 연봉 스케일)
          const pOvr=ovr(p);
          const renewSalary=Math.max(1,Math.floor(_calcSalary(pOvr,p._serviceTime||FA_SERVICE_TIME_THRESHOLD)));
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

// ── 재계약 협상 ─────────────────────────────────────────────────
function _showRenewalNegotiation(){
  const renewals=G._renewalCandidates||[];
  if(renewals.length===0){showToast('재계약 대상 선수가 없습니다.');showStoveLeague();return;}

  // 총 예상 비용
  const totalExpCost=renewals.reduce((s,p)=>{const e=getExpectedContract(p,'renewal');return s+e.salary*e.years;},0);

  $('modalTitle').textContent='';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:0.92rem;font-weight:700;color:var(--text);">📝 재계약 협상</div>
        <div style="display:flex;gap:10px;font-size:0.65rem;color:var(--text-dim);">
          <span>대상 <b style="color:var(--accent);">${renewals.length}명</b></span>
          <span>예상 총액 <b style="color:#f59e0b;">~${won(+totalExpCost.toFixed(1))}</b></span>
        </div>
      </div>

      <!-- 안내 -->
      <div style="background:rgba(245,158,11,0.06);border:1px solid #f59e0b22;border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:0.68rem;color:var(--text-dim);">
        선수를 클릭하여 계약 조건을 협상하세요. 협상 결렬 시 FA 시장으로 이동합니다.
      </div>

      <!-- 선수 목록 -->
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
        ${renewals.map((p,i)=>{
          const o=ovr(p);const exp=getExpectedContract(p,'renewal');const w=approxWAR(p);
          return `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#111827;border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='var(--border)'" onclick="_startRenewalNego(${i})">
            <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.6rem;padding:2px 8px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
            <div style="flex:1;">
              <div class="player-name" style="font-size:0.78rem;">${p.name}</div>
              <div style="font-size:0.58rem;color:var(--text-dim);">${p.age||22}세 · WAR ${w.toFixed(1)} · 서비스 ${p._serviceTime||0}yr</div>
            </div>
            <span style="color:${statColor(o)};font-weight:800;font-size:0.88rem;font-family:'JetBrains Mono',monospace;">${o}</span>
            <div style="text-align:right;min-width:80px;">
              <div style="color:#f59e0b;font-size:0.72rem;font-weight:700;">~${won(exp.salary)} × ${exp.years}년</div>
              <div style="font-size:0.55rem;color:var(--text-dim);">에이전트 요구</div>
            </div>
            <button class="btn btn-sm" onclick="_declineRenewal(${i});event.stopPropagation();" style="font-size:0.55rem;padding:3px 8px;background:rgba(239,68,68,0.08);border:1px solid #ef444433;color:#ef4444;border-radius:6px;">방출</button>
            <span style="color:var(--text-dim);font-size:0.72rem;">›</span>
          </div>`;
        }).join('')}
      </div>

      <!-- 하단 버튼 -->
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary" onclick="_declineAllRenewals();" style="flex:1;color:#ef4444;border-color:#ef444433;">전체 방출</button>
        <button class="btn btn-secondary" onclick="showStoveLeague();" style="flex:1;padding:10px;">← 돌아가기</button>
      </div>
    </div>`;
  $('seasonModal').classList.add('active');
}

function _startRenewalNego(idx){
  const renewals=G._renewalCandidates||[];
  const p=renewals[idx];if(!p)return;

  showNegotiationModal(p,'renewal',
    function onAccept(salary,years){
      p.salary=salary;p._contractYears=years;p._contractEvent=null;
      G._renewalCandidates=(G._renewalCandidates||[]).filter(c=>c!==p);
      showToast(`✅ ${p.name} 재계약! (${won(salary)} × ${years}년)`);
      saveGame();
      if((G._renewalCandidates||[]).length>0)_showRenewalNegotiation();
      else showStoveLeague();
    },
    function onFail(reason){
      if(reason==='cancel'){_showRenewalNegotiation();return;}
      // 결렬 → FA 방출
      p._fromTeam=G.myTeam.name;p._fromTeamEmoji=G.myTeam.emoji;
      p._teamTenure=0;
      G.faPool.push(p);
      G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
      G._renewalCandidates=(G._renewalCandidates||[]).filter(c=>c!==p);
      showToast(`❌ ${p.name} 협상 결렬 → FA 이동`);
      saveGame();
      if((G._renewalCandidates||[]).length>0)_showRenewalNegotiation();
      else showStoveLeague();
    }
  );
}

function _declineRenewal(idx){
  const renewals=G._renewalCandidates||[];
  const p=renewals[idx];if(!p)return;
  p._fromTeam=G.myTeam.name;p._fromTeamEmoji=G.myTeam.emoji;
  p._teamTenure=0;
  G.faPool.push(p);
  G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
  G._renewalCandidates=renewals.filter(c=>c!==p);
  showToast(`❌ ${p.name} FA 방출`);saveGame();
  if((G._renewalCandidates||[]).length>0)_showRenewalNegotiation();
  else showStoveLeague();
}

function _declineAllRenewals(){
  const renewals=G._renewalCandidates||[];
  renewals.forEach(p=>{
    p._fromTeam=G.myTeam.name;p._fromTeamEmoji=G.myTeam.emoji;
    p._teamTenure=0;
    G.faPool.push(p);
    G.myTeam.roster=G.myTeam.roster.filter(r=>r!==p);
  });
  G._renewalCandidates=[];
  showToast(`❌ 전체 FA 방출 (${renewals.length}명)`);
  showStoveLeague();saveGame();
}

// ── 연봉 협상 ───────────────────────────────────────────────────
function _calcNewSalary(p){
  const pOvr=ovr(p);
  const war=approxWAR(p);
  const st=p._serviceTime||0;
  const oldSalary=p.salary||0;
  const phase=getContractPhase(p);
  let newSalary;

  if(phase==='pre'){
    // 프리아브: 신인 계약 연봉 유지 (슬롯 연봉 3년 고정, 인상 없음)
    newSalary=Math.max(PRE_ARB_SALARY,oldSalary);
  }else if(phase==='arb'){
    // P2-3 연봉조정 (Arbitration): 연차별 설계 인상률
    // Arb1 = 성적 기반 베이스라인 / Arb2 = 전년 120~180% / Arb3+ = 전년 110~150%
    // 연차는 명시적 카운터(_arbYears, 호출부에서 시즌당 1회 증가) — floor(서비스타임) 파생 시
    // 슈퍼2 진입 기준이 뒤바뀌거나 부분 출전으로 연차가 정체되는 버그가 있어 교체
    const arbYear=Math.max(1,p._arbYears||1);
    if(arbYear<=1||oldSalary<=PRE_ARB_SALARY*1.5){
      newSalary=_calcSalary(pOvr,ARB_MIN_SERVICE,p._super2); // 베이스라인 (전년 연봉 무관)
    }else if(arbYear===2){
      newSalary=+(oldSalary*(rand(120,180)/100)).toFixed(1);
    }else{
      newSalary=+(oldSalary*(rand(110,150)/100)).toFixed(1);
    }
    if(war>=3)newSalary=+(newSalary*1.15).toFixed(1);
    newSalary=Math.max(SALARY_MIN,+newSalary);
  }else{
    // FA 자격자: 자유 시장 가치 기반
    if(pOvr>=75)newSalary=+(oldSalary*1.3+rand(5,20)*0.1).toFixed(1);
    else if(pOvr>=59)newSalary=+(oldSalary*1.1+rand(2,10)*0.1).toFixed(1);
    else if(pOvr>=37)newSalary=oldSalary;
    else newSalary=Math.max(SALARY_MIN,+(oldSalary*0.85).toFixed(1));
    if(war>=3)newSalary=+(newSalary*1.15).toFixed(1);
    else if(war<0.5&&pOvr<47)newSalary=Math.max(SALARY_MIN,+(newSalary-0.5).toFixed(1));
  }
  // 팀 컨셉 연봉 배율
  if(G.myTeam.concept==='pitching')newSalary=+(newSalary*1.05).toFixed(1);
  if(G.myTeam.concept==='prospect')newSalary=+(newSalary*1.10).toFixed(1);
  return +newSalary;
}

function _getSalaryPhase(p){
  const ph=getContractPhase(p);
  if(ph==='pre')return'프리아브';
  if(ph==='arb')return(p._super2&&(p._serviceTime||0)<ARB_MIN_SERVICE)?'연봉조정(슈퍼2)':'연봉조정';
  return'FA자격';
}

function _showSalaryNegotiation(){
  const t=G.myTeam;
  // 프리아브/연봉조정: 자동 조정
  const autoAdjust=[];
  // FA 자격: 개별 협상 대상
  const faPlayers=[];

  t.roster.forEach(p=>{
    const phase=_getSalaryPhase(p);
    if(phase==='FA자격'){
      faPlayers.push(p);
      return;
    }
    // 프리아브/연봉조정 자동 조정은 시즌당 1회만 — 재진입 시 복리 인상 방지
    if(p._salaryAdjSeason===G.season)return;
    // P2-3 Arb 연차 누적 (슈퍼2 조기 진입 포함, 서비스타임과 독립)
    if(getContractPhase(p)==='arb')p._arbYears=(p._arbYears||0)+1;
    const oldSalary=p.salary||0;
    const newSalary=_calcNewSalary(p);
    if(newSalary!==oldSalary){
      autoAdjust.push({p,oldSalary,newSalary,phase});
    }
    p._salaryAdjSeason=G.season;
  });

  // 프리아브/연봉조정 자동 적용
  autoAdjust.forEach(a=>{a.p.salary=a.newSalary;});

  // 자동 조정 요약
  const totalUp=autoAdjust.filter(a=>a.newSalary>a.oldSalary);
  const totalDown=autoAdjust.filter(a=>a.newSalary<a.oldSalary);
  const diffSum=autoAdjust.reduce((s,a)=>s+(a.newSalary-a.oldSalary),0);

  $('modalTitle').textContent='';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:0.92rem;font-weight:700;color:var(--text);">💰 연봉 협상</div>
        <div style="font-size:0.65rem;color:var(--text-dim);">시즌 ${G.season||1}</div>
      </div>

      ${autoAdjust.length>0?`
      <!-- 자동 조정 요약 카드 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:#111827;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.58rem;color:var(--text-dim);">조정 인원</div>
          <div style="font-size:1rem;font-weight:700;color:var(--text);">${autoAdjust.length}명</div>
        </div>
        <div style="background:#111827;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.58rem;color:var(--text-dim);">인상 / 감봉</div>
          <div style="font-size:0.82rem;font-weight:700;"><span style="color:#ef4444;">${totalUp.length}</span> / <span style="color:#10b981;">${totalDown.length}</span></div>
        </div>
        <div style="background:#111827;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:0.58rem;color:var(--text-dim);">총 변동</div>
          <div style="font-size:0.82rem;font-weight:700;color:${diffSum>0?'#ef4444':'#10b981'};">${diffSum>0?'+':''}${won(+diffSum.toFixed(1))}</div>
        </div>
      </div>

      <!-- 자동 조정 상세 테이블 -->
      <div style="background:#111827;border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:14px;">
        <div style="font-size:0.68rem;color:var(--accent);margin-bottom:8px;">자동 조정 완료 (프리아브 / 연봉조정)</div>
        <div style="max-height:180px;overflow-y:auto;scrollbar-width:none;">
          <table class="data-table" style="font-size:0.7rem;">
            <thead><tr><th>포지션</th><th>이름</th><th>단계</th><th>OVR</th><th>변경</th><th>차액</th></tr></thead>
            <tbody>${autoAdjust.map(a=>{
              const diff=a.newSalary-a.oldSalary;
              const o=ovr(a.p);
              return '<tr>'+
                '<td><span class="pos-badge'+(a.p.isPitcher?' pitcher':'')+'" style="font-size:0.5rem;padding:1px 4px;">'+(ALL_POS_NAMES[a.p.pos]||a.p.pos)+'</span></td>'+
                '<td class="player-name" style="font-size:0.7rem;">'+a.p.name+'</td>'+
                '<td style="color:'+(a.phase==='프리아브'?'#67e8f9':'#f59e0b')+';font-size:0.6rem;">'+a.phase+'</td>'+
                '<td style="color:'+statColor(o)+';font-weight:700;">'+o+'</td>'+
                '<td style="font-family:JetBrains Mono,monospace;">'+won(a.oldSalary)+' → <b>'+won(a.newSalary)+'</b></td>'+
                '<td style="color:'+(diff>0?'#ef4444':'#10b981')+';font-family:JetBrains Mono,monospace;font-weight:700;">'+(diff>0?'+':'')+won(+diff.toFixed(1))+'</td></tr>';
            }).join('')}</tbody>
          </table>
        </div>
      </div>`:''}

      ${faPlayers.length>0?`
      <!-- FA 자격 선수 개별 협상 -->
      <div style="background:#111827;border:1px solid #10b98133;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-size:0.72rem;color:#10b981;font-weight:700;">FA 자격 선수 — 개별 협상</div>
          <div style="font-size:0.6rem;color:var(--text-dim);">${faPlayers.length}명</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${faPlayers.map(p=>{
            const o=ovr(p);
            const w=approxWAR(p);
            return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#0a0e1a;border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='#10b981'" onmouseout="this.style.borderColor='var(--border)'" onclick="_startSalaryNego(${t.roster.indexOf(p)})">
              <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.55rem;padding:2px 6px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
              <div style="flex:1;">
                <div class="player-name" style="font-size:0.75rem;">${p.name}</div>
                <div style="font-size:0.58rem;color:var(--text-dim);">${p.age||22}세 · WAR ${w.toFixed(1)}</div>
              </div>
              <span style="color:${statColor(o)};font-weight:800;font-size:0.85rem;font-family:'JetBrains Mono',monospace;">${o}</span>
              <div style="text-align:right;min-width:60px;">
                <div style="color:var(--accent);font-size:0.75rem;font-weight:700;">${won(p.salary||0)}</div>
                <div style="font-size:0.55rem;color:var(--text-dim);">현재 연봉</div>
              </div>
              <span style="color:var(--text-dim);font-size:0.72rem;">›</span>
            </div>`;
          }).join('')}
        </div>
      </div>`:'<div style="background:#111827;border-radius:10px;padding:16px;text-align:center;color:var(--text-dim);font-size:0.72rem;margin-bottom:14px;">FA 자격 선수가 없습니다.</div>'}

      <button class="btn btn-secondary" onclick="showStoveLeague();" style="width:100%;padding:10px;">← 돌아가기</button>
    </div>`;
  $('seasonModal').classList.add('active');
  saveGame();
}

function _startSalaryNego(rosterIdx){
  const p=G.myTeam.roster[rosterIdx];if(!p)return;
  showNegotiationModal(p,'salary',
    function onAccept(salary,years){
      p.salary=salary;p._contractYears=years;
      showToast(`✅ ${p.name} 연봉 합의! (${won(salary)} × ${years}년)`);
      saveGame();_showSalaryNegotiation();
    },
    function onFail(){_showSalaryNegotiation();}
  );
}

// ── AI 경쟁 입찰 ─────────────────────────────────────────────────
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

function _runAIFreeAgentBidding(){
  if(!G.faPool||G.faPool.length===0)return;
  G.faBiddingLog=[];  // 입찰 로그 (UI 표시용)

  // FA를 OVR 내림차순 정렬 (고급 선수부터 입찰)
  const pool=[...G.faPool].sort((a,b)=>ovr(b)-ovr(a));
  const aiTeams=G.teams.filter(t=>t!==G.myTeam);

  // AI 팀별 예산/니즈 계산
  function teamNeed(team){
    const batCount=team.roster.filter(p=>!p.isPitcher&&(p.status||'active')==='active').length;
    const pitCount=team.roster.filter(p=>p.isPitcher&&(p.status||'active')==='active').length;
    return {needBat:batCount<11, needPit:pitCount<10, budget:team.budget||0};
  }

  pool.forEach(fa=>{
    const pOvr=ovr(fa);

    // 시장 가치 산정 (P2-4: 절대 연봉 스케일)
    const marketSalary=Math.max(SALARY_MIN,+_calcSalary(pOvr,fa._serviceTime||FA_SERVICE_TIME_THRESHOLD).toFixed(1));

    const contractYears=_calcContractYears(pOvr);
    const transferFee=+(pOvr*0.3+rand(5,15)).toFixed(1);

    // OVR 55 미만: AI 경쟁 없음 → 유저 전용 FA 시장으로
    if(pOvr<59){
      fa.salary=marketSalary;
      fa._contractYears=contractYears;
      fa.price=transferFee;
      return;  // faPool에 남김
    }

    // AI 팀 입찰: 예산 여유 + 포지션 니즈 + OVR 기반 + 샐러리캡 가드
    const bidders=aiTeams.filter(t=>{
      const need=teamNeed(t);
      const posMatch=fa.isPitcher?need.needPit:need.needBat;
      const canAfford=need.budget>(marketSalary*contractYears+transferFee);
      // P2-4: 소프트캡(사치세 라인) 근접 시 추가 영입 중단 — AI가 모르고 세금 구간에 눌러앉는 것 방지
      const payroll=getPayroll(t);
      if(payroll+marketSalary>getLuxuryTaxLine()*1.05) return false;
      // 높은 OVR → 더 많은 팀이 관심 (랜덤 경쟁)
      const interest=pOvr>=84?60:pOvr>=75?45:pOvr>=67?30:20;
      return canAfford&&(posMatch||rand(1,100)<=interest);
    });

    if(bidders.length===0) {
      // 아무도 안 원함 → FA 시장에 남김
      fa.salary=marketSalary;
      fa._contractYears=contractYears;
      fa.price=transferFee;
      return;
    }

    // 최고 입찰팀: 예산이 가장 큰 팀이 낙찰 (경쟁 프리미엄 적용)
    bidders.sort((a,b)=>(b.budget||0)-(a.budget||0));
    const winner=bidders[0];
    const competitionMult=bidders.length>=3?1.25:bidders.length>=2?1.15:1.0;
    const finalSalary=+(marketSalary*competitionMult).toFixed(1);
    const finalContract=Math.min(contractYears+Math.floor(bidders.length/2),6);

    // 계약 체결
    fa.salary=finalSalary;
    fa._contractYears=finalContract;
    fa._teamTenure=0;
    fa._contractEvent=null;
    fa.status='active';
    fa.role=fa.isPitcher?(fa.pos==='SP'?'rotation':'bullpen'):'bench';
    initSeasonStats(fa);
    winner.roster.push(fa);
    winner.budget=+(winner.budget-transferFee).toFixed(1);

    G.faBiddingLog.push({
      name:fa.name, pos:fa.pos, ovr:pOvr, age:fa.age||22,
      team:winner.name, emoji:winner.emoji,
      salary:finalSalary, years:finalContract,
      bidders:bidders.length, from:fa._fromTeam||'외부'
    });

    // FA 풀에서 제거
    const idx=G.faPool.indexOf(fa);
    if(idx>=0) G.faPool.splice(idx,1);
  });
}

// ── FA 시장 (유저용: 계약 만료 + 보충 FA) ────────────────────────
function _showFAMarket(){
  G.marketPlayers=[];
  const faMult=G.myTeam.concept==='pitching'?1.05:G.myTeam.concept==='prospect'?1.10:1.0;

  // 1. 계약 만료로 FA 풀에 남은 선수 (AI가 안 가져간 것)
  (G.faPool||[]).forEach(fa=>{
    fa.price=+(fa.price||((ovr(fa)*0.3+rand(5,15))*faMult)).toFixed(1);
    if(!fa.salary) fa.salary=Math.max(SALARY_MIN,+_calcSalary(ovr(fa),fa._serviceTime||FA_SERVICE_TIME_THRESHOLD).toFixed(1));
    if(!fa._contractYears) fa._contractYears=_calcContractYears(ovr(fa));
    fa.status='futures';
    if(!fa.ss)initSeasonStats(fa);
    G.marketPlayers.push(fa);
  });

  // 2. 기존: 서비스 타임 달성 선수 추가 FA (다른 팀에서 30% 확률)
  G.teams.filter(team=>team!==G.myTeam).forEach(team=>{
    const candidates=team.roster.filter(p=>
      (p._serviceTime||0)>=FA_SERVICE_TIME_THRESHOLD && (p._contractYears||0)<=1
    );
    candidates.forEach(p=>{
      if(rand(1,100)<=20&&team.roster.length>ORG_MIN_TOTAL){
        const fa={...p};
        fa.price=+((ovr(fa)*0.3+rand(5,15))*faMult).toFixed(1);
        fa.status='futures';
        fa._fromTeam=team.name;
        if(!fa.ss)initSeasonStats(fa);
        G.marketPlayers.push(fa);
        team.roster=team.roster.filter(tp=>tp!==p);
      }
    });
  });

  // 3. 랜덤 FA 보충 (등급 분포 기반, 최소 26세)
  for(let i=0;i<3;i++){
    const p=genBatter(pick(BAT_POS),null);
    if(p.age<26)p.age=rand(26,33);
    p.price=+((ovrBatter(p)*0.25+rand(3,10))*faMult).toFixed(1);
    p.role='bench';p.status='futures';
    p._serviceTime=rand(7,12);
    G.marketPlayers.push(p);
  }
  for(let i=0;i<2;i++){
    const role=['SP','CP'][i];
    const p=genPitcher(role,null);
    if(p.age<26)p.age=rand(26,33);
    p.price=+((ovrPitcher(p)*0.25+rand(3,10))*faMult).toFixed(1);
    p.role=role==='SP'?'rotation':'bullpen';p.status='futures';
    p._serviceTime=rand(7,12);
    G.marketPlayers.push(p);
  }

  $('seasonModal').classList.remove('active');
  switchTab('market');
  showToast('🔄 FA 시장이 개장되었습니다!');
}

// ── 다음 시즌 시작 ──────────────────────────────────────────────
function _startNextSeason(){
  $('seasonModal').classList.remove('active');
  G.season++;G.gameNum=0;G.phase='preseason';
  G.fanEventUsedThisGame=false;G.trainingCooldown=0;
  G.allStars=[];G.awards=[];G.postseasonBracket=null;
  G.faPool=[];G.faBiddingLog=[];G._draftResult=null;

  // 드래프트 풀 시즌 초 미리 생성 (48명) + 스카우팅 티켓 12장
  G._scoutTickets=12;
  const scLv=G.myTeam.scoutingLevel||0;
  G.draftPool=generateDraftPool();
  G.draftPool.forEach(dp=>{dp._scoutedOvr=getScoutedOvr(dp,scLv);});

  // AI 오프시즌 보강
  G.teams.filter(team=>team!==G.myTeam).forEach(team=>{
    if(rand(1,100)<=50)team.facilityLevel=clamp(team.facilityLevel+rand(1,4),0,100);
    if(rand(1,100)<=40)team.devLevel=clamp(team.devLevel+rand(1,4),0,100);
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

// ── showSeasonEnd (하위 호환 — 기존 코드 참조용) ─────────────────
function showSeasonEnd(){showStoveLeague();}
function nextSeason(){_startNextSeason();}
