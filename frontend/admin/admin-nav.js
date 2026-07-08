/*
====================================================
EXELARIS Tickets
Archivo: frontend/admin/admin-nav.js
Función: Botón flotante de navegación admin
====================================================
*/

(function(){
    function crearEstilos(){
        if(document.getElementById('exelaris-admin-nav-styles')){
            return;
        }

        const style = document.createElement('style');
        style.id = 'exelaris-admin-nav-styles';
        style.textContent = `
            .exelaris-admin-nav{
                position:fixed;
                right:18px;
                bottom:18px;
                z-index:9997;
                display:flex;
                flex-direction:column;
                gap:10px;
                font-family:Poppins,Arial,sans-serif;
            }

            .exelaris-admin-nav-main{
                border:none;
                border-radius:999px;
                padding:14px 18px;
                font-weight:900;
                color:white;
                background:linear-gradient(135deg,#7C3AED,#2563EB);
                box-shadow:0 18px 45px rgba(0,0,0,.35);
                cursor:pointer;
            }

            .exelaris-admin-nav-menu{
                display:none;
                flex-direction:column;
                gap:8px;
                background:rgba(15,23,42,.94);
                border:1px solid rgba(255,255,255,.12);
                border-radius:22px;
                padding:12px;
                box-shadow:0 20px 60px rgba(0,0,0,.45);
                backdrop-filter:blur(16px);
                min-width:215px;
            }

            .exelaris-admin-nav-menu.open{
                display:flex;
            }

            .exelaris-admin-nav-menu a{
                color:#E5E7EB;
                text-decoration:none;
                font-weight:900;
                font-size:14px;
                padding:10px 12px;
                border-radius:14px;
                background:rgba(255,255,255,.06);
                border:1px solid rgba(255,255,255,.08);
            }

            .exelaris-admin-nav-menu a:hover{
                background:rgba(124,58,237,.26);
            }

            .exelaris-admin-nav-menu a.active{
                background:#DCFCE7;
                color:#166534;
            }

            @media(max-width:640px){
                .exelaris-admin-nav{
                    right:12px;
                    bottom:12px;
                }

                .exelaris-admin-nav-main{
                    padding:13px 15px;
                    font-size:13px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function crearNav(){
        if(document.getElementById('exelaris-admin-nav')){
            return;
        }

        const pagina = String(location.pathname.split('/').pop() || '').toLowerCase();

        const links = [
            { href:'inventario.html', label:'Dashboard' },
            { href:'eventos.html', label:'Eventos' },
            { href:'compras.html', label:'Compras' },
            { href:'taquilla.html', label:'Taquilla' },
            { href:'lotes.html', label:'Lotes físicos' },
            { href:'lotes-impresion.html', label:'Impresión lotes' },
            { href:'clientes.html', label:'Clientes / correos' },
            { href:'usuarios.html', label:'Usuarios' }
        ];

        const nav = document.createElement('div');
        nav.id = 'exelaris-admin-nav';
        nav.className = 'exelaris-admin-nav';

        const menu = document.createElement('div');
        menu.className = 'exelaris-admin-nav-menu';

        links.forEach(item => {
            const a = document.createElement('a');
            a.href = item.href;
            a.textContent = item.label;

            if(pagina === item.href){
                a.classList.add('active');
            }

            menu.appendChild(a);
        });

        const btn = document.createElement('button');
        btn.className = 'exelaris-admin-nav-main';
        btn.type = 'button';
        btn.textContent = '☰ Admin';

        btn.addEventListener('click', () => {
            menu.classList.toggle('open');
        });

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
