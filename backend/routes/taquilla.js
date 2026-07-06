/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/taquilla.js
Módulo: Venta física / Taquilla

Endpoint:
POST /api/taquilla/vender

Permite crear compras presenciales:
- efectivo
- transferencia
- cortesía

Genera:
- compra
- boletos individuales
- QR
- PDF
- pdfUrl
- correo opcional
====================================================
*/

const express = require('express');
const { nanoid } = require('nanoid');

const db = require('../firebase');

const generarQR = require('../services/qr');
const generarPDF = require('../services/pdf');
const { subirPDF } = require('../services/storage');
const enviarCompraPorCorreo = require('../services/email');

const router = express.Router();

/*
====================================================
UTILIDADES
====================================================
*/

function normalizarTipo(tipo){
    const value = String(tipo || '').trim().toLowerCase();

    if(value === 'vip'){
        return 'VIP';
    }

    return 'General';
}

function obtenerPrecio(evento,tipo){
    if(tipo === 'VIP'){
        return Number(evento.precioVIP || 350);
    }

    return Number(evento.precioGeneral || 250);
}

function normalizarSolicitud(body){
    if(Array.isArray(body.boletos)){
        return {
            comprador:{
                nombre: body.comprador?.nombre || body.nombre || '',
                correo: body.comprador?.correo || body.correo || '',
                telefono: body.comprador?.telefono || body.telefono || ''
            },
            metodoPago: body.metodoPago || 'efectivo',
            enviarCorreo: Boolean(body.enviarCorreo),
            vendedor: body.vendedor || 'Taquilla',
            boletos: body.boletos.map(item => ({
                tipo: normalizarTipo(item.tipo),
                nombre: String(item.nombre || '').trim()
            }))
        };
    }

    const cantidad = Math.max(
        1,
        Number(body.cantidad || 1)
    );

    return {
        comprador:{
            nombre: body.nombre || '',
            correo: body.correo || '',
            telefono: body.telefono || ''
        },
        metodoPago: body.metodoPago || 'efectivo',
        enviarCorreo: Boolean(body.enviarCorreo),
        vendedor: body.vendedor || 'Taquilla',
        boletos: Array.from({ length:cantidad },()=>({
            tipo: normalizarTipo(body.tipo),
            nombre: body.nombre || ''
        }))
    };
}

function validarSolicitud(comprador,boletos,enviarCorreo){
    if(!comprador.nombre){
        return 'Nombre del comprador es obligatorio';
    }

    if(enviarCorreo && !comprador.correo){
        return 'Para enviar correo debes capturar correo del comprador';
    }

    if(!Array.isArray(boletos) || boletos.length === 0){
        return 'Debes seleccionar al menos un boleto';
    }

    const vip = boletos.filter(boleto => boleto.tipo === 'VIP').length;

    if(vip > 0 && (vip < 4 || vip > 8)){
        return 'Los boletos VIP son por mesa reservada: mínimo 4 y máximo 8 boletos';
    }

    if(boletos.length > 100){
        return 'Máximo 100 boletos por venta';
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

async function generarFolio(){
    const contadorRef = db
        .collection('config')
        .doc('contadorBoletos');

    return await db.runTransaction(async transaction => {
        const doc = await transaction.get(contadorRef);

        let ultimoFolio = 0;

        if(doc.exists){
            ultimoFolio = doc.data().ultimoFolio || 0;
        }

        const nuevoFolio = ultimoFolio + 1;

        transaction.set(contadorRef,{
            ultimoFolio:nuevoFolio
        });

        return 'EXL-' + String(nuevoFolio).padStart(6,'0');
    });
}

async function generarCompraId(){
    const contadorRef = db
        .collection('config')
        .doc('contadorCompras');

    return await db.runTransaction(async transaction => {
        const doc = await transaction.get(contadorRef);

        let ultimo = 0;

        if(doc.exists){
            ultimo = doc.data().ultimo || 0;
        }

        const nuevo = ultimo + 1;

        transaction.set(contadorRef,{
            ultimo:nuevo
        });

        return 'COMP-' + String(nuevo).padStart(6,'0');
    });
}

async function generarUUIDUnico(){
    let uuid;
    let existeUUID = true;

    while(existeUUID){
        uuid = 'EXL-' + nanoid(12);

        const existe = await db
            .collection('boletos')
            .doc(uuid)
            .get();

        existeUUID = existe.exists;
    }

    return uuid;
}

function esCortesia(metodoPago){
    return String(metodoPago || '').toLowerCase() === 'cortesia';
}

/*
====================================================
POST /api/taquilla/vender
====================================================
*/

router.post('/vender', async (req,res) => {

    try{

        console.log('POST /api/taquilla/vender');

        const {
            comprador,
            metodoPago,
            enviarCorreo,
            vendedor,
            boletos: boletosSolicitados
        } = normalizarSolicitud(req.body);

        const errorValidacion = validarSolicitud(
            comprador,
            boletosSolicitados,
            enviarCorreo
        );

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

        const compraId = await generarCompraId();

        const subtotal = boletosSolicitados.reduce((sum,boleto)=>{
            return sum + obtenerPrecio(evento,boleto.tipo);
        },0);

        const cortesia = esCortesia(metodoPago);
        const total = cortesia ? 0 : subtotal;

        const compraBase = {
            compraId,
            eventoId:evento.id,
            eventoNombre:evento.nombre,

            compradorNombre:comprador.nombre,
            compradorCorreo:comprador.correo || '',
            compradorTelefono:comprador.telefono || '',

            cantidad:boletosSolicitados.length,
            subtotal,
            total,
            descuento:cortesia ? subtotal : 0,

            metodoPago,
            estadoPago:cortesia ? 'cortesia' : 'pagado',
            canalVenta:'taquilla',
            vendedor,

            correoEnviado:false,
            correoMetodo:null,

            fechaCompra:new Date(),
            boletos:[]
        };

        await db
            .collection('compras')
            .doc(compraId)
            .set(compraBase);

        const boletosGenerados = [];

        for(const solicitado of boletosSolicitados){

            const tipo = normalizarTipo(solicitado.tipo);
            const precioBase = obtenerPrecio(evento,tipo);
            const precio = cortesia ? 0 : precioBase;
            const titular = solicitado.nombre || comprador.nombre;

            const folio = await generarFolio();
            const uuid = await generarUUIDUnico();
            const qr = await generarQR(uuid);

            const boleto = {
                uuid,
                folio,
                compraId,

                nombre:titular,
                tipo,
                precio,
                precioBase,
                qr,

                compradorNombre:comprador.nombre,
                compradorCorreo:comprador.correo || '',
                compradorTelefono:comprador.telefono || '',

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
                validadoPor:'',
                fechaValidacion:null,

                canalVenta:'taquilla',
                metodoPago,
                vendidoPor:vendedor,

                metodoEntrega: enviarCorreo ? ['email','pdf','impreso'] : ['pdf','impreso'],
                enviadoCorreo:false,
                enviadoWhatsapp:false,
                impreso:false,
                fechaImpresion:null,
                impresoPor:null,

                fechaCompra:new Date()
            };

            await db
                .collection('boletos')
                .doc(uuid)
                .set(boleto);

            const rutaPDF = await generarPDF({
                nombre:titular,
                correo:comprador.correo || '',
                telefono:comprador.telefono || '',

                folio,
                tipo,
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

            boletosGenerados.push({
                ...boleto,
                pdfUrl,
                rutaPDF
            });

            console.log(`✅ Boleto taquilla generado ${folio}`);

        }

        await db
            .collection('compras')
            .doc(compraId)
            .update({
                boletos:boletosGenerados.map(boleto => boleto.uuid),
                folios:boletosGenerados.map(boleto => boleto.folio)
            });

        let resultadoCorreo = {
            enviado:false,
            metodo:null,
            error:null
        };

        if(enviarCorreo && comprador.correo){

            try{

                resultadoCorreo = await enviarCompraPorCorreo({
                    compra:{
                        ...compraBase,
                        boletos:boletosGenerados.map(boleto => boleto.uuid)
                    },
                    comprador,
                    evento,
                    boletos:boletosGenerados
                });

                await db
                    .collection('compras')
                    .doc(compraId)
                    .update({
                        correoEnviado:Boolean(resultadoCorreo.enviado),
                        correoMetodo:resultadoCorreo.metodo || null,
                        correoPesoAdjuntosMB:resultadoCorreo.pesoAdjuntosMB || 0,
                        fechaEnvioCorreo:new Date()
                    });

                await Promise.all(
                    boletosGenerados.map(boleto =>
                        db.collection('boletos')
                            .doc(boleto.uuid)
                            .update({
                                enviadoCorreo:Boolean(resultadoCorreo.enviado)
                            })
                    )
                );

            }catch(errorCorreo){

                console.error('❌ Error correo taquilla:', errorCorreo);

                resultadoCorreo = {
                    enviado:false,
                    metodo:null,
                    error:errorCorreo.message
                };

                await db
                    .collection('compras')
                    .doc(compraId)
                    .update({
                        correoEnviado:false,
                        correoError:errorCorreo.message
                    });

            }

        }

        return res.json({
            success:true,
            compraId,
            canalVenta:'taquilla',
            metodoPago,
            total:boletosGenerados.length,
            importe:total,
            subtotal,
            correo:resultadoCorreo,
            boletos:boletosGenerados.map(boleto => ({
                uuid:boleto.uuid,
                folio:boleto.folio,
                nombre:boleto.nombre,
                tipo:boleto.tipo,
                precio:boleto.precio,
                pdfUrl:boleto.pdfUrl,
                estado:boleto.estado
            }))
        });

    }catch(error){

        console.error('❌ Error venta taquilla:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });

    }

});

module.exports = router;
