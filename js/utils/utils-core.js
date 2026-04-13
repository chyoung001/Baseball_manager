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
// 20-80 MLB 스케일: 80=역대급, 70=올스타, 60=잘함, 50=평균, 40=부족, 20=최하
function statColor(v){if(v>=70)return'#10b981';if(v>=55)return'#f59e0b';if(v>=40)return'#f97316';return'#ef4444';}
function statPct(v){return Math.round(((v-STAT_MIN)/(STAT_MAX-STAT_MIN))*100);} // 스탯→퍼센트 (바 너비용)

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
