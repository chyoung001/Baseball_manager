// ===================== STANDINGS =====================
function _teamBatAvg(t){
  let ab=0,h=0;
  t.roster.forEach(p=>{if(!p.isPitcher&&p.ss){ab+=p.ss.ab||0;h+=p.ss.h||0;}});
  return ab>0?(h/ab):0;
}
function _teamERA(t){
  let totalOuts=0,er=0;
  t.roster.forEach(p=>{if(p.isPitcher&&p.ss){totalOuts+=_ssOuts(p.ss);er+=p.ss.er||0;}});
  return totalOuts>0?(er*27/totalOuts):0;
}

function renderStandings(){
  const sorted=[...G.teams].sort((a,b)=>(b.wins/(b.wins+b.losses||1))-(a.wins/(a.wins+a.losses||1)));
  // 1위 팀 기준 게임차 계산
  const top=sorted[0];
  const topPct=top.wins+top.losses>0?top.wins/(top.wins+top.losses):0;

  $('standingsBody').innerHTML=sorted.map((t,i)=>{
    const gp=t.wins+t.losses;
    const pct=gp>0?(t.wins/gp).toFixed(3):'.000';
    // 게임차 = ((1위승-해당팀승)+(해당팀패-1위패)) / 2
    const gb=i===0?'-':(((top.wins-t.wins)+(t.losses-top.losses))/2).toFixed(1);
    const streak=t.streak||0;
    const streakTxt=streak>0?streak+'연승':streak<0?Math.abs(streak)+'연패':'-';
    const streakColor=streak>0?'#10b981':streak<0?'#ef4444':'var(--text-dim)';
    const avg=_teamBatAvg(t);
    const era=_teamERA(t);
    const recent=(t.recentResults||[]).slice(-5);
    const recentHTML=recent.length>0
      ?recent.map(r=>'<span style="display:inline-block;width:16px;height:16px;line-height:16px;text-align:center;border-radius:3px;font-size:0.6rem;font-weight:700;margin:0 1px;background:'+(r==='W'?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)')+';color:'+(r==='W'?'#10b981':'#ef4444')+';">'+r+'</span>').join('')
      :'<span style="color:var(--text-dim);">-</span>';

    return`<tr class="${t===G.myTeam?'my-team':''}">
      <td>${i+1}</td>
      <td>${t.emoji} ${t.name}</td>
      <td style="font-weight:700;">${pct}</td>
      <td style="color:${i===0?'var(--accent)':'var(--text-dim)'};">${gb}</td>
      <td style="color:var(--accent2);">${t.wins}</td>
      <td style="color:var(--accent3);">${t.losses}</td>
      <td>${gp}</td>
      <td style="color:${streakColor};font-weight:600;">${streakTxt}</td>
      <td style="font-family:'JetBrains Mono',monospace;">${gp>0?avg.toFixed(3):'-'}</td>
      <td style="font-family:'JetBrains Mono',monospace;color:${era<=3.5?'#10b981':era<=4.5?'#f59e0b':'#ef4444'};">${gp>0?era.toFixed(2):'-'}</td>
      <td>${recentHTML}</td>
    </tr>`;
  }).join('');

  renderLeagueLeaders();
}

// ===================== LEAGUE LEADERS =====================
function renderLeagueLeaders(){
  // 모든 팀의 모든 선수 수집
  const allBatters=[];
  const allPitchers=[];
  G.teams.forEach(t=>{
    t.roster.forEach(p=>{
      if(!p.ss)return;
      if(!p.isPitcher && p.ss.ab>=10) allBatters.push({p,team:t});
      if(p.isPitcher && _ssOuts(p.ss)>=9) allPitchers.push({p,team:t});
    });
  });

  const noData=allBatters.length===0;

  function leaderRow(entry,i,val,isMine){
    const p=entry.p,t=entry.team;
    const highlight=isMine?'background:rgba(245,158,11,0.06);':'';
    return `<div style="display:flex;align-items:center;gap:5px;padding:3px 2px;border-bottom:1px solid rgba(255,255,255,0.03);font-size:0.72rem;${highlight}">
      <span style="color:${i<3?'#f59e0b':'var(--text-dim)'};font-weight:700;width:16px;text-align:right;font-family:'JetBrains Mono',monospace;">${i+1}</span>
      <span style="font-size:0.6rem;margin-right:2px;">${t.emoji}</span>
      <span style="color:var(--text-bright);flex:1;${isMine?'font-weight:700;':''}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</span>
      <span class="pos-badge${p.isPitcher?' pitcher':''}" style="font-size:0.5rem;padding:1px 3px;">${p.pos}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-weight:700;color:${i<3?'#f59e0b':'var(--text-bright)'};">${val}</span>
    </div>`;
  }
  function leaderSection(title,entries,valFn,n){
    n=n||10;
    return `<div style="margin-bottom:14px;">
      <div style="font-size:0.7rem;font-weight:700;color:var(--accent);margin-bottom:4px;font-family:'Orbitron',sans-serif;letter-spacing:0.5px;">${title}</div>
      ${entries.slice(0,n).map((e,i)=>leaderRow(e,i,valFn(e),e.team===G.myTeam)).join('')}
    </div>`;
  }

  if(noData){
    $('leagueBatLeaders').innerHTML='<div style="color:var(--text-dim);font-size:0.75rem;text-align:center;padding:20px;">경기 기록 없음</div>';
    $('leaguePitLeaders').innerHTML='<div style="color:var(--text-dim);font-size:0.75rem;text-align:center;padding:20px;">경기 기록 없음</div>';
    return;
  }

  // 타자 리더
  const byAvg=[...allBatters].sort((a,b)=>ssAvg(b.p)-ssAvg(a.p));
  const byHR=[...allBatters].sort((a,b)=>b.p.ss.hr-a.p.ss.hr);
  const byRBI=[...allBatters].sort((a,b)=>b.p.ss.rbi-a.p.ss.rbi);
  const bySB=[...allBatters].sort((a,b)=>b.p.ss.sb-a.p.ss.sb);
  const byOBP=[...allBatters].sort((a,b)=>ssOBP(b.p)-ssOBP(a.p));

  $('leagueBatLeaders').innerHTML=
    leaderSection('타율 (AVG)',byAvg,e=>ssAvg(e.p).toFixed(3))+
    leaderSection('홈런 (HR)',byHR,e=>e.p.ss.hr)+
    leaderSection('타점 (RBI)',byRBI,e=>e.p.ss.rbi)+
    leaderSection('도루 (SB)',bySB,e=>e.p.ss.sb)+
    leaderSection('출루율 (OBP)',byOBP,e=>ssOBP(e.p).toFixed(3));

  // 투수 리더
  const byERA=[...allPitchers].sort((a,b)=>ssERA(a.p)-ssERA(b.p));
  const byW=[...allPitchers].sort((a,b)=>b.p.ss.w-a.p.ss.w);
  const byK=[...allPitchers].sort((a,b)=>b.p.ss.pk-a.p.ss.pk);
  const bySV=[...allPitchers].sort((a,b)=>b.p.ss.sv-a.p.ss.sv);
  const byWHIP=[...allPitchers].sort((a,b)=>ssWHIP(a.p)-ssWHIP(b.p));

  $('leaguePitLeaders').innerHTML=
    leaderSection('방어율 (ERA)',byERA,e=>ssERA(e.p).toFixed(2))+
    leaderSection('승리 (W)',byW,e=>e.p.ss.w)+
    leaderSection('탈삼진 (K)',byK,e=>e.p.ss.pk)+
    leaderSection('세이브 (SV)',bySV,e=>e.p.ss.sv)+
    leaderSection('WHIP',byWHIP,e=>ssWHIP(e.p).toFixed(2));
}
