const express = require('express');
const { nanoid } = require('nanoid');

const db = require('../firebase');

const generarQR = require('../services/qr');
const generarPDF = require('../services/pdf');
const { subirPDF } = require('../services/storage');
const { enviarCompra } = require('../services/email');

const router = express.Router();

/*
====================================================
EXELARIS Tickets v2.0
Archivo: routes/boletos.js
Objetivo:
- Comprador separado de asistentes
- Varios boletos con nombres diferentes
- VIP mínimo 4 y máximo 8
- General sin tope operativo por ahora
- 1 correo por compra con Resend
====================================================
*/

function normalizarTipo(tipo){

    const valor = String(tipo || '')
        .trim()
        .toLowerCase();

    if(valor === 'vip'){
        return 'VIP';
    }

    if(valor === 'general'){
        return 'General';
    }

    return null;

}

function obtenerPrecio(evento,tipo){

    if(tipo === 'VIP'){
        return Number(evento.precioVIP || evento.precioVip || 350);
    }

    return Number(evento.precioGeneral || 250);

}

function construirSolicitud(body){

    /*
    Nuevo formato esperado:
    {
        comprador:{ nombre, correo, telefono },
        boletos:[ { tipo:'VIP', nombre:'Juan' } ]
    }
    */

    if(Array.isArray(body.boletos)){

        const comprador = {
            nombre:String(body.comprador?.nombre || '').trim(),
            correo:String(body.comprador?.correo || '').trim(),
            telefono:String(body.comprador?.telefono || '').trim()
        };

        const boletos = body.boletos.map(item=>{

            const tipo = normalizarTipo(item.tipo);

            return {
                tipo,
                nombre:String(item.nombre || comprador.nombre || '').trim()
            };

        });

        return {
            comprador,
            boletos
        };

    }

    /*
    Compatibilidad con formato anterior:
    {
        nombre, correo, telefono, tipo, cantidad
    }
    */

    const comprador = {
        nombre:String(body.nombre || '').trim(),
        correo:String(body.correo || '').trim(),
        telefono:String(body.telefono || '').trim()
    };

    const tipo = normalizarTipo(body.tipo);
    const cantidad = Number(body.cantidad || 0);

    const boletos = Array.from({ length:cantidad },()=>({
        tipo,
        nombre:comprador.nombre
    }));

    return {
        comprador,
        boletos
    };

}

function validarSolicitud({ comprador, boletos }){

    if(!comprador.nombre || !comprador.correo){
        return 'Nombre y correo del comprador son obligatorios';
    }

    if(!Array.isArray(boletos) || boletos.length === 0){
        return 'Debes seleccionar al menos un boleto';
    }

    const tipoInvalido = boletos.some(boleto=>!boleto.tipo);

    if(tipoInvalido){
        return 'Tipo de boleto inválido';
    }

    const vip = boletos.filter(boleto=>boleto.tipo === 'VIP').length;

    if(vip > 0 && (vip < 4 || vip > 8)){
        return 'Los boletos VIP se venden por mesa: mínimo 4 y máximo 8 boletos';
    }

    return null;

}

async function obtenerEventoActivo(){

    const eventosSnapshot = await db
        .collection('eventos')
        .where('activo','==',true)
        .limit(1)
        .get();

    if(eventosSnapshot.empty){
        return null;
    }

    const eventoDoc = eventosSnapshot.docs[0];

    return {
        id:eventoDoc.id,
        ...eventoDoc.data()
    };

}

async function generarConsecutivo(configDoc,campo,prefijo){

    const ref = db.collection('config').doc(configDoc);

    return await db.runTransaction(async(transaction)=>{

        const doc = await transaction.get(ref);

        let ultimo = 0;

        if(doc.exists){
            ultimo = Number(doc.data()[campo] || 0);
        }

        const nuevo = ultimo + 1;

        transaction.set(
            ref,
            {
                [campo]:nuevo
            },
            {
                merge:true
            }
        );

        return `${prefijo}-${String(nuevo).padStart(6,'0')}`;

    });

}

async function generarUUIDUnico(){

    let uuid;
    let existeUUID = true;

    while(existeUUID){

        uuid = `EXL-${nanoid(12)}`;

        const existe = await db
            .collection('boletos')
            .doc(uuid)
            .get();

        existeUUID = existe.exists;

    }

    return uuid;

}

router.post('/comprar', async(req,res)=>{

    try{

        console.log('POST /api/boletos/comprar');

        const solicitud = construirSolicitud(req.body);
        const errorValidacion = validarSolicitud(solicitud);

        if(errorValidacion){
            return res.status(400).json({
                success:false,
                error:errorValidacion
            });
        }

        const evento = await obtenerEventoActivo();

        if(!evento){
            return res.status(400).json({
                success:false,
                error:'No existe un evento activo'
            });
        }

        const { comprador, boletos: boletosSolicitados } = solicitud;

        const compraId = await generarConsecutivo(
            'contadorCompras',
            'ultimoCompra',
            'COMP'
        );

        const fechaCompra = new Date();

        const subtotal = boletosSolicitados.reduce((total,boleto)=>{
            return total + obtenerPrecio(evento,boleto.tipo);
        },0);

        const compraBase = {
            compraId,
            eventoId:evento.id,
            eventoNombre:evento.nombre,
            compradorNombre:comprador.nombre,
            compradorCorreo:comprador.correo,
            compradorTelefono:comprador.telefono,
            cantidad:boletosSolicitados.length,
            subtotal,
            total:subtotal,
            metodoPago:req.body.metodoPago || 'manual',
            estadoPago:req.body.estadoPago || 'aprobado',
            canalVenta:req.body.canalVenta || 'online',
            correoEnviado:false,
            correoMetodo:null,
            correoPesoAdjuntosMB:0,
            fechaCompra,
            boletos:[],
            folios:[]
        };

        await db
            .collection('compras')
            .doc(compraId)
            .set(compraBase);

        const boletosGenerados = [];
        const boletosRespuesta = [];

        for(const boletoSolicitado of boletosSolicitados){

            const folio = await generarConsecutivo(
                'contadorBoletos',
                'ultimoFolio',
                'EXL'
            );

            const uuid = await generarUUIDUnico();
            const precio = obtenerPrecio(evento,boletoSolicitado.tipo);
            const qr = await generarQR(uuid);

            const boleto = {
                uuid,
                folio,
                compraId,

                nombre:boletoSolicitado.nombre || comprador.nombre,
                correo:comprador.correo,
                telefono:comprador.telefono,

                compradorNombre:comprador.nombre,
                compradorCorreo:comprador.correo,
                compradorTelefono:comprador.telefono,

                tipo:boletoSolicitado.tipo,
                precio,
                qr,

                eventoId:evento.id,
                eventoNombre:evento.nombre,
                eventoFecha:evento.fecha,
                eventoHora:evento.hora,
                eventoLugar:evento.lugar,
                eventoDireccion:evento.direccion,
                eventoCiudad:evento.ciudad,
                eventoFlyer:evento.flyer,

                estado:'activo',
                validado:false,
                validadoPor:null,
                fechaValidacion:null,

                canalVenta:req.body.canalVenta || 'online',
                metodoEntrega:['email','pdf'],
                enviadoCorreo:false,
                enviadoWhatsapp:false,
                impreso:false,
                fechaImpresion:null,
                impresoPor:null,

                fechaCompra
            };

            await db
                .collection('boletos')
                .doc(uuid)
                .set(boleto);

            const rutaPDF = await generarPDF({
                nombre:boleto.nombre,
                correo:comprador.correo,
                telefono:comprador.telefono,
                folio,
                tipo:boleto.tipo,
                precio,
                uuid,
                qr,
                eventoNombre:evento.nombre,
                eventoFecha:evento.fecha,
                eventoHora:evento.hora,
                eventoLugar:evento.lugar,
                eventoDireccion:evento.direccion,
                eventoCiudad:evento.ciudad,
                eventoFlyer:evento.flyer
            });

            const pdfUrl = await subirPDF(
                rutaPDF,
                folio
            );

            await db
                .collection('boletos')
                .doc(uuid)
                .update({
                    pdfUrl
                });

            const boletoCompleto = {
                ...boleto,
                pdfUrl,
                pdfPath:rutaPDF
            };

            boletosGenerados.push(boletoCompleto);

            boletosRespuesta.push({
                ...boleto,
                pdfUrl
            });

            console.log(`✅ Boleto generado: ${folio}`);

        }

        await db
            .collection('compras')
            .doc(compraId)
            .update({
                boletos:boletosGenerados.map(boleto=>boleto.uuid),
                folios:boletosGenerados.map(boleto=>boleto.folio)
            });

        let resultadoCorreo = {
            enviado:false,
            metodo:'no_enviado',
            pesoAdjuntosMB:0,
            adjuntosIncluidos:false
        };

        try{

            resultadoCorreo = await enviarCompra({
                compra:{
                    ...compraBase,
                    boletos:boletosGenerados.map(boleto=>boleto.uuid),
                    folios:boletosGenerados.map(boleto=>boleto.folio)
                },
                comprador,
                evento,
                boletos:boletosGenerados
            });

            await db
                .collection('compras')
                .doc(compraId)
                .update({
                    correoEnviado:resultadoCorreo.enviado,
                    correoMetodo:resultadoCorreo.metodo,
                    correoPesoAdjuntosMB:resultadoCorreo.pesoAdjuntosMB,
                    fechaEnvioCorreo:resultadoCorreo.enviado ? new Date() : null
                });

            if(resultadoCorreo.enviado){

                const batch = db.batch();

                for(const boleto of boletosGenerados){

                    const ref = db
                        .collection('boletos')
                        .doc(boleto.uuid);

                    batch.update(ref,{
                        enviadoCorreo:true
                    });

                }

                await batch.commit();

            }

        }catch(errorCorreo){

            console.error('❌ Error enviando correo:', errorCorreo);

            await db
                .collection('compras')
                .doc(compraId)
                .update({
                    correoEnviado:false,
                    correoMetodo:'error',
                    correoError:errorCorreo.message
                });

            resultadoCorreo = {
                enviado:false,
                metodo:'error',
                error:errorCorreo.message,
                pesoAdjuntosMB:0,
                adjuntosIncluidos:false
            };

        }

        return res.json({
            success:true,
            compra:{
                ...compraBase,
                boletos:boletosGenerados.map(boleto=>boleto.uuid),
                folios:boletosGenerados.map(boleto=>boleto.folio),
                correoEnviado:resultadoCorreo.enviado,
                correoMetodo:resultadoCorreo.metodo,
                correoPesoAdjuntosMB:resultadoCorreo.pesoAdjuntosMB
            },
            total:boletosRespuesta.length,
            boletos:boletosRespuesta,
            correo:resultadoCorreo
        });

    }catch(error){

        console.error('❌ Error compra:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });

    }

});

module.exports = router;
