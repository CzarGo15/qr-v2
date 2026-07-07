/*
====================================================
EXELARIS Tickets
Archivo: frontend/admin/admin-nav.js
Función: Menú flotante Admin con logout
====================================================
*/

(function(){
    function crearEstilos(){
        if(document.getElementById('exelaris-admin-nav-styles')) return;

        const style = document.createElement('style');
        style.id = 'exelaris-admin-nav-styles';
        style.textContent = `
            .exelaris-admin-nav{position:fixed;right:18px;bottom:18px;z-index:9997;display:flex;flex-direction:column;gap:10px;font-family:Poppins,Arial,sans-serif}
            .exelaris-admin-nav-main{border:none;border-radius:999px;padding:14px 18px;font-weight:900;color:white;background:linear-gradient(135deg,#7C3AED,#2563EB);box-shadow:0 18px 45px rgba(0,0,0,.35);cursor:pointer}
            .exelaris-admin-nav-menu{display:none;flex-direction:column;gap:8px;background:rgba(15,23,42,.94);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:12px;box-shadow:0 20px 60px rgba(0,0,0,.45);backdrop-filter:blur(16px);min-width:210px}
            .exelaris-admin-nav-menu.open{display:flex}
            .exelaris-admin-nav-menu a,.exelaris-admin-nav-menu button{color:#E5E7EB;text-decoration:none;font-weight:900;font-size:14px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);text-align:left;cursor:pointer}
            .exelaris-admin-nav-menu a:hover,.exelaris-admin-nav-menu button:hover{background:rgba(124,58,237,.26)}
            .exelaris-admin-nav-menu a.active{background:#DCFCE7;color:#166534}
            .exelaris-admin-nav-user{color:#CBD5E1;font-size:12px;font-weight:800;padding:4px 8px 8px;border-bottom:1px solid rgba(255,255,255,.10);margin-bottom:4px}
            .exelaris-admin-nav-logout{background:#7f1d1d!important;color:#fee2e2!important}
            @media(max-width:640px){.exelaris-admin-nav{right:12px;bottom:12px}.exelaris-admin-nav-main{padding:13px 15px;font-size:13px}}
        `;
        document.head.appendChild(style);
    }

    function crearNav(){
        if(document.getElementById('exelaris-admin-nav')) return;

        const pagina = String(location.pathname.split('/').pop() || '').toLowerCase();
        const auth = window.exelarisAuth;
        const user = auth ? auth.getUser() : {};
        const role = user.role || '';

        const todos = [
            { href:'inventario.html', label:'Dashboard', roles:['admin'] },
            { href:'compras.html', label:'Compras', roles:['admin','taquilla'] },
            { href:'taquilla.html', label:'Taquilla', roles:['admin','taquilla'] },
            { href:'lotes.html', label:'Lotes físicos', roles:['admin'] },
            { href:'acceso.html', label:'Acceso QR', roles:['admin','validador'] },
            { href:'usuarios.html', label:'Usuarios', roles:['admin'] }
        ];

        const links = todos.filter(item => !role || item.roles.includes(role));

        const nav = document.createElement('div');
        nav.id = 'exelaris-admin-nav';
        nav.className = 'exelaris-admin-nav';

        const menu = document.createElement('div');
        menu.className = 'exelaris-admin-nav-menu';

        const userBox = document.createElement('div');
        userBox.className = 'exelaris-admin-nav-user';
        userBox.textContent = user.usuario ? `${user.usuario} · ${user.role}` : 'EXELARIS Admin';
        menu.appendChild(userBox);

        links.forEach(item => {
            const a = document.createElement('a');
            a.href = item.href;
            a.textContent = item.label;

            if(pagina === item.href){
                a.classList.add('active');
            }

            menu.appendChild(a);
        });

        const logout = document.createElement('button');
        logout.type = 'button';
        logout.className = 'exelaris-admin-nav-logout';
        logout.textContent = 'Cerrar sesión';
        logout.addEventListener('click',() => {
            if(window.exelarisAuth){
                window.exelarisAuth.logout();
            }else{
                localStorage.removeItem('exelaris_admin_token');
                localStorage.removeItem('exelaris_admin_user');
                location.href='login.html';
            }
        });
        menu.appendChild(logout);

        const btn = document.createElement('button');
        btn.className = 'exelaris-admin-nav-main';
        btn.type = 'button';
        btn.textContent = '☰ Admin';
        btn.addEventListener('click', () => menu.classList.toggle('open'));

        nav.appendChild(menu);
        nav.appendChild(btn);
        document.body.appendChild(nav);
    }

    function iniciar(){
        crearEstilos();
        crearNav();
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', iniciar);
    }else{
        iniciar();
    }
})();
