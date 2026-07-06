/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/lotes.js
Módulo: Lotes físicos para puntos de venta externos

Idea principal:
- Para restaurantes, bares, tiendas o promotores, los boletos nacen ACTIVOS.
- No requieren activación posterior.
- Quedan ligados a lote, punto de venta y responsable.
- En acceso se validan normalmente: activo -> usado.

Endpoints:
GET  /api/lotes/config
GET  /api/lotes
GET  /api/lotes/:loteId
POST /api/lotes/crear
====================================================
*/

const express = require('express');
const { nanoid } = require('nanoid');
const admin = require('firebase-admin');

const db = require('../firebase');
const generarQR = require('../services/qr');
const generarPDF = require('../services/pdf');
const { subirPDF } = require('../services/storage');

const router = express.Router();
const FieldValue = admin.firestore.FieldValue;

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

function normalizarTexto(valor){
    return String(valor || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'');
}

function esGrupo(categoria){
    return categoria.tipoVenta === 'grupo' || Number(categoria.boletosPorUnidad || 1) > 1;
}

function boletosPorUnidad(categoria){
    return Math.max(1, Number(categoria.boletosPorUnidad || 1));
}

function precioCategoria(categoria){
    return Number(categoria.precio || 0);
}

function categoriaActiva(categoria){
    return categoria.activo !== false;
}

function disponibilidadCategoria(categoria){
    const bpu = boletosPorUnidad(categoria);
    const vendidos = Number(categoria.vendidos || 0);
    const cupoTotal = categoria.cupoTotal === undefined || categoria.cupoTotal === null
        ? null
        : Number(categoria.cupoTotal || 0);

    const unidadesVendidas = Number(categoria.unidadesVendidas || 0);

    const unidadesTotal = categoria.unidadesTotal !== undefined && categoria.unidadesTotal !== null
        ? Number(categoria.unidadesTotal || 0)
        : (
            cupoTotal !== null && esGrupo(categoria)
                ? Math.floor(cupoTotal / bpu)
                : null
        );

    return {
        vendidos,
        cupoTotal,
        disponiblesBoletos: cupoTotal === null ? null : Math.max(0, cupoTotal - vendidos),
        unidadesVendidas,
        unidadesTotal,
        disponiblesUnidades: unidadesTotal === null ? null : Math.max(0, unidadesTotal - unidadesVendidas)
    };
}

function normalizarCategorias(evento){
    const categorias = evento.categorias || {};

    if(Object.keys(categorias).length > 0){
        return Object.keys(categorias).map(id => {
            const categoria = {
                id,
                ...categorias[id]
            };

            const disp = disponibilidadCategoria(categoria);

            return {
                id,
                nombre: categoria.nombre || id,
                descripcion: categoria.descripcion || '',
                precio: precioCategoria(categoria),
                tipoVenta: categoria.tipoVenta || (boletosPorUnidad(categoria) > 1 ? 'grupo' : 'individual'),
                unidad: categoria.unidad || 'Boleto',
                boletosPorUnidad: boletosPorUnidad(categoria),
                cupoTotal: disp.cupoTotal,
                vendidos: disp.vendidos,
                disponiblesBoletos: disp.disponiblesBoletos,
                unidadesTotal: disp.unidadesTotal,
                unidadesVendidas: disp.unidadesVendidas,
                disponiblesUnidades: disp.disponiblesUnidades,
                activo: categoriaActiva(categoria),
                prefijoGrupo: categoria.prefijoGrupo || null,
                orden: Number(categoria.orden || 0)
            };
        }).sort((a,b) => a.orden - b.orden);
    }

    /*
    Compatibilidad con tu evento actual si todavía no agregas categorias.
    No bloquea cupos porque aún no existen cupos configurados.
    */
    return [
        {
            id:'general',
            nombre:'General',
            descripcion:'Acceso general',
            precio:Number(evento.precioGeneral || 250),
            tipoVenta:'individual',
            unidad:'Boleto',
            boletosPorUnidad:1,
            cupoTotal:null,
            vendidos:0,
            disponiblesBoletos:null,
            unidadesTotal:null,
            unidadesVendidas:0,
            disponiblesUnidades:null,
            activo:true,
            prefijoGrupo:null,
            orden:1
        },
        {
            id:'vip',
            nombre:'VIP',
            descripcion:'Acceso VIP',
            precio:Number(evento.precioVIP || 350),
            tipoVenta:'individual',
            unidad:'Boleto',
            boletosPorUnidad:1,
            cupoTotal:null,
            vendidos:0,
            disponiblesBoletos:null,
            unidadesTotal:null,
            unidadesVendidas:0,
            disponiblesUnidades:null,
            activo:true,
            prefijoGrupo:'VIP',
            orden:2
        }
    ];
}

function obtenerCategoria(evento,categoriaId){
    return normalizarCategorias(evento).find(c => c.id === categoriaId);
}

async function obtenerEventoActivo(){
    const snapshot = await db
        .collection('eventos')
        .where('activo','==',true)
        .limit(1)
        .get();

    if(snapshot.empty){
        return null;
    }

    const doc = snapshot.docs[0];

    return {
        id:doc.id,
        ...doc.data()
    };
}

async function generarSecuencial(docId,campo,prefijo,digitos){
    const ref = db.collection('config').doc(docId);

    return await db.runTransaction(async transaction => {
        const doc = await transaction.get(ref);

        let ultimo = 0;

        if(doc.exists){
            ultimo = Number(doc.data()[campo] || 0);
        }

        const nuevo = ultimo + 1;

        transaction.set(ref,{
            [campo]:nuevo
        },{ merge:true });

        return prefijo + String(nuevo).padStart(digitos,'0');
    });
}

async function generarFolio(){
    return await generarSecuencial('contadorBoletos','ultimoFolio','EXL-',6);
}

async function generarLoteId(){
    return await generarSecuencial('contadorLotes','ultimo','LOTE-',6);
}

async function generarUUIDUnico(){
    let uuid;
    let existe = true;

    while(existe){
        uuid = 'EXL-' + nanoid(12);

        const doc = await db
            .collection('boletos')
            .doc(uuid)
            .get();

        existe = doc.exists;
    }

    return uuid;
}

function prefijoGrupo(categoria){
    if(categoria.prefijoGrupo){
        return categoria.prefijoGrupo;
    }

    const texto = normalizarTexto(categoria.unidad || categoria.nombre || categoria.id);

    if(texto.includes('periquera')){
        return 'PER';
    }

    if(texto.includes('sala') || texto.includes('lounge')){
        return 'LOU';
    }

    if(texto.includes('vip')){
        return 'VIP';
    }

    return String(categoria.id || 'GRP')
        .replace(/[^a-zA-Z0-9]/g,'')
        .slice(0,3)
        .toUpperCase() || 'GRP';
}

async function reservarInventario(eventoId,categoriaId,cantidadUnidades,totalBoletos){
    /*
    Si el evento todavía no tiene categorias, no se puede bloquear cupo.
    Cuando agregues categorias al evento, esta transacción evita sobreventa.
    */
    const eventoRef = db.collection('eventos').doc(eventoId);

    await db.runTransaction(async transaction => {
        const eventoDoc = await transaction.get(eventoRef);

        if(!eventoDoc.exists){
            throw new Error('Evento no encontrado');
        }

        const evento = eventoDoc.data();
        const categorias = evento.categorias || {};
        const catActual = categorias[categoriaId];

        if(!catActual){
            return;
        }

        const cat = {
            id:categoriaId,
            ...catActual
        };

        if(cat.activo === false){
            throw new Error(`La categoría ${cat.nombre || categoriaId} está inactiva`);
        }

        const disp = disponibilidadCategoria(cat);
        const bpu = boletosPorUnidad(cat);

        if(disp.cupoTotal !== null && disp.vendidos + totalBoletos > disp.cupoTotal){
            throw new Error(`Cupo insuficiente en ${cat.nombre || categoriaId}. Disponibles: ${disp.disponiblesBoletos}`);
        }

        if(esGrupo(cat)){
            if(totalBoletos % bpu !== 0){
                throw new Error(`La categoría ${cat.nombre || categoriaId} debe venderse en grupos de ${bpu}`);
            }

            if(disp.unidadesTotal !== null && disp.unidadesVendidas + cantidadUnidades > disp.unidadesTotal){
                throw new Error(`No hay suficientes ${cat.unidad || 'unidades'} disponibles. Disponibles: ${disp.disponiblesUnidades}`);
            }
        }

        const update = {
            [`categorias.${categoriaId}.vendidos`]: FieldValue.increment(totalBoletos),
            [`categorias.${categoriaId}.asignadosFisicos`]: FieldValue.increment(totalBoletos)
        };

        if(esGrupo(cat)){
            update[`categorias.${categoriaId}.unidadesVendidas`] = FieldValue.increment(cantidadUnidades);
        }

        transaction.update(eventoRef, update);
    });
}

/*
====================================================
GET /api/lotes/config
====================================================
*/

router.get('/config', async (req,res) => {
    try{
        const evento = await obtenerEventoActivo();

        if(!evento){
            return res.status(404).json({
                success:false,
                error:'No existe evento activo'
            });
        }

        return res.json({
            success:true,
            evento:{
                id:evento.id,
                nombre:evento.nombre,
                fecha:evento.fecha,
                hora:evento.hora,
                lugar:evento.lugar,
                ciudad:evento.ciudad
            },
            categorias:normalizarCategorias(evento)
        });

    }catch(error){
        console.error('❌ Error config lotes:', error);
        return res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

/*
====================================================
GET /api/lotes
====================================================
*/

router.get('/', async (req,res) => {
    try{
        const snapshot = await db
            .collection('lotes')
            .orderBy('fechaCreacion','desc')
            .limit(Number(req.query.limit || 100))
            .get();

        const lotes = snapshot.docs.map(doc => ({
            id:doc.id,
            ...serializarFirestore(doc.data())
        }));

        return res.json({
            success:true,
            total:lotes.length,
            lotes
        });

    }catch(error){
        console.error('❌ Error listar lotes:', error);
        return res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

/*
====================================================
GET /api/lotes/:loteId
====================================================
*/

router.get('/:loteId', async (req,res) => {
    try{
        const loteId = req.params.loteId;

        const loteDoc = await db
            .collection('lotes')
            .doc(loteId)
            .get();

        if(!loteDoc.exists){
            return res.status(404).json({
                success:false,
                error:'Lote no encontrado'
            });
        }

        const boletosSnapshot = await db
            .collection('boletos')
            .where('loteId','==',loteId)
            .get();

        const boletos = boletosSnapshot.docs.map(doc => ({
            id:doc.id,
            ...serializarFirestore(doc.data())
        }));

        return res.json({
            success:true,
            lote:{
                id:loteDoc.id,
                ...serializarFirestore(loteDoc.data())
            },
            boletos
        });

    }catch(error){
        console.error('❌ Error detalle lote:', error);
        return res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

/*
====================================================
POST /api/lotes/crear
====================================================
*/

router.post('/crear', async (req,res) => {
    try{
        console.log('POST /api/lotes/crear');

        const evento = await obtenerEventoActivo();

        if(!evento){
            return res.status(400).json({
                success:false,
                error:'No existe evento activo'
            });
        }

        const {
            categoriaId,
            cantidad = 1,
            puntoVenta = '',
            responsable = '',
            notas = '',
            estadoInicial = 'activo'
        } = req.body || {};

        if(!categoriaId){
            return res.status(400).json({
                success:false,
                error:'Selecciona una categoría'
            });
        }

        const categoria = obtenerCategoria(evento,categoriaId);

        if(!categoria){
            return res.status(404).json({
                success:false,
                error:'Categoría no encontrada'
            });
        }

        if(!categoria.activo){
            return res.status(400).json({
                success:false,
                error:'Categoría inactiva'
            });
        }

        const cantidadUnidades = Math.max(1, Number(cantidad || 1));
        const bpu = boletosPorUnidad(categoria);
        const totalBoletos = esGrupo(categoria)
            ? cantidadUnidades * bpu
            : cantidadUnidades;

        const precioUnitario = precioCategoria(categoria);
        const totalEstimado = totalBoletos * precioUnitario;

        await reservarInventario(
            evento.id,
            categoriaId,
            cantidadUnidades,
            totalBoletos
        );

        const loteId = await generarLoteId();

        const lote = {
            loteId,
            eventoId:evento.id,
            eventoNombre:evento.nombre,

            categoriaId:categoria.id,
            categoriaNombre:categoria.nombre,
            tipoVenta:categoria.tipoVenta,
            unidad:categoria.unidad || 'Boleto',
            boletosPorUnidad:bpu,

            cantidadUnidades,
            totalBoletos,
            precioUnitario,
            totalEstimado,

            modalidad:'venta_externa',
            estadoInicial,
            estado:'activo',
            puntoVenta,
            responsable,
            notas,

            activos:estadoInicial === 'activo' ? totalBoletos : 0,
            preimpresos:estadoInicial === 'preimpreso' ? totalBoletos : 0,
            usados:0,
            cancelados:0,
            devueltos:0,

            folios:[],
            boletos:[],

            fechaCreacion:new Date()
        };

        await db
            .collection('lotes')
            .doc(loteId)
            .set(lote);

        const boletosGenerados = [];
        const prefix = prefijoGrupo(categoria);

        for(let unidadIndex = 1; unidadIndex <= cantidadUnidades; unidadIndex++){

            const grupoId = esGrupo(categoria)
                ? `${prefix}-${String(loteId).replace('LOTE-','')}-${String(unidadIndex).padStart(3,'0')}`
                : null;

            const boletosEnUnidad = esGrupo(categoria) ? bpu : 1;

            for(let posicion = 1; posicion <= boletosEnUnidad; posicion++){

                const folio = await generarFolio();
                const uuid = await generarUUIDUnico();
                const qr = await generarQR(uuid);

                const nombre = esGrupo(categoria)
                    ? `${categoria.unidad || categoria.nombre} ${String(unidadIndex).padStart(3,'0')} - Lugar ${posicion}`
                    : 'PORTADOR';

                const boleto = {
                    uuid,
                    folio,
                    qr,

                    compraId:null,
                    loteId,

                    nombre,
                    tipo:categoria.nombre,
                    categoriaId:categoria.id,
                    categoriaNombre:categoria.nombre,
                    precio:precioUnitario,

                    tipoVenta:categoria.tipoVenta,
                    unidad:categoria.unidad || 'Boleto',
                    grupoId,
                    numeroUnidad:esGrupo(categoria) ? unidadIndex : null,
                    posicionGrupo:esGrupo(categoria) ? posicion : null,
                    boletosPorGrupo:esGrupo(categoria) ? bpu : 1,

                    eventoId:evento.id,
                    eventoNombre:evento.nombre,
                    eventoFecha:evento.fecha,
                    eventoHora:evento.hora,
                    eventoLugar:evento.lugar,
                    eventoDireccion:evento.direccion,
                    eventoCiudad:evento.ciudad,
                    eventoFlyer:evento.flyer,

                    canalVenta:'lote_fisico',
                    modalidad:'venta_externa',
                    metodoPago:'punto_venta',
                    puntoVenta,
                    responsable,
                    vendidoPor:puntoVenta || responsable || 'Punto de venta',

                    estado:estadoInicial,
                    estadoVenta:'en_punto_venta',

                    validado:false,
                    validadoPor:'',
                    fechaValidacion:null,

                    enviadoCorreo:false,
                    enviadoWhatsapp:false,

                    impreso:true,
                    fechaImpresion:new Date(),
                    impresoPor:'Sistema / Lote físico',

                    fechaCreacion:new Date()
                };

                await db
                    .collection('boletos')
                    .doc(uuid)
                    .set(boleto);

                const rutaPDF = await generarPDF({
                    nombre:boleto.nombre,
                    correo:'',
                    telefono:'',

                    folio,
                    tipo:categoria.nombre,
                    precio:precioUnitario,

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

                const pdfUrl = await subirPDF(rutaPDF, folio);

                await db
                    .collection('boletos')
                    .doc(uuid)
                    .update({
                        pdfUrl
                    });

                boletosGenerados.push({
                    ...boleto,
                    pdfUrl
                });

                console.log(`✅ Boleto físico externo generado ${folio}`);
            }
        }

        await db
            .collection('lotes')
            .doc(loteId)
            .update({
                boletos:boletosGenerados.map(b => b.uuid),
                folios:boletosGenerados.map(b => b.folio)
            });

        return res.json({
            success:true,
            loteId,
            eventoId:evento.id,
            categoria:categoria.nombre,
            modalidad:'venta_externa',
            estadoInicial,
            totalBoletos,
            cantidadUnidades,
            totalEstimado,
            puntoVenta,
            responsable,
            boletos:boletosGenerados.map(b => ({
                uuid:b.uuid,
                folio:b.folio,
                nombre:b.nombre,
                tipo:b.tipo,
                categoriaId:b.categoriaId,
                grupoId:b.grupoId,
                estado:b.estado,
                puntoVenta:b.puntoVenta,
                pdfUrl:b.pdfUrl
            }))
        });

    }catch(error){
        console.error('❌ Error crear lote externo:', error);
        return res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

module.exports = router;
