/*
====================================================
EXELARIS Tickets
Archivo: backend/services/pdf.js
Versión: 4.1 Premium

IMPORTANTE:
Al generar un boleto nuevo, en logs de Render debe aparecer:
✅ PDF Premium v4.1 generado

Y en el pie del boleto debe aparecer:
EXELARIS Ticket System v4.1
====================================================
*/

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const bwipjs = require('bwip-js');
const { imageSize } = require('image-size');

const PAGE = {
    width: 390,
    height: 1040
};

const COLORS = {
    bg: '#EEF2F7',
    navy: '#020617',
    dark: '#0F172A',
    white: '#FFFFFF',
    black: '#111827',
    gray: '#64748B',
    lightGray: '#E5E7EB',
    soft: '#F8FAFC',
    purple: '#7C3AED',
    purpleDark: '#5B21B6',
    blue: '#2563EB',
    gold: '#FACC15',
    green: '#16A34A',
    amberBg: '#FFFBEB',
    amberText: '#92400E'
};

function safeText(value, fallback = ''){
    if(value === undefined || value === null || value === ''){
        return fallback;
    }

    return String(value);
}

function fechaMX(fecha){
    if(!fecha){
        return '';
    }

    try{
        const valor = String(fecha);

        if(/^\d{4}-\d{2}-\d{2}$/.test(valor)){
            const [year, month, day] = valor.split('-').map(Number);

            return new Date(year, month - 1, day)
                .toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });
        }

        return new Date(valor)
            .toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

    }catch(error){
        return safeText(fecha);
    }
}

function precioMX(valor){
    const numero = Number(valor || 0);

    return numero.toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0
    });
}

function esVIP(tipo){
    return safeText(tipo).toUpperCase() === 'VIP';
}

function colorTipo(tipo){
    return esVIP(tipo) ? COLORS.gold : COLORS.blue;
}

function colorTextoTipo(tipo){
    return esVIP(tipo) ? COLORS.black : COLORS.white;
}

function drawShadow(doc, x, y, width, height, radius){
    doc.save();
    doc.opacity(0.08);
    doc.fillColor('#000000');
    doc.roundedRect(x, y + 6, width, height, radius).fill();
    doc.restore();
}

function drawCard(doc, x, y, width, height, radius = 22, color = COLORS.white){
    drawShadow(doc, x, y, width, height, radius);

    doc.save();
    doc.fillColor(color);
    doc.roundedRect(x, y, width, height, radius).fill();
    doc.restore();
}

function drawDivider(doc, x, y, width){
    doc.save();
    doc.strokeColor(COLORS.lightGray);
    doc.lineWidth(0.7);
    doc.moveTo(x, y).lineTo(x + width, y).stroke();
    doc.restore();
}

function drawPill(doc, text, x, y, width, height, fillColor, textColor){
    doc.save();

    doc.roundedRect(x, y, width, height, height / 2).fill(fillColor);

    doc.fillColor(textColor)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(safeText(text).toUpperCase(), x, y + 7, {
            width,
            align: 'center'
        });

    doc.restore();
}

function drawSectionTitle(doc, text, x, y){
    doc.fillColor(COLORS.purple)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(safeText(text).toUpperCase(), x, y, {
            characterSpacing: 1
        });
}

function drawLabelValue(doc, label, value, x, y, width, options = {}){
    doc.fillColor(options.labelColor || COLORS.gray)
        .font('Helvetica-Bold')
        .fontSize(options.labelSize || 7.4)
        .text(safeText(label).toUpperCase(), x, y, {
            width,
            characterSpacing: 0.6
        });

    doc.fillColor(options.valueColor || COLORS.black)
        .font(options.valueFont || 'Helvetica-Bold')
        .fontSize(options.valueSize || 11)
        .text(safeText(value, 'No disponible'), x, y + 13, {
            width,
            lineGap: 1
        });
}

function dottedLine(doc, x, y, width){
    doc.save();
    doc.strokeColor('#CBD5E1');
    doc.lineWidth(1);
    doc.dash(4, { space: 5 });
    doc.moveTo(x, y).lineTo(x + width, y).stroke();
    doc.undash();
    doc.restore();
}

async function descargarImagen(url){
    try{
        if(!url){
            return null;
        }

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000
        });

        const buffer = Buffer.from(response.data);
        const dimensions = imageSize(buffer);

        return {
            buffer,
            width: dimensions.width,
            height: dimensions.height
        };

    }catch(error){
        console.log('Imagen no disponible');
        return null;
    }
}

function dibujarCover(doc, image, x, y, width, height){
    const scale = Math.max(
        width / image.width,
        height / image.height
    );

    const newWidth = image.width * scale;
    const newHeight = image.height * scale;

    const posX = x - ((newWidth - width) / 2);
    const posY = y - ((newHeight - height) / 2);

    doc.save();
    doc.rect(x, y, width, height).clip();

    doc.image(image.buffer, posX, posY, {
        width: newWidth,
        height: newHeight
    });

    doc.restore();
}

async function generarBarcode(texto){
    return await bwipjs.toBuffer({
        bcid: 'code128',
        text: safeText(texto),
        scale: 2,
        height: 10,
        includetext: false
    });
}

function drawBackground(doc){
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.bg);

    doc.save();
    doc.opacity(0.11);
    doc.circle(-40, 130, 145).fill(COLORS.purple);
    doc.circle(PAGE.width + 35, 600, 160).fill(COLORS.blue);
    doc.restore();
}

function drawHeader(doc, datos, flyer){
    const headerHeight = 268;

    if(flyer){
        dibujarCover(doc, flyer, 0, 0, PAGE.width, headerHeight);
    }else{
        const g = doc.linearGradient(0, 0, PAGE.width, headerHeight);
        g.stop(0, COLORS.navy);
        g.stop(1, COLORS.purpleDark);
        doc.rect(0, 0, PAGE.width, headerHeight).fill(g);
    }

    doc.save();
    doc.opacity(0.62);
    doc.rect(0, 0, PAGE.width, headerHeight).fill('#000000');
    doc.restore();

    doc.save();

    doc.roundedRect(18, 18, 40, 40, 14).fill(COLORS.white);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(21)
        .text('E', 31, 26);

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(17)
        .text('EXELARIS', 68, 19);

    doc.fillColor('#CBD5E1')
        .font('Helvetica')
        .fontSize(7)
        .text('EVENT MANAGEMENT', 68, 39, {
            characterSpacing: 1.3
        });

    drawPill(
        doc,
        'Boleto oficial',
        246,
        22,
        126,
        30,
        COLORS.white,
        COLORS.black
    );

    drawPill(
        doc,
        safeText(datos.tipo, 'General'),
        18,
        90,
        92,
        30,
        colorTipo(datos.tipo),
        colorTextoTipo(datos.tipo)
    );

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(34)
        .text(safeText(datos.eventoNombre, 'Evento EXELARIS'), 18, 133, {
            width: 315,
            lineGap: -2
        });

    doc.fillColor('#E5E7EB')
        .font('Helvetica')
        .fontSize(11)
        .text(`${fechaMX(datos.eventoFecha)} · ${safeText(datos.eventoHora)}`, 20, 218, {
            width: 310
        });

    doc.fillColor('#CBD5E1')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(safeText(datos.eventoCiudad), 20, 238, {
            width: 310,
            characterSpacing: 0.5
        });

    doc.restore();

    const g = doc.linearGradient(0, headerHeight - 6, PAGE.width, headerHeight - 6);
    g.stop(0, COLORS.purple);
    g.stop(0.55, COLORS.blue);
    g.stop(1, COLORS.gold);

    doc.rect(0, headerHeight - 6, PAGE.width, 6).fill(g);
}

function drawEventInfo(doc, datos){
    const x = 18;
    const y = 288;
    const width = 354;
    const height = 145;

    drawCard(doc, x, y, width, height);

    drawSectionTitle(doc, 'Información del evento', x + 20, y + 18);
    drawDivider(doc, x + 20, y + 42, width - 40);

    drawLabelValue(
        doc,
        'Fecha',
        fechaMX(datos.eventoFecha),
        x + 20,
        y + 58,
        145
    );

    drawLabelValue(
        doc,
        'Hora',
        safeText(datos.eventoHora, 'No disponible'),
        x + 190,
        y + 58,
        130
    );

    drawLabelValue(
        doc,
        'Lugar',
        safeText(datos.eventoLugar, 'No disponible'),
        x + 20,
        y + 98,
        145,
        {
            valueSize: 10
        }
    );

    drawLabelValue(
        doc,
        'Dirección',
        `${safeText(datos.eventoDireccion)} ${safeText(datos.eventoCiudad)}`,
        x + 190,
        y + 98,
        140,
        {
            valueSize: 9,
            valueFont: 'Helvetica'
        }
    );
}

function drawHolder(doc, datos){
    const x = 18;
    const y = 452;
    const width = 354;
    const height = 110;

    drawCard(doc, x, y, width, height, 22, COLORS.soft);

    drawSectionTitle(doc, 'Titular del boleto', x + 20, y + 18);

    drawPill(
        doc,
        safeText(datos.tipo, 'General'),
        x + width - 104,
        y + 16,
        84,
        28,
        colorTipo(datos.tipo),
        colorTextoTipo(datos.tipo)
    );

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(22)
        .text(safeText(datos.nombre, 'SIN NOMBRE'), x + 20, y + 53, {
            width: 300,
            lineGap: -1
        });

    doc.fillColor(COLORS.gray)
        .font('Helvetica')
        .fontSize(8.5)
        .text('Identificación del titular para control de acceso.', x + 20, y + 88, {
            width: 300
        });
}

function drawSummary(doc, datos){
    const x = 18;
    const y = 584;
    const width = 354;
    const height = 78;

    drawCard(doc, x, y, width, height, 20);

    drawLabelValue(
        doc,
        'Folio',
        safeText(datos.folio, 'EXL-000000'),
        x + 20,
        y + 20,
        145,
        {
            valueSize: 13
        }
    );

    doc.save();
    doc.strokeColor(COLORS.lightGray);
    doc.lineWidth(0.8);
    doc.moveTo(x + 177, y + 18).lineTo(x + 177, y + height - 18).stroke();
    doc.restore();

    drawLabelValue(
        doc,
        'Precio',
        precioMX(datos.precio),
        x + 200,
        y + 20,
        130,
        {
            valueSize: 13
        }
    );
}

function drawAccess(doc, datos, barcode){
    const x = 18;
    const y = 682;
    const width = 354;
    const height = 300;

    drawCard(doc, x, y, width, height, 24);

    drawSectionTitle(doc, 'Acceso al evento', x + 20, y + 18);

    doc.fillColor(COLORS.gray)
        .font('Helvetica')
        .fontSize(8.5)
        .text('Presenta este QR en la entrada. Válido para una sola lectura.', x + 20, y + 35, {
            width: 300
        });

    dottedLine(doc, x + 20, y + 58, width - 40);

    const qrBase64 = safeText(datos.qr).replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(qrBase64, 'base64');

    doc.save();
    doc.roundedRect(111, y + 76, 168, 168, 22).fill(COLORS.soft);
    doc.roundedRect(120, y + 85, 150, 150, 18).fill(COLORS.white);

    doc.image(qrBuffer, 130, y + 95, {
        width: 130,
        height: 130
    });
    doc.restore();

    doc.image(barcode, 72, y + 250, {
        width: 246,
        height: 26
    });

    doc.fillColor(COLORS.gray)
        .font('Helvetica')
        .fontSize(7)
        .text(safeText(datos.uuid), x + 24, y + 280, {
            width: width - 48,
            align: 'center'
        });
}

function drawWarning(doc){
    const x = 18;
    const y = 996;
    const width = 354;
    const height = 30;

    doc.save();
    doc.roundedRect(x, y, width, height, 13).fill(COLORS.amberBg);

    doc.fillColor(COLORS.amberText)
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text('No compartas este boleto públicamente. El QR solo puede usarse una vez.', x + 16, y + 9, {
            width: width - 32,
            align: 'center'
        });

    doc.restore();
}

function drawFooter(doc){
    const y = PAGE.height - 8;

    const g = doc.linearGradient(0, y, PAGE.width, y);
    g.stop(0, COLORS.purple);
    g.stop(0.5, COLORS.blue);
    g.stop(1, COLORS.gold);

    doc.rect(0, y, PAGE.width, 8).fill(g);

    doc.fillColor('#64748B')
        .font('Helvetica')
        .fontSize(6)
        .text(`EXELARIS Ticket System v4.1 · ${new Date().getFullYear()}`, 18, PAGE.height - 23, {
            width: PAGE.width - 36,
            align: 'center'
        });
}

async function generarPDF(datos){
    return new Promise(async(resolve, reject) => {
        try{
            const carpeta = path.join(__dirname, '../pdfs');

            if(!fs.existsSync(carpeta)){
                fs.mkdirSync(carpeta, {
                    recursive: true
                });
            }

            const rutaPDF = path.join(
                carpeta,
                `boleto-${datos.folio}.pdf`
            );

            const doc = new PDFDocument({
                size: [
                    PAGE.width,
                    PAGE.height
                ],
                margin: 0,
                info: {
                    Title: safeText(datos.eventoNombre, 'Boleto EXELARIS'),
                    Author: 'EXELARIS',
                    Subject: 'Boleto Digital',
                    Creator: 'EXELARIS EVENTOS'
                }
            });

            const stream = fs.createWriteStream(rutaPDF);

            stream.on('finish', () => {
                console.log(`✅ PDF Premium v4.1 generado: ${rutaPDF}`);
                resolve(rutaPDF);
            });

            stream.on('error', error => {
                console.error('❌ Error Stream PDF:', error);
                reject(error);
            });

            doc.pipe(stream);

            const flyer = await descargarImagen(datos.eventoFlyer);
            const barcode = await generarBarcode(datos.uuid);

            drawBackground(doc);
            drawHeader(doc, datos, flyer);
            drawEventInfo(doc, datos);
            drawHolder(doc, datos);
            drawSummary(doc, datos);
            drawAccess(doc, datos, barcode);
            drawWarning(doc);
            drawFooter(doc);

            doc.end();

        }catch(error){
            console.error('❌ Error PDF:', error);
            reject(error);
        }
    });
}

module.exports = generarPDF;
