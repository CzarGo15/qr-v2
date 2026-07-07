/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/taquilla.js
Módulo: Venta física / Taquilla con categorías dinámicas
====================================================
*/

const express = require('express');
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
            categorias:normalizarCategorias(evento)
        });

    }catch(error){
        console.error('❌ Error config taquilla:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

router.post('/vender', async (req,res) => {
    try{
        console.log('POST /api/taquilla/vender');

        const evento = await obtenerEventoActivo();

        if(!evento){
            return res.status(400).json({ success:false, error:'No existe un evento activo' });
        }

        const body = req.body || {};

        const comprador = {
            nombre:body.comprador?.nombre || body.nombre || '',
            correo:body.comprador?.correo || body.correo || '',
            telefono:body.comprador?.telefono || body.telefono || ''
        };

        const metodoPago = body.metodoPago || 'efectivo';
        const vendedor = body.vendedor || 'Taquilla';
        const enviarCorreo = Boolean(body.enviarCorreo);
        const cortesia = String(metodoPago).toLowerCase() === 'cortesia';

        if(!comprador.nombre){
            return res.status(400).json({ success:false, error:'Nombre del comprador es obligatorio' });
        }

        if(enviarCorreo && !comprador.correo){
            return res.status(400).json({ success:false, error:'Para enviar correo debes capturar correo del comprador' });
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

        const totalFinal = cortesia ? 0 : totalImporte;
        const asistentes = obtenerAsistentes(body,totalBoletos,comprador.nombre);

        await reservarInventario(evento.id,detalle);

        const compraId = await generarCompraId();

        const compraBase = {
            compraId,
            eventoId:evento.id,
            eventoNombre:evento.nombre,
            compradorNombre:comprador.nombre,
            compradorCorreo:comprador.correo || '',
            compradorTelefono:comprador.telefono || '',
            cantidad:totalBoletos,
            subtotal:totalImporte,
            total:totalFinal,
            descuento:cortesia ? totalImporte : 0,
            metodoPago,
            estadoPago:cortesia ? 'cortesia' : 'pagado',
            canalVenta:'taquilla',
            vendedor,
            seleccion:detalle.map(item => ({
                categoriaId:item.categoriaId,
                categoriaNombre:item.categoria.nombre,
                cantidadUnidades:item.cantidadUnidades,
                boletosPorUnidad:item.boletosPorUnidad,
                totalBoletos:item.totalBoletos,
                precioUnitario:item.precioUnitario,
                importe:item.importe
            })),
            correoEnviado:false,
            correoMetodo:null,
            fechaCompra:new Date(),
            boletos:[],
            folios:[]
        };

        await db.collection('compras').doc(compraId).set(compraBase);

        const boletosGenerados = await crearBoletos({
            evento,
            compraId,
            comprador,
            detalleSeleccion:detalle,
            asistentes,
            canalVenta:'taquilla',
            metodoPago,
            vendedor,
            cortesia
        });

        await db.collection('compras').doc(compraId).update({
            boletos:boletosGenerados.map(b => b.uuid),
            folios:boletosGenerados.map(b => b.folio)
        });

        let resultadoCorreo = { enviado:false, metodo:null, error:null };

        if(enviarCorreo && comprador.correo){
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
                console.error('❌ Error correo taquilla:', errorCorreo);
                resultadoCorreo = { enviado:false, metodo:null, error:errorCorreo.message };
                await db.collection('compras').doc(compraId).update({ correoEnviado:false, correoError:errorCorreo.message });
            }
        }

        return res.json({
            success:true,
            compraId,
            canalVenta:'taquilla',
            metodoPago,
            cantidad:totalBoletos,
            total:totalFinal,
            subtotal:totalImporte,
            correo:resultadoCorreo,
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
        console.error('❌ Error venta taquilla:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

module.exports = router;
