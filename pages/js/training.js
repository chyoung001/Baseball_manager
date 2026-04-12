// ===================== TRAINING (타자/투수 분리) =====================
function renderTraining(){
  const tm=G.myTeam;
  const db=Math.floor((tm.devLevel||0)/30);
  $('trainingLevelDisp').textContent=`${tm.devLevel||0} (시설 보너스 +${db})`;

  const batDone=G.trainedBatter;
  const pitDone=G.trainedPitcher;

  function section(title, items, done){
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:0.75rem;color:var(--accent);font-weight:700;">${title}</span>
        ${done?'<span style="font-size:0.65rem;color:#10b981;">✅ 완료</span>':''}
      </div>
      <div class="training-grid">
        ${items.map(t=>{
          const idx=TRAININGS.indexOf(t);
          const mult=getTrainingMultiplier(tm,t.stat);
          return `<div class="training-card${done?' disabled':''}" onclick="${done?'':'doTraining('+idx+')'}" style="${done?'opacity:0.5;pointer-events:none;':''}">
            <div class="training-icon">${t.icon}</div>
            <div class="training-name">${t.name}</div>
            <div class="training-desc">${t.desc}</div>
            <div style="font-size:0.6rem;color:var(--accent2);margin-top:4px;">배율 ×${mult.toFixed(2)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  const batters=TRAININGS.filter(t=>t.target==='batter');
  const pitchers=TRAININGS.filter(t=>t.target==='pitcher');
  const common=TRAININGS.filter(t=>t.target==='all');
  const commonDone=batDone&&pitDone;

  $('trainingContent').innerHTML=
    section('🏏 타자 훈련', batters, batDone)+
    section('⚾ 투수 훈련', pitchers, pitDone)+
    section('🧘 공통', common, commonDone);

  let statusParts=[];
  if(batDone) statusParts.push('타자 ✅');
  if(pitDone) statusParts.push('투수 ✅');
  $('trainingStatus').textContent=statusParts.length>0
    ?'훈련 상태: '+statusParts.join(' · ')
    :'타자 훈련과 투수 훈련을 각각 1회씩 선택하세요.';
}

function doTraining(idx){
  const t=TRAININGS[idx];
  const type=t.target; // 'batter' | 'pitcher' | 'all'

  // 타자/투수 분리 체크
  if(type==='batter'&&G.trainedBatter){showToast('⚠️ 이미 타자 훈련을 완료했습니다!');return;}
  if(type==='pitcher'&&G.trainedPitcher){showToast('⚠️ 이미 투수 훈련을 완료했습니다!');return;}
  if(type==='all'&&G.trainedBatter&&G.trainedPitcher){showToast('⚠️ 이미 모든 훈련을 완료했습니다!');return;}

  const tm=G.myTeam;
  const devBonus=Math.floor((tm.devLevel||0)/30);
  const mult=getTrainingMultiplier(tm,t.stat);
  let affected=0;

  tm.roster.filter(p=>p.role!=='overseas'&&(p.status||'active')==='active').forEach(p=>{
    if(t.stat==='condition'){
      const condGain=Math.round((rand(10,20)+devBonus)*mult);
      p.condition=clamp(p.condition+condGain,30,100);affected++;return;
    }
    if(type==='batter'&&p.isPitcher)return;
    if(type==='pitcher'&&!p.isPitcher)return;
    if(p[t.stat]!==undefined&&ovr(p)<maxOvrFromPot(p._potential||10)){
      const base=rand(1,3)+devBonus;
      const ethicMod=0.5+((p._workEthic||10)/20);
      const gain=Math.max(0,Math.round(base*mult*ethicMod));
      p[t.stat]=clamp(p[t.stat]+gain,20,80);
      affected++;
    }
  });

  // 플래그 설정
  if(type==='batter') G.trainedBatter=true;
  else if(type==='pitcher') G.trainedPitcher=true;
  else { G.trainedBatter=true; G.trainedPitcher=true; } // 공통은 양쪽 다 소모

  showToast(`✅ ${t.name} 완료! ${affected}명 적용 (×${mult.toFixed(2)})`);
  renderTraining();
  saveGame();
}
