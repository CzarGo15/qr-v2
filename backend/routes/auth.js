/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/auth.js
Módulo: Seguridad Admin / Login / Usuarios / Recuperación
====================================================
*/

const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const db = require('../firebase');
const { requireAuth, requireRole } = require('../middleware/adminAuth');

const router = express.Router();
const FieldValue = admin.firestore.FieldValue;

const USERS = 'admin_users';
const SESSIONS = 'admin_sessions';

const ROLES = ['admin','taquilla','validador'];

function normalizar(valor){
    return String(valor || '').trim().toLowerCase();
}

function sha256(valor){
    return crypto.createHash('sha256').update(String(valor)).digest('hex');
}

function generarSalt(){
    return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password,salt){
    return crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
}

function crearPassword(password){
    const salt = generarSalt();
    const passwordHash = hashPassword(password,salt);

    return {
        salt,
        passwordHash
    };
}

function validarPassword(password,user){
    if(!user || !user.salt || !user.passwordHash) return false;

    const intento = hashPassword(password,user.salt);

    try{
        return crypto.timingSafeEqual(
            Buffer.from(intento,'hex'),
            Buffer.from(user.passwordHash,'hex')
        );
    }catch(error){
        return false;
    }
}

function limpiarUsuario(doc){
    const data = doc.data ? doc.data() : doc;

    return {
        id:doc.id || data.id,
        nombre:data.nombre || '',
        usuario:data.usuario || '',
        correo:data.correo || '',
        role:data.role || 'validador',
        activo:data.activo !== false,
        creadoEn:data.creadoEn || null,
        actualizadoEn:data.actualizadoEn || null,
        ultimoLogin:data.ultimoLogin || null
    };
}

async function buscarUsuario(usuarioOCorreo){
    const q = normalizar(usuarioOCorreo);

    if(!q){
        return null;
    }

    let snap = await db.collection(USERS)
        .where('usuarioLower','==',q)
        .limit(1)
        .get();

    if(!snap.empty){
        const doc = snap.docs[0];
        return {
            id:doc.id,
            ...doc.data()
        };
    }

    snap = await db.collection(USERS)
        .where('correoLower','==',q)
        .limit(1)
        .get();

    if(!snap.empty){
        const doc = snap.docs[0];
        return {
            id:doc.id,
            ...doc.data()
        };
    }

    return null;
}

async function crearSesion(user,req){
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    const expira = new Date(Date.now() + (12 * 60 * 60 * 1000));

    await db.collection(SESSIONS).doc(tokenHash).set({
        tokenHash,
        userId:user.id,
        role:user.role,
        activo:true,
        creadoEn:new Date(),
        expiraEn:expira,
        userAgent:req.headers['user-agent'] || '',
        ip:req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
    });

    await db.collection(USERS).doc(user.id).update({
        ultimoLogin:new Date()
    });

    return {
        token,
        expiraEn:expira
    };
}

async function enviarCorreoRecuperacion(user,codigo){
    if(!process.env.RESEND_API_KEY || !process.env.RESEND_FROM){
        console.warn('⚠️ No se envió recuperación: faltan RESEND_API_KEY o RESEND_FROM');
        return {
            enviado:false,
            motivo:'correo_no_configurado'
        };
    }

    if(!user.correo){
        return {
            enviado:false,
            motivo:'usuario_sin_correo'
        };
    }

    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
        from:process.env.RESEND_FROM,
        to:user.correo,
        subject:'Código de recuperación EXELARIS',
        html:`
            <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px">
                <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:24px;border:1px solid #e5e7eb">
                    <h2 style="margin:0 0 12px;color:#111827">Recuperación de contraseña</h2>
                    <p>Hola <strong>${user.nombre || user.usuario}</strong>, solicitaste recuperar tu acceso al panel EXELARIS.</p>
                    <p>Tu código es:</p>
                    <div style="font-size:32px;font-weight:900;letter-spacing:6px;background:#eef2ff;color:#4f46e5;border-radius:14px;padding:16px;text-align:center">
                        ${codigo}
                    </div>
                    <p style="color:#64748b;font-size:14px;margin-top:18px">Este código vence en 15 minutos. Si no lo solicitaste, ignora este correo.</p>
                </div>
            </div>
        `
    });

    return {
        enviado:true
    };
}

/*
====================================================
POST /api/auth/bootstrap
Crea el primer administrador. Solo funciona si no existen usuarios.
Si configuras ADMIN_SETUP_KEY en Render, debe coincidir.
====================================================
*/
router.post('/bootstrap', async (req,res) => {
    try{
        const snap = await db.collection(USERS).limit(1).get();

        if(!snap.empty){
            return res.status(400).json({
                success:false,
                error:'Ya existen usuarios admin. Usa el panel de usuarios.'
            });
        }

        const setupKey = String(req.body.setupKey || '');

        if(process.env.ADMIN_SETUP_KEY && setupKey !== process.env.ADMIN_SETUP_KEY){
            return res.status(401).json({
                success:false,
                error:'Clave de instalación incorrecta'
            });
        }

        const nombre = String(req.body.nombre || 'Administrador').trim();
        const usuario = String(req.body.usuario || 'admin').trim();
        const correo = String(req.body.correo || '').trim();
        const password = String(req.body.password || '').trim();

        if(!usuario || !password){
            return res.status(400).json({
                success:false,
                error:'Usuario y contraseña son obligatorios'
            });
        }

        if(password.length < 4){
            return res.status(400).json({
                success:false,
                error:'La contraseña debe tener mínimo 4 caracteres'
            });
        }

        const pass = crearPassword(password);

        const ref = await db.collection(USERS).add({
            nombre,
            usuario,
            usuarioLower:normalizar(usuario),
            correo,
            correoLower:normalizar(correo),
            role:'admin',
            activo:true,
            ...pass,
            creadoEn:new Date(),
            actualizadoEn:new Date(),
            creadoPor:'bootstrap'
        });

        const user = {
            id:ref.id,
            nombre,
            usuario,
            correo,
            role:'admin',
            activo:true
        };

        const sesion = await crearSesion(user,req);

        return res.json({
            success:true,
            token:sesion.token,
            expiraEn:sesion.expiraEn,
            user
        });

    }catch(error){
        console.error('❌ Error bootstrap auth:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

/*
====================================================
POST /api/auth/login
====================================================
*/
router.post('/login', async (req,res) => {
    try{
        const usuarioOCorreo = req.body.usuario || req.body.correo || '';
        const password = req.body.password || '';

        const user = await buscarUsuario(usuarioOCorreo);

        if(!user || user.activo === false || !validarPassword(password,user)){
            return res.status(401).json({
                success:false,
                error:'Usuario o contraseña incorrectos'
            });
        }

        const sesion = await crearSesion(user,req);

        return res.json({
            success:true,
            token:sesion.token,
            expiraEn:sesion.expiraEn,
            user:limpiarUsuario({ id:user.id, data:() => user })
        });

    }catch(error){
        console.error('❌ Error login:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

/*
====================================================
GET /api/auth/me
====================================================
*/
router.get('/me', requireAuth(), async (req,res) => {
    return res.json({
        success:true,
        user:req.adminUser
    });
});

/*
====================================================
POST /api/auth/logout
====================================================
*/
router.post('/logout', requireAuth(), async (req,res) => {
    try{
        if(req.sessionId){
            await db.collection(SESSIONS).doc(req.sessionId).update({
                activo:false,
                cerradoEn:new Date()
            });
        }

        return res.json({ success:true });
    }catch(error){
        return res.status(500).json({ success:false, error:error.message });
    }
});

/*
====================================================
POST /api/auth/change-password
Usuario cambia su propia contraseña.
====================================================
*/
router.post('/change-password', requireAuth(), async (req,res) => {
    try{
        const actual = String(req.body.actual || '');
        const nueva = String(req.body.nueva || '');

        if(nueva.length < 4){
            return res.status(400).json({
                success:false,
                error:'La nueva contraseña debe tener mínimo 4 caracteres'
            });
        }

        const doc = await db.collection(USERS).doc(req.adminUser.id).get();

        if(!doc.exists){
            return res.status(404).json({ success:false, error:'Usuario no encontrado' });
        }

        const user = {
            id:doc.id,
            ...doc.data()
        };

        if(!validarPassword(actual,user)){
            return res.status(401).json({ success:false, error:'Contraseña actual incorrecta' });
        }

        const pass = crearPassword(nueva);

        await db.collection(USERS).doc(user.id).update({
            ...pass,
            actualizadoEn:new Date(),
            passwordActualizadaEn:new Date()
        });

        return res.json({ success:true });

    }catch(error){
        console.error('❌ Error change-password:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

/*
====================================================
POST /api/auth/forgot-password
Genera código de recuperación y lo manda por correo.
====================================================
*/
router.post('/forgot-password', async (req,res) => {
    try{
        const usuarioOCorreo = req.body.usuario || req.body.correo || '';
        const user = await buscarUsuario(usuarioOCorreo);

        if(user && user.activo !== false){
            const codigo = String(Math.floor(100000 + Math.random() * 900000));
            const codigoHash = sha256(codigo);
            const expira = new Date(Date.now() + (15 * 60 * 1000));

            await db.collection(USERS).doc(user.id).update({
                resetCodigoHash:codigoHash,
                resetExpiraEn:expira,
                resetSolicitadoEn:new Date()
            });

            await enviarCorreoRecuperacion(user,codigo).catch(error => {
                console.error('❌ Error enviando recuperación:', error.message);
            });
        }

        return res.json({
            success:true,
            message:'Si el usuario existe y tiene correo, se envió un código de recuperación.'
        });

    }catch(error){
        console.error('❌ Error forgot-password:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

/*
====================================================
POST /api/auth/reset-password
Restablece contraseña con código de recuperación.
====================================================
*/
router.post('/reset-password', async (req,res) => {
    try{
        const usuarioOCorreo = req.body.usuario || req.body.correo || '';
        const codigo = String(req.body.codigo || '').trim();
        const nueva = String(req.body.nueva || '').trim();

        if(nueva.length < 4){
            return res.status(400).json({ success:false, error:'La nueva contraseña debe tener mínimo 4 caracteres' });
        }

        const user = await buscarUsuario(usuarioOCorreo);

        if(!user || user.activo === false){
            return res.status(400).json({ success:false, error:'Código inválido o vencido' });
        }

        if(!user.resetCodigoHash || !user.resetExpiraEn){
            return res.status(400).json({ success:false, error:'Código inválido o vencido' });
        }

        const expira = typeof user.resetExpiraEn.toDate === 'function'
            ? user.resetExpiraEn.toDate()
            : new Date(user.resetExpiraEn);

        if(expira.getTime() < Date.now()){
            return res.status(400).json({ success:false, error:'Código inválido o vencido' });
        }

        if(sha256(codigo) !== user.resetCodigoHash){
            return res.status(400).json({ success:false, error:'Código inválido o vencido' });
        }

        const pass = crearPassword(nueva);

        await db.collection(USERS).doc(user.id).update({
            ...pass,
            resetCodigoHash:FieldValue.delete(),
            resetExpiraEn:FieldValue.delete(),
            resetSolicitadoEn:FieldValue.delete(),
            actualizadoEn:new Date(),
            passwordActualizadaEn:new Date()
        });

        return res.json({ success:true });

    }catch(error){
        console.error('❌ Error reset-password:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

/*
====================================================
GET /api/auth/users
Solo admin.
====================================================
*/
router.get('/users', requireRole(['admin']), async (req,res) => {
    try{
        const snap = await db.collection(USERS).orderBy('creadoEn','desc').get();
        const users = snap.docs.map(limpiarUsuario);

        return res.json({ success:true, users });
    }catch(error){
        return res.status(500).json({ success:false, error:error.message });
    }
});

/*
====================================================
POST /api/auth/users
Crear usuario admin/taquilla/validador.
====================================================
*/
router.post('/users', requireRole(['admin']), async (req,res) => {
    try{
        const nombre = String(req.body.nombre || '').trim();
        const usuario = String(req.body.usuario || '').trim();
        const correo = String(req.body.correo || '').trim();
        const role = String(req.body.role || 'validador').trim();
        const password = String(req.body.password || '').trim();

        if(!nombre || !usuario || !password){
            return res.status(400).json({ success:false, error:'Nombre, usuario y contraseña son obligatorios' });
        }

        if(!ROLES.includes(role)){
            return res.status(400).json({ success:false, error:'Rol inválido' });
        }

        const existente = await buscarUsuario(usuario);
        if(existente){
            return res.status(400).json({ success:false, error:'Ese usuario ya existe' });
        }

        if(correo){
            const existenteCorreo = await buscarUsuario(correo);
            if(existenteCorreo){
                return res.status(400).json({ success:false, error:'Ese correo ya está registrado' });
            }
        }

        const pass = crearPassword(password);

        const ref = await db.collection(USERS).add({
            nombre,
            usuario,
            usuarioLower:normalizar(usuario),
            correo,
            correoLower:normalizar(correo),
            role,
            activo:true,
            ...pass,
            creadoEn:new Date(),
            actualizadoEn:new Date(),
            creadoPor:req.adminUser.usuario
        });

        const doc = await ref.get();

        return res.json({ success:true, user:limpiarUsuario(doc) });

    }catch(error){
        console.error('❌ Error crear usuario:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

/*
====================================================
PUT /api/auth/users/:id
Actualizar usuario.
====================================================
*/
router.put('/users/:id', requireRole(['admin']), async (req,res) => {
    try{
        const id = req.params.id;
        const doc = await db.collection(USERS).doc(id).get();

        if(!doc.exists){
            return res.status(404).json({ success:false, error:'Usuario no encontrado' });
        }

        const updates = {
            actualizadoEn:new Date(),
            actualizadoPor:req.adminUser.usuario
        };

        if(req.body.nombre !== undefined){
            updates.nombre = String(req.body.nombre || '').trim();
        }

        if(req.body.correo !== undefined){
            updates.correo = String(req.body.correo || '').trim();
            updates.correoLower = normalizar(req.body.correo || '');
        }

        if(req.body.role !== undefined){
            const role = String(req.body.role || '').trim();
            if(!ROLES.includes(role)){
                return res.status(400).json({ success:false, error:'Rol inválido' });
            }
            updates.role = role;
        }

        if(req.body.activo !== undefined){
            updates.activo = Boolean(req.body.activo);
        }

        await db.collection(USERS).doc(id).update(updates);

        const nuevo = await db.collection(USERS).doc(id).get();

        return res.json({ success:true, user:limpiarUsuario(nuevo) });

    }catch(error){
        console.error('❌ Error actualizar usuario:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

/*
====================================================
POST /api/auth/users/:id/reset-password
Admin restablece contraseña.
====================================================
*/
router.post('/users/:id/reset-password', requireRole(['admin']), async (req,res) => {
    try{
        const id = req.params.id;
        const nueva = String(req.body.password || '').trim();

        if(nueva.length < 4){
            return res.status(400).json({ success:false, error:'La contraseña debe tener mínimo 4 caracteres' });
        }

        const doc = await db.collection(USERS).doc(id).get();

        if(!doc.exists){
            return res.status(404).json({ success:false, error:'Usuario no encontrado' });
        }

        const pass = crearPassword(nueva);

        await db.collection(USERS).doc(id).update({
            ...pass,
            resetCodigoHash:FieldValue.delete(),
            resetExpiraEn:FieldValue.delete(),
            resetSolicitadoEn:FieldValue.delete(),
            actualizadoEn:new Date(),
            passwordActualizadaEn:new Date(),
            passwordActualizadaPor:req.adminUser.usuario
        });

        return res.json({ success:true });

    }catch(error){
        console.error('❌ Error reset admin:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

module.exports = router;
