// ===================== PLAYER POOLS (Mass Roster & Draft Pool Generation) =====================

// ===================== DRAFT GENERATION (6 Rounds = 48 Players) =====================
// 목표 기대값: S 1명, A 7명, B 20명, C 15명, D 5명
function generateDraftPool(){
  const pool=[];
  // 1. 최소 보장 (1~3픽용 대어)
  pool.push(genDraftProspect(Math.random()<0.5, 'S'));
  pool.push(genDraftProspect(Math.random()<0.5, 'A'));
  pool.push(genDraftProspect(Math.random()<0.5, 'A'));
  // 2. 나머지 45명 확률형 생성
  for(let i=0;i<45;i++){
    const r=Math.random()*100;
    let g='D';
    if(r<0.5) g='S';       // 0.5% (황금 세대 잭팟)
    else if(r<12.0) g='A'; // 11.5%
    else if(r<56.0) g='B'; // 44.0%
    else if(r<90.0) g='C'; // 34.0%
    // 나머지 10% = D급
    pool.push(genDraftProspect(Math.random()<0.5, g));
  }
  // 3. 스카우팅 블라인드 (셔플)
  return pool.sort(()=>Math.random()-0.5);
}

// ═══════════════════════════════════════════════════════
// TEAM ROSTER GENERATION (등급 분포 적용)
// ═══════════════════════════════════════════════════════
function genTeamRoster(_tier, concept, isMyTeam){
  const _t=isMyTeam ? 'my' : null;
  const roster=[];

  // 1군 타자: 8포지션 선발 + DH 1명 = 9명
  const startingPos=['C','1B','2B','3B','SS','LF','CF','RF'];
  startingPos.forEach(pos=>roster.push(genBatter(pos, null, concept, _t)));
  // DH: 선발 라인업 9번째 자리 자동 배치
  const dhP=genBatter('DH', null, concept, _t);
  dhP.role='starting';
  roster.push(dhP);
  // 벤치 5명: C~D 급 위주
  const benchPos=['C','SS','CF','1B','RF'];
  benchPos.forEach(pos=>{
    const benchGrade=Math.random()<0.6 ? 'C' : 'D';
    const p=genBatter(pos, benchGrade, concept, _t);
    p.role='bench';
    roster.push(p);
  });

  // 1군 투수 14명
  for(let i=0;i<5;i++) roster.push(genPitcher('SP', null, concept, _t));  // 선발 5명
  roster.push(genPitcher('CP', null, concept, _t));                        // 마무리 1명
  for(let i=0;i<2;i++) roster.push(genPitcher('SU', null, concept, _t));  // 셋업 2명
  for(let i=0;i<4;i++) roster.push(genPitcher('MR', null, concept, _t)); // 중계 4명
  for(let i=0;i<2;i++) roster.push(genPitcher('LR', null, concept, _t)); // 롱릴리프 2명

  // 2군: C~D급 (DH 제외)
  const fieldPos=['C','1B','2B','3B','SS','LF','CF','RF'];
  for(let i=0;i<5;i++){
    const g=Math.random()<0.4 ? 'D' : 'C';
    const p=genBatter(pick(fieldPos), g, null, _t);
    p.role='bench'; p.status='futures';
    roster.push(p);
  }
  for(let i=0;i<4;i++){
    const g=Math.random()<0.4 ? 'D' : 'C';
    const p=genPitcher(pick(['SP','SP','MR','MR']), g, null, _t);
    p.status='futures';
    roster.push(p);
  }

  // 육성: D급 고정 + 추가 하향
  for(let i=0;i<3;i++){
    const p=i<2 ? genBatter(pick(fieldPos),'D', null, _t) : genPitcher(pick(['SP','MR']),'D', null, _t);
    p.role=p.isPitcher ? 'rotation' : 'bench';
    p.status='developmental';
    const ss=p.isPitcher
      ? ['stuff','control','velocity','movement','stamina','clutch']
      : ['contact','power','eye','speed','fielding','arm'];
    ss.forEach(s=>{ p[s]=clamp((p[s]||25)-rand(8,12), 20, 50); });
    roster.push(p);
  }

  return roster;
}
