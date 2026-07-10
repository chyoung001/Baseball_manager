// ===================== SEASON FINANCE (Revenue Engine) =====================
// ── calcSeasonRevenue (absorbed from season.js) ──────────────────
function calcSeasonRevenue(t,rank){
  // 목표: 시즌 수익 130~160억 (사치세 라인 140억과 균형)
  const popRev=+(t.popularity*0.8).toFixed(1);           // 인기 60 → 48억, 80 → 64억
  const winB=+(t.wins*1.5).toFixed(1);                   // 42승 → 63억, 60승 → 90억
  const facB=+(t.facilityLevel*0.2).toFixed(1);          // 시설 60 → 12억, 100 → 20억
  const starB=+(t.roster.filter(p=>p.popularity>=60).length*5); // OVR65+ 스타 1명당 5억
  const rankB=rank===1?20:rank===2?15:rank===3?10:rank===4?5:0;
  const base=+(popRev+winB+facB+starB+rankB).toFixed(1);
  const stadMult=t===G.myTeam?1+(t.stadiumLevel||0)*STADIUM_REVENUE_BONUS:1;
  const stadBonus=+(base*(stadMult-1)).toFixed(1);
  const total=+(base+stadBonus).toFixed(1);
  const luxTax=t===G.myTeam?getLuxuryTax(t):0;
  return{popRev,winB,facB,starB,rankB,base,stadBonus,total,luxTax,net:+(total-luxTax).toFixed(1)};
}
