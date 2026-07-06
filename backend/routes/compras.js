/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/compras.js
Módulo: Admin / Compras / Taquilla

Endpoints:
GET  /api/compras
GET  /api/compras/:compraId
PUT  /api/compras/boletos/:uuid/impreso
POST /api/compras/:compraId/reenviar-correo
====================================================
*/

const express = require('express');

const db = require('../firebase');
const enviarCompraPorCorreo = require('../services/email');

const router = express.Router();

/*
====================================================
UTILIDADES
====================================================
*/

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

function normalizarTexto(texto){
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .trim();
}

function coincideBusqueda(compra, q){
    if(!q){
        return true;
    }

    const needle = normalizarTexto(q);

    const campos = [
        compra.compraId,
        compra.compradorNombre,
        compra.compradorCorreo,
        compra.compradorTelefono,
        compra.eventoNombre,
        ...(compra.folios || []),
        ...(compra.boletos || [])
    ];

    return campos.some(campo =>
        normalizarTexto(campo).includes(needle)
    );
}

async function obtenerBoletosPorCompra(compra){
    const ids = compra.boletos || [];

    if(ids.length > 0){
        const boletos = [];

        for(const uuid of ids){
            const doc = await db
                .collection('boletos')
                .doc(uuid)
                .get();

            if(doc.exists){
                boletos.push({
                    id: doc.id,
                    ...serializarFirestore(doc.data())
                });
            }
        }

        return boletos;
    }

    const snapshot = await db
        .collection('boletos')
        .where('compraId','==',compra.compraId)
        .get();

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...serializarFirestore(doc.data())
    }));
}

/*
====================================================
GET /api/compras
Lista de compras para panel admin.
====================================================
*/

router.get('/', async (req,res) => {

    try{

        const limite = Math.min(
            Number(req.query.limit || 100),
            300
        );

        const q = req.query.q || '';

        const snapshot = await db
            .collection('compras')
            .orderBy('fechaCompra','desc')
            .limit(limite)
            .get();

        let compras = snapshot.docs.map(doc => ({
            id: doc.id,
            ...serializarFirestore(doc.data())
        }));

        compras = compras.filter(compra =>
            coincideBusqueda(compra, q)
        );

        return res.json({
            success:true,
            total:compras.length,
            compras
        });

    }catch(error){

        console.error('❌ Error GET /api/compras:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });

    }

});

/*
====================================================
GET /api/compras/:compraId
Detalle de compra con boletos.
====================================================
*/

router.get('/:compraId', async (req,res) => {

    try{

        const compraId = req.params.compraId;

        const compraDoc = await db
            .collection('compras')
            .doc(compraId)
            .get();

        if(!compraDoc.exists){
            return res.status(404).json({
                success:false,
                error:'Compra no encontrada'
            });
        }

        const compra = {
            id: compraDoc.id,
            ...serializarFirestore(compraDoc.data())
        };

        const boletos = await obtenerBoletosPorCompra(compra);

        return res.json({
            success:true,
            compra,
            boletos
        });

    }catch(error){

        console.error('❌ Error GET /api/compras/:compraId:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });

    }

});

/*
====================================================
PUT /api/compras/boletos/:uuid/impreso
Marca boleto como impreso/reimpreso.
====================================================
*/

router.put('/boletos/:uuid/impreso', async (req,res) => {

    try{

        const uuid = req.params.uuid;

        const {
            impresoPor = 'Administrador'
        } = req.body || {};

        const boletoRef = db
            .collection('boletos')
            .doc(uuid);

        const boletoDoc = await boletoRef.get();

        if(!boletoDoc.exists){
            return res.status(404).json({
                success:false,
                error:'Boleto no encontrado'
            });
        }

        await boletoRef.update({
            impreso:true,
            fechaImpresion:new Date(),
            impresoPor
        });

        return res.json({
            success:true,
            message:'Boleto marcado como impreso'
        });

    }catch(error){

        console.error('❌ Error marcar impreso:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });

    }

});

/*
====================================================
POST /api/compras/:compraId/reenviar-correo
Reenvía correo de una compra.
Nota:
- Si el servidor ya no tiene los PDFs locales, envía solo links.
- Es correcto para reenvío desde admin.
====================================================
*/

router.post('/:compraId/reenviar-correo', async (req,res) => {

    try{

        const compraId = req.params.compraId;

        const compraDoc = await db
            .collection('compras')
            .doc(compraId)
            .get();

        if(!compraDoc.exists){
            return res.status(404).json({
                success:false,
                error:'Compra no encontrada'
            });
        }

        const compra = {
            id: compraDoc.id,
            ...serializarFirestore(compraDoc.data())
        };

        const boletos = await obtenerBoletosPorCompra(compra);

        if(boletos.length === 0){
            return res.status(400).json({
                success:false,
                error:'La compra no tiene boletos'
            });
        }

        let evento = {
            nombre: compra.eventoNombre || boletos[0].eventoNombre,
            fecha: boletos[0].eventoFecha,
            hora: boletos[0].eventoHora,
            lugar: boletos[0].eventoLugar
        };

        if(compra.eventoId){
            const eventoDoc = await db
                .collection('eventos')
                .doc(compra.eventoId)
                .get();

            if(eventoDoc.exists){
                evento = {
                    id:eventoDoc.id,
                    ...serializarFirestore(eventoDoc.data())
                };
            }
        }

        const comprador = {
            nombre: compra.compradorNombre,
            correo: compra.compradorCorreo,
            telefono: compra.compradorTelefono
        };

        const resultado = await enviarCompraPorCorreo({
            compra,
            comprador,
            evento,
            boletos: boletos.map(boleto => ({
                ...boleto,
                /*
                No forzamos adjuntos en reenvío porque los PDFs
                locales pueden no existir después de un reinicio.
                */
                rutaPDF:null
            }))
        });

        await db
            .collection('compras')
            .doc(compraId)
            .update({
                correoReenviado:true,
                fechaReenvioCorreo:new Date(),
                ultimoMetodoCorreo:resultado.metodo || null
            });

        return res.json({
            success:true,
            correo:resultado
        });

    }catch(error){

        console.error('❌ Error reenviar correo:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });

    }

});

module.exports = router;
