/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/acceso.js
Módulo: Validación de entrada al evento

Endpoints:
POST /api/acceso/buscar
POST /api/acceso/confirmar

Reglas:
- activo -> puede entrar
- usado -> rechazo
- preimpreso -> rechazo
- cancelado/devuelto -> rechazo
====================================================
*/

const express = require('express');
const admin = require('firebase-admin');

const db = require('../firebase');

const router = express.Router();
const FieldValue = admin.firestore.FieldValue;

function serializarFirestore(valor){
    if(!valor){
        return valor;
    }

    if(typeof valor.toDate === 'function'){
        return valor.toDate().toISOString();
    }

    if(Array.isArray(valor)){
        return valor.map(serializarFirestore);
    }

    if(typeof valor === 'object'){
        const salida = {};
        Object.keys(valor).forEach(key => {
            salida[key] = serializarFirestore(valor[key]);
        });
        return salida;
    }

    return valor;
}

function limpiarCodigo(codigo){
    return String(codigo || '').trim();
}

async function buscarBoleto(codigo){
    const valor = limpiarCodigo(codigo);

    if(!valor){
        return null;
    }

    const directo = await db
        .collection('boletos')
        .doc(valor)
        .get();

    if(directo.exists){
        return {
            id:directo.id,
            ...serializarFirestore(directo.data())
        };
    }

    const porFolio = await db
        .collection('boletos')
        .where('folio','==',valor)
        .limit(1)
        .get();

    if(!porFolio.empty){
        const doc = porFolio.docs[0];

        return {
            id:doc.id,
            ...serializarFirestore(doc.data())
        };
    }

    return null;
}

function evaluarAcceso(boleto){
    if(!boleto){
        return {
            permitido:false,
            estado:'no_encontrado',
            mensaje:'Boleto no encontrado'
        };
    }

    if(boleto.estado === 'preimpreso'){
        return {
            permitido:false,
            estado:'preimpreso',
            mensaje:'Boleto físico no activo'
        };
    }

    if(boleto.estado === 'cancelado'){
        return {
            permitido:false,
            estado:'cancelado',
            mensaje:'Boleto cancelado'
        };
    }

    if(boleto.estado === 'devuelto'){
        return {
            permitido:false,
            estado:'devuelto',
            mensaje:'Boleto devuelto / no válido'
        };
    }

    if(boleto.estado === 'usado' || boleto.validado){
        return {
            permitido:false,
            estado:'usado',
            mensaje:'Boleto ya utilizado'
        };
    }

    if(boleto.estado === 'activo'){
        return {
            permitido:true,
            estado:'activo',
            mensaje:'Boleto válido'
        };
    }

    return {
        permitido:false,
        estado:boleto.estado || 'desconocido',
        mensaje:`Estado no válido: ${boleto.estado || 'desconocido'}`
    };
}

/*
====================================================
POST /api/acceso/buscar
====================================================
*/

router.post('/buscar', async (req,res) => {
    try{
        const boleto = await buscarBoleto(req.body.codigo || req.body.uuid || req.body.folio);
        const acceso = evaluarAcceso(boleto);

        if(!boleto){
            return res.status(404).json({
                success:false,
                acceso,
                error:acceso.mensaje
            });
        }

        return res.json({
            success:true,
            boleto,
            acceso
        });

    }catch(error){
        console.error('❌ Error buscar acceso:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

/*
====================================================
POST /api/acceso/confirmar
====================================================
*/

router.post('/confirmar', async (req,res) => {
    try{
        const {
            codigo,
            validadoPor = 'Validador',
            puerta = ''
        } = req.body || {};

        const boleto = await buscarBoleto(codigo);

        if(!boleto){
            return res.status(404).json({
                success:false,
                error:'Boleto no encontrado'
            });
        }

        const acceso = evaluarAcceso(boleto);

        if(!acceso.permitido){
            return res.status(400).json({
                success:false,
                acceso,
                boleto,
                error:acceso.mensaje
            });
        }

        await db
            .collection('boletos')
            .doc(boleto.uuid || boleto.id)
            .update({
                estado:'usado',
                validado:true,
                validadoPor,
                puerta,
                fechaValidacion:new Date()
            });

        if(boleto.loteId){
            await db
                .collection('lotes')
                .doc(boleto.loteId)
                .update({
                    usados:FieldValue.increment(1),
                    activos:FieldValue.increment(-1),
                    fechaUltimoUso:new Date()
                })
                .catch(() => {});
        }

        await db
            .collection('validaciones')
            .add({
                uuid:boleto.uuid,
                folio:boleto.folio,
                eventoId:boleto.eventoId,
                eventoNombre:boleto.eventoNombre,
                categoriaId:boleto.categoriaId || null,
                categoriaNombre:boleto.categoriaNombre || boleto.tipo || null,
                loteId:boleto.loteId || null,
                puntoVenta:boleto.puntoVenta || null,
                responsable:boleto.responsable || null,
                canalVenta:boleto.canalVenta || null,
                validadoPor,
                puerta,
                fecha:new Date()
            });

        return res.json({
            success:true,
            message:'Acceso confirmado',
            boleto:{
                uuid:boleto.uuid,
                folio:boleto.folio,
                nombre:boleto.nombre,
                tipo:boleto.tipo,
                categoriaNombre:boleto.categoriaNombre || boleto.tipo,
                loteId:boleto.loteId || null,
                puntoVenta:boleto.puntoVenta || null
            }
        });

    }catch(error){
        console.error('❌ Error confirmar acceso:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

module.exports = router;
