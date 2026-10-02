/**
 * dashboard/layout.js — Layout base e CSS compartilhado (Solo Leveling theme)
 */

const CARGO_LABELS = {
  cliente:    { label: 'Cliente',     color: '#60a5fa', icon: '👤' },
  staff:      { label: 'Staff',       color: '#34d399', icon: '🛡️' },
  resp_staff: { label: 'Resp. Staff', color: '#a78bfa', icon: '⭐' },
  sub_dono:   { label: 'Sub-Dono',    color: '#f59e0b', icon: '👑' },
  dono:       { label: 'Dono',        color: '#f43f5e', icon: '💎' },
};

const ABAS_INFO = {
  overview:     { icon: '📊', label: 'Visão Geral'    },
  loja:         { icon: '🛍️', label: 'Loja'           },
  perfil:       { icon: '👤', label: 'Perfil'          },
  solicitar:    { icon: '📋', label: 'Solicitar Item'  },
  solicitacoes: { icon: '📥', label: 'Solicitações'   },
  usuarios:     { icon: '👥', label: 'Usuários'       },
  produtos:     { icon: '📦', label: 'Produtos'        },
  pedidos:      { icon: '🛒', label: 'Pedidos'         },
  tickets:      { icon: '🎫', label: 'Tickets'         },
  cupons:       { icon: '🎟️', label: 'Cupons'          },
  gerenciar:    { icon: '⚙️', label: 'Gerenciar'       },
  config_mr:    { icon: '🔧', label: 'Config. Mr'      },
  clientes:     { icon: '📥', label: 'Clientes'         },
};

// CSS é uma string JS válida — todo o conteúdo dentro de backticks
const CSS = `<canvas id="bg-canvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:0.18"></canvas>
<style>
:root{--bg:#05050d;--sidebar:#08081a;--card:#0d0d20;--card2:#12122a;--border:#7c3aed18;--border2:#7c3aed30;--text:#e8e8ff;--text2:#7070a0;--accent:#7c3aed;--accent2:#a855f7;--accent-glow:rgba(124,58,237,0.3);--green:#00ff88;--red:#ff4455;--yellow:#f59e0b;--blue:#3b82f6;--radius:12px;--sidebar-w:240px}
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
body::before{content:'';position:fixed;inset:0;z-index:0;background:radial-gradient(ellipse at 15% 25%,#7c3aed12 0%,transparent 55%),radial-gradient(ellipse at 85% 75%,#3b82f608 0%,transparent 55%),radial-gradient(ellipse at 50% 50%,#0a0a1e 0%,#05050d 100%);pointer-events:none}
.layout,.auth-bg{position:relative;z-index:1}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#7c3aed40;border-radius:3px}
.layout{display:flex;min-height:100vh}
.sidebar{width:var(--sidebar-w);background:linear-gradient(180deg,#09091e 0%,#07071a 100%);border-right:1px solid var(--border2);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;z-index:220;overflow-y:auto;box-shadow:4px 0 30px #7c3aed15;flex-shrink:0;transition:width .25s ease,opacity .25s ease}
.sidebar.hidden{width:0;opacity:0;overflow:hidden;border:none;box-shadow:none}
.sidebar.open{width:var(--sidebar-w);opacity:1}
.sidebar-logo{padding:24px 20px 20px;border-bottom:1px solid var(--border);position:relative;overflow:hidden}
.sidebar-logo .brand{font-size:22px;font-weight:900;letter-spacing:2px;background:linear-gradient(135deg,#c0a020,#f0c040,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 8px #c0a02060)}
.sidebar-logo .sub{font-size:10px;color:#7070a0;margin-top:3px;letter-spacing:1px;text-transform:uppercase}
.sidebar-nav{flex:1;padding:12px 10px}
.nav-section{font-size:10px;color:#7070a0;text-transform:uppercase;letter-spacing:1px;padding:14px 10px 6px;font-weight:600}
.nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;color:var(--text2);text-decoration:none;font-size:13px;transition:all .2s cubic-bezier(.4,0,.2,1);cursor:pointer;margin-bottom:2px;border:1px solid transparent;position:relative;overflow:hidden}
.nav-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#7c3aed60,transparent);transition:width .2s;border-radius:9px 0 0 9px}
.nav-item:hover{background:linear-gradient(135deg,#7c3aed12,#3b82f608);color:var(--text);border-color:#7c3aed30;transform:translateX(3px)}
.nav-item:hover::before{width:3px}
.nav-item.active{background:linear-gradient(135deg,#7c3aed25,#3b82f615);color:#fff;border-color:#7c3aed50;box-shadow:0 0 20px #7c3aed20}
.nav-item.active::before{width:3px;background:#a855f7}
.nav-item .icon{font-size:16px;width:20px;text-align:center}
.sidebar-footer{padding:16px;border-top:1px solid var(--border)}
.user-card{background:linear-gradient(135deg,#0d0d25,#12122e);border:1px solid var(--border2);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;position:relative;overflow:hidden}
.user-avatar{width:38px;height:38px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,var(--accent),var(--blue));display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;box-shadow:0 0 12px #7c3aed40;border:2px solid #7c3aed60}
.user-info{flex:1;min-width:0}
.user-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}
.user-cargo{font-size:11px;font-weight:600;margin-top:1px}
.logout-btn{display:block;text-align:center;margin-top:10px;color:var(--text2);font-size:12px;text-decoration:none;padding:7px;border-radius:8px;transition:all .18s;border:1px solid transparent}
.logout-btn:hover{background:#ff445515;color:var(--red);border-color:#ff445530}
.main{flex:1;padding:32px;min-height:100vh;position:relative;z-index:1;transition:padding .25s ease;min-width:0}
.page-header{margin-bottom:28px}
.page-title{font-size:28px;font-weight:900;color:#fff;background:linear-gradient(135deg,#fff 30%,#c4b5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:28px}
.stat-card{background:linear-gradient(135deg,#0d0d20,#12122a);border:1px solid var(--border);border-radius:var(--radius);padding:20px;position:relative;overflow:hidden;transition:transform .25s cubic-bezier(.4,0,.2,1),border-color .25s,box-shadow .25s}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--glow-a,#7c3aed),var(--glow-b,#3b82f6));opacity:.8}
.stat-card:hover{transform:translateY(-3px);border-color:var(--border2);box-shadow:0 8px 30px #7c3aed18}
.stat-label{font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.7px;font-weight:600;margin-bottom:10px;position:relative;z-index:1}
.stat-value{font-size:30px;font-weight:900;color:#fff;position:relative;z-index:1;line-height:1}
.stat-sub{font-size:12px;color:var(--text2);margin-top:8px;position:relative;z-index:1}
.table-card{background:linear-gradient(135deg,#0d0d20,#0f0f22);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px;box-shadow:0 4px 24px #00000040}
.table-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:linear-gradient(135deg,#0f0f25,#0d0d20)}
.table-title{font-size:15px;font-weight:700;color:#fff}
table{width:100%;border-collapse:collapse}
th{padding:10px 16px;text-align:left;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;background:#0a0a1e;font-weight:600;border-bottom:1px solid var(--border)}
td{padding:11px 16px;font-size:13px;border-bottom:1px solid var(--border);color:var(--text);transition:background .15s}
tr:last-child td{border-bottom:none}tr:hover td{background:#7c3aed08}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.3px}
.badge-green{background:#00ff8818;color:#00ff88;border:1px solid #00ff8830}
.badge-red{background:#ff445518;color:#ff4455;border:1px solid #ff445530}
.badge-yellow{background:#f59e0b18;color:#fde68a;border:1px solid #f59e0b30}
.badge-blue{background:#3b82f618;color:#93c5fd;border:1px solid #3b82f630}
.badge-purple{background:#a855f718;color:#c4b5fd;border:1px solid #a855f730}
.badge-gray{background:#7070a018;color:#7070a0;border:1px solid #7070a030}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 18px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;border:none;transition:all .2s cubic-bezier(.4,0,.2,1);white-space:nowrap;position:relative;overflow:hidden}
.btn-primary{background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;box-shadow:0 4px 15px #7c3aed35;border:1px solid #a855f730}
.btn-primary:hover{background:linear-gradient(135deg,#a855f7,#7c3aed);box-shadow:0 6px 25px #7c3aed50;transform:translateY(-1px)}
.btn-success{background:#00ff8815;color:#00ff88;border:1px solid #00ff8840}
.btn-success:hover{background:#00ff8825}
.btn-danger{background:#ff445515;color:#ff4455;border:1px solid #ff445540}
.btn-danger:hover{background:#ff445525}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border2)}
.btn-ghost:hover{background:var(--card2);color:var(--text)}
.btn-sm{padding:5px 12px;font-size:12px;border-radius:7px}
.form-group{margin-bottom:18px}
.form-group label{display:block;font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px}
.form-control{width:100%;padding:10px 14px;background:#0a0a1e;border:1px solid var(--border2);border-radius:9px;color:var(--text);font-size:14px;outline:none;transition:border-color .18s,box-shadow .18s}
.form-control:focus{border-color:var(--accent);box-shadow:0 0 0 3px #7c3aed20;background:#0d0d22}
.form-control option{background:#0a0a1e}
.form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.alert{padding:13px 16px;border-radius:10px;margin-bottom:18px;font-size:13px;display:flex;align-items:center;gap:10px}
.alert-success{background:#00ff8810;border:1px solid #00ff8830;color:#00ff88}
.alert-error{background:#ff445510;border:1px solid #ff445530;color:#ff4455}
.alert-info{background:#3b82f610;border:1px solid #3b82f630;color:#93c5fd}
.search-row{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.search-row .form-control{max-width:280px}
.produtos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px;margin-bottom:24px}
.produto-card{background:linear-gradient(135deg,#0d0d20,#12122a);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:transform .25s cubic-bezier(.4,0,.2,1),border-color .25s,box-shadow .25s;cursor:pointer}
.produto-card:hover{transform:translateY(-5px) scale(1.01);border-color:#7c3aed60;box-shadow:0 12px 40px #7c3aed20}
.produto-img{width:100%;height:150px;background:linear-gradient(135deg,#0d0d25,#1a1a35);display:flex;align-items:center;justify-content:center;font-size:48px;overflow:hidden;position:relative}
.produto-img img{width:100%;height:100%;object-fit:cover;transition:transform .3s}
.produto-card:hover .produto-img img{transform:scale(1.08)}
.produto-body{padding:14px}
.produto-nome{font-size:14px;font-weight:700;margin-bottom:6px;color:#fff}
.produto-preco{font-size:20px;font-weight:900;margin-bottom:10px;background:linear-gradient(135deg,#c0a020,#f0c040);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.produto-desc{font-size:12px;color:var(--text2);margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pagination{display:flex;gap:8px;align-items:center;margin-top:16px}
.pagination a,.pagination span{padding:6px 14px;border-radius:8px;font-size:13px;text-decoration:none}
.pagination a{background:var(--card2);color:var(--text);border:1px solid var(--border2);transition:all .15s}
.pagination a:hover{background:var(--accent);color:#fff}
.pagination .current{background:linear-gradient(135deg,var(--accent),#5b21b6);color:#fff;font-weight:700;border:none}
@keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.main > *{animation:fadeInUp .3s ease-out both}
.main > *:nth-child(2){animation-delay:.05s}
.main > *:nth-child(3){animation-delay:.1s}
@media(max-width:900px){
  .sidebar{position:fixed;top:0;left:0;bottom:0;width:240px!important;opacity:1!important;overflow-y:auto;transform:translateX(-100%);transition:transform .25s ease;z-index:999}
  .sidebar.open{transform:translateX(0)}
  .sidebar.hidden{transform:translateX(-100%)}
  .main{margin-left:0;padding:14px}
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .produtos-grid{grid-template-columns:repeat(2,1fr)}
  [style*="grid-template-columns"]{grid-template-columns:1fr!important}
}@media(max-width:600px){
  .stats-grid,.produtos-grid{grid-template-columns:1fr}
  .main{padding:10px}
  .page-title{font-size:18px}
  th,td{padding:7px 8px;font-size:12px}
  table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
}
</style>
<script>
(function(){
  const canvas = document.getElementById('bg-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];
  function resize(){ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  function createParticles(){
    particles = [];
    const count = Math.floor(W * H / 18000);
    for(let i = 0; i < count; i++){
      particles.push({ x: Math.random()*W, y: Math.random()*H, size: Math.random()*2+0.3, speedX: (Math.random()-.5)*.3, speedY: -Math.random()*.4-.1, alpha: Math.random()*.6+.1, color: Math.random()>.5?'124,58,237':Math.random()>.5?'59,130,246':'192,160,32', pulse: Math.random()*Math.PI*2, pulseSpeed: Math.random()*.02+.005 });
    }
  }
  function draw(){
    ctx.clearRect(0,0,W,H);
    particles.forEach(p => {
      p.x+=p.speedX; p.y+=p.speedY; p.pulse+=p.pulseSpeed;
      if(p.y<-5)p.y=H+5; if(p.x<-5)p.x=W+5; if(p.x>W+5)p.x=-5;
      const a = p.alpha*(0.7+0.3*Math.sin(p.pulse));
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
      ctx.fillStyle='rgba('+p.color+','+a+')'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*2.5,0,Math.PI*2);
      ctx.fillStyle='rgba('+p.color+','+(a*.15)+')'; ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize',()=>{resize();createParticles();});
  resize(); createParticles(); draw();
})();
(function(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  const ac = new AC();
  function playTone(freq,type,dur,vol){
    if(ac.state==='suspended')ac.resume();
    const o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(ac.destination);
    o.type=type||'sine'; o.frequency.setValueAtTime(freq,ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq*.5,ac.currentTime+dur);
    g.gain.setValueAtTime(vol||.08,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);
    o.start(ac.currentTime); o.stop(ac.currentTime+dur);
  }
  document.querySelectorAll('.nav-item,.btn,.produto-card').forEach(el=>{
    el.addEventListener('mouseenter',()=>playTone(880,'sine',.08,.04));
  });
  document.addEventListener('click',e=>{
    if(e.target.closest('.btn,.nav-item'))playTone(660,'triangle',.12,.06);
  });
  document.querySelectorAll('form').forEach(f=>{
    f.addEventListener('submit',()=>{playTone(880,'sine',.05,.05);setTimeout(()=>playTone(1100,'sine',.1,.05),60);});
  });
})();
</script>`;

function layout(user, title, body, activePage = '') {
  const { podeVer } = require('./db');
  const cargo = user?.cargo || 'cliente';
  const ci    = CARGO_LABELS[cargo] || CARGO_LABELS.cliente;

  // Perfil sempre visível
  const navItems = Object.entries(ABAS_INFO)
    .filter(([aba]) => aba === 'perfil' || podeVer(cargo, aba))
    .map(([aba, info]) => `
      <a href="/painel/${aba === 'overview' ? '' : aba.replace(/_/g, '-')}" class="nav-item${activePage === aba ? ' active' : ''}">
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
<style>
.hamburger{display:flex;position:fixed;top:14px;left:14px;z-index:1000;background:linear-gradient(135deg,#7c3aed,#5b21b6);border:none;border-radius:9px;width:40px;height:40px;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 15px #7c3aed40;color:#fff;font-size:20px}
.main{padding-top:60px!important}
</style>
</head>
<body>
<button class="hamburger" onclick="toggleMenu()" id="ham-btn">☰</button>
<div class="layout">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <div class="brand">MrStore</div>
      <div class="sub">Painel de Controle</div>
    </div>
    <nav class="sidebar-nav">${navItems}</nav>
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
  <div id="sb-backdrop" onclick="fecharMenu()" style="display:none;position:fixed;inset:0;z-index:998;background:#00000070;-webkit-tap-highlight-color:transparent"></div>
  <main class="main">
    <div class="page-header"><div class="page-title">${title}</div></div>
    ${body}
  </main>
</div>
<script>
var _desktop = window.innerWidth > 900;
function toggleMenu(){
  _desktop = window.innerWidth > 900;
  var sb = document.getElementById('sidebar');
  var isOpen = !sb.classList.contains('hidden');
  isOpen ? fecharMenu() : abrirMenu();
}
function abrirMenu(){
  _desktop = window.innerWidth > 900;
  var sb = document.getElementById('sidebar');
  sb.classList.remove('hidden');
  sb.classList.add('open');
  document.getElementById('ham-btn').textContent='✕';
  if(!_desktop){
    document.getElementById('sb-backdrop').style.display='block';
  }
}
function fecharMenu(){
  _desktop = window.innerWidth > 900;
  var sb = document.getElementById('sidebar');
  sb.classList.add('hidden');
  sb.classList.remove('open');
  document.getElementById('sb-backdrop').style.display='none';
  document.getElementById('ham-btn').textContent='☰';
}
window.addEventListener('DOMContentLoaded',function(){
  var sb = document.getElementById('sidebar');
  if(window.innerWidth > 900){
    // Desktop: começa aberta, não sobrepõe
    sb.classList.add('open');
    sb.classList.remove('hidden');
    document.getElementById('ham-btn').textContent='✕';
  } else {
    // Mobile: começa fechada
    sb.classList.add('hidden');
    document.getElementById('ham-btn').textContent='☰';
  }
});
window.addEventListener('resize',function(){
  var sb = document.getElementById('sidebar');
  if(window.innerWidth > 900){
    document.getElementById('sb-backdrop').style.display='none';
    // No resize para desktop, se estava hidden mantém; se estava open mantém
  }
});
</script>
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
.auth-bg{min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 20% 50%,#7c3aed15 0%,transparent 50%),radial-gradient(ellipse at 80% 20%,#3b82f615 0%,transparent 50%),var(--bg)}
.auth-card{background:#0d0d20;border:1px solid #7c3aed30;border-radius:20px;padding:44px;width:min(440px,95vw);box-shadow:0 25px 60px #00000060,0 0 60px rgba(124,58,237,0.15)}
.auth-logo{text-align:center;margin-bottom:32px}
.auth-logo .brand{font-size:32px;font-weight:900;background:linear-gradient(135deg,#c0a020,#f0c040,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.auth-logo .sub{font-size:13px;color:#7070a0;margin-top:4px}
.auth-title{font-size:20px;font-weight:700;margin-bottom:6px;color:#fff}
.auth-sub{font-size:13px;color:#7070a0;margin-bottom:24px}
.auth-switch{text-align:center;margin-top:20px;font-size:13px;color:#7070a0}
.auth-switch a{color:#a855f7;text-decoration:none;font-weight:600}
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
    dono:'badge-red',inativo:'badge-gray',expirado:'badge-red',bloqueado:'badge-red',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtMoeda(v) { return `R$ ${Number(v || 0).toFixed(2)}`; }

function pagination(page, total, limit, base) {
  const pages = Math.ceil(total / limit);
  if (pages <= 1) return '';
  const sep = base.includes('?') ? '&' : '?';
  let html = `<div class="pagination">`;
  if (page > 1) html += `<a href="${base}${sep}page=${page - 1}">← Anterior</a>`;
  html += `<span class="current">Página ${page} de ${pages}</span>`;
  if (page < pages) html += `<a href="${base}${sep}page=${page + 1}">Próxima →</a>`;
  html += `</div>`;
  return html;
}

module.exports = { layout, loginLayout, badge, fmtDate, fmtMoeda, pagination, CARGO_LABELS, ABAS_INFO };
