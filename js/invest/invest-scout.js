// ===================== 🌎 중남미 스카우팅 캠프 =====================
function renderInvestScoutCamp() {
  const t = G.myTeam;
  const isOffseason = G.phase==='stove_league'||G.phase==='preseason';
  const used = t.scoutCampUsed || 0;
  const foreignCount = getActiveForeignCount(t);
  const canUse = isOffseason && used < SCOUT_CAMP_MAX_PER_SEASON && t.budget >= SCOUT_CAMP_COST && foreignCount < FOREIGN_PLAYER_MAX;

  $('investContent').innerHTML = `
    <div class="card">
      <div class="card-title">🌎 중남미 비밀 스카우팅 캠프</div>
      <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:14px;line-height:1.7;">
        중남미 현지 스카우팅 네트워크를 가동하여 원석급 선수를 발굴합니다.<br>
        비용 <b style="color:var(--accent);">${won(SCOUT_CAMP_COST)}</b> | 시즌 ${SCOUT_CAMP_MAX_PER_SEASON}회 제한 (사용: ${used}/${SCOUT_CAMP_MAX_PER_SEASON})<br>
        🌐 외국인 선수: <b style="color:${foreignCount>=FOREIGN_PLAYER_MAX?'#ef4444':'var(--accent2)'};">${foreignCount}/${FOREIGN_PLAYER_MAX}명</b><br>
        <span style="color:${isOffseason?'#10b981':'#ef4444'};">${isOffseason?'✅ 비시즌 — 스카우팅 가능':'🚫 시즌 중 — 비시즌에만 가능'}</span>
      </div>
      <div class="card" style="background:var(--bg-card-hover);padding:14px;margin-bottom:14px;">
        <div style="font-size:0.72rem;color:var(--accent);margin-bottom:8px;">🎲 확률 테이블</div>
        <table class="data-table" style="font-size:0.72rem;">
          <thead><tr><th>등급</th><th>확률</th><th>결과</th></tr></thead>
          <tbody>
            <tr><td style="color:#ef4444;">꽝</td><td>60%</td><td>OVR 26~42 선수</td></tr>
            <tr><td style="color:#f59e0b;">본전</td><td>34%</td><td>OVR 51~67 선수</td></tr>
            <tr><td style="color:#10b981;">대박</td><td>5%</td><td>OVR 75~82 선수</td></tr>
            <tr><td style="color:#a855f7;">초대박</td><td>1%</td><td>OVR 92~100 선수</td></tr>
          </tbody>
        </table>
        <div style="font-size:0.65rem;color:var(--text-dim);margin-top:6px;">* 생성 선수는 즉시 로스터에 추가되며 OVR에 맞는 FA급 연봉이 자동 체결됩니다.</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:0.72rem;color:var(--accent);margin-bottom:10px;font-weight:700;">포지션 선택</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:14px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="executeScoutCamp('if')" ${canUse?'':'disabled'} style="padding:10px 20px;font-size:0.78rem;">🧤 내야수</button>
          <button class="btn btn-secondary" onclick="executeScoutCamp('of')" ${canUse?'':'disabled'} style="padding:10px 20px;font-size:0.78rem;">🏃 외야수</button>
          <button class="btn btn-secondary" onclick="executeScoutCamp('c')" ${canUse?'':'disabled'} style="padding:10px 20px;font-size:0.78rem;">🎯 포수</button>
          <button class="btn btn-secondary" onclick="executeScoutCamp('pit')" ${canUse?'':'disabled'} style="padding:10px 20px;font-size:0.78rem;">⚾ 투수</button>
        </div>
        <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:8px;">비용: ${won(SCOUT_CAMP_COST)} / 경기</div>
        ${!canUse && used >= SCOUT_CAMP_MAX_PER_SEASON ? '<div style="font-size:0.68rem;color:#ef4444;margin-top:8px;">이번 시즌 사용 횟수를 모두 소진했습니다.</div>' : ''}
        ${!canUse && t.budget < SCOUT_CAMP_COST ? '<div style="font-size:0.68rem;color:#ef4444;margin-top:8px;">예산이 부족합니다.</div>' : ''}
        ${!canUse && foreignCount >= FOREIGN_PLAYER_MAX ? '<div style="font-size:0.68rem;color:#ef4444;margin-top:8px;">🌐 외국인 선수 등록 한도('+FOREIGN_PLAYER_MAX+'명)를 초과합니다.</div>' : ''}
      </div>
    </div>`;
}

function executeScoutCamp(posCategory) {
  const t = G.myTeam;
  if(!(G.phase==='stove_league'||G.phase==='preseason')) { showToast('🚫 비시즌에만 가능!'); return; }
  if((t.scoutCampUsed||0) >= SCOUT_CAMP_MAX_PER_SEASON) { showToast('🚫 이번 시즌 사용 횟수 소진!'); return; }
  if(!canSpend(t,SCOUT_CAMP_COST)) { showToast('🚫 사용 가능 자금 부족!'); return; }
  if(!canAddForeign(t)) { showToast('🚫 외국인 선수 등록 한도 '+FOREIGN_PLAYER_MAX+'명 초과!'); return; }

  t.budget = +(t.budget - SCOUT_CAMP_COST).toFixed(1);
  t.scoutCampUsed = (t.scoutCampUsed || 0) + 1;

  // 확률 롤
  const roll = rand(1, 100);
  let ovrMin, ovrMax, grade, gradeColor, gradeEmoji;
  if (roll <= 60)       { ovrMin=26; ovrMax=42; grade='꽝';   gradeColor='#ef4444'; gradeEmoji='😢'; }
  else if (roll <= 94)  { ovrMin=51; ovrMax=67; grade='본전'; gradeColor='#f59e0b'; gradeEmoji='😐'; }
  else if (roll <= 99)  { ovrMin=75; ovrMax=82; grade='대박'; gradeColor='#10b981'; gradeEmoji='🎉'; }
  else                  { ovrMin=92; ovrMax=100; grade='초대박';gradeColor='#a855f7'; gradeEmoji='🔥'; }

  // 선수 생성 — 포지션 카테고리에 따라 결정
  const targetOvr = rand(ovrMin, ovrMax);
  const pGrade = targetOvr >= 84 ? 'S' : targetOvr >= 67 ? 'A' : targetOvr >= 51 ? 'B' : targetOvr >= 34 ? 'C' : 'D';
  let pos, isBat;
  if(posCategory==='if')       { isBat=true;  pos=pick(['1B','2B','3B','SS']); }
  else if(posCategory==='of')  { isBat=true;  pos=pick(['LF','CF','RF']); }
  else if(posCategory==='c')   { isBat=true;  pos='C'; }
  else                         { isBat=false; pos=pick(['SP','SP','CP','MR','SU']); }
  const p = isBat ? genBatter(pos, pGrade, null, 'my') : genPitcher(pos, pGrade, null, 'my');

  // OVR을 목표 범위로 강제 조정
  const stats = p.isPitcher
    ? ['stuff','control','velocity','movement','stamina','clutch']
    : ['contact','power','eye','speed','fielding','arm'];
  let currentOvr = ovr(p);
  let attempts = 0;
  while (Math.abs(currentOvr - targetOvr) > 3 && attempts < 20) {
    const diff = targetOvr - currentOvr;
    const s = pick(stats);
    p[s] = clamp(p[s] + Math.round(diff * 0.4), STAT_MIN, STAT_MAX);
    currentOvr = ovr(p);
    attempts++;
  }

  // POT-OVR 정합성: 목표 OVR에 도달 가능하도록 POT 최소값 보장
  const minPotScout = Math.ceil((ovr(p) - 30) / 2.5);
  p._potential = Math.max(p._potential||10, clamp(minPotScout, 7, 20));

  // 선수 데이터 준비 (아직 로스터에 추가하지 않음)
  p.name = genLatinName();  // 남미 선수 이름
  p.isForeign = true;
  p._serviceTime = rand(7, 10);
  p._contractYears = targetOvr >= 75 ? rand(2, 4) : rand(1, 2);
  p.salary = _calcSalary(ovr(p), p._serviceTime);
  p.age = rand(22, 30);
  p._seasonsPlayed = p.age - 18;
  p.status = 'active';
  p.role = p.isPitcher ? (p.pos === 'SP' ? 'rotation' : 'bullpen') : 'bench';
  initSeasonStats(p);

  // 임시 저장 (계약 선택 대기)
  G._scoutResult = p;

  // 결과 모달 (계약/포기 선택)
  const o = ovr(p);
  $('modalTitle').textContent = `${gradeEmoji} 스카우팅 결과: ${grade}!`;
  $('modalBody').innerHTML = `
    <div style="text-align:center;">
      <div style="font-size:2.5rem;margin:10px 0;">${gradeEmoji}</div>
      <div style="font-size:1.2rem;font-weight:700;color:${gradeColor};margin-bottom:8px;">${grade}</div>
      <div class="card" style="background:var(--bg-card-hover);padding:14px;text-align:left;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span class="player-name" style="font-size:1rem;">${p.name}</span>
          <span class="pos-badge${p.isPitcher?' pitcher':''}">${ALL_POS_NAMES[p.pos]||p.pos}</span>
        </div>
        <div style="font-size:0.82rem;margin-bottom:4px;">OVR <span style="color:${statColor(o)};font-weight:700;font-size:1.1rem;">${o}</span></div>
        <div style="font-size:0.72rem;color:var(--text-dim);">
          ${p.isPitcher
            ? '구위 '+p.stuff+' | 제구 '+p.control+' | 구속 '+p.velocity+' | 무브 '+p.movement
            : '컨택 '+p.contact+' | 파워 '+p.power+' | 선구안 '+p.eye+' | 주력 '+p.speed}
        </div>
        <div style="font-size:0.72rem;color:var(--accent);margin-top:6px;">연봉 ${won(p.salary)} · ${p._contractYears}년 계약 · 🌐 외국인</div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-primary" onclick="_confirmScoutSign()" style="flex:1;padding:10px;">✅ 계약 체결</button>
        <button class="btn btn-secondary" onclick="_declineScoutSign()" style="flex:1;padding:10px;">❌ 포기</button>
      </div>
    </div>`;
  $('seasonModal').classList.add('active');
  updateHeader(); saveGame();
}

function _confirmScoutSign() {
  const p = G._scoutResult;
  if (!p) return;
  $('seasonModal').classList.remove('active');

  // 협상 모달로 전환
  showNegotiationModal(p,'scout',
    function onAccept(salary,years){
      p.salary=salary;p._contractYears=years;
      G.myTeam.roster.push(p);
      delete G._scoutResult;
      showToast(`✅ ${p.name} 계약! (${won(salary)} × ${years}년)`);
      updateHeader();renderInvestScoutCamp();saveGame();
    },
    function onFail(){
      delete G._scoutResult;
      showToast(`❌ ${p.name} 계약 결렬 (스카우팅 비용은 소모됨)`);
      renderInvestScoutCamp();
    }
  );
}

function _declineScoutSign() {
  const p = G._scoutResult;
  delete G._scoutResult;
  $('seasonModal').classList.remove('active');
  showToast(`❌ 스카우팅 선수 계약 포기${p ? ' (' + p.name + ')' : ''}`);
  renderInvestScoutCamp();
}
