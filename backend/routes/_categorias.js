/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/_categorias.js
Helpers compartidos para categorías dinámicas
====================================================
*/

const { nanoid } = require('nanoid');
const admin = require('firebase-admin');

const db = require('../firebase');
const generarQR = require('../services/qr');
const generarPDF = require('../services/pdf');
const { subirPDF } = require('../services/storage');

const FieldValue = admin.firestore.FieldValue;

function normalizarTexto(valor){
    return String(valor || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'');
}

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

function esGrupo(categoria){
    return categoria.tipoVenta === 'grupo' || Number(categoria.boletosPorUnidad || 1) > 1;
}

function boletosPorUnidad(categoria){
    return Math.max(1, Number(categoria.boletosPorUnidad || 1));
}

function precioCategoria(categoria){
    return Number(categoria.precio || 0);
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
                activo: categoria.activo !== false,
                prefijoGrupo: categoria.prefijoGrupo || null,
                orden: Number(categoria.orden || 0)
            };
        }).sort((a,b) => a.orden - b.orden);
    }

    return [
        {
            id:'general', nombre:'General', descripcion:'Acceso general', precio:Number(evento.precioGeneral || 250),
            tipoVenta:'individual', unidad:'Boleto', boletosPorUnidad:1, cupoTotal:null, vendidos:0,
            disponiblesBoletos:null, unidadesTotal:null, unidadesVendidas:0, disponiblesUnidades:null,
            activo:true, prefijoGrupo:null, orden:1
        },
        {
            id:'vip', nombre:'VIP', descripcion:'Acceso VIP', precio:Number(evento.precioVIP || 350),
            tipoVenta:'individual', unidad:'Boleto', boletosPorUnidad:1, cupoTotal:null, vendidos:0,
            disponiblesBoletos:null, unidadesTotal:null, unidadesVendidas:0, disponiblesUnidades:null,
            activo:true, prefijoGrupo:'VIP', orden:2
        }
    ];
}

function obtenerCategoria(evento,categoriaId){
    return normalizarCategorias(evento).find(c => c.id === categoriaId);
}

function resolverCategoria(evento,valor){
    const categorias = normalizarCategorias(evento);
    const texto = normalizarTexto(valor);

    let categoria = categorias.find(c =>
        normalizarTexto(c.id) === texto ||
        normalizarTexto(c.nombre) === texto
    );

    if(!categoria && texto === 'vip'){
        categoria = categorias.find(c => c.id === 'vip1') || categorias.find(c => normalizarTexto(c.nombre).includes('vip'));
    }

    if(!categoria && texto.includes('general')){
        categoria = categorias.find(c => c.id === 'general') || categorias.find(c => normalizarTexto(c.nombre).includes('general'));
    }

    return categoria;
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

        transaction.set(ref,{ [campo]:nuevo },{ merge:true });

        return prefijo + String(nuevo).padStart(digitos,'0');
    });
}

async function generarFolio(){
    return await generarSecuencial('contadorBoletos','ultimoFolio','EXL-',6);
}

async function generarCompraId(){
    return await generarSecuencial('contadorCompras','ultimo','COMP-',6);
}

async function generarUUIDUnico(){
    let uuid;
    let existe = true;

    while(existe){
        uuid = 'EXL-' + nanoid(12);
        const doc = await db.collection('boletos').doc(uuid).get();
        existe = doc.exists;
    }

    return uuid;
}

function prefijoGrupo(categoria){
    if(categoria.prefijoGrupo){
        return categoria.prefijoGrupo;
    }

    const texto = normalizarTexto(categoria.unidad || categoria.nombre || categoria.id);

    if(texto.includes('periquera')) return 'PER';
    if(texto.includes('sala') || texto.includes('lounge')) return 'LOU';
    if(texto.includes('vip')) return 'VIP';

    return String(categoria.id || 'GRP').replace(/[^a-zA-Z0-9]/g,'').slice(0,3).toUpperCase() || 'GRP';
}

function normalizarSeleccionDesdePayload(evento,body){
    if(Array.isArray(body.seleccion) && body.seleccion.length > 0){
        return body.seleccion
            .map(item => ({ categoriaId:item.categoriaId, cantidad:Number(item.cantidad || 0) }))
            .filter(item => item.cantidad > 0);
    }

    if(body.tipo){
        const categoria = resolverCategoria(evento,body.tipo);
        if(!categoria) return [];
        return [{ categoriaId:categoria.id, cantidad:Number(body.cantidad || 1) }];
    }

    if(Array.isArray(body.boletos) && body.boletos.length > 0){
        const acumulado = {};

        body.boletos.forEach(item => {
            const categoria = resolverCategoria(evento,item.categoriaId || item.tipo);
            if(!categoria) return;
            acumulado[categoria.id] = (acumulado[categoria.id] || 0) + 1;
        });

        return Object.keys(acumulado).map(categoriaId => {
            const categoria = obtenerCategoria(evento,categoriaId);
            const totalBoletos = acumulado[categoriaId];

            if(esGrupo(categoria)){
                return { categoriaId, cantidad:Math.ceil(totalBoletos / boletosPorUnidad(categoria)) };
            }

            return { categoriaId, cantidad:totalBoletos };
        });
    }

    return [];
}

function validarSeleccion(evento,seleccion){
    if(!Array.isArray(seleccion) || seleccion.length === 0){
        return 'Selecciona al menos una categoría';
    }

    for(const item of seleccion){
        const categoria = obtenerCategoria(evento,item.categoriaId);

        if(!categoria) return `Categoría no encontrada: ${item.categoriaId}`;
        if(!categoria.activo) return `La categoría ${categoria.nombre} está inactiva`;

        const cantidad = Number(item.cantidad || 0);
        if(cantidad <= 0) return `Cantidad inválida en ${categoria.nombre}`;
        if(esGrupo(categoria) && !Number.isInteger(cantidad)) return `${categoria.nombre} debe venderse por unidades completas`;
    }

    return null;
}

function calcularDetalleSeleccion(evento,seleccion){
    const detalle = [];
    let totalBoletos = 0;
    let totalImporte = 0;

    seleccion.forEach(item => {
        const categoria = obtenerCategoria(evento,item.categoriaId);
        const cantidadUnidades = Number(item.cantidad || 0);
        const bpu = boletosPorUnidad(categoria);
        const totalCategoriaBoletos = esGrupo(categoria) ? cantidadUnidades * bpu : cantidadUnidades;
        const importe = totalCategoriaBoletos * precioCategoria(categoria);

        detalle.push({
            categoria,
            categoriaId:categoria.id,
            cantidadUnidades,
            boletosPorUnidad:bpu,
            totalBoletos:totalCategoriaBoletos,
            precioUnitario:precioCategoria(categoria),
            importe
        });

        totalBoletos += totalCategoriaBoletos;
        totalImporte += importe;
    });

    return { detalle, totalBoletos, totalImporte };
}

function obtenerAsistentes(body,totalBoletos,compradorNombre){
    let nombres = [];

    if(Array.isArray(body.asistentes)){
        nombres = body.asistentes.map(item => typeof item === 'string' ? item : item?.nombre || '');
    }else if(Array.isArray(body.boletos)){
        nombres = body.boletos.map(item => item?.nombre || '');
    }

    while(nombres.length < totalBoletos){
        nombres.push(nombres.length === 0 ? compradorNombre : `Invitado ${nombres.length + 1}`);
    }

    return nombres.slice(0,totalBoletos).map((nombre,index) => {
        const limpio = String(nombre || '').trim();
        if(limpio) return limpio;
        return index === 0 ? compradorNombre : `Invitado ${index + 1}`;
    });
}

async function reservarInventario(eventoId,detalleSeleccion){
    const eventoRef = db.collection('eventos').doc(eventoId);

    await db.runTransaction(async transaction => {
        const eventoDoc = await transaction.get(eventoRef);

        if(!eventoDoc.exists){
            throw new Error('Evento no encontrado');
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

            if(!catActual) throw new Error(`Categoría no encontrada: ${categoriaId}`);

            const cat = { id:categoriaId, ...catActual };

            if(cat.activo === false) throw new Error(`La categoría ${cat.nombre || categoriaId} está inactiva`);

            const disp = disponibilidadCategoria(cat);

            if(disp.cupoTotal !== null && disp.vendidos + item.totalBoletos > disp.cupoTotal){
                throw new Error(`Cupo insuficiente en ${cat.nombre || categoriaId}. Disponibles: ${disp.disponiblesBoletos}`);
            }

            if(esGrupo(cat)){
                if(disp.unidadesTotal !== null && disp.unidadesVendidas + item.cantidadUnidades > disp.unidadesTotal){
                    throw new Error(`No hay suficientes ${cat.unidad || 'unidades'} disponibles. Disponibles: ${disp.disponiblesUnidades}`);
                }

                updates[`categorias.${categoriaId}.unidadesVendidas`] = FieldValue.increment(item.cantidadUnidades);
            }

            updates[`categorias.${categoriaId}.vendidos`] = FieldValue.increment(item.totalBoletos);
        }

        transaction.update(eventoRef, updates);
    });
}

async function crearBoletos({ evento, compraId, comprador, detalleSeleccion, asistentes, canalVenta, metodoPago, vendedor, cortesia = false }){
    const boletosGenerados = [];
    let asistenteIndex = 0;

    for(const item of detalleSeleccion){
        const categoria = item.categoria;
        const grupo = esGrupo(categoria);
        const bpu = boletosPorUnidad(categoria);
        const prefijo = prefijoGrupo(categoria);

        for(let unidadIndex = 1; unidadIndex <= item.cantidadUnidades; unidadIndex++){
            const grupoId = grupo
                ? `${prefijo}-${String(compraId).replace('COMP-','')}-${String(unidadIndex).padStart(3,'0')}`
                : null;

            const boletosEnUnidad = grupo ? bpu : 1;

            for(let posicion = 1; posicion <= boletosEnUnidad; posicion++){
                const nombre = asistentes[asistenteIndex] || comprador.nombre || 'PORTADOR';
                asistenteIndex++;

                const folio = await generarFolio();
                const uuid = await generarUUIDUnico();
                const qr = await generarQR(uuid);
                const precioBase = precioCategoria(categoria);
                const precio = cortesia ? 0 : precioBase;

                const boleto = {
                    uuid,
                    folio,
                    compraId,
                    nombre,
                    tipo:categoria.nombre,
                    categoriaId:categoria.id,
                    categoriaNombre:categoria.nombre,
                    precio,
                    precioBase,
                    qr,
                    compradorNombre:comprador.nombre || '',
                    compradorCorreo:comprador.correo || '',
                    compradorTelefono:comprador.telefono || '',
                    tipoVenta:categoria.tipoVenta,
                    unidad:categoria.unidad || 'Boleto',
                    grupoId,
                    numeroUnidad:grupo ? unidadIndex : null,
                    posicionGrupo:grupo ? posicion : null,
                    boletosPorGrupo:grupo ? bpu : 1,
                    eventoId:evento.id,
                    eventoNombre:evento.nombre,
                    eventoFecha:evento.fecha,
                    eventoHora:evento.hora,
                    eventoLugar:evento.lugar,
                    eventoDireccion:evento.direccion,
                    eventoCiudad:evento.ciudad,
                    eventoFlyer:evento.flyer,
                    canalVenta,
                    metodoPago,
                    vendidoPor:vendedor || canalVenta,
                    estado:'activo',
                    estadoVenta:'activo',
                    validado:false,
                    validadoPor:'',
                    fechaValidacion:null,
                    enviadoCorreo:false,
                    enviadoWhatsapp:false,
                    impreso:false,
                    fechaImpresion:null,
                    impresoPor:null,
                    fechaCompra:new Date()
                };

                await db.collection('boletos').doc(uuid).set(boleto);

                const rutaPDF = await generarPDF({
                    nombre,
                    correo:comprador.correo || '',
                    telefono:comprador.telefono || '',
                    folio,
                    tipo:categoria.nombre,
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

                const pdfUrl = await subirPDF(rutaPDF, folio);

                await db.collection('boletos').doc(uuid).update({ pdfUrl });

                boletosGenerados.push({ ...boleto, pdfUrl, rutaPDF });

                console.log(`✅ Boleto generado ${folio}`);
            }
        }
    }

    return boletosGenerados;
}

module.exports = {
    db,
    serializarFirestore,
    normalizarCategorias,
    obtenerEventoActivo,
    generarCompraId,
    normalizarSeleccionDesdePayload,
    validarSeleccion,
    calcularDetalleSeleccion,
    obtenerAsistentes,
    reservarInventario,
    crearBoletos
};
