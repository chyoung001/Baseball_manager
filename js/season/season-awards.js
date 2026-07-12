// ===================== SEASON AWARDS (Awards, Retirement) =====================
// ===================== PHASE 6: AWARDS & RETIREMENT =====================
function showAwards(){
  const allB=[];const allP=[];
  G.teams.forEach(t=>t.roster.forEach(p=>{
    if(!p.ss)return;
    if(!p.isPitcher&&qualifyBatter(p, QUALIFY_RATIO_AWARDS))allB.push({p,team:t});
    if(p.isPitcher&&qualifyPitcher(p, QUALIFY_RATIO_AWARDS))allP.push({p,team:t});
  }));

  const allQ=[...allB,...allP]; // 타자·투수 공통 후보 (세이버 WAR 기반)

  // MVP — 타자·투수 공통, 정식 WAR 최고 (기존 타자 전용 → 투수 MVP 가능)
  const mvpList=[...allQ].sort((a,b)=>warSaber(b.p)-warSaber(a.p));
  const mvp=mvpList[0]||null;

  // 투수상 (사이영) — 투수 WAR 최고 (FIP 기반, ERA 단독 아님)
  const cyList=[...allP].sort((a,b)=>warPitcher(b.p)-warPitcher(a.p));
  const cyYoung=cyList[0]||null;

  // 신인왕 — 타자·투수 공통, 데뷔 1시즌 이하 WAR 최고 (기존 타자 전용 → 투수 신인 가능)
  const rookieList=[...allQ].filter(e=>(e.p._seasonsPlayed||0)<=1).sort((a,b)=>warSaber(b.p)-warSaber(a.p));
  const rookie=rookieList[0]||null;

  // 홈런왕
  const hrList=[...allB].sort((a,b)=>b.p.ss.hr-a.p.ss.hr);
  const hrKing=hrList[0]||null;

  // 투수 트리플 크라운
  const tripleList=[...allP].sort((a,b)=>{
    const sa=-ssERA(a.p)+a.p.ss.w*10+a.p.ss.pk;
    const sb=-ssERA(b.p)+b.p.ss.w*10+b.p.ss.pk;
    return sb-sa;
  });
  const pitTriple=tripleList[0]||null;

  G.awards=[
    mvp?{title:'MVP',name:mvp.p.name,team:mvp.team.name,emoji:mvp.team.emoji}:null,
    cyYoung?{title:'투수상',name:cyYoung.p.name,team:cyYoung.team.name,emoji:cyYoung.team.emoji}:null,
    rookie?{title:'신인왕',name:rookie.p.name,team:rookie.team.name,emoji:rookie.team.emoji}:null,
    hrKing?{title:'홈런왕',name:hrKing.p.name,team:hrKing.team.name,emoji:hrKing.team.emoji}:null,
    pitTriple?{title:'투수 트리플 크라운',name:pitTriple.p.name,team:pitTriple.team.name,emoji:pitTriple.team.emoji}:null,
  ].filter(Boolean);

  // 수상자 보너스: 잠재력 +5~10 (1~100 스케일), 인기도 +20
  G.awards.forEach(a=>{
    const potBoost=(a.title==='MVP'||a.title==='투수 트리플 크라운')?10:5;
    G.teams.forEach(t=>t.roster.forEach(p=>{
      if(p.name===a.name){
        p._potential=clamp((p._potential||50)+potBoost,35,100);
        p.popularity=clamp(p.popularity+20,0,100);
        // P2-3 크리스 브라이언트 룰: 신인왕 수상 → 서비스타임 자동 1풀 시즌 인정
        if(a.title==='신인왕')p._rookieFullCredit=true;
      }
    }));
  });

  // P3-2 인공 특성 평가 (어워드·타이틀·시즌 기록·통산·올스타 연속·우승 멤버) — 은퇴 처리 전에 수행
  const traitResults=evaluateSeasonTraits({mvp,cyYoung,rookie,hrKing,pitTriple});

  // 은퇴 처리 + 명예의 전당
  const retirees=[];
  G.teams.forEach(t=>{
    t.roster=t.roster.filter(p=>{
      const sp=p._seasonsPlayed||0;
      if(sp<RETIRE_MIN_AGE_PROXY)return true;
      const prob=RETIRE_BASE_PROB+(sp-RETIRE_MIN_AGE_PROXY)*RETIRE_PROB_PER_SEASON;
      if(rand(1,100)>prob)return true;

      // 은퇴 확정
      const pOvr=ovr(p);
      const entry={name:p.name,team:t.name,emoji:t.emoji,ovr:pOvr,seasonsPlayed:sp,isPitcher:p.isPitcher,pos:p.pos};
      retirees.push(entry);
      return false;
    });
  });

  $('modalTitle').textContent='🏅 시상식 & 은퇴';
  $('modalBody').innerHTML=`
    <div style="text-align:left;">
      <div style="font-size:0.72rem;color:var(--accent);margin-bottom:8px;">타이틀 홀더</div>
      ${G.awards.map(a=>'<div style="font-size:0.85rem;padding:6px 0;border-bottom:1px solid var(--border);"><span style="color:var(--accent);font-weight:700;">'+a.title+'</span> — '+a.emoji+' <b>'+a.name+'</b> <span style="color:var(--text-dim);">('+a.team+')</span></div>').join('')}
      ${(()=>{
        // 은퇴 처리 "후" 잔류 선수만 표시 (은퇴자 특성 획득·소멸 동시 노출 혼선 방지),
        // 선수 참조 기반 필터 — 동명이인 오귀속 차단
        const shown=traitResults.filter(r=>G.teams.some(t=>t.roster.includes(r.p)));
        const mine=shown.filter(r=>G.myTeam.roster.includes(r.p));
        if(shown.length===0)return '';
        return `<div style="margin-top:14px;font-size:0.72rem;color:var(--accent2);margin-bottom:6px;">✨ 특성 획득 (리그 ${shown.length}건${mine.length>0?' · 내 팀 '+mine.length+'건':''})</div>`
          +(mine.length>0?mine:shown.slice(0,5)).map(r=>'<div style="font-size:0.72rem;padding:2px 0;"><b>'+r.name+'</b> — '+r.text+'</div>').join('');
      })()}
      ${retirees.length>0?`
      <div style="margin-top:14px;font-size:0.72rem;color:var(--text-dim);margin-bottom:6px;">👋 은퇴 선수</div>
      ${retirees.map(r=>'<div style="font-size:0.75rem;padding:3px 0;">'+r.emoji+' '+r.name+' (OVR '+r.ovr+', '+r.seasonsPlayed+'시즌)</div>').join('')}
      `:''}
      <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');G.phase='gm_meeting';advancePhase();" style="width:100%;margin-top:16px;">▶ GM 회의로</button>
    </div>`;
  $('seasonModal').classList.add('active');
}
