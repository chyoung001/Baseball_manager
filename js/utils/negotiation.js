// ═══════════════════════════════════════════════════════
// 계약 협상 시스템
// ═══════════════════════════════════════════════════════

// ── 히든 스탯 기반 요구액 보정 (P2-2, 설계서 상황 B/C) ──
// 야망(상황 C): 기대 연봉 ±10% 공격성. 충성심(상황 B): 재계약+재적 3년+ 시 홈타운 디스카운트,
// 야망이 충성심보다 크면 차이 × 0.5%p 만큼 할인 상쇄. (o = (히든-50)/5 : 구 스케일 오프셋)
function _contractHiddenMod(p,context){
  const oAmb=((p._ambition||50)-50)/5;
  let mult=1+oAmb*0.01; // 야망 -10~+10 → ×0.90~1.10
  if(context==='renewal'&&(p._teamTenure||0)>=3){
    const oLoy=((p._loyalty||50)-50)/5;
    let disc=Math.max(0,oLoy*1.25); // 충성심 만점 → 12.5% 할인
    if(oAmb>oLoy)disc=Math.max(0,disc-(oAmb-oLoy)*0.5);
    mult*=1-disc/100;
  }
  return mult;
}

// 선수의 기대 계약 조건 (내부값)
function getExpectedContract(p,context){
  const pOvr=ovr(p);
  const base=Math.max(1,Math.floor(_calcSalary(pOvr,p._serviceTime||0)));
  const salary=Math.max(SALARY_MIN,+(base*_contractHiddenMod(p,context)).toFixed(1));
  const years=_calcContractYears(pOvr);
  return {salary,years,totalValue:+(salary*years).toFixed(1)};
}

// 유저 제안 판정: 'accept' | 'reject'
function evaluateOffer(p,offerSalary,offerYears,context){
  const exp=getExpectedContract(p,context);
  const offerTotal=offerSalary*offerYears;
  const totalRatio=offerTotal/Math.max(1,exp.totalValue);
  const aavOk=offerSalary>=exp.salary*0.6;
  if(!aavOk)return 'reject';
  if(totalRatio>=1.0)return 'accept';
  if(totalRatio>=0.85)return rand(1,100)<=70?'accept':'reject';
  if(totalRatio>=0.7)return rand(1,100)<=30?'accept':'reject';
  return 'reject';
}

// FA 경쟁 페널티: 거절 시 AI가 빼앗을 확률
function _faSnatchProb(p){
  const o=ovr(p);
  if(o>=84)return 60;if(o>=75)return 50;if(o>=67)return 40;if(o>=59)return 30;return 20;
}

// 공통 협상 모달
// context: 'renewal'|'fa'|'scout'|'salary'
// onAccept(salary, years): 수락 시 콜백
// onFail(): 결렬 시 콜백
// onRejectFA(p): FA 거절 시 빼앗김 콜백 (fa context만)
let _negoState=null;

function showNegotiationModal(p, context, onAccept, onFail, extraData){
  const exp=getExpectedContract(p,context);
  const aLv=G.myTeam.analyticsLevel||0;
  // 데이터 분석팀 레벨에 따른 에이전트 요구 조건 힌트 정확도
  const hintSalary=aLv>=60?exp.salary:aLv>=30?Math.floor(exp.salary*(0.8+Math.random()*0.4)):Math.floor(exp.salary*(0.5+Math.random()));
  const hintYears=aLv>=60?exp.years:aLv>=30?clamp(exp.years+rand(-1,1),1,6):clamp(exp.years+rand(-2,2),1,6);

  // 참을성(상황 C): 협상 인내 — 높으면 역제안 기회 4회, 낮으면 2회
  const tem=p._temperament||50;
  const maxAttempts=tem>=65?4:tem<40?2:3;
  _negoState={p,context,onAccept,onFail,extraData,attemptsLeft:maxAttempts,maxAttempts,exp};

  _renderNegotiationUI(hintSalary,hintYears);
}

function _renderNegotiationUI(hintSalary,hintYears){
  const s=_negoState;if(!s)return;
  const p=s.p,o=ovr(p);
  const st=p._serviceTime||0;
  const phase=st<=PRE_ARB_MAX_SERVICE?'프리아브':st<=ARB_MAX_SERVICE?'연봉조정':'FA자격';
  const phColor=st<=PRE_ARB_MAX_SERVICE?'#67e8f9':st<=ARB_MAX_SERVICE?'#f59e0b':'#10b981';
  const contextLabel=s.context==='renewal'?'재계약':s.context==='fa'?'FA 영입':s.context==='salary'?'연봉 협상':'계약';
  const war=approxWAR(p);

  // 능력치 상위 3개 미니바
  let topStats=[];
  if(p.isPitcher){
    topStats=[{l:'구위',v:p.stuff},{l:'제구',v:p.control},{l:'구속',v:p.velocity},{l:'무브',v:p.movement},{l:'체력',v:p.stamina},{l:'위기',v:p.clutch}];
  }else{
    topStats=[{l:'컨택',v:p.contact},{l:'파워',v:p.power},{l:'선구',v:p.eye},{l:'주력',v:p.speed},{l:'수비',v:p.fielding},{l:'어깨',v:p.arm}];
  }
  topStats.sort((a,b)=>b.v-a.v);
  const top3=topStats.slice(0,3);

  // 시즌 핵심 성적
  const ss=p.ss||{};
  let keyStatHTML='';
  if(p.isPitcher){
    const era=ssERA(p);
    const ipStr=ssIPstr(p);
    keyStatHTML=`<span>ERA <b style="color:${era<=3?'#10b981':era<=4.5?'#f59e0b':'#ef4444'};">${era.toFixed(2)}</b></span>
      <span>W-L <b>${ss.w||0}-${ss.l||0}</b></span><span>IP <b>${ipStr}</b></span>`;
  }else{
    const avg=ss.ab>0?(ss.h/ss.ab):0;
    keyStatHTML=`<span>AVG <b style="color:${avg>=.300?'#10b981':avg>=.250?'#f59e0b':'#ef4444'};">${avg.toFixed(3)}</b></span>
      <span>HR <b style="color:${(ss.hr||0)>=10?'#a855f7':'var(--text)'};">${ss.hr||0}</b></span><span>RBI <b>${ss.rbi||0}</b></span>`;
  }

  // 남은 협상 도트 (참을성에 따라 2~4회)
  const dots=Array.from({length:s.maxAttempts||3},(_, i)=>{
    if(i<s.attemptsLeft) return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);"></span>';
    return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#374151;"></span>';
  }).join('');

  $('modalTitle').textContent='';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <!-- 헤더: 컨텍스트 라벨 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="font-size:0.92rem;font-weight:700;color:var(--text);">📝 ${contextLabel} 협상</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:0.62rem;color:${s.attemptsLeft<=1?'#ef4444':'var(--text-dim)'};">남은 기회</span>
          <div style="display:flex;gap:3px;">${dots}</div>
        </div>
      </div>

      <!-- 선수 프로필 카드 -->
      <div style="background:linear-gradient(135deg,#1a1f35 0%,#0f1729 100%);border:1px solid ${statColor(o)}33;border-radius:12px;padding:14px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div style="position:relative;">
            <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.82rem;padding:5px 14px;">${ALL_POS_NAMES[p.pos]||p.pos}</span>
          </div>
          <div style="flex:1;">
            <div style="font-size:1rem;font-weight:700;color:var(--text);margin-bottom:2px;">${p.name}</div>
            <div style="display:flex;gap:8px;font-size:0.68rem;color:var(--text-dim);">
              <span>${p.age||22}세</span>
              <span style="color:${phColor};">${phase} (${st}yr)</span>
              <span>계약 ${p._contractYears||1}년</span>
            </div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:1.6rem;font-weight:800;color:${statColor(o)};line-height:1;font-family:'JetBrains Mono',monospace;">${o}</div>
            <div style="font-size:0.55rem;color:var(--text-dim);margin-top:1px;">OVR</div>
          </div>
        </div>

        <!-- 상위 능력치 미니바 -->
        <div style="display:flex;gap:8px;margin-bottom:10px;">
          ${top3.map(s=>`<div style="flex:1;background:#111827;border-radius:6px;padding:5px 8px;">
            <div style="display:flex;justify-content:space-between;font-size:0.6rem;margin-bottom:3px;">
              <span style="color:var(--text-dim);">${s.l}</span>
              <span style="color:${statColor(s.v)};font-weight:700;">${s.v}</span>
            </div>
            <div style="height:3px;background:#1f2937;border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${statPct(s.v)}%;background:${statColor(s.v)};border-radius:2px;"></div>
            </div>
          </div>`).join('')}
        </div>

        <!-- 시즌 성적 + WAR -->
        <div style="display:flex;align-items:center;gap:12px;font-size:0.72rem;color:var(--text-dim);padding:6px 8px;background:#111827;border-radius:6px;">
          ${keyStatHTML}
          <span style="margin-left:auto;color:${war>=3?'#10b981':war>=1.5?'#f59e0b':'var(--text-dim)'};">WAR <b>${war.toFixed(1)}</b></span>
        </div>
      </div>

      <!-- 협상 테이블: 에이전트 vs 나 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <!-- 에이전트 요구 -->
        <div style="background:#111827;border:1px solid #f59e0b33;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:0.62rem;color:#f59e0b;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">에이전트 요구</div>
          <div style="font-size:1.3rem;font-weight:800;color:#f59e0b;font-family:'JetBrains Mono',monospace;">${won(hintSalary)}</div>
          <div style="font-size:0.72rem;color:var(--text-dim);margin-top:2px;">${hintYears}년 · 총 ${won(hintSalary*hintYears)}</div>
        </div>

        <!-- 나의 제안 -->
        <div style="background:#111827;border:1px solid #3b82f633;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:0.62rem;color:#3b82f6;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">나의 제안</div>
          <div style="display:flex;gap:6px;justify-content:center;align-items:center;">
            <input type="number" id="negoSalary" value="${hintSalary}" min="${SALARY_MIN}" max="50" step="0.5"
              style="width:70px;padding:4px 6px;background:#0a0e1a;border:1px solid #3b82f644;border-radius:6px;color:#3b82f6;font-size:1.1rem;font-weight:800;font-family:'JetBrains Mono',monospace;text-align:center;"
              oninput="_updateNegoTotal()">
            <span style="color:var(--text-dim);font-size:0.72rem;">억</span>
          </div>
          <div style="display:flex;gap:6px;justify-content:center;align-items:center;margin-top:6px;">
            <select id="negoYears" style="padding:3px 8px;background:#0a0e1a;border:1px solid #3b82f644;border-radius:6px;color:#3b82f6;font-size:0.82rem;font-weight:700;text-align:center;cursor:pointer;"
              onchange="_updateNegoTotal()">
              ${[1,2,3,4,5,6].map(y=>`<option value="${y}" ${y===hintYears?'selected':''}>${y}년</option>`).join('')}
            </select>
            <span style="font-size:0.68rem;color:var(--text-dim);" id="negoTotalDisp">총 ${won(hintSalary*hintYears)}</span>
          </div>
        </div>
      </div>

      <!-- 제안 비교 게이지 -->
      <div style="background:#111827;border-radius:8px;padding:10px 12px;margin-bottom:12px;" id="negoGaugeWrap">
        <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-dim);margin-bottom:4px;">
          <span>저평가</span><span>적정</span><span>프리미엄</span>
        </div>
        <div style="height:6px;background:#1f2937;border-radius:3px;position:relative;overflow:visible;">
          <div style="position:absolute;left:0;top:0;height:100%;width:100%;border-radius:3px;background:linear-gradient(to right,#ef4444,#f59e0b 50%,#10b981);opacity:0.3;"></div>
          <div id="negoGaugeMarker" style="position:absolute;top:-3px;width:12px;height:12px;background:var(--accent);border-radius:50%;border:2px solid #fff;transition:left 0.3s;left:50%;transform:translateX(-50%);"></div>
        </div>
        <div style="text-align:center;margin-top:6px;font-size:0.68rem;color:var(--text-dim);" id="negoRatioDisp">제안 비율: 100%</div>
      </div>

      <!-- 결과 영역 -->
      <div id="negoResult" style="min-height:36px;margin-bottom:10px;"></div>

      <!-- 버튼 -->
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" id="negoSubmitBtn" onclick="_submitNegotiation()" style="flex:2;padding:10px;font-size:0.85rem;font-weight:700;">제안하기</button>
        <button class="btn btn-secondary" onclick="_cancelNegotiation()" style="flex:1;padding:10px;">포기</button>
      </div>
    </div>`;
  $('seasonModal').classList.add('active');
  _updateNegoTotal();
}

function _updateNegoTotal(){
  const sal=parseFloat($('negoSalary').value)||0;
  const yrs=parseInt($('negoYears').value)||1;
  const total=sal*yrs;
  const disp=$('negoTotalDisp');if(disp) disp.textContent='총 '+won(total);

  // 게이지 업데이트
  const s=_negoState;if(!s)return;
  const expTotal=Math.max(1,s.exp.totalValue);
  const ratio=total/expTotal;
  const pct=Math.max(0,Math.min(100,ratio*50));
  const marker=$('negoGaugeMarker');if(marker) marker.style.left=pct+'%';
  const ratioDisp=$('negoRatioDisp');
  if(ratioDisp){
    const rpct=Math.round(ratio*100);
    const rColor=rpct>=100?'#10b981':rpct>=85?'#f59e0b':'#ef4444';
    ratioDisp.innerHTML='제안 비율: <b style="color:'+rColor+';">'+rpct+'%</b>';
  }
}

function _submitNegotiation(){
  const s=_negoState;if(!s)return;
  const sal=parseFloat($('negoSalary').value)||0;
  const yrs=parseInt($('negoYears').value)||1;

  if(sal<SALARY_MIN){$('negoResult').innerHTML=`<div style="color:#ef4444;font-size:0.72rem;padding:8px;background:#ef444411;border-radius:6px;">최소 연봉은 ${SALARY_MIN}억입니다.</div>`;return;}

  const result=evaluateOffer(s.p,sal,yrs,s.context);
  s.attemptsLeft--;

  if(result==='accept'){
    $('negoResult').innerHTML=`<div style="text-align:center;padding:12px;background:rgba(16,185,129,0.08);border:1px solid #10b98133;border-radius:8px;">
      <div style="font-size:1.1rem;font-weight:800;color:#10b981;margin-bottom:4px;">계약 체결!</div>
      <div style="font-size:0.75rem;color:var(--text-dim);">${won(sal)} × ${yrs}년 (총액 ${won(sal*yrs)})</div>
    </div>`;
    $('negoSubmitBtn').disabled=true;
    $('negoSubmitBtn').style.opacity='0.4';
    setTimeout(()=>{
      $('seasonModal').classList.remove('active');
      s.onAccept(sal,yrs);
      _negoState=null;
    },1000);
  } else {
    // FA 경쟁 페널티
    if(s.context==='fa' && rand(1,100)<=_faSnatchProb(s.p)){
      $('negoResult').innerHTML=`<div style="text-align:center;padding:12px;background:rgba(239,68,68,0.08);border:1px solid #ef444433;border-radius:8px;">
        <div style="font-size:1rem;font-weight:800;color:#ef4444;margin-bottom:4px;">선수 이탈</div>
        <div style="font-size:0.72rem;color:var(--text-dim);">다른 구단이 더 좋은 조건을 제시했습니다.</div>
      </div>`;
      $('negoSubmitBtn').disabled=true;
      $('negoSubmitBtn').style.opacity='0.4';
      setTimeout(()=>{
        $('seasonModal').classList.remove('active');
        if(s.onFail)s.onFail('snatched');
        _negoState=null;
      },1200);
      return;
    }

    if(s.attemptsLeft<=0){
      $('negoResult').innerHTML=`<div style="text-align:center;padding:12px;background:rgba(239,68,68,0.08);border:1px solid #ef444433;border-radius:8px;">
        <div style="font-size:1rem;font-weight:800;color:#ef4444;margin-bottom:4px;">협상 결렬</div>
        <div style="font-size:0.72rem;color:var(--text-dim);">선수 측이 협상 테이블을 떠났습니다.</div>
      </div>`;
      $('negoSubmitBtn').disabled=true;
      $('negoSubmitBtn').style.opacity='0.4';
      setTimeout(()=>{
        $('seasonModal').classList.remove('active');
        if(s.onFail)s.onFail('exhausted');
        _negoState=null;
      },1200);
    } else {
      const exp=s.exp;
      const hint85=won(Math.floor(exp.totalValue*0.85));
      // 남은 기회 도트 업데이트
      const dotsHTML=Array.from({length:s.maxAttempts||3},(_,i)=>{
        if(i<s.attemptsLeft) return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--accent);"></span>';
        return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#374151;"></span>';
      }).join('');

      $('negoResult').innerHTML=`<div style="padding:10px;background:rgba(245,158,11,0.06);border:1px solid #f59e0b33;border-radius:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:0.78rem;font-weight:700;color:#f59e0b;">거절</span>
          <div style="display:flex;gap:3px;">${dotsHTML}</div>
        </div>
        <div style="font-size:0.68rem;color:var(--text-dim);">💬 "총액 ${hint85} 이상은 되어야 고려하겠습니다."</div>
      </div>`;
    }
  }
}

function _cancelNegotiation(){
  const s=_negoState;
  $('seasonModal').classList.remove('active');
  if(s&&s.onFail)s.onFail('cancel');
  _negoState=null;
}
