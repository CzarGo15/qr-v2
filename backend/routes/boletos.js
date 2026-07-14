/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/boletos.js
Módulo: Venta pública con categorías dinámicas
====================================================
*/

const express = require('express');
const admin = require('firebase-admin');
const enviarCompraPorCorreo = require('../services/email');

const {
    db,
    normalizarCategorias,
    obtenerEventoActivo,
    generarCompraId,
    normalizarSeleccionDesdePayload,
    validarSeleccion,
    calcularDetalleSeleccion,
    obtenerAsistentes,
    reservarInventario,
    crearBoletos
} = require('./_categorias');

const router = express.Router();

const FieldValue = admin.firestore.FieldValue;

function openpaySandbox(){
    return String(process.env.OPENPAY_SANDBOX ?? 'true').toLowerCase() !== 'false';
}

function openpayConfigurado(){
    return Boolean(
        process.env.OPENPAY_MERCHANT_ID &&
        process.env.OPENPAY_PUBLIC_KEY &&
        process.env.OPENPAY_PRIVATE_KEY &&
        String(process.env.OPENPAY_ENABLED ?? 'true').toLowerCase() !== 'false'
    );
}

function openpayPublicConfig(){
    return {
        enabled:openpayConfigurado(),
        sandbox:openpaySandbox(),
        merchantId:process.env.OPENPAY_MERCHANT_ID || '',
        publicKey:process.env.OPENPAY_PUBLIC_KEY || ''
    };
}

function openpayBaseUrl(){
    if(process.env.OPENPAY_BASE_URL){
        return process.env.OPENPAY_BASE_URL.replace(/\/+$/,'');
    }

    return openpaySandbox()
        ? 'https://sandbox-api.openpay.mx'
        : 'https://api.openpay.mx';
}

function limpiarTexto(valor){
    return String(valor || '').trim();
}

function normalizarMonto(valor){
    return Number(Number(valor || 0).toFixed(2));
}

function dividirNombre(nombreCompleto){
    const partes = limpiarTexto(nombreCompleto).split(/\s+/).filter(Boolean);

    if(partes.length <= 1){
        return {
            name:partes[0] || 'Cliente',
            last_name:'EXELARIS'
        };
    }

    return {
        name:partes.slice(0,Math.max(1,partes.length-1)).join(' '),
        last_name:partes.slice(-1).join(' ')
    };
}

function errorOpenpayTexto(data,status){
    if(!data){
        return `Openpay rechazó la operación (${status})`;
    }

    return data.description ||
           data.message ||
           data.error_message ||
           data.error_code ||
           `Openpay rechazó la operación (${status})`;
}

async function crearCargoOpenpay({ req, compraId, evento, comprador, totalImporte, openpay }){
    if(!openpayConfigurado()){
        throw new Error('Openpay no está configurado. Revisa variables de entorno en Render.');
    }

    const tokenId = limpiarTexto(openpay?.token_id || openpay?.tokenId || openpay?.source_id || openpay?.sourceId);
    const deviceSessionId = limpiarTexto(openpay?.device_session_id || openpay?.deviceSessionId);

    if(!tokenId){
        throw new Error('Falta token_id de Openpay.');
    }

    if(!deviceSessionId){
        throw new Error('Falta device_session_id de Openpay.');
    }

    const merchantId = process.env.OPENPAY_MERCHANT_ID;
    const privateKey = process.env.OPENPAY_PRIVATE_KEY;
    const baseUrl = openpayBaseUrl();

    const nombre = dividirNombre(comprador.nombre);

    const chargeData = {
        method:'card',
        source_id:tokenId,
        amount:normalizarMonto(totalImporte),
        currency:'MXN',
        description:`EXELARIS - ${evento.nombre} - ${compraId}`.slice(0,250),
        order_id:compraId,
        device_session_id:deviceSessionId,
        customer:{
            name:nombre.name,
            last_name:nombre.last_name,
            phone_number:limpiarTexto(comprador.telefono),
            email:limpiarTexto(comprador.correo)
        }
    };

    const auth = Buffer.from(`${privateKey}:`).toString('base64');

    const response = await fetch(`${baseUrl}/v1/${merchantId}/charges`,{
        method:'POST',
        headers:{
            'Authorization':`Basic ${auth}`,
            'Content-Type':'application/json'
        },
        body:JSON.stringify(chargeData)
    });

    const text = await response.text();
    let data = null;

    try{
        data = text ? JSON.parse(text) : null;
    }catch(parseError){
        data = { raw:text };
    }

    if(!response.ok){
        const error = new Error(errorOpenpayTexto(data,response.status));
        error.openpay = data;
        error.httpStatus = response.status;
        throw error;
    }

    if(data?.status && data.status !== 'completed'){
        const error = new Error(`Pago no completado por Openpay. Estado: ${data.status}`);
        error.openpay = data;
        error.httpStatus = 402;
        throw error;
    }

    return data;
}

async function liberarInventario(eventoId,detalleSeleccion){
    const eventoRef = db.collection('eventos').doc(eventoId);

    try{
        await db.runTransaction(async transaction => {
            const eventoDoc = await transaction.get(eventoRef);

            if(!eventoDoc.exists){
                return;
            }

            const evento = eventoDoc.data();
            const categorias = evento.categorias || {};

            if(Object.keys(categorias).length === 0){
                return;
            }

            const updates = {};

            for(const item of detalleSeleccion){
                const categoriaId = item.categoriaId;
                const catActual = categorias[categoriaId];

                if(!catActual){
                    continue;
                }

                if(item.boletosPorUnidad > 1){
                    updates[`categorias.${categoriaId}.unidadesVendidas`] = FieldValue.increment(-Number(item.cantidadUnidades || 0));
                }

                updates[`categorias.${categoriaId}.vendidos`] = FieldValue.increment(-Number(item.totalBoletos || 0));
            }

            if(Object.keys(updates).length > 0){
                transaction.update(eventoRef, updates);
            }
        });
    }catch(error){
        console.error('⚠️ No se pudo liberar inventario:', error);
    }
}



router.get('/config', async (req,res) => {
    try{
        const evento = await obtenerEventoActivo();

        if(!evento){
            return res.status(404).json({ success:false, error:'No existe evento activo' });
        }

        return res.json({
            success:true,
            evento:{
                id:evento.id,
                nombre:evento.nombre,
                descripcion:evento.descripcion || '',
                fecha:evento.fecha,
                hora:evento.hora,
                lugar:evento.lugar,
                direccion:evento.direccion,
                ciudad:evento.ciudad,
                flyer:evento.flyer
            },
            openpay:openpayPublicConfig(),
            categorias:normalizarCategorias(evento)
        });

    }catch(error){
        console.error('❌ Error config boletos:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

router.post('/comprar', async (req,res) => {
    try{
        console.log('POST /api/boletos/comprar');

        const evento = await obtenerEventoActivo();

        if(!evento){
            return res.status(400).json({ success:false, error:'No existe un evento activo' });
        }

        const body = req.body || {};

        const comprador = {
            nombre:body.comprador?.nombre || body.nombre || '',
            correo:body.comprador?.correo || body.correo || '',
            telefono:body.comprador?.telefono || body.telefono || '',
            marketingConsent:Boolean(
                body.comprador?.marketingConsent ||
                body.marketingConsent ||
                body.aceptaMarketing ||
                false
            )
        };

        if(!comprador.nombre){
            return res.status(400).json({ success:false, error:'Nombre del comprador es obligatorio' });
        }

        if(!comprador.correo){
            return res.status(400).json({ success:false, error:'Correo del comprador es obligatorio' });
        }

        const seleccion = normalizarSeleccionDesdePayload(evento,body);
        const errorSeleccion = validarSeleccion(evento,seleccion);

        if(errorSeleccion){
            return res.status(400).json({ success:false, error:errorSeleccion });
        }

        const { detalle, totalBoletos, totalImporte } = calcularDetalleSeleccion(evento,seleccion);

        if(totalBoletos <= 0){
            return res.status(400).json({ success:false, error:'Selecciona al menos un boleto' });
        }

        const asistentes = obtenerAsistentes(body,totalBoletos,comprador.nombre);

        if(!openpayConfigurado()){
            return res.status(500).json({
                success:false,
                error:'Openpay no está configurado en el servidor'
            });
        }

        if(!body.openpay?.token_id && !body.openpay?.tokenId && !body.openpay?.source_id){
            return res.status(400).json({
                success:false,
                error:'Falta token de pago de Openpay'
            });
        }

        if(!body.openpay?.device_session_id && !body.openpay?.deviceSessionId){
            return res.status(400).json({
                success:false,
                error:'Falta device_session_id de Openpay'
            });
        }

        const compraId = await generarCompraId();

        await reservarInventario(evento.id,detalle);

        const compraBase = {
            compraId,
            eventoId:evento.id,
            eventoNombre:evento.nombre,
            compradorNombre:comprador.nombre,
            compradorCorreo:comprador.correo,
            compradorTelefono:comprador.telefono || '',
            marketingConsent:comprador.marketingConsent,
            aceptaMarketing:comprador.marketingConsent,
            fechaConsentimientoMarketing:comprador.marketingConsent ? new Date() : null,
            cantidad:totalBoletos,
            subtotal:totalImporte,
            total:totalImporte,
            metodoPago:'openpay',
            estadoPago:'pendiente_openpay',
            canalVenta:'online',
            seleccion:detalle.map(item => ({
                categoriaId:item.categoriaId,
                categoriaNombre:item.categoria.nombre,
                cantidadUnidades:item.cantidadUnidades,
                boletosPorUnidad:item.boletosPorUnidad,
                totalBoletos:item.totalBoletos,
                precioUnitario:item.precioUnitario,
                importe:item.importe
            })),
            openpaySandbox:openpaySandbox(),
            openpayMerchantId:process.env.OPENPAY_MERCHANT_ID || '',
            openpayChargeId:null,
            openpayStatus:null,
            openpayAuthorization:null,
            fechaPago:null,
            correoEnviado:false,
            correoMetodo:null,
            fechaCompra:new Date(),
            boletos:[],
            folios:[]
        };

        await db.collection('compras').doc(compraId).set(compraBase);

        let cargoOpenpay = null;

        try{
            cargoOpenpay = await crearCargoOpenpay({
                req,
                compraId,
                evento,
                comprador,
                totalImporte,
                openpay:body.openpay
            });

            await db.collection('compras').doc(compraId).update({
                estadoPago:'pagado',
                metodoPago:'openpay',
                openpayChargeId:cargoOpenpay.id || null,
                openpayStatus:cargoOpenpay.status || null,
                openpayAuthorization:cargoOpenpay.authorization || null,
                openpayOperationDate:cargoOpenpay.operation_date || null,
                openpayCard:cargoOpenpay.card ? {
                    type:cargoOpenpay.card.type || null,
                    brand:cargoOpenpay.card.brand || null,
                    card_number:cargoOpenpay.card.card_number || null,
                    holder_name:cargoOpenpay.card.holder_name || null,
                    expiration_year:cargoOpenpay.card.expiration_year || null,
                    expiration_month:cargoOpenpay.card.expiration_month || null
                } : null,
                fechaPago:new Date()
            });

        }catch(errorPago){
            console.error('❌ Error pago Openpay:', errorPago);

            await liberarInventario(evento.id,detalle);

            await db.collection('compras').doc(compraId).update({
                estadoPago:'rechazado',
                openpayError:errorPago.message,
                openpayErrorRaw:errorPago.openpay || null,
                fechaRechazoPago:new Date()
            });

            return res.status(errorPago.httpStatus || 402).json({
                success:false,
                error:errorPago.message,
                compraId
            });
        }

        const boletosGenerados = await crearBoletos({
            evento,
            compraId,
            comprador,
            detalleSeleccion:detalle,
            asistentes,
            canalVenta:'online',
            metodoPago:'openpay',
            vendedor:'Online',
            cortesia:false
        });

        await Promise.all(
            boletosGenerados.map(boleto =>
                db.collection('boletos').doc(boleto.uuid).update({
                    openpayChargeId:cargoOpenpay?.id || null,
                    openpayStatus:cargoOpenpay?.status || null,
                    compradorMarketingConsent:comprador.marketingConsent || false
                })
            )
        );

        await db.collection('compras').doc(compraId).update({
            boletos:boletosGenerados.map(b => b.uuid),
            folios:boletosGenerados.map(b => b.folio)
        });


        let resultadoCorreo = { enviado:false, metodo:null, error:null };

        try{
            resultadoCorreo = await enviarCompraPorCorreo({
                compra:{
                    ...compraBase,
                    boletos:boletosGenerados.map(b => b.uuid),
                    folios:boletosGenerados.map(b => b.folio)
                },
                comprador,
                evento,
                boletos:boletosGenerados
            });

            await db.collection('compras').doc(compraId).update({
                correoEnviado:Boolean(resultadoCorreo.enviado),
                correoMetodo:resultadoCorreo.metodo || null,
                correoPesoAdjuntosMB:resultadoCorreo.pesoAdjuntosMB || 0,
                fechaEnvioCorreo:new Date()
            });

            await Promise.all(
                boletosGenerados.map(boleto =>
                    db.collection('boletos').doc(boleto.uuid).update({
                        enviadoCorreo:Boolean(resultadoCorreo.enviado)
                    })
                )
            );

        }catch(errorCorreo){
            console.error('❌ Error correo compra:', errorCorreo);
            resultadoCorreo = { enviado:false, metodo:null, error:errorCorreo.message };
            await db.collection('compras').doc(compraId).update({ correoEnviado:false, correoError:errorCorreo.message });
        }

        return res.json({
            success:true,
            compraId,
            cantidad:totalBoletos,
            total:totalImporte,
            marketingConsent:comprador.marketingConsent,
            correo:resultadoCorreo,
            pago:{
                metodo:'openpay',
                status:cargoOpenpay?.status || null,
                chargeId:cargoOpenpay?.id || null,
                authorization:cargoOpenpay?.authorization || null
            },
            boletos:boletosGenerados.map(boleto => ({
                uuid:boleto.uuid,
                folio:boleto.folio,
                nombre:boleto.nombre,
                tipo:boleto.tipo,
                categoriaId:boleto.categoriaId,
                categoriaNombre:boleto.categoriaNombre,
                precio:boleto.precio,
                grupoId:boleto.grupoId,
                pdfUrl:boleto.pdfUrl,
                estado:boleto.estado
            }))
        });

    }catch(error){
        console.error('❌ Error comprar boletos:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

module.exports = router;
