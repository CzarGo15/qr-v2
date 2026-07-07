/*
====================================================
EXELARIS Tickets
Archivo: frontend/admin/admin-auth.js
Función: protege páginas admin y agrega token a fetch()
====================================================
*/

(function(){
    const API = window.EXELARIS_API || 'https://fiestaretro-api.onrender.com';
    const TOKEN_KEY = 'exelaris_admin_token';
    const USER_KEY = 'exelaris_admin_user';

    function getToken(){
        return localStorage.getItem(TOKEN_KEY) || '';
    }

    function setSession(token,user){
        localStorage.setItem(TOKEN_KEY,token);
        localStorage.setItem(USER_KEY,JSON.stringify(user || {}));
    }

    function clearSession(){
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function getUser(){
        try{
            return JSON.parse(localStorage.getItem(USER_KEY) || '{}');
        }catch(error){
            return {};
        }
    }

    function currentPage(){
        return location.pathname.split('/').pop() || 'inventario.html';
    }

    function loginUrl(){
        return 'login.html?redirect=' + encodeURIComponent(currentPage());
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = function(input,init){
        init = init || {};
        init.headers = new Headers(init.headers || {});

        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const token = getToken();

        if(token && (url.startsWith(API) || url.startsWith('/api/') || url.includes('/api/'))){
            init.headers.set('Authorization','Bearer ' + token);
        }

        return originalFetch(input,init);
    };

    async function verificar(){
        const pagina = currentPage().toLowerCase();

        if(pagina === 'login.html' || pagina === 'setup.html'){
            return;
        }

        const token = getToken();

        if(!token){
            location.href = loginUrl();
            return;
        }

        try{
            const r = await originalFetch(API + '/api/auth/me',{
                headers:{
                    Authorization:'Bearer ' + token
                }
            });

            const d = await r.json();

            if(!d.success){
                throw new Error(d.error || 'Sesión inválida');
            }

            setSession(token,d.user);

            const allowed = window.EXELARIS_ALLOWED_ROLES || [];

            if(Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(d.user.role)){
                document.body.innerHTML = `
                    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020617;color:white;font-family:Poppins,Arial,sans-serif;padding:24px">
                        <div style="max-width:520px;background:#0f172a;border:1px solid rgba(255,255,255,.12);border-radius:28px;padding:32px;text-align:center">
                            <div style="font-size:46px;font-weight:900;color:#fca5a5">!</div>
                            <h1 style="font-size:30px;margin:12px 0 8px">Sin permiso</h1>
                            <p style="color:#cbd5e1">Tu rol actual es <strong>${d.user.role}</strong> y no tiene acceso a esta sección.</p>
                            <a href="login.html" style="display:inline-block;margin-top:20px;background:#7c3aed;color:white;text-decoration:none;font-weight:900;padding:12px 18px;border-radius:16px">Cambiar usuario</a>
                        </div>
                    </main>
                `;
            }

        }catch(error){
            clearSession();
            location.href = loginUrl();
        }
    }

    async function logout(){
        const token = getToken();

        try{
            if(token){
                await originalFetch(API + '/api/auth/logout',{
                    method:'POST',
                    headers:{
                        Authorization:'Bearer ' + token
                    }
                });
            }
        }catch(error){}

        clearSession();
        location.href = 'login.html';
    }

    window.exelarisAuth = {
        API,
        getToken,
        getUser,
        setSession,
        clearSession,
        logout,
        verificar
    };

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', verificar);
    }else{
        verificar();
    }
})();
