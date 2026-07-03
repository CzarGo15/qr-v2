/*
====================================================
EXELARIS Tickets
Archivo: backend/services/pdf.js
Versión: Premium Final

Diseño:
- Boleto vertical premium tipo ticket digital.
- Header con flyer tipo cover.
- Notches laterales estilo boleto.
- Información del evento con iconos dibujados.
- Titular, folio, precio, QR, Code128 y footer profesional.

Compatible con:
- Node.js + Express
- PDFKit
- Firebase Storage
- Resend
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
CONFIGURACIÓN
====================================================
*/

const PAGE = {
    width: 430,
    height: 1180
};

const TICKET = {
    x: 24,
    y: 22,
    width: PAGE.width - 48,
    height: PAGE.height - 44,
    radius: 24
};

const COLORS = {
    pageBg: '#F3F4F6',
    white: '#FFFFFF',
    black: '#0B1020',
    black2: '#111827',
    navy: '#020617',
    text: '#111827',
    muted: '#64748B',
    muted2: '#475569',
    line: '#E5E7EB',
    line2: '#CBD5E1',
    soft: '#F8FAFC',
    purple: '#6D28D9',
    purple2: '#7C3AED',
    purpleSoft: '#F5F3FF',
    blue: '#2563EB',
    gold: '#FACC15',
    green: '#16A34A',
    greenSoft: '#DCFCE7',
    greenText: '#15803D'
};

/*
====================================================
UTILIDADES
====================================================
*/

function safeText(value, fallback = ''){
    if(value === undefined || value === null || value === ''){
        return fallback;
    }

    return String(value);
}

function truncate(text, max){
    const value = safeText(text);

    if(value.length <= max){
        return value;
    }

    return value.substring(0, max - 1) + '…';
}

function esVIP(tipo){
    return safeText(tipo).toUpperCase() === 'VIP';
}

function tipoColor(tipo){
    return esVIP(tipo) ? COLORS.gold : COLORS.blue;
}

function tipoTextColor(tipo){
    return esVIP(tipo) ? COLORS.black2 : COLORS.white;
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

function limpiarBase64QR(qr){
    return safeText(qr).replace(/^data:image\/png;base64,/, '');
}

/*
====================================================
DIBUJO GENERAL
====================================================
*/

function drawShadow(doc, x, y, width, height, radius = 18, opacity = 0.08){
    doc.save();
    doc.opacity(opacity);
    doc.fillColor('#000000');
    doc.roundedRect(x, y + 7, width, height, radius).fill();
    doc.restore();
}

function drawCard(doc, x, y, width, height, radius = 18, fill = COLORS.white, shadow = true){
    if(shadow){
        drawShadow(doc, x, y, width, height, radius, 0.06);
    }

    doc.save();
    doc.fillColor(fill);
    doc.roundedRect(x, y, width, height, radius).fill();
    doc.restore();
}

function drawLine(doc, x1, y, x2, color = COLORS.line, width = 0.8){
    doc.save();
    doc.strokeColor(color);
    doc.lineWidth(width);
    doc.moveTo(x1, y).lineTo(x2, y).stroke();
    doc.restore();
}

function drawDottedLine(doc, x, y, width){
    doc.save();
    doc.strokeColor(COLORS.line2);
    doc.lineWidth(1);
    doc.dash(4, { space: 5 });
    doc.moveTo(x, y).lineTo(x + width, y).stroke();
    doc.undash();
    doc.restore();
}

function drawPill(doc, text, x, y, width, height, bg, color, fontSize = 11){
    doc.save();

    doc.roundedRect(x, y, width, height, height / 2)
        .fill(bg);

    doc.fillColor(color)
        .font('Helvetica-Bold')
        .fontSize(fontSize)
        .text(safeText(text), x, y + ((height - fontSize) / 2) - 1, {
            width,
            align: 'center'
        });

    doc.restore();
}

function drawSectionTitle(doc, text, x, y){
    doc.fillColor(COLORS.purple)
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(safeText(text).toUpperCase(), x, y, {
            characterSpacing: 0.4
        });
}

function drawLabelValueRow(doc, iconFn, label, value, x, y, width){
    const iconX = x;
    const textX = x + 38;

    if(iconFn){
        iconFn(doc, iconX, y + 1, COLORS.purple);
    }

    doc.fillColor(COLORS.muted2)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(safeText(label).toUpperCase(), textX, y + 4, {
            width: 92
        });

    doc.fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(safeText(value, 'No disponible'), textX + 105, y + 3, {
            width: width - 145,
            lineGap: 1
        });
}

/*
====================================================
ICONOS DIBUJADOS
====================================================
*/

function iconCalendar(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.6);
    doc.roundedRect(x + 3, y + 4, 18, 18, 3).stroke();
    doc.moveTo(x + 3, y + 10).lineTo(x + 21, y + 10).stroke();
    doc.moveTo(x + 8, y + 2).lineTo(x + 8, y + 7).stroke();
    doc.moveTo(x + 16, y + 2).lineTo(x + 16, y + 7).stroke();
    doc.restore();
}

function iconClock(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.6);
    doc.circle(x + 12, y + 13, 10).stroke();
    doc.moveTo(x + 12, y + 13).lineTo(x + 12, y + 7).stroke();
    doc.moveTo(x + 12, y + 13).lineTo(x + 17, y + 15).stroke();
    doc.restore();
}

function iconPin(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.7);
    doc.circle(x + 12, y + 9, 7).stroke();
    doc.circle(x + 12, y + 9, 2.4).stroke();
    doc.moveTo(x + 7, y + 14).lineTo(x + 12, y + 24).stroke();
    doc.moveTo(x + 17, y + 14).lineTo(x + 12, y + 24).stroke();
    doc.restore();
}

function iconCity(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.5);
    doc.rect(x + 3, y + 9, 6, 14).stroke();
    doc.rect(x + 12, y + 4, 7, 19).stroke();
    doc.rect(x + 22, y + 12, 6, 11).stroke();
    doc.moveTo(x + 1, y + 23).lineTo(x + 30, y + 23).stroke();
    doc.restore();
}

function iconInfo(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.7);
    doc.roundedRect(x + 2, y + 7, 16, 15, 3).stroke();
    doc.moveTo(x + 20, y + 22).lineTo(x + 29, y + 22).stroke();
    doc.moveTo(x + 10, y + 4).lineTo(x + 10, y + 7).stroke();
    doc.restore();
}

function iconPerson(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.8);
    doc.circle(x + 13, y + 8, 6).stroke();
    doc.roundedRect(x + 4, y + 19, 18, 9, 4).stroke();
    doc.restore();
}

function iconTicket(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.7);
    doc.roundedRect(x + 2, y + 5, 24, 17, 3).stroke();
    doc.circle(x + 2, y + 13.5, 3).fill(COLORS.white).stroke(color);
    doc.circle(x + 26, y + 13.5, 3).fill(COLORS.white).stroke(color);
    doc.moveTo(x + 14, y + 7).lineTo(x + 14, y + 20).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.restore();
}

function iconTag(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.7);
    doc.moveTo(x + 4, y + 13)
        .lineTo(x + 15, y + 3)
        .lineTo(x + 27, y + 15)
        .lineTo(x + 16, y + 26)
        .closePath()
        .stroke();
    doc.circle(x + 16, y + 10, 2.2).stroke();
    doc.restore();
}

function iconShield(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.5);
    doc.moveTo(x + 12, y + 2)
        .lineTo(x + 22, y + 7)
        .lineTo(x + 20, y + 19)
        .lineTo(x + 12, y + 25)
        .lineTo(x + 4, y + 19)
        .lineTo(x + 2, y + 7)
        .closePath()
        .stroke();
    doc.moveTo(x + 8, y + 13).lineTo(x + 11, y + 16).lineTo(x + 17, y + 9).stroke();
    doc.restore();
}

function iconCrown(doc, x, y, color){
    doc.save();
    doc.fillColor(color);
    doc.moveTo(x + 2, y + 22)
        .lineTo(x + 6, y + 8)
        .lineTo(x + 13, y + 15)
        .lineTo(x + 20, y + 6)
        .lineTo(x + 27, y + 15)
        .lineTo(x + 34, y + 8)
        .lineTo(x + 38, y + 22)
        .closePath()
        .fill();
    doc.rect(x + 5, y + 24, 30, 4).fill();
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

async function generarBarcode(texto){
    return await bwipjs.toBuffer({
        bcid: 'code128',
        text: safeText(texto),
        scale: 2,
        height: 10,
        includetext: false
    });
}

/*
====================================================
ESTRUCTURA DEL BOLETO
====================================================
*/

function drawPageBackground(doc){
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.pageBg);

    drawShadow(
        doc,
        TICKET.x,
        TICKET.y,
        TICKET.width,
        TICKET.height,
        TICKET.radius,
        0.14
    );

    doc.fillColor(COLORS.white)
        .roundedRect(
            TICKET.x,
            TICKET.y,
            TICKET.width,
            TICKET.height,
            TICKET.radius
        )
        .fill();

    const notchY = 520;
    const notchR = 18;

    doc.save();
    doc.fillColor(COLORS.pageBg);
    doc.circle(TICKET.x, notchY, notchR).fill();
    doc.circle(TICKET.x + TICKET.width, notchY, notchR).fill();
    doc.restore();
}

function drawHeader(doc, datos, flyer){
    const x = TICKET.x;
    const y = TICKET.y;
    const width = TICKET.width;
    const height = 280;

    doc.save();
    doc.roundedRect(x, y, width, height, TICKET.radius).clip();

    if(flyer){
        dibujarCover(doc, flyer, x, y, width, height);
    }else{
        const bg = doc.linearGradient(x, y, x + width, y + height);
        bg.stop(0, COLORS.navy);
        bg.stop(1, COLORS.purple);
        doc.rect(x, y, width, height).fill(bg);
    }

    doc.opacity(0.62);
    doc.rect(x, y, width, height).fill('#000000');
    doc.opacity(1);

    const glow = doc.linearGradient(x, y + height - 70, x, y + height);
    glow.stop(0, '#000000');
    glow.stop(1, COLORS.purple);
    doc.opacity(0.35);
    doc.rect(x, y + height - 80, width, 80).fill(glow);
    doc.opacity(1);

    doc.restore();

    doc.save();

    doc.circle(x + 34, y + 36, 20).fill(COLORS.white);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(24)
        .text('E', x + 27, y + 25);

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(20)
        .text('EXELARIS', x + 62, y + 22);

    doc.fillColor('#E5E7EB')
        .font('Helvetica')
        .fontSize(9)
        .text('EVENT MANAGEMENT', x + 63, y + 47, {
            characterSpacing: 0.7
        });

    const badgeX = x + width - 95;
    const badgeY = y + 23;
    const badgeW = 75;
    const badgeH = 34;

    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 10)
        .fill(tipoColor(datos.tipo));

    if(esVIP(datos.tipo)){
        iconCrown(doc, badgeX + 8, badgeY + 4, COLORS.black2);
        doc.fillColor(COLORS.black2)
            .font('Helvetica-Bold')
            .fontSize(14)
            .text('VIP', badgeX + 39, badgeY + 12, {
                width: 30,
                align: 'center'
            });
    }else{
        doc.fillColor(COLORS.white)
            .font('Helvetica-Bold')
            .fontSize(12)
            .text('General', badgeX + 8, badgeY + 11, {
                width: badgeW - 16,
                align: 'center'
            });
    }

    const eventName = safeText(datos.eventoNombre, 'Evento EXELARIS');
    const words = eventName.split(' ');

    if(words.length >= 2){
        doc.fillColor(COLORS.white)
            .font('Helvetica-Bold')
            .fontSize(35)
            .text(words[0], x + 28, y + 118, {
                width: 190
            });

        doc.fillColor('#C084FC')
            .font('Helvetica-Bold')
            .fontSize(35)
            .text(words.slice(1).join(' '), x + 28, y + 158, {
                width: 220
            });
    }else{
        doc.fillColor(COLORS.white)
            .font('Helvetica-Bold')
            .fontSize(34)
            .text(eventName, x + 28, y + 125, {
                width: 250
            });
    }

    iconCalendar(doc, x + 30, y + 222, '#A78BFA');

    doc.fillColor('#F8FAFC')
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(fechaMX(datos.eventoFecha), x + 65, y + 226, {
            width: 250
        });

    doc.restore();

    const g = doc.linearGradient(x, y + height - 4, x + width, y + height - 4);
    g.stop(0, COLORS.purple);
    g.stop(0.55, COLORS.blue);
    g.stop(1, COLORS.gold);

    doc.rect(x, y + height - 5, width, 5).fill(g);
}

function drawInfoEvent(doc, datos){
    const x = TICKET.x + 22;
    const y = 330;
    const width = TICKET.width - 44;

    iconInfo(doc, x, y - 8, COLORS.purple);
    drawSectionTitle(doc, 'Información del evento', x + 42, y);

    drawLine(doc, x, y + 34, x + width, COLORS.line);

    const rowX = x + 2;
    const rowW = width - 4;
    const startY = y + 55;
    const gap = 36;

    drawLabelValueRow(doc, iconCalendar, 'Fecha', fechaMX(datos.eventoFecha), rowX, startY, rowW);
    drawLine(doc, x, startY + 28, x + width, '#EEF2F7');

    drawLabelValueRow(doc, iconClock, 'Hora', safeText(datos.eventoHora, 'No disponible'), rowX, startY + gap, rowW);
    drawLine(doc, x, startY + gap + 28, x + width, '#EEF2F7');

    drawLabelValueRow(doc, iconPin, 'Lugar', safeText(datos.eventoLugar, 'No disponible'), rowX, startY + gap * 2, rowW);
    drawLine(doc, x, startY + gap * 2 + 28, x + width, '#EEF2F7');

    drawLabelValueRow(doc, iconPin, 'Dirección', safeText(datos.eventoDireccion, 'No disponible'), rowX, startY + gap * 3, rowW);
    drawLine(doc, x, startY + gap * 3 + 28, x + width, '#EEF2F7');

    drawLabelValueRow(doc, iconCity, 'Ciudad', safeText(datos.eventoCiudad, 'No disponible'), rowX, startY + gap * 4, rowW);
}

function drawHolder(doc, datos){
    const x = TICKET.x + 22;
    const y = 550;
    const width = TICKET.width - 44;
    const height = 78;

    drawCard(doc, x, y, width, height, 14, COLORS.purpleSoft, false);

    iconPerson(doc, x + 22, y + 20, COLORS.purple);

    drawSectionTitle(doc, 'Titular del boleto', x + 60, y + 24);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(18)
        .text(
            truncate(safeText(datos.nombre, 'SIN NOMBRE'), 32),
            x + 60,
            y + 48,
            {
                width: width - 85,
                align: 'center'
            }
        );
}

function drawFolioPrice(doc, datos){
    const x = TICKET.x + 22;
    const y = 648;
    const width = TICKET.width - 44;
    const height = 70;

    drawCard(doc, x, y, width, height, 14, COLORS.white, true);

    iconTicket(doc, x + 24, y + 20, COLORS.purple);

    doc.fillColor(COLORS.purple)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('FOLIO', x + 66, y + 20);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(15)
        .text(safeText(datos.folio, 'EXL-000000'), x + 66, y + 38, {
            width: 110
        });

    drawLine(doc, x + width / 2, y + 17, x + width / 2, COLORS.line2, 1);

    iconTag(doc, x + width / 2 + 28, y + 17, COLORS.purple);

    doc.fillColor(COLORS.purple)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('PRECIO', x + width / 2 + 72, y + 20);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(15)
        .text(precioMX(datos.precio), x + width / 2 + 72, y + 38, {
            width: 105
        });
}

function drawAccess(doc, datos, barcode){
    const x = TICKET.x + 22;
    const y = 738;
    const width = TICKET.width - 44;
    const height = 290;

    drawCard(doc, x, y, width, height, 14, COLORS.white, true);

    drawLine(doc, x + 22, y + 36, x + 115, COLORS.purple, 1);
    doc.circle(x + 116, y + 36, 2.5).fill(COLORS.purple);

    drawSectionTitle(doc, 'Acceso al evento', x + 126, y + 27);

    doc.circle(x + width - 116, y + 36, 2.5).fill(COLORS.purple);
    drawLine(doc, x + width - 114, y + 36, x + width - 22, COLORS.purple, 1);

    const qrBase64 = limpiarBase64QR(datos.qr);
    const qrBuffer = Buffer.from(qrBase64, 'base64');

    const qrX = x + 110;
    const qrY = y + 69;
    const qrBox = 134;

    doc.save();
    doc.strokeColor(COLORS.purple);
    doc.lineWidth(1.4);
    doc.moveTo(qrX - 13, qrY + 18).lineTo(qrX - 13, qrY - 9).lineTo(qrX + 18, qrY - 9).stroke();
    doc.moveTo(qrX + qrBox - 18, qrY - 9).lineTo(qrX + qrBox + 13, qrY - 9).lineTo(qrX + qrBox + 13, qrY + 18).stroke();
    doc.moveTo(qrX - 13, qrY + qrBox - 18).lineTo(qrX - 13, qrY + qrBox + 9).lineTo(qrX + 18, qrY + qrBox + 9).stroke();
    doc.moveTo(qrX + qrBox - 18, qrY + qrBox + 9).lineTo(qrX + qrBox + 13, qrY + qrBox + 9).lineTo(qrX + qrBox + 13, qrY + qrBox - 18).stroke();
    doc.restore();

    doc.image(qrBuffer, qrX, qrY, {
        width: qrBox,
        height: qrBox
    });

    doc.fillColor(COLORS.muted2)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('ID ÚNICO', x, y + 212, {
            width,
            align: 'center',
            characterSpacing: 0.8
        });

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(safeText(datos.uuid), x + 60, y + 229, {
            width: width - 120,
            align: 'center'
        });

    drawPill(doc, '✓  BOLETO OFICIAL', x + 112, y + 252, 126, 24, COLORS.greenSoft, COLORS.greenText, 9);

    doc.fillColor(COLORS.black2)
        .font('Helvetica')
        .fontSize(9)
        .text('Presenta este código QR al ingresar al evento.', x + 24, y + 282, {
            width: width - 48,
            align: 'center'
        });

    drawDottedLine(doc, x + 24, y + 312, width - 48);

    doc.image(barcode, x + 72, y + 334, {
        width: 180,
        height: 28
    });

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(safeText(datos.uuid), x + 72, y + 365, {
            width: 180,
            align: 'center'
        });

    doc.roundedRect(x + width - 86, y + 343, 64, 28, 8)
        .strokeColor('#86EFAC')
        .lineWidth(1)
        .stroke();

    iconShield(doc, x + width - 78, y + 347, COLORS.green);

    doc.fillColor(COLORS.greenText)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('VÁLIDO', x + width - 48, y + 352);
}

function drawFooter(doc){
    const x = TICKET.x;
    const y = PAGE.height - 116;
    const width = TICKET.width;
    const height = 94;

    doc.save();
    doc.roundedRect(x, y, width, height, TICKET.radius).clip();
    doc.rect(x, y, width, height).fill(COLORS.navy);
    doc.restore();

    doc.rect(x, y, width, 5).fill(COLORS.purple);

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('EXELARIS', x + 22, y + 31);

    doc.fillColor('#CBD5E1')
        .font('Helvetica')
        .fontSize(7)
        .text('EVENT MANAGEMENT', x + 22, y + 51);

    drawLine(doc, x + 105, y + 25, x + 105, '#475569', 0.8);

    doc.fillColor('#E5E7EB')
        .font('Helvetica')
        .fontSize(8)
        .text(
            'Este boleto es único e intransferible.\nEl código QR solo puede ser utilizado\nuna vez para ingresar al evento.',
            x + 122,
            y + 25,
            {
                width: 170,
                lineGap: 3
            }
        );

    doc.fillColor('#E5E7EB')
        .font('Helvetica')
        .fontSize(7)
        .text('Powered by', x + width - 86, y + 29, {
            width: 65,
            align: 'right'
        });

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('EXELARIS®', x + width - 86, y + 45, {
            width: 65,
            align: 'right'
        });

    doc.fillColor('#C084FC')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(new Date().getFullYear().toString(), x + width - 86, y + 65, {
            width: 65,
            align: 'right'
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

            const rutaPDF = path.join(carpeta, `boleto-${datos.folio}.pdf`);

            const doc = new PDFDocument({
                size: [PAGE.width, PAGE.height],
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
                console.log(`✅ PDF Premium final generado: ${rutaPDF}`);
                resolve(rutaPDF);
            });

            stream.on('error', error => {
                console.error('❌ Error Stream PDF:', error);
                reject(error);
            });

            doc.pipe(stream);

            const flyer = await descargarImagen(datos.eventoFlyer);
            const barcode = await generarBarcode(datos.uuid);

            drawPageBackground(doc);
            drawHeader(doc, datos, flyer);
            drawInfoEvent(doc, datos);
            drawHolder(doc, datos);
            drawFolioPrice(doc, datos);
            drawAccess(doc, datos, barcode);
            drawFooter(doc);

            doc.end();

        }catch(error){
            console.error('❌ Error PDF:', error);
            reject(error);
        }
    });
}

module.exports = generarPDF;
