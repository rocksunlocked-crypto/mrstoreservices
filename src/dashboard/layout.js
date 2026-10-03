/**
 * dashboard/layout.js — Layout base e CSS (tema anime moderno)
 */

const CARGO_LABELS = {
  cliente:    { label: 'Cliente',     color: '#60a5fa', icon: '👤' },
  revendedor: { label: 'Revendedor',  color: '#f97316', icon: '🏪' },
  staff:      { label: 'Staff',       color: '#34d399', icon: '🛡️' },
  resp_staff: { label: 'Resp. Staff', color: '#a78bfa', icon: '⭐' },
  sub_dono:   { label: 'Sub-Dono',    color: '#f59e0b', icon: '👑' },
  dono:       { label: 'Dono',        color: '#f43f5e', icon: '💎' },
};

const ABAS_INFO = {
  overview:     { icon: '📊', label: 'Visão Geral'    },
  loja:         { icon: '🛍️', label: 'Loja'           },
  perfil:       { icon: '👤', label: 'Perfil'          },
  meus_pedidos: { icon: '📦', label: 'Meus Pedidos'    },
  revendedor:   { icon: '🏪', label: 'Revendedor'      },
  carrinhos:    { icon: '🛒', label: 'Carrinhos'        },
  solicitar:    { icon: '📋', label: 'Solicitar Item'  },
  solicitacoes: { icon: '📥', label: 'Solicitações'   },
  usuarios:     { icon: '👥', label: 'Usuários'       },
  produtos:     { icon: '📦', label: 'Produtos'        },
  pedidos:      { icon: '🛒', label: 'Pedidos'         },
  tickets:      { icon: '🎫', label: 'Tickets'         },
  cupons:       { icon: '🎟️', label: 'Cupons'          },
  gerenciar:    { icon: '⚙️', label: 'Gerenciar'       },
  config_mr:    { icon: '🔧', label: 'Config. Mr'      },
  clientes:     { icon: '📥', label: 'Clientes'        },
};

const CSS = `<canvas id="bg-canvas" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none"></canvas>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
:root{--bg:#03030a;--sidebar:#05050e;--card:#0b0b18;--card2:#0e0e1e;--border:#6d28d918;--border2:#6d28d930;--text:#eeeeff;--text2:#5a5a90;--accent:#6d28d9;--accent2:#9333ea;--green:#00e87a;--red:#ff3355;--yellow:#f59e0b;--blue:#3b82f6;--pink:#ec4899;--cyan:#06b6d4;--radius:14px;--sidebar-w:250px}
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
body::before{content:'';position:fixed;inset:0;z-index:0;background:radial-gradient(ellipse 80% 60% at 10% 20%,#6d28d915 0%,transparent 60%),radial-gradient(ellipse 60% 50% at 90% 80%,#06b6d40c 0%,transparent 55%),radial-gradient(ellipse 50% 40% at 50% 50%,#9333ea08 0%,transparent 50%),linear-gradient(160deg,#03030a 0%,#060612 50%,#03030a 100%);pointer-events:none}
.layout,.auth-bg{position:relative;z-index:1}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#6d28d950;border-radius:4px}::-webkit-scrollbar-thumb:hover{background:#9333ea80}
.layout{display:flex;min-height:100vh}
.sidebar{width:var(--sidebar-w);background:linear-gradient(180deg,rgba(7,5,18,0.98) 0%,rgba(4,3,12,0.99) 100%);border-right:1px solid var(--border2);display:flex;flex-direction:column;position:sticky;top:0;height:100vh;z-index:220;overflow-y:auto;box-shadow:0 0 50px rgba(109,40,217,0.1);flex-shrink:0;transition:width .3s cubic-bezier(.4,0,.2,1),opacity .3s ease;backdrop-filter:blur(20px)}
.sidebar.hidden{width:0;opacity:0;overflow:hidden;border:none;box-shadow:none}
.sidebar.open{width:var(--sidebar-w);opacity:1}
.sidebar-logo{padding:28px 22px 22px;border-bottom:1px solid var(--border);position:relative;overflow:hidden}
.sidebar-logo::after{content:'';position:absolute;top:-30px;right:-20px;width:100px;height:100px;background:radial-gradient(circle,#9333ea25,transparent 70%);pointer-events:none}
.sidebar-logo .brand{font-size:21px;font-weight:900;letter-spacing:3px;background:linear-gradient(135deg,#e8b840 0%,#f5d060 40%,#c084fc 70%,#818cf8 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 12px rgba(232,184,64,0.35))}
.sidebar-logo .sub{font-size:9px;color:#40407060;margin-top:4px;letter-spacing:2px;text-transform:uppercase;font-weight:600}
.sidebar-nav{flex:1;padding:14px 10px}
.nav-section{font-size:9px;color:#30305050;text-transform:uppercase;letter-spacing:1.5px;padding:16px 12px 7px;font-weight:700}
.nav-item{display:flex;align-items:center;gap:11px;padding:11px 14px;border-radius:10px;color:var(--text2);text-decoration:none;font-size:12.5px;font-weight:500;transition:all .22s cubic-bezier(.4,0,.2,1);cursor:pointer;margin-bottom:2px;border:1px solid transparent;position:relative;overflow:hidden}
.nav-item::before{content:'';position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#9333ea,transparent);transition:width .25s;border-radius:10px 0 0 10px}
.nav-item:hover{background:linear-gradient(135deg,rgba(109,40,217,0.1),rgba(6,182,212,0.03));color:var(--text);border-color:rgba(109,40,217,0.22);transform:translateX(4px)}
.nav-item:hover::before{width:3px}
.nav-item.active{background:linear-gradient(135deg,rgba(109,40,217,0.17),rgba(6,182,212,0.05));color:#fff;border-color:rgba(147,51,234,0.42);box-shadow:0 2px 20px rgba(109,40,217,0.15),inset 0 0 20px rgba(109,40,217,0.04)}
.nav-item.active::before{width:3px;background:linear-gradient(to bottom,#c084fc,#818cf8)}
.nav-item .icon{font-size:15px;width:20px;text-align:center;flex-shrink:0}
.sidebar-footer{padding:16px;border-top:1px solid var(--border)}
.user-card{background:linear-gradient(135deg,rgba(14,10,32,0.9),rgba(18,12,40,0.9));border:1px solid var(--border2);border-radius:12px;padding:13px;display:flex;align-items:center;gap:11px;position:relative;overflow:hidden}
.user-card::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(109,40,217,0.05),transparent);pointer-events:none}
.user-avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#6d28d9,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;box-shadow:0 0 15px rgba(109,40,217,0.5);border:2px solid rgba(109,40,217,0.6)}
.user-info{flex:1;min-width:0}
.user-name{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}
.user-cargo{font-size:10.5px;font-weight:600;margin-top:2px}
.logout-btn{display:block;text-align:center;margin-top:10px;color:var(--text2);font-size:12px;text-decoration:none;padding:7px;border-radius:9px;transition:all .18s;border:1px solid transparent;font-weight:500}
.logout-btn:hover{background:rgba(255,51,85,0.1);color:var(--red);border-color:rgba(255,51,85,0.3)}
.main{flex:1;padding:32px;min-height:100vh;position:relative;z-index:1;transition:padding .25s ease;min-width:0}
.page-header{margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid var(--border)}
.page-title{font-size:26px;font-weight:800;color:#fff;background:linear-gradient(135deg,#fff 20%,#c4b5fd 60%,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:-0.5px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:28px}
.stat-card{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--border);border-radius:var(--radius);padding:22px;position:relative;overflow:hidden;transition:transform .25s cubic-bezier(.4,0,.2,1),border-color .25s,box-shadow .25s}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--glow-a,#6d28d9),var(--glow-b,#3b82f6));opacity:.9}
.stat-card::after{content:'';position:absolute;top:-40px;right:-40px;width:100px;height:100px;background:radial-gradient(circle,rgba(109,40,217,0.06),transparent 70%);pointer-events:none}
.stat-card:hover{transform:translateY(-4px);border-color:var(--border2);box-shadow:0 12px 40px rgba(109,40,217,0.15)}
.stat-label{font-size:10.5px;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;font-weight:700;margin-bottom:12px;position:relative;z-index:1}
.stat-value{font-size:30px;font-weight:900;color:#fff;position:relative;z-index:1;line-height:1;letter-spacing:-1px}
.stat-sub{font-size:11.5px;color:var(--text2);margin-top:9px;position:relative;z-index:1}
.table-card{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:24px;box-shadow:0 4px 30px rgba(0,0,0,0.4)}
.table-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:linear-gradient(135deg,rgba(10,7,25,0.8),rgba(8,5,20,0.6));backdrop-filter:blur(5px)}
.table-title{font-size:14px;font-weight:700;color:#fff;letter-spacing:0.2px}
table{width:100%;border-collapse:collapse}
th{padding:11px 16px;text-align:left;font-size:10.5px;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;background:rgba(0,0,0,0.25);font-weight:700;border-bottom:1px solid var(--border)}
td{padding:12px 16px;font-size:13px;border-bottom:1px solid var(--border);color:var(--text);transition:background .15s}
tr:last-child td{border-bottom:none}tr:hover td{background:rgba(109,40,217,0.06)}
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:10.5px;font-weight:700;letter-spacing:.3px}
.badge-green{background:rgba(0,232,122,0.12);color:#00e87a;border:1px solid rgba(0,232,122,0.3)}
.badge-red{background:rgba(255,51,85,0.12);color:#ff3355;border:1px solid rgba(255,51,85,0.3)}
.badge-yellow{background:rgba(245,158,11,0.12);color:#fde68a;border:1px solid rgba(245,158,11,0.3)}
.badge-blue{background:rgba(59,130,246,0.12);color:#93c5fd;border:1px solid rgba(59,130,246,0.3)}
.badge-purple{background:rgba(168,85,247,0.12);color:#c4b5fd;border:1px solid rgba(168,85,247,0.3)}
.badge-gray{background:rgba(90,90,144,0.12);color:#5a5a90;border:1px solid rgba(90,90,144,0.3)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 18px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;border:none;transition:all .2s cubic-bezier(.4,0,.2,1);white-space:nowrap;position:relative;overflow:hidden;font-family:inherit}
.btn-primary{background:linear-gradient(135deg,#6d28d9,#4f1d96);color:#fff;box-shadow:0 4px 15px rgba(109,40,217,0.4);border:1px solid rgba(168,85,247,0.3)}
.btn-primary:hover{background:linear-gradient(135deg,#9333ea,#6d28d9);box-shadow:0 6px 25px rgba(109,40,217,0.55);transform:translateY(-1px)}
.btn-success{background:rgba(0,232,122,0.1);color:#00e87a;border:1px solid rgba(0,232,122,0.35)}
.btn-success:hover{background:rgba(0,232,122,0.2)}
.btn-danger{background:rgba(255,51,85,0.1);color:#ff3355;border:1px solid rgba(255,51,85,0.35)}
.btn-danger:hover{background:rgba(255,51,85,0.2)}
.btn-ghost{background:transparent;color:var(--text2);border:1px solid var(--border2);font-weight:500}
.btn-ghost:hover{background:var(--card2);color:var(--text);border-color:rgba(109,40,217,0.35)}
.btn-sm{padding:5px 12px;font-size:11.5px;border-radius:7px}
.form-group{margin-bottom:18px}
.form-group label{display:block;font-size:10.5px;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px}
.form-control{width:100%;padding:10px 14px;background:rgba(5,3,15,0.85);border:1px solid var(--border2);border-radius:10px;color:var(--text);font-size:13.5px;outline:none;transition:border-color .18s,box-shadow .18s;font-family:inherit}
.form-control:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(109,40,217,0.18);background:rgba(8,5,22,0.95)}
.form-control option{background:#0c0a1e}
.form-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.alert{padding:13px 16px;border-radius:10px;margin-bottom:18px;font-size:13px;display:flex;align-items:center;gap:10px}
.alert-success{background:rgba(0,232,122,0.08);border:1px solid rgba(0,232,122,0.3);color:#00e87a}
.alert-error{background:rgba(255,51,85,0.08);border:1px solid rgba(255,51,85,0.3);color:#ff3355}
.alert-info{background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.3);color:#67e8f9}
.search-row{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.search-row .form-control{max-width:280px}
.produtos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:20px;margin-bottom:24px}
.produto-card{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:transform .25s cubic-bezier(.4,0,.2,1),border-color .25s,box-shadow .25s;cursor:pointer;position:relative}
.produto-card:hover{transform:translateY(-6px) scale(1.01);border-color:rgba(109,40,217,0.5);box-shadow:0 15px 50px rgba(109,40,217,0.18)}
.produto-img{width:100%;height:155px;background:linear-gradient(135deg,#0a0818,#12103a);display:flex;align-items:center;justify-content:center;font-size:48px;overflow:hidden;position:relative}
.produto-img img{width:100%;height:100%;object-fit:cover;transition:transform .35s}
.produto-card:hover .produto-img img{transform:scale(1.1)}
.produto-body{padding:15px}
.produto-nome{font-size:13.5px;font-weight:700;margin-bottom:7px;color:#fff;line-height:1.3}
.produto-preco{font-size:20px;font-weight:900;margin-bottom:10px;background:linear-gradient(135deg,#e8b840,#f5d060);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.produto-desc{font-size:11.5px;color:var(--text2);margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5}
.pagination{display:flex;gap:8px;align-items:center;margin-top:16px}
.pagination a,.pagination span{padding:6px 14px;border-radius:9px;font-size:13px;text-decoration:none}
.pagination a{background:var(--card2);color:var(--text);border:1px solid var(--border2);transition:all .15s}
.pagination a:hover{background:var(--accent);color:#fff}
.pagination .current{background:linear-gradient(135deg,var(--accent),#4f1d96);color:#fff;font-weight:700;border:none}
@keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.main > *{animation:fadeInUp .28s ease-out both}
.main > *:nth-child(2){animation-delay:.04s}
.main > *:nth-child(3){animation-delay:.08s}
.main > *:nth-child(4){animation-delay:.12s}
@media(max-width:900px){
  .sidebar{position:fixed;top:0;left:0;bottom:0;width:250px!important;opacity:1!important;overflow-y:auto;transform:translateX(-100%);transition:transform .3s ease;z-index:999}
  .sidebar.open{transform:translateX(0)}
  .sidebar.hidden{transform:translateX(-100%)}
  .main{margin-left:0;padding:14px}
  .stats-grid{grid-template-columns:repeat(2,1fr)}
  .produtos-grid{grid-template-columns:repeat(2,1fr)}
  [style*="grid-template-columns"]{grid-template-columns:1fr!important}
}
@media(max-width:600px){
  .stats-grid,.produtos-grid{grid-template-columns:1fr}
  .main{padding:10px}
  .page-title{font-size:18px}
  th,td{padding:7px 8px;font-size:11.5px}
  table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
}
</style>
<script>
(function(){
  const canvas = document.getElementById('bg-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [], sakura = [], orbs = [];
  function resize(){ W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  function initParticles(){
    particles = [];
    const n = Math.floor(W * H / 14000);
    for(let i=0;i<n;i++){
      particles.push({ x:Math.random()*W, y:Math.random()*H, size:Math.random()*1.5+0.3, vx:(Math.random()-.5)*.25, vy:-Math.random()*.35-.08, alpha:Math.random()*.5+.1, color:['109,40,217','147,51,234','6,182,212','129,140,248','236,72,153'][Math.floor(Math.random()*5)], pulse:Math.random()*Math.PI*2, ps:Math.random()*.015+.004 });
    }
  }
  function initSakura(){
    sakura = [];
    for(let i=0;i<16;i++){
      sakura.push({ x:Math.random()*W, y:Math.random()*H-H, size:Math.random()*5+3, vx:(Math.random()-.5)*.6, vy:Math.random()*.5+.3, rot:Math.random()*Math.PI*2, rs:(Math.random()-.5)*.04, alpha:Math.random()*.2+.04, color:Math.random()>.5?'236,72,153':'168,85,247' });
    }
  }
  function initOrbs(){
    orbs = [
      { x:W*.1, y:H*.2, r:180, color:'109,40,217', a:.05, pa:0, ps:.007 },
      { x:W*.88, y:H*.8, r:140, color:'6,182,212', a:.035, pa:1.5, ps:.005 },
      { x:W*.5, y:H*.45, r:100, color:'147,51,234', a:.025, pa:3, ps:.009 },
    ];
  }
  function drawPetal(x,y,size,rot,alpha,color){
    ctx.save(); ctx.translate(x,y); ctx.rotate(rot);
    ctx.globalAlpha=alpha; ctx.beginPath();
    ctx.ellipse(0,0,size,size*.5,0,0,Math.PI*2);
    ctx.fillStyle='rgba('+color+',.75)'; ctx.fill(); ctx.restore();
  }
  function draw(){
    ctx.clearRect(0,0,W,H);
    orbs.forEach(o=>{
      o.pa+=o.ps;
      const a=o.a*(0.7+0.3*Math.sin(o.pa));
      const g=ctx.createRadialGradient(o.x,o.y,0,o.x,o.y,o.r);
      g.addColorStop(0,'rgba('+o.color+','+a+')'); g.addColorStop(1,'rgba('+o.color+',0)');
      ctx.beginPath(); ctx.arc(o.x,o.y,o.r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
    });
    particles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.pulse+=p.ps;
      if(p.y<-5)p.y=H+5; if(p.x<-5)p.x=W+5; if(p.x>W+5)p.x=-5;
      const a=p.alpha*(0.6+0.4*Math.sin(p.pulse));
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
      ctx.fillStyle='rgba('+p.color+','+a+')'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*3,0,Math.PI*2);
      ctx.fillStyle='rgba('+p.color+','+(a*.1)+')'; ctx.fill();
    });
    sakura.forEach(s=>{
      s.x+=s.vx; s.y+=s.vy; s.rot+=s.rs; s.vx+=Math.sin(s.y*.01)*.01;
      if(s.y>H+20){ s.y=-20; s.x=Math.random()*W; }
      drawPetal(s.x,s.y,s.size,s.rot,s.alpha,s.color);
    });
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize',()=>{ resize(); initParticles(); initOrbs(); });
  resize(); initParticles(); initSakura(); initOrbs(); draw();
})();
</script>`;

function layout(user, title, body, activePage = '') {
  const { podeVer } = require('./db');
  const cargo = user?.cargo || 'cliente';
  const ci    = CARGO_LABELS[cargo] || CARGO_LABELS.cliente;
  const isVisitante = user?.__visitante;

  const navItems = Object.entries(ABAS_INFO)
    .filter(([aba]) => {
      if (isVisitante) return aba === 'loja' || aba === 'perfil';
      return aba === 'perfil' || podeVer(cargo, aba);
    })
    .map(([aba, info]) => `
      <a href="/painel/${aba === 'overview' ? 'overview' : aba.replace(/_/g, '-')}" class="nav-item${activePage === aba ? ' active' : ''}">
        <span class="icon">${info.icon}</span>
        <span>${info.label}</span>
      </a>
    `).join('');

  const inicial = (user?.username || 'V')[0].toUpperCase();

  const footerHtml = isVisitante ? `
    <div style="padding:16px;border-top:1px solid var(--border)">
      <a href="/painel/login" class="btn btn-primary" style="width:100%;margin-bottom:8px;justify-content:center">🔑 Entrar</a>
      <a href="/painel/cadastro" class="btn btn-ghost" style="width:100%;justify-content:center">✨ Criar conta</a>
    </div>` : `
    <div class="sidebar-footer">
      <div class="user-card">
        <div class="user-avatar">${inicial}</div>
        <div class="user-info">
          <div class="user-name">${user?.username || 'Usuário'}</div>
          <div class="user-cargo" style="color:${ci.color}">${ci.icon} ${ci.label}</div>
        </div>
      </div>
      <a href="/painel/logout" class="logout-btn">🚪 Sair da conta</a>
    </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — MrStore</title>
${CSS}
<style>
.hamburger{display:flex;position:fixed;top:14px;left:14px;z-index:1000;background:linear-gradient(135deg,#6d28d9,#4f1d96);border:none;border-radius:10px;width:42px;height:42px;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 18px rgba(109,40,217,0.5);color:#fff;font-size:20px;transition:all .2s}
.hamburger:hover{background:linear-gradient(135deg,#9333ea,#6d28d9);transform:scale(1.08)}
.main{padding-top:64px!important}
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
    ${footerHtml}
  </aside>
  <div id="sb-backdrop" onclick="fecharMenu()" style="display:none;position:fixed;inset:0;z-index:998;background:rgba(0,0,0,0.6);backdrop-filter:blur(3px);-webkit-tap-highlight-color:transparent"></div>
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
  sb.classList.contains('open') ? fecharMenu() : abrirMenu();
}
function abrirMenu(){
  var sb = document.getElementById('sidebar');
  sb.classList.remove('hidden'); sb.classList.add('open');
  document.getElementById('ham-btn').textContent = '✕';
  if(window.innerWidth <= 900) document.getElementById('sb-backdrop').style.display = 'block';
}
function fecharMenu(){
  var sb = document.getElementById('sidebar');
  sb.classList.add('hidden'); sb.classList.remove('open');
  document.getElementById('sb-backdrop').style.display = 'none';
  document.getElementById('ham-btn').textContent = '☰';
}
window.addEventListener('DOMContentLoaded', function(){
  var sb = document.getElementById('sidebar');
  if(window.innerWidth > 900){ sb.classList.add('open'); sb.classList.remove('hidden'); document.getElementById('ham-btn').textContent = '✕'; }
  else { sb.classList.add('hidden'); }
});
window.addEventListener('resize', function(){
  if(window.innerWidth > 900) document.getElementById('sb-backdrop').style.display = 'none';
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
.auth-bg{min-height:100vh;display:grid;place-items:center;padding:20px}
.auth-card{background:linear-gradient(135deg,rgba(11,9,24,0.95),rgba(14,11,30,0.95));border:1px solid rgba(109,40,217,0.3);border-radius:20px;padding:44px;width:min(440px,95vw);box-shadow:0 30px 70px rgba(0,0,0,0.7),0 0 80px rgba(109,40,217,0.12);backdrop-filter:blur(20px);position:relative;z-index:1}
.auth-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#9333ea,transparent);border-radius:20px 20px 0 0}
.auth-logo{text-align:center;margin-bottom:32px}
.auth-logo .brand{font-size:32px;font-weight:900;background:linear-gradient(135deg,#e8b840,#f5d060,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 15px rgba(232,184,64,0.3))}
.auth-logo .sub{font-size:12px;color:#40406080;margin-top:5px;letter-spacing:2px;text-transform:uppercase;font-weight:600}
.auth-title{font-size:20px;font-weight:800;margin-bottom:6px;color:#fff}
.auth-sub{font-size:13px;color:#5a5a90;margin-bottom:24px}
.auth-switch{text-align:center;margin-top:20px;font-size:13px;color:#5a5a90}
.auth-switch a{color:#c084fc;text-decoration:none;font-weight:700}
.auth-switch a:hover{color:#e879f9}
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
    revendedor:'badge-yellow',
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
