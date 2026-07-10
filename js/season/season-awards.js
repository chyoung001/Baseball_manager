// ===================== SEASON AWARDS (Awards, Retirement) =====================
// ===================== PHASE 6: AWARDS & RETIREMENT =====================
function showAwards(){
  const allB=[];const allP=[];
  G.teams.forEach(t=>t.roster.forEach(p=>{
    if(!p.ss)return;
    if(!p.isPitcher&&qualifyBatter(p, QUALIFY_RATIO_AWARDS))allB.push({p,team:t});
    if(p.isPitcher&&qualifyPitcher(p, QUALIFY_RATIO_AWARDS))allP.push({p,team:t});
  }));

  // MVP
  const mvpList=[...allB].sort((a,b)=>{
    const wa=ssAvg(a.p)*100+a.p.ss.hr*3+a.p.ss.rbi;
    const wb=ssAvg(b.p)*100+b.p.ss.hr*3+b.p.ss.rbi;
    return wb-wa;
  });
  const mvp=mvpList[0]||null;

  // 투수상 (사이영)
  const cyList=[...allP].sort((a,b)=>ssERA(a.p)-ssERA(b.p));
  const cyYoung=cyList[0]||null;

  // 신인왕
  const rookieList=[...allB].filter(e=>(e.p._seasonsPlayed||0)<=1).sort((a,b)=>ssAvg(b.p)-ssAvg(a.p));
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
      }
    }));
  });

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
      ${retirees.length>0?`
      <div style="margin-top:14px;font-size:0.72rem;color:var(--text-dim);margin-bottom:6px;">👋 은퇴 선수</div>
      ${retirees.map(r=>'<div style="font-size:0.75rem;padding:3px 0;">'+r.emoji+' '+r.name+' (OVR '+r.ovr+', '+r.seasonsPlayed+'시즌)</div>').join('')}
      `:''}
      <button class="btn btn-primary" onclick="$('seasonModal').classList.remove('active');G.phase='gm_meeting';advancePhase();" style="width:100%;margin-top:16px;">▶ GM 회의로</button>
    </div>`;
  $('seasonModal').classList.add('active');
}
