/**
 * dashboard/layout.js — Layout base e CSS compartilhado
 */

const CARGO_LABELS = {
  cliente:    { label: 'Cliente',       color: '#60a5fa', icon: '👤' },
  staff:      { label: 'Staff',         color: '#34d399', icon: '🛡️' },
  resp_staff: { label: 'Resp. Staff',   color: '#a78bfa', icon: '⭐' },
  sub_dono:   { label: 'Sub-Dono',      color: '#f59e0b', icon: '👑' },
  dono:       { label: 'Dono',          color: '#f43f5e', icon: '💎' },
};

const ABAS_INFO = {
  overview:     { icon: '📊', label: 'Visão Geral'   },
  loja:         { icon: '🛍️', label: 'Loja'          },
  perfil:       { icon: '👤', label: 'Perfil'         },
  solicitar:    { icon: '📋', label: 'Solicitar Item' },
  solicitacoes: { icon: '📥', label: 'Solicitações'  },
  usuarios:     { icon: '👥', label: 'Usuários'      },
  produtos:     { icon: '📦', label: 'Produtos'      },
  pedidos:      { icon: '🛒', label: 'Pedidos'       },
  tickets:      { icon: '🎫', label: 'Tickets'       },
  cupons:       { icon: '🎟️', label: 'Cupons'        },
  gerenciar:    { icon: '⚙️', label: 'Gerenciar'     },
};

const CSS = `
<!-- Sons de navegação Solo Leveling -->
<audio id="snd-hover"  src="https://cdn.discordapp.com/attachments/1522456699082903572/1549000000000000000/hover.mp3"  preload="auto" volume="0.2"></audio>
<audio id="snd-click"  src="https://cdn.discordapp.com/attachments/1522456699082903572/1549000000000000001/click.mp3"  preload="auto" volume="0.3"></audio>
<audio id="snd-success"src="https://cdn.discordapp.com/attachments/1522456699082903572/1549000000000000002/success.mp3"preload="auto" volume="0.4"></audio>
<canvas id="bg-canvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:0.18"></canvas>
<style>
:root {
  --bg: #05050d;
  --sidebar: #08081a;
  --card: #0d0d20;
  --card2: #12122a;
  --border: #7c3aed18;
  --border2: #7c3aed30;
  --text: #e8e8ff;
  --text2: #7070a0;
  --accent: #7c3aed;
  --accent2: #a855f7;
  --accent-glow: rgba(124,58,237,0.3);
  --gold: #c0a020;
  --gold2: #f0c040;
  --green: #00ff88;
  --red: #ff4455;
  --yellow: #f59e0b;
  --blue: #3b82f6;
  --radius: 12px;
  --sidebar-w: 240px;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
  background:var(--bg);color:var(--text);line-height:1.5;
  position:relative;
}
body::before{
  content:'';position:fixed;inset:0;z-index:0;
  background:
    radial-gradient(ellipse at 15% 25%,#7c3aed12 0%,transparent 55%),
    radial-gradient(ellipse at 85% 75%,#3b82f608 0%,transparent 55%),
    radial-gradient(ellipse at 50% 50%,#0a0a1e 0%,#05050d 100%);
  pointer-events:none;
}

/* Partículas Solo Leveling */
.layout,.auth-bg{position:relative;z-index:1}

/* Scrollbar */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#7c3aed40;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#7c3aed80}

/* Layout */
.layout{display:flex;min-height:100vh}

/* Sidebar */
.sidebar{
  width:var(--sidebar-w);
  background:linear-gradient(180deg,#09091e 0%,#07071a 100%);
  border-right:1px solid var(--border2);
  display:flex;flex-direction:column;
  position:fixed;top:0;left:0;bottom:0;
  z-index:200;overflow-y:auto;
  box-shadow:4px 0 30px #7c3aed15;
}
.sidebar-logo{
  padding:24px 20px 20px;
  border-bottom:1px solid var(--border);
  position:relative;overflow:hidden;
}
.sidebar-logo::after{
  content:'';position:absolute;bottom:0;left:20px;right:20px;height:1px;
  background:linear-gradient(90deg,transparent,#7c3aed80,transparent);
}
.sidebar-logo .brand{
  font-size:22px;font-weight:900;letter-spacing:2px;
  background:linear-gradient(135deg,#c0a020,#f0c040,#a855f7);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
  text-shadow:none;
  filter:drop-shadow(0 0 8px #c0a02060);
}
.sidebar-logo .sub{font-size:10px;color:#7070a0;margin-top:3px;letter-spacing:1px;text-transform:uppercase}
.sidebar-nav{flex:1;padding:12px 10px}
.nav-section{font-size:10px;color:#7070a0;text-transform:uppercase;letter-spacing:1px;padding:14px 10px 6px;font-weight:600}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:10px 12px;border-radius:9px;
  color:var(--text2);text-decoration:none;font-size:13px;
  transition:all .2s cubic-bezier(.4,0,.2,1);
  cursor:pointer;margin-bottom:2px;
  border:1px solid transparent;
  position:relative;overflow:hidden;
}
.nav-item::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:0;
  background:linear-gradient(90deg,#7c3aed60,transparent);
  transition:width .2s;border-radius:9px 0 0 9px;
}
.nav-item:hover{
  background:linear-gradient(135deg,#7c3aed12,#3b82f608);
  color:var(--text);
  border-color:#7c3aed30;
  transform:translateX(3px);
}
.nav-item:hover::before{width:3px}
.nav-item.active{
  background:linear-gradient(135deg,#7c3aed25,#3b82f615);
  color:#fff;
  border-color:#7c3aed50;
  box-shadow:0 0 20px #7c3aed20, inset 0 0 20px #7c3aed08;
}
.nav-item.active::before{width:3px;background:#a855f7}
.nav-item .icon{font-size:16px;width:20px;text-align:center;filter:drop-shadow(0 0 4px currentColor)}
.sidebar-footer{padding:16px;border-top:1px solid var(--border)}
.user-card{
  background:linear-gradient(135deg,#0d0d25,#12122e);
  border:1px solid var(--border2);
  border-radius:10px;padding:12px;
  display:flex;align-items:center;gap:10px;
  position:relative;overflow:hidden;
}
.user-card::before{
  content:'';position:absolute;top:-50%;right:-30%;width:80px;height:80px;
  background:radial-gradient(circle,#7c3aed20,transparent);
  border-radius:50%;
}
.user-avatar{
  width:38px;height:38px;border-radius:50%;flex-shrink:0;
  background:linear-gradient(135deg,var(--accent),var(--blue));
  display:flex;align-items:center;justify-content:center;
  font-size:16px;font-weight:800;
  box-shadow:0 0 12px #7c3aed40;
  border:2px solid #7c3aed60;
}
.user-info{flex:1;min-width:0}
.user-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}
.user-cargo{font-size:11px;font-weight:600;margin-top:1px}
.logout-btn{
  display:block;text-align:center;margin-top:10px;
  color:var(--text2);font-size:12px;text-decoration:none;
  padding:7px;border-radius:8px;
  transition:all .18s;border:1px solid transparent;
}
.logout-btn:hover{background:#ff445515;color:var(--red);border-color:#ff445530}

/* Main */
.main{margin-left:var(--sidebar-w);flex:1;padding:32px;min-height:100vh;position:relative;z-index:1}

/* Header */
.page-header{margin-bottom:28px;position:relative}
.page-title{
  font-size:28px;font-weight:900;color:#fff;
  background:linear-gradient(135deg,#fff 30%,#c4b5fd);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.page-sub{font-size:14px;color:var(--text2);margin-top:4px}

/* Cards */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:28px}
.stat-card{
  background:linear-gradient(135deg,#0d0d20,#12122a);
  border:1px solid var(--border);
  border-radius:var(--radius);padding:20px;
  position:relative;overflow:hidden;
  transition:transform .25s cubic-bezier(.4,0,.2,1),border-color .25s,box-shadow .25s;
  cursor:default;
}
.stat-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,var(--glow-a,#7c3aed),var(--glow-b,#3b82f6));
  opacity:0.8;
}
.stat-card::after{
  content:'';position:absolute;top:0;left:0;right:0;bottom:0;
  background:radial-gradient(ellipse at top right,var(--glow-a,#7c3aed)08,transparent 60%);
  pointer-events:none;
}
.stat-card:hover{
  transform:translateY(-3px);
  border-color:var(--border2);
  box-shadow:0 8px 30px #7c3aed18;
}
.stat-label{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.7px;font-weight:600;margin-bottom:10px;position:relative;z-index:1}
.stat-value{font-size:30px;font-weight:900;color:#fff;position:relative;z-index:1;line-height:1}
.stat-sub{font-size:12px;color:var(--text2);margin-top:8px;position:relative;z-index:1}

/* Table */
.table-card{
  background:linear-gradient(135deg,#0d0d20,#0f0f22);
  border:1px solid var(--border);border-radius:var(--radius);
  overflow:hidden;margin-bottom:24px;
  box-shadow:0 4px 24px #00000040;
}
.table-head{
  padding:16px 20px;border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  background:linear-gradient(135deg,#0f0f25,#0d0d20);
}
.table-title{font-size:15px;font-weight:700;color:#fff}
table{width:100%;border-collapse:collapse}
th{
  padding:10px 16px;text-align:left;font-size:11px;
  color:var(--text2);text-transform:uppercase;letter-spacing:.5px;
  background:#0a0a1e;font-weight:600;border-bottom:1px solid var(--border);
}
td{padding:11px 16px;font-size:13px;border-bottom:1px solid var(--border);color:var(--text);transition:background .15s}
tr:last-child td{border-bottom:none}
tr:hover td{background:#7c3aed08}

/* Badges */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.3px}
.badge-green{background:#00ff8818;color:#00ff88;border:1px solid #00ff8830}
.badge-red{background:#ff445518;color:#ff4455;border:1px solid #ff445530}
.badge-yellow{background:#f59e0b18;color:#fde68a;border:1px solid #f59e0b30}
.badge-blue{background:#3b82f618;color:#93c5fd;border:1px solid #3b82f630}
.badge-purple{background:#a855f718;color:#c4b5fd;border:1px solid #a855f730}
.badge-gray{background:#7070a018;color:#7070a0;border:1px solid #7070a030}

/* Buttons */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:7px;
  padding:9px 18px;border-radius:9px;font-size:13px;font-weight:600;
  cursor:pointer;text-decoration:none;border:none;
  transition:all .2s cubic-bezier(.4,0,.2,1);white-space:nowrap;
  position:relative;overflow:hidden;
}
.btn::after{
  content:'';position:absolute;top:50%;left:50%;width:0;height:0;
  background:rgba(255,255,255,0.12);border-radius:50%;
  transform:translate(-50%,-50%);
  transition:width .4s,height .4s,opacity .4s;opacity:0;
}
.btn:active::after{width:200px;height:200px;opacity:0}
.btn-primary{
  background:linear-gradient(135deg,#7c3aed,#5b21b6);
  color:#fff;
  box-shadow:0 4px 15px #7c3aed35;
  border:1px solid #a855f730;
}
.btn-primary:hover{
  background:linear-gradient(135deg,#a855f7,#7c3aed);
  box-shadow:0 6px 25px #7c3aed50;
  transform:translateY(-1px);
}
.btn-success{background:#00ff8815;color:#00ff88;border:1px solid #00ff8840}
.btn-success:hover{background:#00ff8825;box-shadow:0 4px 15px #00ff8820}
.btn-danger{background:#ff445515;color:#ff4455;border:1px solid #ff445540}
.btn-danger:hover{background:#ff445525;box-shadow:0 4px 15px #ff445520}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border2)}
.btn-ghost:hover{background:var(--card2);color:var(--text);border-color:var(--border2)}
.btn-sm{padding:5px 12px;font-size:12px;border-radius:7px}

/* Forms */
.form-group{margin-bottom:18px}
.form-group label{
  display:block;font-size:11px;color:var(--text2);
  font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px;
}
.form-control{
  width:100%;padding:10px 14px;
  background:#0a0a1e;
  border:1px solid var(--border2);
  border-radius:9px;color:var(--text);font-size:14px;outline:none;
  transition:border-color .18s,box-shadow .18s,background .18s;
}
.form-control:focus{
  border-color:var(--accent);
  box-shadow:0 0 0 3px #7c3aed20;
  background:#0d0d22;
}
.form-control option{background:#0a0a1e}
.form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}

/* Alerts */
.alert{padding:13px 16px;border-radius:10px;margin-bottom:18px;font-size:13px;display:flex;align-items:center;gap:10px}
.alert-success{background:#00ff8810;border:1px solid #00ff8830;color:#00ff88}
.alert-error{background:#ff445510;border:1px solid #ff445530;color:#ff4455}
.alert-info{background:#3b82f610;border:1px solid #3b82f630;color:#93c5fd}

/* Search */
.search-row{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.search-row .form-control{max-width:280px}

/* Produtos grid - Solo Leveling style */
.produtos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px;margin-bottom:24px}
.produto-card{
  background:linear-gradient(135deg,#0d0d20,#12122a);
  border:1px solid var(--border);border-radius:var(--radius);
  overflow:hidden;
  transition:transform .25s cubic-bezier(.4,0,.2,1),border-color .25s,box-shadow .25s;
  cursor:pointer;
}
.produto-card:hover{
  transform:translateY(-5px) scale(1.01);
  border-color:#7c3aed60;
  box-shadow:0 12px 40px #7c3aed20,0 0 0 1px #7c3aed20;
}
.produto-img{
  width:100%;height:150px;
  background:linear-gradient(135deg,#0d0d25,#1a1a35);
  display:flex;align-items:center;justify-content:center;
  font-size:48px;overflow:hidden;position:relative;
}
.produto-img img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.produto-card:hover .produto-img img{transform:scale(1.08)}
.produto-img::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:40px;
  background:linear-gradient(transparent,#0d0d20);
}
.produto-body{padding:14px}
.produto-nome{font-size:14px;font-weight:700;margin-bottom:6px;color:#fff}
.produto-preco{
  font-size:20px;font-weight:900;margin-bottom:10px;
  background:linear-gradient(135deg,#c0a020,#f0c040);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.produto-desc{font-size:12px;color:var(--text2);margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* Paginação */
.pagination{display:flex;gap:8px;align-items:center;margin-top:16px}
.pagination a,.pagination span{padding:6px 14px;border-radius:8px;font-size:13px;text-decoration:none}
.pagination a{background:var(--card2);color:var(--text);border:1px solid var(--border2);transition:all .15s}
.pagination a:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.pagination .current{background:linear-gradient(135deg,var(--accent),#5b21b6);color:#fff;font-weight:700;border:none}

/* Animações */
@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes glow{0%,100%{box-shadow:0 0 5px #7c3aed40}50%{box-shadow:0 0 20px #7c3aed80,0 0 40px #7c3aed30}}
@keyframes particle{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(-100px) rotate(720deg);opacity:0}}
.main > *{animation:fadeInUp .3s ease-out both}
.main > *:nth-child(2){animation-delay:.05s}
.main > *:nth-child(3){animation-delay:.1s}

/* Solo Leveling background canvas particles */
@keyframes float{0%{transform:translateY(0)}50%{transform:translateY(-10px)}100%{transform:translateY(0)}}

/* Responsive */
@media(max-width:900px){
  :root{--sidebar-w:64px}
  .sidebar-logo .brand,.sidebar-logo .sub,.nav-item span,.user-info{display:none}
  .nav-item{padding:12px;justify-content:center}
  .main{padding:16px}
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .produtos-grid{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:480px){
  .stats-grid,.produtos-grid{grid-template-columns:1fr}
}
</style>
<script>
// ── Solo Leveling particle background ──────────────────────────────────────
(function(){
  const canvas = document.getElementById('bg-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];
  
  function resize(){
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  
  function createParticles(){
    particles = [];
    const count = Math.floor(W * H / 18000);
    for(let i = 0; i < count; i++){
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        size: Math.random() * 2 + 0.3,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: -Math.random() * 0.4 - 0.1,
        alpha: Math.random() * 0.6 + 0.1,
        color: Math.random() > 0.5 ? '124,58,237' : Math.random() > 0.5 ? '59,130,246' : '192,160,32',
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.02 + 0.005,
      });
    }
  }
  
  function draw(){
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.pulse += p.pulseSpeed;
      if(p.y < -5) p.y = H + 5;
      if(p.x < -5) p.x = W + 5;
      if(p.x > W + 5) p.x = -5;
      const alpha = p.alpha * (0.7 + 0.3 * Math.sin(p.pulse));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + p.color + ',' + alpha + ')';
      ctx.fill();
      // Glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + p.color + ',' + (alpha * 0.15) + ')';
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  
  window.addEventListener('resize', () => { resize(); createParticles(); });
  resize();
  createParticles();
  draw();
})();

// ── Sons de navegação ───────────────────────────────────────────────────────
(function(){
  // Gerar sons sintéticos com Web Audio API (sem arquivos externos)
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ac = new AC();
  
  function playTone(freq, type, duration, vol) {
    if (ac.state === 'suspended') ac.resume();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ac.currentTime + duration);
    gain.gain.setValueAtTime(vol || 0.08, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  }
  
  // Hover: tom suave
  document.querySelectorAll('.nav-item,.btn,.produto-card').forEach(el => {
    el.addEventListener('mouseenter', () => playTone(880, 'sine', 0.08, 0.04));
  });
  
  // Click: tom mais marcado
  document.addEventListener('click', (e) => {
    const target = e.target.closest('.btn,.nav-item');
    if (target) playTone(660, 'triangle', 0.12, 0.06);
  });
  
  // Form submit: tom de sucesso
  document.querySelectorAll('form').forEach(f => {
    f.addEventListener('submit', () => {
      playTone(880, 'sine', 0.05, 0.05);
      setTimeout(() => playTone(1100, 'sine', 0.1, 0.05), 60);
    });
  });
})();
</script>`;
:root {
  --bg: #08080f;
  --sidebar: #0e0e1a;
  --card: #13131f;
  --card2: #1a1a2a;
  --border: #ffffff0f;
  --border2: #ffffff18;
  --text: #e8e8f8;
  --text2: #7878a0;
  --accent: #7c3aed;
  --accent2: #a855f7;
  --accent-glow: rgba(124,58,237,0.25);
  --green: #22c55e;
  --red: #ef4444;
  --yellow: #f59e0b;
  --blue: #3b82f6;
  --pink: #ec4899;
  --radius: 12px;
  --sidebar-w: 240px;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}

/* Scrollbar */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#ffffff20;border-radius:3px}

/* Layout */
.layout{display:flex;min-height:100vh}

/* Sidebar */
.sidebar{
  width:var(--sidebar-w);
  background:var(--sidebar);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  position:fixed;top:0;left:0;bottom:0;
  z-index:200;overflow-y:auto;
  backdrop-filter:blur(20px);
}
.sidebar-logo{
  padding:24px 20px 20px;
  border-bottom:1px solid var(--border);
}
.sidebar-logo .brand{
  font-size:20px;font-weight:800;
  background:linear-gradient(135deg,#a855f7,#3b82f6);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.sidebar-logo .sub{font-size:11px;color:var(--text2);margin-top:2px}
.sidebar-nav{flex:1;padding:12px 10px}
.nav-section{font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:1px;padding:14px 10px 6px;font-weight:600}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:9px 12px;border-radius:9px;
  color:var(--text2);text-decoration:none;font-size:13px;
  transition:all .18s;cursor:pointer;margin-bottom:2px;
  border:1px solid transparent;
}
.nav-item:hover{background:var(--card2);color:var(--text);border-color:var(--border)}
.nav-item.active{
  background:linear-gradient(135deg,#7c3aed20,#3b82f620);
  color:#fff;border-color:#7c3aed40;
  box-shadow:0 0 20px var(--accent-glow);
}
.nav-item .icon{font-size:16px;width:20px;text-align:center}
.sidebar-footer{padding:16px;border-top:1px solid var(--border)}
.user-card{
  background:var(--card2);border:1px solid var(--border2);
  border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;
}
.user-avatar{
  width:36px;height:36px;border-radius:50%;
  background:linear-gradient(135deg,var(--accent),var(--blue));
  display:flex;align-items:center;justify-content:center;
  font-size:16px;font-weight:700;flex-shrink:0;
}
.user-info{flex:1;min-width:0}
.user-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.user-cargo{font-size:11px;font-weight:600}
.logout-btn{display:block;text-align:center;margin-top:10px;color:var(--text2);font-size:12px;text-decoration:none;padding:6px;border-radius:7px;transition:all .15s}
.logout-btn:hover{background:#ef444420;color:var(--red)}

/* Main */
.main{margin-left:var(--sidebar-w);flex:1;padding:32px;max-width:1400px}

/* Header */
.page-header{margin-bottom:28px}
.page-title{font-size:26px;font-weight:800;color:#fff}
.page-sub{font-size:14px;color:var(--text2);margin-top:4px}

/* Cards grid */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:28px}
.stat-card{
  background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
  padding:20px;position:relative;overflow:hidden;transition:transform .2s,border-color .2s;
}
.stat-card:hover{transform:translateY(-2px);border-color:var(--border2)}
.stat-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,var(--glow-a,#7c3aed),var(--glow-b,#3b82f6));
}
.stat-label{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:10px}
.stat-value{font-size:30px;font-weight:800;color:#fff}
.stat-sub{font-size:12px;color:var(--text2);margin-top:6px}

/* Table */
.table-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px}
.table-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.table-title{font-size:15px;font-weight:700;color:#fff}
table{width:100%;border-collapse:collapse}
th{padding:10px 16px;text-align:left;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;background:var(--card2);font-weight:600;border-bottom:1px solid var(--border)}
td{padding:11px 16px;font-size:13px;border-bottom:1px solid var(--border);color:var(--text)}
tr:last-child td{border-bottom:none}
tr:hover td{background:#ffffff03}

/* Badges */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.badge-green{background:#166534;color:#86efac}
.badge-red{background:#7f1d1d;color:#fca5a5}
.badge-yellow{background:#78350f;color:#fde68a}
.badge-blue{background:#1e3a5f;color:#93c5fd}
.badge-purple{background:#4c1d95;color:#c4b5fd}
.badge-gray{background:#1e1e2e;color:#6b6b8a}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;border:none;transition:all .18s;white-space:nowrap}
.btn-primary{background:linear-gradient(135deg,var(--accent),#6025cc);color:#fff;box-shadow:0 4px 15px var(--accent-glow)}
.btn-primary:hover{filter:brightness(1.15);transform:translateY(-1px)}
.btn-success{background:#166534;color:#86efac;border:1px solid #166534}
.btn-success:hover{background:#15803d}
.btn-danger{background:#7f1d1d;color:#fca5a5;border:1px solid #7f1d1d}
.btn-danger:hover{background:#991b1b}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border2)}
.btn-ghost:hover{background:var(--card2);color:var(--text)}
.btn-sm{padding:5px 12px;font-size:12px;border-radius:7px}

/* Forms */
.form-group{margin-bottom:18px}
.form-group label{display:block;font-size:12px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:7px}
.form-control{
  width:100%;padding:10px 14px;
  background:var(--card2);border:1px solid var(--border2);
  border-radius:9px;color:var(--text);font-size:14px;outline:none;
  transition:border-color .18s,box-shadow .18s;
}
.form-control:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
.form-control option{background:var(--card)}
.form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}

/* Alerts */
.alert{padding:13px 16px;border-radius:10px;margin-bottom:18px;font-size:13px;display:flex;align-items:center;gap:10px}
.alert-success{background:#166534;border:1px solid #22c55e40;color:#86efac}
.alert-error{background:#7f1d1d;border:1px solid #ef444440;color:#fca5a5}
.alert-info{background:#1e3a5f;border:1px solid #3b82f640;color:#93c5fd}

/* Search */
.search-row{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.search-row .form-control{max-width:280px}

/* Produto cards (loja) */
.produtos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:24px}
.produto-card{
  background:var(--card);border:1px solid var(--border);border-radius:var(--radius);
  overflow:hidden;transition:transform .2s,border-color .2s;
}
.produto-card:hover{transform:translateY(-3px);border-color:var(--accent)40}
.produto-img{width:100%;height:140px;object-fit:cover;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:40px}
.produto-img img{width:100%;height:100%;object-fit:cover}
.produto-body{padding:14px}
.produto-nome{font-size:14px;font-weight:700;margin-bottom:6px;color:#fff}
.produto-preco{font-size:18px;font-weight:800;color:var(--accent2);margin-bottom:10px}
.produto-desc{font-size:12px;color:var(--text2);margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* Paginação */
.pagination{display:flex;gap:8px;align-items:center;margin-top:16px}
.pagination a,.pagination span{padding:6px 14px;border-radius:8px;font-size:13px;text-decoration:none}
.pagination a{background:var(--card2);color:var(--text);border:1px solid var(--border2)}
.pagination a:hover{background:var(--accent);color:#fff}
.pagination .current{background:var(--accent);color:#fff;font-weight:700}

/* Responsive */
@media(max-width:900px){
  :root{--sidebar-w:64px}
  .sidebar-logo .brand,.sidebar-logo .sub,.nav-item span,.user-info{display:none}
  .nav-item{padding:12px;justify-content:center}
  .main{padding:20px}
}
</style>`;

function layout(user, title, body, activePage = '') {
  const { podeVer } = require('./db');
  const cargo = user?.cargo || 'cliente';
  const ci    = CARGO_LABELS[cargo] || CARGO_LABELS.cliente;

  const navItems = Object.entries(ABAS_INFO)
    .filter(([aba]) => podeVer(cargo, aba))
    .map(([aba, info]) => `
      <a href="/painel/${aba === 'overview' ? '' : aba}" class="nav-item${activePage === aba ? ' active' : ''}">
        <span class="icon">${info.icon}</span>
        <span>${info.label}</span>
      </a>
    `).join('');

  const inicial = (user?.username || 'U')[0].toUpperCase();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — MrStore</title>
${CSS}
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-logo">
      <div class="brand">MrStore</div>
      <div class="sub">Painel de Controle</div>
    </div>
    <nav class="sidebar-nav">
      ${navItems}
    </nav>
    <div class="sidebar-footer">
      <div class="user-card">
        <div class="user-avatar">${inicial}</div>
        <div class="user-info">
          <div class="user-name">${user?.username || 'Usuário'}</div>
          <div class="user-cargo" style="color:${ci.color}">${ci.icon} ${ci.label}</div>
        </div>
      </div>
      <a href="/painel/logout" class="logout-btn">🚪 Sair da conta</a>
    </div>
  </aside>
  <main class="main">
    <div class="page-header">
      <div class="page-title">${title}</div>
    </div>
    ${body}
  </main>
</div>
</body>
</html>`;
}

function loginLayout(title, body) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — MrStore</title>
${CSS}
<style>
.auth-bg{
  min-height:100vh;display:grid;place-items:center;
  background:radial-gradient(ellipse at 20% 50%,#7c3aed15 0%,transparent 50%),
             radial-gradient(ellipse at 80% 20%,#3b82f615 0%,transparent 50%),
             var(--bg);
}
.auth-card{
  background:var(--card);border:1px solid var(--border2);border-radius:20px;
  padding:44px;width:min(440px,95vw);
  box-shadow:0 25px 60px #00000060,0 0 60px var(--accent-glow);
}
.auth-logo{text-align:center;margin-bottom:32px}
.auth-logo .brand{
  font-size:32px;font-weight:900;
  background:linear-gradient(135deg,#a855f7,#3b82f6);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.auth-logo .sub{font-size:13px;color:var(--text2);margin-top:4px}
.auth-title{font-size:20px;font-weight:700;margin-bottom:6px;color:#fff}
.auth-sub{font-size:13px;color:var(--text2);margin-bottom:24px}
.auth-switch{text-align:center;margin-top:20px;font-size:13px;color:var(--text2)}
.auth-switch a{color:var(--accent2);text-decoration:none;font-weight:600}
.auth-switch a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="auth-bg">
  <div class="auth-card">
    <div class="auth-logo">
      <div class="brand">MrStore</div>
      <div class="sub">Painel de Controle</div>
    </div>
    ${body}
  </div>
</div>
</body>
</html>`;
}

function badge(status) {
  const map = {
    pago:'badge-green',entregue:'badge-green',pendente:'badge-yellow',
    cancelado:'badge-red',aberto:'badge-blue',open:'badge-blue',
    fechado:'badge-gray',closed:'badge-gray',ativo:'badge-green',
    aprovado:'badge-green',recusado:'badge-red',cliente:'badge-blue',
    staff:'badge-green',resp_staff:'badge-purple',sub_dono:'badge-yellow',
    dono:'badge-red',
  };
  const cls = map[status] || 'badge-gray';
  return `<span class="badge ${cls}">${status}</span>`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function fmtMoeda(v) { return `R$ ${Number(v||0).toFixed(2)}`; }

function pagination(page, total, limit, base) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return '';
  let html = `<div class="pagination">`;
  if (page > 1) html += `<a href="${base}${base.includes('?')?'&':'?'}page=${page-1}">← Anterior</a>`;
  html += `<span class="current">Página ${page} de ${pages}</span>`;
  if (page < pages) html += `<a href="${base}${base.includes('?')?'&':'?'}page=${page+1}">Próxima →</a>`;
  html += `</div>`;
  return html;
}

module.exports = { layout, loginLayout, badge, fmtDate, fmtMoeda, pagination, CARGO_LABELS, ABAS_INFO };
