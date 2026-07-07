/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/inventario.js
Módulo: Dashboard de inventario, ventas y puntos de venta
====================================================
*/

const express = require('express');
const db = require('../firebase');
const router = express.Router();

function serializar(v){
    if(!v) return v;
    if(typeof v.toDate === 'function') return v.toDate().toISOString();
    if(Array.isArray(v)) return v.map(serializar);
    if(typeof v === 'object'){
        const o = {};
        Object.keys(v).forEach(k => o[k] = serializar(v[k]));
        return o;
    }
    return v;
}

function esGrupo(c){
    return c.tipoVenta === 'grupo' || Number(c.boletosPorUnidad || 1) > 1;
}

function bpu(c){
    return Math.max(1, Number(c.boletosPorUnidad || 1));
}

function normalizarCategorias(evento){
    const categorias = evento.categorias || {};

    return Object.keys(categorias).map(id => {
        const c = { id, ...categorias[id] };
        const boletosPorUnidad = bpu(c);
        const vendidos = Number(c.vendidos || 0);
        const cupoTotal = c.cupoTotal === undefined || c.cupoTotal === null ? null : Number(c.cupoTotal || 0);
        const unidadesVendidas = Number(c.unidadesVendidas || 0);
        const unidadesTotal = c.unidadesTotal !== undefined && c.unidadesTotal !== null
            ? Number(c.unidadesTotal || 0)
            : (cupoTotal !== null && esGrupo(c) ? Math.floor(cupoTotal / boletosPorUnidad) : null);

        return {
            id,
            nombre: c.nombre || id,
            descripcion: c.descripcion || '',
            precio: Number(c.precio || 0),
            tipoVenta: c.tipoVenta || 'individual',
            unidad: c.unidad || 'Boleto',
            boletosPorUnidad,
            cupoTotal,
            vendidos,
            disponiblesBoletos: cupoTotal === null ? null : Math.max(0, cupoTotal - vendidos),
            unidadesTotal,
            unidadesVendidas,
            disponiblesUnidades: unidadesTotal === null ? null : Math.max(0, unidadesTotal - unidadesVendidas),
            activo: c.activo !== false,
            orden: Number(c.orden || 0)
        };
    }).sort((a,b) => a.orden - b.orden);
}

async function obtenerEventoActivo(){
    const snap = await db.collection('eventos').where('activo','==',true).limit(1).get();
    if(snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...serializar(doc.data()) };
}

function fechaMs(v){
    if(!v) return 0;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? 0 : t;
}

function addGroup(obj,key,cantidad,total){
    if(!obj[key]) obj[key] = { nombre:key, compras:0, boletos:0, total:0 };
    obj[key].compras += 1;
    obj[key].boletos += Number(cantidad || 0);
    obj[key].total += Number(total || 0);
}

router.get('/resumen', async (req,res) => {
    try{
        const evento = await obtenerEventoActivo();

        if(!evento){
            return res.status(404).json({ success:false, error:'No existe evento activo' });
        }

        const [comprasSnap, boletosSnap, lotesSnap] = await Promise.all([
            db.collection('compras').where('eventoId','==',evento.id).get(),
            db.collection('boletos').where('eventoId','==',evento.id).get(),
            db.collection('lotes').where('eventoId','==',evento.id).get()
        ]);

        const compras = comprasSnap.docs.map(d => ({ id:d.id, ...serializar(d.data()) }));
        const boletos = boletosSnap.docs.map(d => ({ id:d.id, ...serializar(d.data()) }));
        const lotes = lotesSnap.docs.map(d => ({ id:d.id, ...serializar(d.data()) }));

        const categorias = normalizarCategorias(evento);
        const porCanal = {};
        const porMetodo = {};
        const estados = {};
        const porCategoria = {};
        const puntos = {};

        let totalVendido = 0;
        let totalBoletosCompra = 0;

        compras.forEach(c => {
            const total = Number(c.total || 0);
            const cantidad = Number(c.cantidad || 0);
            totalVendido += total;
            totalBoletosCompra += cantidad;
            addGroup(porCanal, c.canalVenta || 'sin_canal', cantidad, total);
            addGroup(porMetodo, c.metodoPago || 'sin_metodo', cantidad, total);
        });

        boletos.forEach(b => {
            const estado = b.estado || 'sin_estado';
            estados[estado] = (estados[estado] || 0) + 1;

            const cat = b.categoriaId || b.tipo || 'sin_categoria';
            if(!porCategoria[cat]){
                porCategoria[cat] = { categoriaId:cat, nombre:b.categoriaNombre || b.tipo || cat, total:0, activos:0, usados:0, preimpresos:0, cancelados:0 };
            }
            porCategoria[cat].total++;
            if(estado === 'activo') porCategoria[cat].activos++;
            if(estado === 'usado') porCategoria[cat].usados++;
            if(estado === 'preimpreso') porCategoria[cat].preimpresos++;
            if(estado === 'cancelado') porCategoria[cat].cancelados++;
        });

        lotes.forEach(l => {
            const punto = l.puntoVenta || 'Sin punto de venta';
            if(!puntos[punto]){
                puntos[punto] = { puntoVenta:punto, responsables:[], lotes:0, boletos:0, activos:0, usados:0, preimpresos:0, totalEstimado:0 };
            }
            puntos[punto].lotes += 1;
            puntos[punto].boletos += Number(l.totalBoletos || 0);
            puntos[punto].activos += Number(l.activos || 0);
            puntos[punto].usados += Number(l.usados || 0);
            puntos[punto].preimpresos += Number(l.preimpresos || 0);
            puntos[punto].totalEstimado += Number(l.totalEstimado || 0);
            if(l.responsable && !puntos[punto].responsables.includes(l.responsable)) puntos[punto].responsables.push(l.responsable);
        });

        const resumenCategorias = categorias.map(c => ({
            ...c,
            conteoBoletos: porCategoria[c.id] || { total:0, activos:0, usados:0, preimpresos:0, cancelados:0 }
        }));

        return res.json({
            success:true,
            evento:{ id:evento.id, nombre:evento.nombre, fecha:evento.fecha, hora:evento.hora, lugar:evento.lugar, ciudad:evento.ciudad },
            resumen:{
                totalVendido,
                totalCompras: compras.length,
                totalBoletosCompra,
                boletosRegistrados: boletos.length,
                lotes: lotes.length,
                estados
            },
            categorias: resumenCategorias,
            porCanal: Object.values(porCanal),
            porMetodo: Object.values(porMetodo),
            puntosVenta: Object.values(puntos),
            comprasRecientes: compras.sort((a,b) => fechaMs(b.fechaCompra) - fechaMs(a.fechaCompra)).slice(0,20),
            lotesRecientes: lotes.sort((a,b) => fechaMs(b.fechaCreacion) - fechaMs(a.fechaCreacion)).slice(0,20)
        });
    }catch(error){
        console.error('❌ Error dashboard inventario:', error);
        return res.status(500).json({ success:false, error:error.message });
    }
});

module.exports = router;
