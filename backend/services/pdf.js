/*
====================================================
EXELARIS Tickets
Archivo: backend/services/pdf.js
Diseño final de boleto premium / retro neon
Requiere:
npm install pdfkit qrcode bwip-js
====================================================
*/

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');

/*
====================================================
Utilidades
====================================================
*/

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

function hexToRgb(hex) {
    const limpio = String(hex || '').replace('#', '');

    return [
        parseInt(limpio.substring(0, 2), 16),
        parseInt(limpio.substring(2, 4), 16),
        parseInt(limpio.substring(4, 6), 16)
    ];
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function safeFilename(nombre) {
    return String(nombre || 'boleto')
        .replace(/[^a-zA-Z0-9-_]/g, '_');
}

function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        if (!url || !/^https?:\/\//i.test(url)) {
            return resolve(null);
        }

        const client = url.startsWith('https') ? https : http;

        const req = client.get(url, response => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return resolve(downloadBuffer(response.headers.location));
            }

            if (response.statusCode !== 200) {
                response.resume();
                return resolve(null);
            }

            const chunks = [];

            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

async function crearQRBuffer(valor) {
    return await QRCode.toBuffer(valor, {
        type: 'png',
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 520,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });
}

async function crearBarcodeBuffer(valor) {
    return await bwipjs.toBuffer({
        bcid: 'code128',
        text: valor,
        scale: 3,
        height: 12,
        includetext: false,
        backgroundcolor: 'FFFFFF',
        barcolor: '000000'
    });
}

/*
====================================================
Dibujo base
====================================================
*/

function roundedGradientCard(doc, x, y, w, h, radius, colorA, colorB) {
    const grad = doc.linearGradient(x, y, x + w, y + h);

    grad.stop(0, colorA);
    grad.stop(1, colorB);

    doc
        .roundedRect(x, y, w, h, radius)
        .fill(grad);
}

function strokeNeon(doc, x, y, w, h, radius, color, width = 1.2) {
    doc
        .save()
        .roundedRect(x, y, w, h, radius)
        .lineWidth(width + 2.5)
        .strokeOpacity(0.13)
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
    doc.fillColor(color).opacity(0.18);

    for (let yy = y; yy < y + h; yy += 11) {
        for (let xx = x; xx < x + w; xx += 11) {
            doc.circle(xx, yy, 1.1).fill();
        }
    }

    doc.restore();
}

function textLabel(doc, label, value, x, y, w) {
    doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#A855F7')
        .text(String(label || '').toUpperCase(), x, y, { width: w });

    doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#FFFFFF')
        .text(limpiarTexto(value, '-'), x, y + 14, { width: w, lineGap: 1 });
}

function smallIconBox(doc, x, y, label) {
    doc
        .save()
        .roundedRect(x, y, 34, 34, 17)
        .lineWidth(1.2)
        .strokeColor('#A855F7')
        .strokeOpacity(0.9)
        .stroke();

    doc
        .font('Helvetica-Bold')
        .fontSize(15)
        .fillColor('#C084FC')
        .text(label, x, y + 9, {
            width: 34,
            align: 'center'
        });

    doc.restore();
}

function drawCutouts(doc, pageW, y) {
    doc.save();
    doc.fillColor('#FFFFFF');
    doc.circle(0, y, 16).fill();
    doc.circle(pageW, y, 16).fill();
    doc.restore();
}

function drawHeader(doc, data, flyerBuffer) {
    const pageW = doc.page.width;
    const margin = 26;
    const x = margin;
    const y = 24;
    const w = pageW - margin * 2;
    const h = 190;

    roundedGradientCard(doc, x, y, w, h, 28, '#070816', '#14162F');

    if (flyerBuffer) {
        try {
            doc.save();
            doc.roundedRect(x, y, w, h, 28).clip();
            doc.image(flyerBuffer, x, y, {
                width: w,
                height: h,
                fit: [w, h],
                align: 'center',
                valign: 'center'
            });
            doc.rect(x, y, w, h).fillOpacity(0.45).fill('#000000');
            doc.restore();
        } catch (e) {
            dottedPattern(doc, x + 20, y + 26, w - 40, h - 52);
        }
    } else {
        dottedPattern(doc, x + 20, y + 26, w - 40, h - 52);
    }

    strokeNeon(doc, x, y, w, h, 28, '#A855F7');

    doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#FDE68A')
        .text('EXELARIS', x + 26, y + 24, {
            width: w - 52,
            align: 'center'
        });

    doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#FDE68A')
        .text('EVENT MANAGEMENT', x + 26, y + 50, {
            width: w - 52,
            align: 'center',
            characterSpacing: 2
        });

    doc
        .font('Helvetica-Bold')
        .fontSize(17)
        .fillColor('#FF4FD8')
        .text(limpiarTexto(data.eventoNombre, 'EVENTO'), x + 25, y + 85, {
            width: w - 50,
            align: 'center'
        });

    doc
        .font('Helvetica-Bold')
        .fontSize(34)
        .fillColor('#FFFFFF')
        .text(limpiarTexto(data.tituloPrincipal, 'FIESTA RETRO'), x + 22, y + 112, {
            width: w - 44,
            align: 'center'
        });

    doc
        .roundedRect(x + w - 92, y + 20, 68, 48, 14)
        .lineWidth(1.4)
        .strokeColor('#FDE68A')
        .stroke();

    doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#FDE68A')
        .text(limpiarTexto(data.tipo, 'GENERAL').toUpperCase(), x + w - 86, y + 34, {
            width: 56,
            align: 'center'
        });
}

function drawEventDetails(doc, data, y) {
    const pageW = doc.page.width;
    const margin = 34;
    const x = margin;
    const w = pageW - margin * 2;
    const h = 150;

    roundedGradientCard(doc, x, y, w, h, 20, '#0B1020', '#111827');
    strokeNeon(doc, x, y, w, h, 20, '#7C3AED');

    doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#FDE68A')
        .text('DETALLES DEL EVENTO', x, y + 14, {
            width: w,
            align: 'center'
        });

    doc
        .moveTo(x + 18, y + 48)
        .lineTo(x + w - 18, y + 48)
        .lineWidth(0.5)
        .strokeColor('#334155')
        .stroke();

    const col1 = x + 22;
    const col2 = x + 226;

    smallIconBox(doc, col1, y + 60, 'F');
    textLabel(doc, 'Fecha', data.eventoFecha, col1 + 46, y + 59, 140);

    smallIconBox(doc, col2, y + 60, 'H');
    textLabel(doc, 'Hora', data.eventoHora, col2 + 46, y + 59, 135);

    smallIconBox(doc, col1, y + 106, 'L');
    textLabel(doc, 'Lugar', data.eventoLugar, col1 + 46, y + 105, 160);

    smallIconBox(doc, col2, y + 106, 'C');
    textLabel(doc, 'Ciudad', data.eventoCiudad, col2 + 46, y + 105, 135);
}

function drawOwner(doc, data, y) {
    const pageW = doc.page.width;
    const margin = 34;
    const x = margin;
    const w = pageW - margin * 2;
    const h = 70;

    roundedGradientCard(doc, x, y, w, h, 18, '#070B16', '#111827');
    strokeNeon(doc, x, y, w, h, 18, '#FDE68A', 1);

    doc
        .circle(x + 38, y + 35, 22)
        .lineWidth(1)
        .strokeColor('#FDE68A')
        .stroke();

    doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#FDE68A')
        .text('ID', x + 23, y + 26, {
            width: 30,
            align: 'center'
        });

    doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#FDE68A')
        .text('TITULAR DEL BOLETO', x + 78, y + 16);

    doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#FFFFFF')
        .text(limpiarTexto(data.nombre, 'PORTADOR'), x + 78, y + 34, {
            width: w - 96,
            ellipsis: true
        });
}

function drawFolioPrice(doc, data, y) {
    const pageW = doc.page.width;
    const margin = 34;
    const x = margin;
    const w = pageW - margin * 2;
    const h = 62;

    roundedGradientCard(doc, x, y, w, h, 16, '#0B1020', '#111827');
    strokeNeon(doc, x, y, w, h, 16, '#7C3AED');

    doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#A855F7')
        .text('FOLIO', x + 26, y + 13);

    doc
        .font('Helvetica-Bold')
        .fontSize(17)
        .fillColor('#FFFFFF')
        .text(limpiarTexto(data.folio, 'EXL-000000'), x + 26, y + 30);

    doc
        .moveTo(x + w / 2, y + 13)
        .lineTo(x + w / 2, y + h - 13)
        .lineWidth(0.5)
        .strokeColor('#334155')
        .stroke();

    doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#A855F7')
        .text('PRECIO', x + w / 2 + 26, y + 13);

    doc
        .font('Helvetica-Bold')
        .fontSize(17)
        .fillColor('#FFFFFF')
        .text(money(data.precio), x + w / 2 + 26, y + 30);
}

function drawQRSection(doc, data, qrBuffer, barcodeBuffer, y) {
    const pageW = doc.page.width;
    const margin = 34;
    const x = margin;
    const w = pageW - margin * 2;
    const h = 208;

    roundedGradientCard(doc, x, y, w, h, 20, '#070B16', '#0B1020');
    strokeNeon(doc, x, y, w, h, 20, '#2563EB');
    dottedPattern(doc, x + 14, y + 18, 120, h - 36, '#2563EB');
    dottedPattern(doc, x + w - 120, y + 18, 106, h - 36, '#FF4FD8');

    doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#A855F7')
        .text('ESCANEA', x + 34, y + 72);

    doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#A855F7')
        .text('TU ACCESO', x + 34, y + 90);

    doc
        .font('Helvetica-Bold')
        .fontSize(25)
        .fillColor('#7C3AED')
        .text('>>>', x + 34, y + 118);

    const qrSize = 116;
    const qrX = x + (w - qrSize) / 2;
    const qrY = y + 20;

    doc
        .roundedRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 12)
        .fill('#FFFFFF');

    doc.image(qrBuffer, qrX, qrY, {
        width: qrSize,
        height: qrSize
    });

    doc
        .roundedRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 13)
        .lineWidth(2)
        .strokeColor('#FF4FD8')
        .stroke();

    doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#A855F7')
        .text('ID UNICO DE ACCESO', x, y + 148, {
            width: w,
            align: 'center'
        });

    doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#FFFFFF')
        .text(limpiarTexto(data.uuid, '-'), x, y + 162, {
            width: w,
            align: 'center',
            characterSpacing: 1
        });

    if (barcodeBuffer) {
        doc
            .roundedRect(x + 95, y + 184, w - 190, 32, 7)
            .fill('#FFFFFF');

        doc.image(barcodeBuffer, x + 100, y + 188, {
            width: w - 200,
            height: 22
        });
    }
}

function drawFooter(doc, data, y) {
    const pageW = doc.page.width;
    const margin = 34;
    const x = margin;
    const w = pageW - margin * 2;
    const h = 56;

    roundedGradientCard(doc, x, y, w, h, 16, '#0B1020', '#111827');
    strokeNeon(doc, x, y, w, h, 16, '#7C3AED');

    doc
        .roundedRect(x + 18, y + 13, 30, 30, 9)
        .lineWidth(1.2)
        .strokeColor('#FDE68A')
        .stroke();

    doc
        .font('Helvetica-Bold')
        .fontSize(19)
        .fillColor('#FDE68A')
        .text('OK', x + 18, y + 20, {
            width: 30,
            align: 'center'
        });

    doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#FDE68A')
        .text('BOLETO OFICIAL Y VALIDO', x + 62, y + 12);

    doc
        .font('Helvetica')
        .fontSize(8.6)
        .fillColor('#E5E7EB')
        .text('Este boleto es unico e intransferible. Presentalo completo para ingresar al evento.', x + 62, y + 29, {
            width: w - 80
        });
}

/*
====================================================
Función principal
====================================================
*/

async function generarPDF(datos = {}) {
    const folio = limpiarTexto(datos.folio, `EXL-${Date.now()}`);
    const uuid = limpiarTexto(datos.uuid, folio);

    const outDir = path.join(__dirname, '..', 'tmp');
    ensureDir(outDir);

    const rutaPDF = path.join(outDir, `${safeFilename(folio)}.pdf`);

    const data = {
        nombre: limpiarTexto(datos.nombre, 'PORTADOR'),
        correo: limpiarTexto(datos.correo),
        telefono: limpiarTexto(datos.telefono),

        folio,
        uuid,
        tipo: limpiarTexto(datos.tipo || datos.categoriaNombre, 'GENERAL'),
        precio: Number(datos.precio || 0),

        eventoNombre: limpiarTexto(datos.eventoNombre, 'EXELARIS EVENTO'),
        tituloPrincipal: limpiarTexto(datos.eventoNombre, 'FIESTA RETRO'),
        eventoFecha: limpiarTexto(datos.eventoFecha || datos.fecha, '31 Octubre 2026'),
        eventoHora: limpiarTexto(datos.eventoHora || datos.hora, '20:00 HRS'),
        eventoLugar: limpiarTexto(datos.eventoLugar || datos.lugar, 'Salon SUTERM'),
        eventoDireccion: limpiarTexto(datos.eventoDireccion || datos.direccion, ''),
        eventoCiudad: limpiarTexto(datos.eventoCiudad || datos.ciudad, 'Coatzacoalcos'),
        eventoFlyer: limpiarTexto(datos.eventoFlyer || datos.flyer, '')
    };

    const qrValor = limpiarTexto(datos.qr, uuid);
    const qrBuffer = await crearQRBuffer(qrValor);
    const barcodeBuffer = await crearBarcodeBuffer(folio);
    const flyerBuffer = await downloadBuffer(data.eventoFlyer);

    /*
    Tamaño vertical tipo boleto.
    420 x 760 pt aprox.
    */
    const doc = new PDFDocument({
        size: [420, 760],
        margin: 0,
        info: {
            Title: `Boleto ${folio}`,
            Author: 'EXELARIS Tickets',
            Subject: data.eventoNombre
        }
    });

    const stream = fs.createWriteStream(rutaPDF);
    doc.pipe(stream);

    /*
    Fondo
    */
    const bg = doc.linearGradient(0, 0, 420, 760);
    bg.stop(0, '#030712');
    bg.stop(0.48, '#081026');
    bg.stop(1, '#020617');

    doc.rect(0, 0, 420, 760).fill(bg);

    /*
    Luz decorativa superior/inferior
    */
    doc.save();
    doc.circle(78, 120, 88).fillOpacity(0.18).fill('#7C3AED');
    doc.circle(342, 158, 96).fillOpacity(0.14).fill('#2563EB');
    doc.circle(330, 520, 108).fillOpacity(0.12).fill('#FF4FD8');
    doc.restore();

    /*
    Boleto principal con borde exterior.
    */
    doc
        .roundedRect(14, 12, 392, 736, 30)
        .lineWidth(1.1)
        .strokeOpacity(0.55)
        .strokeColor('#334155')
        .stroke();

    drawHeader(doc, data, flyerBuffer);
    drawEventDetails(doc, data, 230);
    drawOwner(doc, data, 392);
    drawFolioPrice(doc, data, 474);
    drawCutouts(doc, 420, 552);
    drawQRSection(doc, data, qrBuffer, barcodeBuffer, 548);
    drawFooter(doc, data, 694);

    doc.end();

    return await new Promise((resolve, reject) => {
        stream.on('finish', () => resolve(rutaPDF));
        stream.on('error', reject);
    });
}

module.exports = generarPDF;
