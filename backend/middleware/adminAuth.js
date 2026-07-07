/*
====================================================
EXELARIS Tickets
Archivo: backend/middleware/adminAuth.js
====================================================
*/

const crypto = require('crypto');
const db = require('../firebase');

const USERS = 'admin_users';
const SESSIONS = 'admin_sessions';

function sha256(valor){
    return crypto.createHash('sha256').update(String(valor)).digest('hex');
}

function limpiarUsuario(id,data){
    return {
        id,
        nombre:data.nombre || '',
        usuario:data.usuario || '',
        correo:data.correo || '',
        role:data.role || 'validador',
        activo:data.activo !== false
    };
}

function obtenerToken(req){
    const header = req.headers.authorization || '';

    if(header.startsWith('Bearer ')){
        return header.replace('Bearer ','').trim();
    }

    if(req.query && req.query.token){
        return String(req.query.token).trim();
    }

    return '';
}

function requireAuth(roles = []){
    return async (req,res,next) => {
        try{
            const token = obtenerToken(req);

            if(!token){
                return res.status(401).json({
                    success:false,
                    error:'No autorizado'
                });
            }

            const tokenHash = sha256(token);
            const sessionDoc = await db.collection(SESSIONS).doc(tokenHash).get();

            if(!sessionDoc.exists){
                return res.status(401).json({
                    success:false,
                    error:'Sesión inválida'
                });
            }

            const session = sessionDoc.data();

            if(session.activo === false){
                return res.status(401).json({
                    success:false,
                    error:'Sesión cerrada'
                });
            }

            const expira = session.expiraEn && typeof session.expiraEn.toDate === 'function'
                ? session.expiraEn.toDate()
                : new Date(session.expiraEn);

            if(expira.getTime() < Date.now()){
                await db.collection(SESSIONS).doc(tokenHash).update({ activo:false }).catch(() => {});

                return res.status(401).json({
                    success:false,
                    error:'Sesión vencida'
                });
            }

            const userDoc = await db.collection(USERS).doc(session.userId).get();

            if(!userDoc.exists){
                return res.status(401).json({
                    success:false,
                    error:'Usuario no encontrado'
                });
            }

            const userData = userDoc.data();

            if(userData.activo === false){
                return res.status(403).json({
                    success:false,
                    error:'Usuario desactivado'
                });
            }

            const user = limpiarUsuario(userDoc.id,userData);

            if(Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)){
                return res.status(403).json({
                    success:false,
                    error:'No tienes permiso para esta sección'
                });
            }

            req.adminUser = user;
            req.sessionId = tokenHash;

            return next();

        }catch(error){
            console.error('❌ Error auth middleware:', error);
            return res.status(500).json({
                success:false,
                error:error.message
            });
        }
    };
}

function requireRole(roles){
    return requireAuth(roles);
}

module.exports = {
    requireAuth,
    requireRole
};
