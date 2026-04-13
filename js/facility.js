// ===================== FACILITY =====================
function renderFacility(){
  $('facilityGrid').innerHTML=FACILITIES.map((f,i)=>{
    const lv=G.myTeam[f.key];const c=upgradeCost(lv);const g=upgradeEfficiency(lv);
    return`<div class="facility-card" onclick="upgradeFacility(${i})">
      <div class="facility-icon">${f.icon}</div>
      <div class="facility-name">${f.name}</div>
      <div class="facility-desc">${f.desc}</div>
      <div class="prog-bar" style="margin-top:8px;"><div class="prog-bar-fill" style="width:${lv}%;background:${statColor(lv)};"></div></div>
      <div class="facility-level">Lv.${lv}/100</div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-top:4px;">💰 ${won(c)} → +${g} ${lv>=80?'<span style="color:#ef4444;">(효율↓)</span>':''}</div>
    </div>`;
  }).join('');
}

function upgradeFacility(idx){
  const f=FACILITIES[idx];const lv=G.myTeam[f.key];const c=upgradeCost(lv);
  if(lv>=100){alert('최대 레벨!');return;}
  if(!canSpend(G.myTeam,c)){showToast('🚫 사용 가능 자금 부족!');return;}
  G.myTeam.budget-=c;G.myTeam[f.key]=clamp(lv+upgradeEfficiency(lv),0,100);
  updateHeader();renderFacility();
}
