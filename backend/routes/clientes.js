/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/clientes.js
Módulo: Clientes / Email marketing / Exportación CSV
====================================================
*/

const express = require('express');
const db = require('../firebase');

const router = express.Router();

/*
====================================================
Utilidades
====================================================
*/

function serializar(valor){
    if(!valor){
        return valor;
    }

    if(typeof valor.toDate === 'function'){
        return valor.toDate().toISOString();
    }

    if(Array.isArray(valor)){
        return valor.map(serializar);
    }

    if(typeof valor === 'object'){
        const salida = {};
        Object.keys(valor).forEach(key => {
            salida[key] = serializar(valor[key]);
        });
        return salida;
    }

    return valor;
}

function limpiarTexto(valor){
    return String(valor || '').trim();
}

function normalizarCorreo(correo){
    return limpiarTexto(correo).toLowerCase();
}

function csvEscape(valor){
    const texto = String(valor ?? '');

    if(/[",\n\r]/.test(texto)){
        return `"${texto.replace(/"/g,'""')}"`;
    }

    return texto;
}

function fechaMs(valor){
    if(!valor) return 0;

    const d = new Date(valor);
    const t = d.getTime();

    return Number.isNaN(t) ? 0 : t;
}

async function obtenerEventoActivo(){
    const snap = await db
        .collection('eventos')
        .where('activo','==',true)
        .limit(1)
        .get();

    if(snap.empty){
        return null;
    }

    const doc = snap.docs[0];

    return {
        id:doc.id,
        ...serializar(doc.data())
    };
}

function compraEsValidaParaClientes(compra){
    const correo = normalizarCorreo(compra.compradorCorreo || compra.correo);

    if(!correo){
        return false;
    }

    /*
    Evita correos de prueba vacíos o genéricos si algún operador los captura.
    Puedes ajustar esta lista después.
    */
    const bloqueados = [
        'sin@correo.com',
        'sincorreo@sincorreo.com',
        'test@test.com',
        'prueba@prueba.com'
    ];

    if(bloqueados.includes(correo)){
        return false;
    }

    return true;
}

function construirClienteDesdeCompra(compra){
    return {
        nombre:limpiarTexto(compra.compradorNombre || compra.nombre),
        correo:normalizarCorreo(compra.compradorCorreo || compra.correo),
        telefono:limpiarTexto(compra.compradorTelefono || compra.telefono),
        ultimoEvento:limpiarTexto(compra.eventoNombre),
        ultimoEventoId:limpiarTexto(compra.eventoId),
        ultimaCompra:compra.fechaCompra || '',
        canalVenta:limpiarTexto(compra.canalVenta),
        metodoPago:limpiarTexto(compra.metodoPago),
        totalCompras:1,
        totalBoletos:Number(compra.cantidad || 0),
        totalGastado:Number(compra.total || 0),
        eventos:new Set([limpiarTexto(compra.eventoNombre)].filter(Boolean)),
        eventosIds:new Set([limpiarTexto(compra.eventoId)].filter(Boolean))
    };
}

function fusionarCliente(cliente, compra){
    const fechaActual = fechaMs(cliente.ultimaCompra);
    const fechaNueva = fechaMs(compra.fechaCompra);

    cliente.totalCompras += 1;
    cliente.totalBoletos += Number(compra.cantidad || 0);
    cliente.totalGastado += Number(compra.total || 0);

    if(compra.eventoNombre){
        cliente.eventos.add(limpiarTexto(compra.eventoNombre));
    }

    if(compra.eventoId){
        cliente.eventosIds.add(limpiarTexto(compra.eventoId));
    }

    if(fechaNueva >= fechaActual){
        cliente.nombre = limpiarTexto(compra.compradorNombre || compra.nombre) || cliente.nombre;
        cliente.telefono = limpiarTexto(compra.compradorTelefono || compra.telefono) || cliente.telefono;
        cliente.ultimoEvento = limpiarTexto(compra.eventoNombre) || cliente.ultimoEvento;
        cliente.ultimoEventoId = limpiarTexto(compra.eventoId) || cliente.ultimoEventoId;
        cliente.ultimaCompra = compra.fechaCompra || cliente.ultimaCompra;
        cliente.canalVenta = limpiarTexto(compra.canalVenta) || cliente.canalVenta;
        cliente.metodoPago = limpiarTexto(compra.metodoPago) || cliente.metodoPago;
    }

    return cliente;
}

async function obtenerCompras({ scope = 'activo', eventoId = '' } = {}){
    let snap;
    let eventoFiltro = null;

    if(scope === 'evento' && eventoId){
        snap = await db
            .collection('compras')
            .where('eventoId','==',eventoId)
            .get();

        eventoFiltro = eventoId;
    }else if(scope === 'activo'){
        const evento = await obtenerEventoActivo();

        if(!evento){
            return {
                evento:null,
                compras:[]
            };
        }

        snap = await db
            .collection('compras')
            .where('eventoId','==',evento.id)
            .get();

        eventoFiltro = evento.id;
    }else{
        snap = await db
            .collection('compras')
            .get();
    }

    const compras = snap.docs.map(doc => ({
        id:doc.id,
        ...serializar(doc.data())
    }));

    return {
        eventoId:eventoFiltro,
        compras
    };
}

function construirClientes(compras){
    const mapa = new Map();

    compras
        .filter(compraEsValidaParaClientes)
        .forEach(compra => {
            const correo = normalizarCorreo(compra.compradorCorreo || compra.correo);

            if(!mapa.has(correo)){
                mapa.set(correo, construirClienteDesdeCompra(compra));
            }else{
                mapa.set(correo, fusionarCliente(mapa.get(correo), compra));
            }
        });

    return Array.from(mapa.values())
        .map(cliente => ({
            ...cliente,
            eventos:Array.from(cliente.eventos).join(' | '),
            eventosIds:Array.from(cliente.eventosIds).join(' | ')
        }))
        .sort((a,b) => fechaMs(b.ultimaCompra) - fechaMs(a.ultimaCompra));
}

function construirCSV(clientes){
    const columnas = [
        'nombre',
        'correo',
        'telefono',
        'totalCompras',
        'totalBoletos',
        'totalGastado',
        'ultimoEvento',
        'ultimaCompra',
        'canalVenta',
        'metodoPago',
        'eventos'
    ];

    const headers = [
        'Nombre',
        'Correo',
        'Telefono',
        'Total compras',
        'Total boletos',
        'Total gastado',
        'Ultimo evento',
        'Ultima compra',
        'Canal venta',
        'Metodo pago',
        'Eventos'
    ];

    const lineas = [
        headers.map(csvEscape).join(',')
    ];

    clientes.forEach(cliente => {
        lineas.push(columnas.map(col => csvEscape(cliente[col])).join(','));
    });

    return lineas.join('\r\n');
}

/*
====================================================
Rutas
====================================================
*/

// GET /api/clientes/listar?scope=activo|todos|evento&eventoId=...
router.get('/listar', async (req,res) => {
    try{
        const scope = limpiarTexto(req.query.scope || 'activo');
        const eventoId = limpiarTexto(req.query.eventoId || '');

        const { compras } = await obtenerCompras({
            scope,
            eventoId
        });

        const clientes = construirClientes(compras);

        return res.json({
            success:true,
            scope,
            eventoId,
            resumen:{
                comprasAnalizadas:compras.length,
                clientesUnicos:clientes.length,
                correosUnicos:clientes.length
            },
            clientes
        });

    }catch(error){
        console.error('Error listar clientes:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

// GET /api/clientes/exportar?scope=activo|todos|evento&eventoId=...
router.get('/exportar', async (req,res) => {
    try{
        const scope = limpiarTexto(req.query.scope || 'activo');
        const eventoId = limpiarTexto(req.query.eventoId || '');

        const { compras } = await obtenerCompras({
            scope,
            eventoId
        });

        const clientes = construirClientes(compras);
        const csv = construirCSV(clientes);

        const fecha = new Date().toISOString().slice(0,10);
        const nombre = `exelaris_clientes_${scope}_${fecha}.csv`;

        res.setHeader('Content-Type','text/csv; charset=utf-8');
        res.setHeader('Content-Disposition',`attachment; filename="${nombre}"`);

        /*
        BOM para que Excel abra acentos correctamente.
        */
        return res.send('\uFEFF' + csv);

    }catch(error){
        console.error('Error exportar clientes:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

// GET /api/clientes/eventos
router.get('/eventos', async (req,res) => {
    try{
        const snap = await db
            .collection('eventos')
            .get();

        const eventos = snap.docs.map(doc => ({
            id:doc.id,
            ...serializar(doc.data())
        })).sort((a,b) => {
            if(a.activo && !b.activo) return -1;
            if(!a.activo && b.activo) return 1;
            return String(b.fecha || '').localeCompare(String(a.fecha || ''));
        });

        return res.json({
            success:true,
            eventos
        });

    }catch(error){
        console.error('Error listar eventos clientes:', error);

        return res.status(500).json({
            success:false,
            error:error.message
        });
    }
});

module.exports = router;
