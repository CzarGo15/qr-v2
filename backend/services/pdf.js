/*
====================================================
EXELARIS Tickets
Archivo: backend/services/pdf.js
Versión: 4.0 Premium

Objetivo:
- Boleto digital profesional para correo, WhatsApp e impresión.
- Compatible con el backend actual.
- Mantiene la misma firma: generarPDF(datos) => rutaPDF.
====================================================
*/

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const bwipjs = require('bwip-js');
const { imageSize } = require('image-size');

/*
====================================================
CONFIGURACIÓN GENERAL
====================================================
*/

const PAGE = {
    width: 390,
    height: 1040
};

const COLORS = {
    background: '#EEF2F7',
    navy: '#020617',
    dark: '#0F172A',
    black: '#111827',
    white: '#FFFFFF',
    muted: '#64748B',
    softText: '#94A3B8',
    border: '#E5E7EB',
    card: '#FFFFFF',
    cardSoft: '#F8FAFC',
    purple: '#7C3AED',
    purpleDark: '#5B21B6',
    blue: '#2563EB',
    gold: '#FACC15',
    goldDark: '#92400E',
    green: '#16A34A',
    red: '#DC2626'
};

/*
====================================================
UTILIDADES
====================================================
*/

function texto(valor, fallback = ''){
    if(valor === undefined || valor === null){
        return fallback;
    }

    return String(valor);
}

function precioMX(valor){
    const numero = Number(valor || 0);

    return numero.toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0
    });
}

function fechaMX(fecha){
    if(!fecha){
        return '';
    }

    try{
        const valor = String(fecha);

        /*
        Evita que fechas tipo 2026-10-31 se recorran un día
        por conversión UTC/local.
        */
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
        return texto(fecha);
    }
}

function tipoColor(tipo){
    return texto(tipo).toUpperCase() === 'VIP'
        ? COLORS.gold
        : COLORS.blue;
}

function tipoTextColor(tipo){
    return texto(tipo).toUpperCase() === 'VIP'
        ? COLORS.black
        : COLORS.white;
}

function drawShadow(doc, x, y, width, height, radius = 18){
    doc.save();
    doc.opacity(0.08);
    doc.fillColor('#000000');
    doc.roundedRect(x, y + 5, width, height, radius).fill();
    doc.restore();
}

function drawCard(doc, x, y, width, height, radius = 18, fill = COLORS.card){
    drawShadow(doc, x, y, width, height, radius);

    doc.save();
    doc.fillColor(fill);
    doc.roundedRect(x, y, width, height, radius).fill();
    doc.restore();
}

function drawDivider(doc, x1, y, x2){
    doc.save();
    doc.strokeColor(COLORS.border);
    doc.lineWidth(0.7);
    doc.moveTo(x1, y).lineTo(x2, y).stroke();
    doc.restore();
}

function drawLabelValue(doc, label, value, x, y, width, options = {}){
    doc.fillColor(options.labelColor || COLORS.muted)
        .font('Helvetica-Bold')
        .fontSize(options.labelSize || 7.5)
        .text(texto(label).toUpperCase(), x, y, {
            width,
            characterSpacing: 0.6
        });

    doc.fillColor(options.valueColor || COLORS.black)
        .font(options.valueFont || 'Helvetica-Bold')
        .fontSize(options.valueSize || 11)
        .text(texto(value, 'No disponible'), x, y + 13, {
            width,
            lineGap: 1
        });
}

function drawPill(doc, text, x, y, width, height, fillColor, textColor){
    doc.save();

    doc.roundedRect(x, y, width, height, height / 2)
        .fill(fillColor);

    doc.fillColor(textColor)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(texto(text).toUpperCase(), x, y + 7, {
            width,
            align: 'center'
        });

    doc.restore();
}

function drawSectionTitle(doc, title, x, y){
    doc.fillColor(COLORS.purple)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(texto(title).toUpperCase(), x, y, {
            characterSpacing: 1
        });
}

function drawDottedLine(doc, x, y, width){
    doc.save();

    doc.strokeColor('#CBD5E1');
    doc.lineWidth(1);
    doc.dash(4, { space: 5 });
    doc.moveTo(x, y).lineTo(x + width, y).stroke();
    doc.undash();

    doc.restore();
}

/*
====================================================
IMÁGENES
====================================================
*/

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

async function generarBarcode(textoCodigo){
    return await bwipjs.toBuffer({
        bcid: 'code128',
        text: texto(textoCodigo),
        scale: 2,
        height: 10,
        includetext: false
    });
}

/*
====================================================
BLOQUES VISUALES
====================================================
*/

function drawBackground(doc){
    const gradient = doc.linearGradient(0, 0, PAGE.width, PAGE.height);
    gradient.stop(0, '#F8FAFC');
    gradient.stop(0.52, '#EEF2FF');
    gradient.stop(1, '#E0F2FE');

    doc.rect(0, 0, PAGE.width, PAGE.height).fill(gradient);

    doc.save();
    doc.opacity(0.12);
    doc.circle(-60, 120, 170).fill(COLORS.purple);
    doc.circle(PAGE.width + 40, 530, 160).fill(COLORS.blue);
    doc.restore();
}

function drawHeader(doc, datos, flyer){
    const headerHeight = 255;

    if(flyer){
        dibujarCover(doc, flyer, 0, 0, PAGE.width, headerHeight);
    }else{
        const gradient = doc.linearGradient(0, 0, PAGE.width, headerHeight);
        gradient.stop(0, COLORS.dark);
        gradient.stop(1, COLORS.purpleDark);

        doc.rect(0, 0, PAGE.width, headerHeight).fill(gradient);
    }

    doc.save();
    doc.opacity(0.58);
    doc.rect(0, 0, PAGE.width, headerHeight).fill('#000000');
    doc.restore();

    doc.save();

    doc.roundedRect(18, 18, 38, 38, 13).fill(COLORS.white);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(20)
        .text('E', 31, 25);

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('EXELARIS', 66, 18);

    doc.fillColor('#CBD5E1')
        .font('Helvetica')
        .fontSize(7)
        .text('EVENT MANAGEMENT', 66, 37, {
            characterSpacing: 1.3
        });

    drawPill(
        doc,
        'BOLETO OFICIAL',
        246,
        20,
        126,
        30,
        COLORS.white,
        COLORS.black
    );

    drawPill(
        doc,
        texto(datos.tipo, 'GENERAL'),
        18,
        82,
        92,
        30,
        tipoColor(datos.tipo),
        tipoTextColor(datos.tipo)
    );

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(33)
        .text(texto(datos.eventoNombre, 'Evento EXELARIS'), 18, 122, {
            width: 320,
            lineGap: -2
        });

    doc.fillColor('#E5E7EB')
        .font('Helvetica')
        .fontSize(11)
        .text(`${fechaMX(datos.eventoFecha)} · ${texto(datos.eventoHora)}`, 20, 205, {
            width: 310
        });

    doc.fillColor('#CBD5E1')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(texto(datos.eventoCiudad), 20, 225, {
            width: 310,
            characterSpacing: 0.5
        });

    doc.restore();

    const barGradient = doc.linearGradient(0, headerHeight - 5, PAGE.width, headerHeight - 5);
    barGradient.stop(0, COLORS.purple);
    barGradient.stop(0.55, COLORS.blue);
    barGradient.stop(1, COLORS.gold);

    doc.rect(0, headerHeight - 5, PAGE.width, 5).fill(barGradient);
}

function drawEventInfo(doc, datos){
    const x = 18;
    const y = 275;
    const width = 354;
    const height = 145;

    drawCard(doc, x, y, width, height, 22);

    drawSectionTitle(doc, 'Información del evento', x + 20, y + 18);

    drawDivider(doc, x + 20, y + 42, x + width - 20);

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
        texto(datos.eventoHora, 'No disponible'),
        x + 190,
        y + 58,
        135
    );

    drawLabelValue(
        doc,
        'Lugar',
        texto(datos.eventoLugar, 'No disponible'),
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
        `${texto(datos.eventoDireccion)} ${texto(datos.eventoCiudad)}`,
        x + 190,
        y + 98,
        140,
        {
            valueSize: 9.5,
            valueFont: 'Helvetica'
        }
    );
}

function drawHolder(doc, datos){
    const x = 18;
    const y = 438;
    const width = 354;
    const height = 108;

    drawCard(doc, x, y, width, height, 22, COLORS.cardSoft);

    drawSectionTitle(doc, 'Titular del boleto', x + 20, y + 18);

    drawPill(
        doc,
        texto(datos.tipo, 'GENERAL'),
        x + width - 104,
        y + 16,
        84,
        28,
        tipoColor(datos.tipo),
        tipoTextColor(datos.tipo)
    );

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(22)
        .text(texto(datos.nombre, 'SIN NOMBRE'), x + 20, y + 52, {
            width: 300,
            lineGap: -1
        });

    doc.fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(8.5)
        .text('Este nombre será utilizado para identificar el acceso en validación.', x + 20, y + 86, {
            width: 300
        });
}

function drawPurchaseSummary(doc, datos){
    const x = 18;
    const y = 565;
    const width = 354;
    const height = 78;

    drawCard(doc, x, y, width, height, 20);

    drawLabelValue(
        doc,
        'Folio',
        texto(datos.folio, 'EXL-000000'),
        x + 20,
        y + 20,
        145,
        {
            valueSize: 13
        }
    );

    doc.save();
    doc.strokeColor(COLORS.border);
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
    const y = 665;
    const width = 354;
    const height = 315;

    drawCard(doc, x, y, width, height, 24);

    drawSectionTitle(doc, 'Acceso al evento', x + 20, y + 18);

    doc.fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(8.5)
        .text('Presenta este QR en la entrada. Válido para una sola lectura.', x + 20, y + 35, {
            width: 300
        });

    drawDottedLine(doc, x + 20, y + 58, width - 40);

    const qrBase64 = texto(datos.qr).replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(qrBase64, 'base64');

    doc.save();
    doc.roundedRect(108, y + 76, 174, 174, 22).fill('#F8FAFC');
    doc.roundedRect(116, y + 84, 158, 158, 18).fill(COLORS.white);
    doc.image(qrBuffer, 126, y + 94, {
        width: 138,
        height: 138
    });
    doc.restore();

    doc.image(barcode, 74, y + 240, {
        width: 242,
        height: 26
    });

    drawPill(
        doc,
        'QR ÚNICO',
        139,
        y + 267,
        112,
        26,
        COLORS.green,
        COLORS.white
    );

    doc.fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(7)
        .text(texto(datos.uuid), x + 24, y + 298, {
            width: width - 48,
            align: 'center'
        });
}

function drawWarning(doc){
    const x = 18;
    const y = 990;
    const width = 354;
    const height = 34;

    doc.save();

    doc.roundedRect(x, y, width, height, 14)
        .fill('#FFFBEB');

    doc.fillColor(COLORS.goldDark)
        .font('Helvetica-Bold')
        .fontSize(7.7)
        .text('No compartas este boleto públicamente. El QR solo puede usarse una vez.', x + 16, y + 10, {
            width: width - 32,
            align: 'center'
        });

    doc.restore();
}

function drawFooter(doc){
    const footerY = PAGE.height - 1;

    const footerGradient = doc.linearGradient(0, footerY - 8, PAGE.width, footerY - 8);
    footerGradient.stop(0, COLORS.purple);
    footerGradient.stop(0.5, COLORS.blue);
    footerGradient.stop(1, COLORS.gold);

    doc.rect(0, footerY - 8, PAGE.width, 8).fill(footerGradient);

    doc.fillColor('#64748B')
        .font('Helvetica')
        .fontSize(6)
        .text(`EXELARIS Ticket System v4.0 · ${new Date().getFullYear()}`, 18, PAGE.height - 20, {
            width: PAGE.width - 36,
            align: 'center'
        });
}

/*
====================================================
GENERAR PDF
====================================================
*/

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
                size: [PAGE.width, PAGE.height],
                margin: 0,
                info: {
                    Title: texto(datos.eventoNombre, 'Boleto EXELARIS'),
                    Author: 'EXELARIS',
                    Subject: 'Boleto Digital',
                    Creator: 'EXELARIS EVENTOS'
                }
            });

            const stream = fs.createWriteStream(rutaPDF);

            stream.on('finish', () => {
                console.log(`✅ PDF generado: ${rutaPDF}`);
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
            drawPurchaseSummary(doc, datos);
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
