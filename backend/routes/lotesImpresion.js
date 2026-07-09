/*
====================================================
EXELARIS Tickets
Archivo: backend/routes/lotesImpresion.js
Módulo: PDF maestro de impresión para lotes físicos
Formato: 4 boletos por hoja carta
====================================================
*/

const express = require('express');
const fs = require('fs');
const path = require('path');

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');

const db = require('../firebase');

const router = express.Router();

function limpiarTexto(valor, fallback = '') {
    return String(valor || fallback || '').trim();
}

function money(valor) {
    const n = Number(valor || 0);

    return n.toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0
    });
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function safeFilename(nombre) {
    return String(nombre || 'archivo').replace(/[^a-zA-Z0-9-_]/g, '_');
}

function serializar(valor) {
    if (!valor) return valor;

    if (typeof valor.toDate === 'function') {
        return valor.toDate().toISOString();
    }

    if (Array.isArray(valor)) {
        return valor.map(serializar);
    }

    if (typeof valor === 'object') {
        const salida = {};
        Object.keys(valor).forEach(key => {
            salida[key] = serializar(valor[key]);
        });
        return salida;
    }

    return valor;
}

async function crearQRBuffer(valor) {
    return await QRCode.toBuffer(limpiarTexto(valor), {
        type: 'png',
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 260,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });
}

async function crearBarcodeBuffer(valor) {
    return await bwipjs.toBuffer({
        bcid: 'code128',
        text: limpiarTexto(valor),
        scale: 2,
        height: 7,
        includetext: false,
        backgroundcolor: 'FFFFFF',
        barcolor: '000000'
    });
}

function strokeNeon(doc, x, y, w, h, radius, color, width = 0.8) {
    doc
        .save()
        .roundedRect(x, y, w, h, radius)
        .lineWidth(width + 1.8)
        .strokeOpacity(0.12)
        .stroke(color)
        .restore();

    doc
        .save()
        .roundedRect(x, y, w, h, radius)
        .lineWidth(width)
        .strokeOpacity(0.95)
        .stroke(color)
        .restore();
}

function dottedPattern(doc, x, y, w, h, color = '#7C3AED') {
    doc.save();
    doc.fillColor(color).opacity(0.12);

    for (let yy = y; yy < y + h; yy += 9) {
        for (let xx = x; xx < x + w; xx += 9) {
            doc.circle(xx, yy, 0.8).fill();
        }
    }

    doc.restore();
}

function textFit(doc, text, x, y, options) {
    doc.text(limpiarTexto(text, '-'), x, y, {
        ...options,
        ellipsis: true
    });
}

function drawCompactTicket(doc, boleto, lote, qrBuffer, barcodeBuffer, x, y, w, h) {
    const grad = doc.linearGradient(x, y, x + w, y + h);
    grad.stop(0, '#030712');
    grad.stop(0.55, '#0B1020');
    grad.stop(1, '#111827');

    doc.roundedRect(x, y, w, h, 18).fill(grad);
    strokeNeon(doc, x, y, w, h, 18, '#7C3AED', 0.9);
    dottedPattern(doc, x + w - 86, y + 16, 66, 100, '#FF4FD8');

    doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#FDE68A')
        .text('EXELARIS', x + 14, y + 13, {
            width: w - 28,
            align: 'center',
            characterSpacing: 1.5
        });

    doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor('#C084FC')
        .text('BOLETO OFICIAL', x + 14, y + 29, {
            width: w - 28,
            align: 'center',
            characterSpacing: 1
        });

    doc
        .roundedRect(x + w - 76, y + 44, 58, 26, 8)
        .lineWidth(0.9)
        .strokeColor('#FDE68A')
        .stroke();

    doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#FDE68A')
        .text(limpiarTexto(boleto.categoriaNombre || boleto.tipo, 'GENERAL').toUpperCase(), x + w - 72, y + 53, {
            width: 50,
            align: 'center',
            ellipsis: true
        });

    doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor('#FFFFFF')
        .text(limpiarTexto(boleto.eventoNombre, 'EVENTO'), x + 14, y + 48, {
            width: w - 96,
            ellipsis: true
        });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#A855F7').text('FECHA', x + 14, y + 82);
    doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#FFFFFF').text(limpiarTexto(boleto.eventoFecha || lote.fechaEvento || lote.eventoFecha, '-'), x + 14, y + 93, { width: 93, ellipsis: true });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#A855F7').text('HORA', x + 114, y + 82);
    doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#FFFFFF').text(limpiarTexto(boleto.eventoHora || lote.horaEvento || lote.eventoHora, '-'), x + 114, y + 93, { width: 58, ellipsis: true });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#A855F7').text('LUGAR', x + 14, y + 113);
    doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#FFFFFF').text(limpiarTexto(boleto.eventoLugar || lote.eventoLugar, '-'), x + 14, y + 124, { width: w - 28, ellipsis: true });

    doc.roundedRect(x + 14, y + 146, w - 28, 42, 12).fillOpacity(0.25).fill('#020617').fillOpacity(1);

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FDE68A').text('TITULAR', x + 24, y + 155);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF');
    textFit(doc, boleto.nombre || 'PORTADOR', x + 24, y + 167, { width: w - 48 });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#A855F7').text('FOLIO', x + 14, y + 202);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#FFFFFF').text(limpiarTexto(boleto.folio, '-'), x + 14, y + 213, { width: 100, ellipsis: true });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#A855F7').text('PRECIO', x + 126, y + 202);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#FFFFFF').text(money(boleto.precio), x + 126, y + 213, { width: 78, ellipsis: true });

    const qrSize = 86;
    const qrX = x + w - qrSize - 18;
    const qrY = y + 232;

    doc.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 9).fill('#FFFFFF');
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc.roundedRect(qrX - 7, qrY - 7, qrSize + 14, qrSize + 14, 10).lineWidth(1.2).strokeColor('#FF4FD8').stroke();

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#A855F7').text('ESCANEA TU ACCESO', x + 16, y + 248, { width: 96 });
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#7C3AED').text('>>>', x + 16, y + 272);

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#94A3B8').text('ID UNICO', x + 14, y + 324, { width: w - 28, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(limpiarTexto(boleto.uuid || boleto.id, '-'), x + 14, y + 335, { width: w - 28, align: 'center', ellipsis: true });

    if (barcodeBuffer) {
        doc.roundedRect(x + 42, y + h - 32, w - 84, 20, 5).fill('#FFFFFF');
        doc.image(barcodeBuffer, x + 46, y + h - 29, {
            width: w - 92,
            height: 14
        });
    }

    if (lote?.puntoVenta) {
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#CBD5E1').text(`PV: ${limpiarTexto(lote.puntoVenta)}`, x + 14, y + h - 12, {
            width: w - 28,
            align: 'center',
            ellipsis: true
        });
    }
}

async function generarPDFLoteImpresion(loteId) {
    const loteRef = db.collection('lotes').doc(loteId);
    const loteDoc = await loteRef.get();

    if (!loteDoc.exists) {
        throw new Error('Lote no encontrado');
    }

    const lote = {
        id: loteDoc.id,
        ...serializar(loteDoc.data())
    };

    const boletosSnap = await db.collection('boletos').where('loteId', '==', loteId).get();

    if (boletosSnap.empty) {
        throw new Error('El lote no tiene boletos registrados');
    }

    const boletos = boletosSnap.docs
        .map(doc => ({
            id: doc.id,
            ...serializar(doc.data())
        }))
        .sort((a, b) => String(a.folio || '').localeCompare(String(b.folio || '')));

    const outDir = path.join(__dirname, '..', 'tmp');
    ensureDir(outDir);

    const filename = `LOTE_${safeFilename(loteId)}_IMPRESION_4XHOJA.pdf`;
    const rutaPDF = path.join(outDir, filename);

    const doc = new PDFDocument({
        size: 'LETTER',
        margin: 0,
        info: {
            Title: `Lote ${loteId} - Impresion`,
            Author: 'EXELARIS Tickets',
            Subject: 'PDF maestro de impresion'
        }
    });

    const stream = fs.createWriteStream(rutaPDF);
    doc.pipe(stream);

    const pageW = 612;
    const pageH = 792;
    const marginX = 24;
    const marginY = 24;
    const gapX = 18;
    const gapY = 18;

    const ticketW = (pageW - marginX * 2 - gapX) / 2;
    const ticketH = (pageH - marginY * 2 - gapY) / 2;

    for (let i = 0; i < boletos.length; i++) {
        if (i > 0 && i % 4 === 0) {
            doc.addPage();
        }

        const indexPage = i % 4;
        const col = indexPage % 2;
        const row = Math.floor(indexPage / 2);

        const x = marginX + col * (ticketW + gapX);
        const y = marginY + row * (ticketH + gapY);

        const boleto = boletos[i];

        const qrValor = limpiarTexto(boleto.uuid || boleto.id || boleto.folio);
        const qrBuffer = await crearQRBuffer(qrValor);
        const barcodeBuffer = await crearBarcodeBuffer(limpiarTexto(boleto.folio, qrValor));

        drawCompactTicket(doc, boleto, lote, qrBuffer, barcodeBuffer, x, y, ticketW, ticketH);
    }

    doc.end();

    return await new Promise((resolve, reject) => {
        stream.on('finish', () => resolve({ rutaPDF, filename, totalBoletos: boletos.length, lote }));
        stream.on('error', reject);
    });
}

router.get('/:loteId/pdf', async (req, res) => {
    try {
        const loteId = limpiarTexto(req.params.loteId);
        const resultado = await generarPDFLoteImpresion(loteId);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${resultado.filename}"`);

        const stream = fs.createReadStream(resultado.rutaPDF);
        stream.pipe(res);

        stream.on('close', () => {
            fs.unlink(resultado.rutaPDF, () => {});
        });

    } catch (error) {
        console.error('Error PDF impresion lote:', error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/:loteId/info', async (req, res) => {
    try {
        const loteId = limpiarTexto(req.params.loteId);
        const loteDoc = await db.collection('lotes').doc(loteId).get();

        if (!loteDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Lote no encontrado'
            });
        }

        const boletosSnap = await db.collection('boletos').where('loteId', '==', loteId).get();

        return res.json({
            success: true,
            lote: {
                id: loteDoc.id,
                ...serializar(loteDoc.data())
            },
            totalBoletos: boletosSnap.size,
            pdfUrl: `/api/lotes-impresion/${encodeURIComponent(loteId)}/pdf`
        });

    } catch (error) {
        console.error('Error info impresion lote:', error);

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
