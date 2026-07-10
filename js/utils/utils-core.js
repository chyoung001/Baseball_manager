// ===================== UTILS-CORE (Pure Utilities & Formatting) =====================
function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function pick(arr){return arr[rand(0,arr.length-1)];}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
// Box-Muller 정규분포 난수 (평균 mean, 표준편차 stdDev)
function randomGaussian(mean,stdDev){
  let u,v,s;
  do{u=Math.random()*2-1;v=Math.random()*2-1;s=u*u+v*v;}while(s>=1||s===0);
  const mul=Math.sqrt(-2*Math.log(s)/s);
  return mean+stdDev*u*mul;
}
// 정규분포 + clamp (정수)
function randGauss(mean,stdDev,lo,hi){return clamp(Math.round(randomGaussian(mean,stdDev)),lo,hi);}
function genName(){return pick(FN)+pick(LN);}
function genLatinName(){return pick(LATIN_FN)+' '+pick(LATIN_LN);}
function $(id){return document.getElementById(id);}
// 통화 표시: 소수점 2자리까지
function won(v){
  v=+((+v)||0).toFixed(2);
  if(v>=1) return (v%1===0?v.toFixed(0):v%0.1===0?v.toFixed(1):v.toFixed(2))+'억';
  if(v>0) return (v*10000).toFixed(0)>=1000 ? (v*10).toFixed(0)+'천만' : (v*10000).toFixed(0)+'만';
  if(v<0) return '-'+won(-v);
  return '0';
}
function starsHTML(pop){const s=Math.round(pop/20);let h='';for(let i=0;i<5;i++)h+=i<s?'★':'<span class="empty">★</span>';return'<span class="stars">'+h+'</span>';}
// 1~100 스케일: 84+=엘리트(S), 67+=올스타(A), 51+=주전(B), 34+=백업(C), 그 이하 D
function statColor(v){if(v>=84)return'#10b981';if(v>=59)return'#f59e0b';if(v>=34)return'#f97316';return'#ef4444';}
function statPct(v){return Math.round(((v-STAT_MIN)/(STAT_MAX-STAT_MIN))*100);} // 스탯→퍼센트 (바 너비용)

// ── 표시 스케일 포그오브워 (프론트오피스 레벨 → 일반 능력치 공개 정밀도, 1~100) ──
// L0(<20) 등급문자 S/A/B/C/D · L1(<40) 5단위 버킷 · L2(<60) ±추정 · L3(>=60) 정확값. 히든 스탯은 별도 게이팅(getScoutReport).
function _displayTier(lv){lv=lv||0;return lv<20?0:lv<40?1:lv<60?2:3;}
function _statGrade(v){return v>=84?'S':v>=67?'A':v>=51?'B':v>=34?'C':'D';}
function fmtStatFog(v,tier,fuzz){
  if(v==null)return '?';
  if(tier<=0)return _statGrade(v);
  if(tier===1){const lo=Math.floor(v/5)*5;return `${Math.max(1,lo)}~${Math.min(100,lo+4)}`;}
  if(tier===2){const f=fuzz||3;return `${Math.max(1,v-f)}~${Math.min(100,v+f)}`;}
  return `${v}`;
}

// ── 글로벌 토스트 메시지 ──
function showToast(msg) {
  document.querySelectorAll('.invest-toast').forEach(el=>el.remove());
  const toast = document.createElement('div');
  toast.className = 'invest-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3200);
}
