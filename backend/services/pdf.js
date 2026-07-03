/*
====================================================
EXELARIS Tickets
Archivo: backend/services/pdf.js
Versión: Premium Pro

Diseño profesional para boleto digital:
- Header con flyer tipo cover.
- Iconos vectoriales estilo FontAwesome/Lucide sin fuentes externas.
- Compatible con PDFKit, Firebase Storage y Resend.
- Sin emojis ni caracteres especiales que rompan el PDF.
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
    height: 1120
};

const TICKET = {
    x: 24,
    y: 20,
    width: 382,
    height: 1080,
    radius: 24
};

const COLORS = {
    pageBg: '#F3F4F6',
    white: '#FFFFFF',
    black: '#111827',
    navy: '#020617',
    gray900: '#0F172A',
    gray700: '#334155',
    gray600: '#475569',
    gray500: '#64748B',
    gray300: '#CBD5E1',
    gray200: '#E5E7EB',
    gray100: '#F8FAFC',
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

function truncate(value, max){
    const text = safeText(value);

    if(text.length <= max){
        return text;
    }

    return text.substring(0, max - 1) + '…';
}

function isVIP(tipo){
    return safeText(tipo).toUpperCase() === 'VIP';
}

function ticketType(tipo){
    return isVIP(tipo) ? 'VIP' : 'General';
}

function ticketColor(tipo){
    return isVIP(tipo) ? COLORS.gold : COLORS.blue;
}

function ticketTextColor(tipo){
    return isVIP(tipo) ? COLORS.black : COLORS.white;
}

function precioMX(valor){
    const numero = Number(valor || 0);

    return `$${numero.toLocaleString('es-MX')} MXN`;
}

function fechaMX(fecha){
    if(!fecha){
        return '';
    }

    try{
        const valor = String(fecha);

        /*
        Evita desfase de día por zona horaria cuando la fecha viene como YYYY-MM-DD.
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
        return safeText(fecha);
    }
}

function limpiarQR(qr){
    return safeText(qr).replace(/^data:image\/png;base64,/, '');
}

/*
====================================================
BASE VISUAL
====================================================
*/

function shadow(doc, x, y, width, height, radius = 16, opacity = 0.08){
    doc.save();
    doc.opacity(opacity);
    doc.fillColor('#000000');
    doc.roundedRect(x, y + 6, width, height, radius).fill();
    doc.restore();
}

function card(doc, x, y, width, height, radius = 16, fill = COLORS.white, useShadow = true){
    if(useShadow){
        shadow(doc, x, y, width, height, radius, 0.055);
    }

    doc.save();
    doc.fillColor(fill);
    doc.roundedRect(x, y, width, height, radius).fill();
    doc.restore();
}

function line(doc, x1, y, x2, color = COLORS.gray200, width = 0.8){
    doc.save();
    doc.strokeColor(color);
    doc.lineWidth(width);
    doc.moveTo(x1, y).lineTo(x2, y).stroke();
    doc.restore();
}

function dottedLine(doc, x, y, width){
    doc.save();
    doc.strokeColor(COLORS.gray300);
    doc.lineWidth(1);
    doc.dash(4, { space: 5 });
    doc.moveTo(x, y).lineTo(x + width, y).stroke();
    doc.undash();
    doc.restore();
}

function pill(doc, text, x, y, width, height, bg, color, fontSize = 10){
    doc.save();
    doc.fillColor(bg);
    doc.roundedRect(x, y, width, height, height / 2).fill();

    doc.fillColor(color)
        .font('Helvetica-Bold')
        .fontSize(fontSize)
        .text(safeText(text), x, y + ((height - fontSize) / 2) - 1, {
            width,
            align: 'center'
        });

    doc.restore();
}

function sectionTitle(doc, text, x, y, size = 12){
    doc.fillColor(COLORS.purple)
        .font('Helvetica-Bold')
        .fontSize(size)
        .text(safeText(text).toUpperCase(), x, y, {
            characterSpacing: 0.35
        });
}

function label(doc, text, x, y, width){
    doc.fillColor(COLORS.gray600)
        .font('Helvetica-Bold')
        .fontSize(8.2)
        .text(safeText(text).toUpperCase(), x, y, {
            width,
            characterSpacing: 0.45
        });
}

function value(doc, text, x, y, width, options = {}){
    doc.fillColor(options.color || COLORS.black)
        .font(options.font || 'Helvetica-Bold')
        .fontSize(options.size || 10.5)
        .text(safeText(text, 'No disponible'), x, y, {
            width,
            lineGap: 1
        });
}

/*
====================================================
ICONOS VECTORIALES
Estilo profesional sin depender de FontAwesome como fuente.
====================================================
*/

function iconCalendar(doc, x, y, color = COLORS.purple, size = 22){
    const s = size / 22;

    doc.save();
    doc.strokeColor(color).lineWidth(1.8);
    doc.roundedRect(x + 2*s, y + 4*s, 18*s, 16*s, 3*s).stroke();
    doc.moveTo(x + 2*s, y + 9*s).lineTo(x + 20*s, y + 9*s).stroke();
    doc.moveTo(x + 7*s, y + 2*s).lineTo(x + 7*s, y + 6*s).stroke();
    doc.moveTo(x + 15*s, y + 2*s).lineTo(x + 15*s, y + 6*s).stroke();
    doc.restore();
}

function iconClock(doc, x, y, color = COLORS.purple, size = 22){
    const s = size / 22;

    doc.save();
    doc.strokeColor(color).lineWidth(1.8);
    doc.circle(x + 11*s, y + 11*s, 9*s).stroke();
    doc.moveTo(x + 11*s, y + 11*s).lineTo(x + 11*s, y + 6*s).stroke();
    doc.moveTo(x + 11*s, y + 11*s).lineTo(x + 15*s, y + 13*s).stroke();
    doc.restore();
}

function iconPin(doc, x, y, color = COLORS.purple, size = 22){
    const s = size / 22;

    doc.save();
    doc.strokeColor(color).lineWidth(1.8);
    doc.circle(x + 11*s, y + 8*s, 6*s).stroke();
    doc.circle(x + 11*s, y + 8*s, 2*s).stroke();
    doc.moveTo(x + 7*s, y + 13*s).lineTo(x + 11*s, y + 21*s).stroke();
    doc.moveTo(x + 15*s, y + 13*s).lineTo(x + 11*s, y + 21*s).stroke();
    doc.restore();
}

function iconBuilding(doc, x, y, color = COLORS.purple, size = 22){
    const s = size / 22;

    doc.save();
    doc.strokeColor(color).lineWidth(1.6);
    doc.rect(x + 3*s, y + 8*s, 5*s, 12*s).stroke();
    doc.rect(x + 10*s, y + 4*s, 6*s, 16*s).stroke();
    doc.rect(x + 18*s, y + 11*s, 4*s, 9*s).stroke();
    doc.moveTo(x + 1*s, y + 20*s).lineTo(x + 24*s, y + 20*s).stroke();
    doc.restore();
}

function iconInfo(doc, x, y, color = COLORS.purple){
    doc.save();
    doc.strokeColor(color).lineWidth(1.8);
    doc.roundedRect(x + 2, y + 8, 20, 18, 4).stroke();
    doc.moveTo(x + 24, y + 26).lineTo(x + 32, y + 26).stroke();
    doc.moveTo(x + 12, y + 5).lineTo(x + 12, y + 8).stroke();
    doc.restore();
}

function iconUser(doc, x, y, color = COLORS.purple){
    doc.save();
    doc.strokeColor(color).lineWidth(1.9);
    doc.circle(x + 14, y + 10, 6).stroke();
    doc.roundedRect(x + 5, y + 22, 18, 9, 4).stroke();
    doc.restore();
}

function iconTicket(doc, x, y, color = COLORS.purple){
    doc.save();
    doc.strokeColor(color).lineWidth(1.7);
    doc.roundedRect(x + 2, y + 6, 26, 18, 4).stroke();
    doc.circle(x + 2, y + 15, 3).fill(COLORS.white).stroke(color);
    doc.circle(x + 28, y + 15, 3).fill(COLORS.white).stroke(color);
    doc.dash(2, { space: 2 });
    doc.moveTo(x + 15, y + 8).lineTo(x + 15, y + 22).stroke();
    doc.undash();
    doc.restore();
}

function iconTag(doc, x, y, color = COLORS.purple){
    doc.save();
    doc.strokeColor(color).lineWidth(1.8);
    doc.moveTo(x + 5, y + 15)
        .lineTo(x + 17, y + 4)
        .lineTo(x + 30, y + 16)
        .lineTo(x + 18, y + 28)
        .closePath()
        .stroke();
    doc.circle(x + 18, y + 11, 2.3).stroke();
    doc.restore();
}

function iconShield(doc, x, y, color = COLORS.green){
    doc.save();
    doc.strokeColor(color).lineWidth(1.6);
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

function iconCrown(doc, x, y, color = COLORS.black){
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
IMÁGENES Y CÓDIGOS
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

function drawCover(doc, image, x, y, width, height){
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
SECCIONES DEL BOLETO
====================================================
*/

function drawTicketBackground(doc){
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.pageBg);

    shadow(
        doc,
        TICKET.x,
        TICKET.y,
        TICKET.width,
        TICKET.height,
        TICKET.radius,
        0.13
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

    /*
    Notches laterales estilo boleto, colocados fuera del contenido principal.
    */
    doc.save();
    doc.fillColor(COLORS.pageBg);
    doc.circle(TICKET.x, 548, 16).fill();
    doc.circle(TICKET.x + TICKET.width, 548, 16).fill();
    doc.restore();
}

function drawHeader(doc, datos, flyer){
    const x = TICKET.x;
    const y = TICKET.y;
    const width = TICKET.width;
    const height = 250;

    doc.save();
    doc.roundedRect(x, y, width, height, TICKET.radius).clip();

    if(flyer){
        drawCover(doc, flyer, x, y, width, height);
    }else{
        const bg = doc.linearGradient(x, y, x + width, y + height);
        bg.stop(0, COLORS.navy);
        bg.stop(1, COLORS.purple);
        doc.rect(x, y, width, height).fill(bg);
    }

    doc.opacity(0.60);
    doc.rect(x, y, width, height).fill('#000000');
    doc.opacity(1);

    const bottomGlow = doc.linearGradient(x, y + height - 80, x, y + height);
    bottomGlow.stop(0, '#000000');
    bottomGlow.stop(1, COLORS.purple);
    doc.opacity(0.30);
    doc.rect(x, y + height - 80, width, 80).fill(bottomGlow);
    doc.opacity(1);

    doc.restore();

    /* Logo */
    doc.circle(x + 36, y + 36, 20).fill(COLORS.white);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(23)
        .text('E', x + 29, y + 25);

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(20)
        .text('EXELARIS', x + 66, y + 21);

    doc.fillColor('#E5E7EB')
        .font('Helvetica')
        .fontSize(8)
        .text('EVENT MANAGEMENT', x + 67, y + 45, {
            characterSpacing: 0.8
        });

    /* Badge */
    const badgeX = x + width - 92;
    const badgeY = y + 25;
    const badgeW = 72;
    const badgeH = 32;

    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 10)
        .fill(ticketColor(datos.tipo));

    if(isVIP(datos.tipo)){
        iconCrown(doc, badgeX + 7, badgeY + 3, COLORS.black);

        doc.fillColor(COLORS.black)
            .font('Helvetica-Bold')
            .fontSize(13)
            .text('VIP', badgeX + 38, badgeY + 10, {
                width: 28,
                align: 'center'
            });
    }else{
        doc.fillColor(COLORS.white)
            .font('Helvetica-Bold')
            .fontSize(11)
            .text('General', badgeX + 7, badgeY + 10, {
                width: badgeW - 14,
                align: 'center'
            });
    }

    /* Nombre evento */
    const eventName = safeText(datos.eventoNombre, 'Evento EXELARIS');
    const parts = eventName.split(' ');

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(33)
        .text(parts[0] || eventName, x + 30, y + 112, {
            width: 220
        });

    doc.fillColor('#C084FC')
        .font('Helvetica-Bold')
        .fontSize(33)
        .text(parts.length > 1 ? parts.slice(1).join(' ') : '', x + 30, y + 150, {
            width: 240
        });

    iconCalendar(doc, x + 31, y + 205, '#A78BFA', 20);

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .text(fechaMX(datos.eventoFecha), x + 64, y + 207, {
            width: 260
        });

    const headerLine = doc.linearGradient(x, y + height - 5, x + width, y + height - 5);
    headerLine.stop(0, COLORS.purple);
    headerLine.stop(0.6, COLORS.blue);
    headerLine.stop(1, COLORS.gold);

    doc.rect(x, y + height - 5, width, 5).fill(headerLine);
}

function drawEventInfo(doc, datos){
    const x = TICKET.x + 28;
    const y = 300;
    const width = TICKET.width - 56;

    iconInfo(doc, x, y - 8, COLORS.purple);
    sectionTitle(doc, 'Información del evento', x + 42, y);
    line(doc, x, y + 34, x + width);

    const rowX = x + 2;
    const labelX = rowX + 36;
    const valueX = rowX + 150;
    const rowW = width - 2;
    const startY = y + 55;
    const gap = 33;

    const rows = [
        {
            icon: iconCalendar,
            label: 'Fecha',
            value: fechaMX(datos.eventoFecha)
        },
        {
            icon: iconClock,
            label: 'Hora',
            value: safeText(datos.eventoHora, 'No disponible')
        },
        {
            icon: iconPin,
            label: 'Lugar',
            value: safeText(datos.eventoLugar, 'No disponible')
        },
        {
            icon: iconPin,
            label: 'Dirección',
            value: safeText(datos.eventoDireccion, 'No disponible')
        },
        {
            icon: iconBuilding,
            label: 'Ciudad',
            value: safeText(datos.eventoCiudad, 'No disponible')
        }
    ];

    rows.forEach((row, index) => {
        const currentY = startY + (gap * index);

        row.icon(doc, rowX, currentY - 1, COLORS.purple, 21);
        label(doc, row.label, labelX, currentY + 3, 90);
        value(doc, row.value, valueX, currentY + 1, rowW - 150, {
            size: 10.4
        });

        if(index < rows.length - 1){
            line(doc, x, currentY + 26, x + width, '#EEF2F7');
        }
    });
}

function drawHolder(doc, datos){
    const x = TICKET.x + 28;
    const y = 515;
    const width = TICKET.width - 56;
    const height = 76;

    card(doc, x, y, width, height, 14, COLORS.purpleSoft, false);

    iconUser(doc, x + 22, y + 21, COLORS.purple);
    sectionTitle(doc, 'Titular del boleto', x + 62, y + 23, 11);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(17)
        .text(truncate(safeText(datos.nombre, 'SIN NOMBRE'), 34), x + 70, y + 47, {
            width: width - 90,
            align: 'center'
        });
}

function drawFolioPrice(doc, datos){
    const x = TICKET.x + 28;
    const y = 612;
    const width = TICKET.width - 56;
    const height = 68;

    card(doc, x, y, width, height, 13, COLORS.white, true);

    iconTicket(doc, x + 24, y + 19, COLORS.purple);
    label(doc, 'Folio', x + 67, y + 19, 90);
    value(doc, safeText(datos.folio, 'EXL-000000'), x + 67, y + 36, 118, {
        size: 14
    });

    line(doc, x + width / 2, y + 15, x + width / 2, COLORS.gray300, 1);

    iconTag(doc, x + width / 2 + 26, y + 17, COLORS.purple);
    label(doc, 'Precio', x + width / 2 + 70, y + 19, 90);
    value(doc, precioMX(datos.precio), x + width / 2 + 70, y + 36, 110, {
        size: 14
    });
}

function drawAccess(doc, datos, barcode){
    const x = TICKET.x + 28;
    const y = 700;
    const width = TICKET.width - 56;
    const height = 315;

    card(doc, x, y, width, height, 14, COLORS.white, true);

    line(doc, x + 22, y + 35, x + 112, COLORS.purple, 1);
    doc.circle(x + 113, y + 35, 2.6).fill(COLORS.purple);
    sectionTitle(doc, 'Acceso al evento', x + 124, y + 26, 12);
    doc.circle(x + width - 113, y + 35, 2.6).fill(COLORS.purple);
    line(doc, x + width - 111, y + 35, x + width - 22, COLORS.purple, 1);

    const qrBuffer = Buffer.from(limpiarQR(datos.qr), 'base64');
    const qrX = x + 102;
    const qrY = y + 62;
    const qrSize = 144;

    /* Esquinas del QR */
    doc.save();
    doc.strokeColor(COLORS.purple);
    doc.lineWidth(1.4);

    doc.moveTo(qrX - 13, qrY + 22).lineTo(qrX - 13, qrY - 10).lineTo(qrX + 22, qrY - 10).stroke();
    doc.moveTo(qrX + qrSize - 22, qrY - 10).lineTo(qrX + qrSize + 13, qrY - 10).lineTo(qrX + qrSize + 13, qrY + 22).stroke();
    doc.moveTo(qrX - 13, qrY + qrSize - 22).lineTo(qrX - 13, qrY + qrSize + 10).lineTo(qrX + 22, qrY + qrSize + 10).stroke();
    doc.moveTo(qrX + qrSize - 22, qrY + qrSize + 10).lineTo(qrX + qrSize + 13, qrY + qrSize + 10).lineTo(qrX + qrSize + 13, qrY + qrSize - 22).stroke();

    doc.restore();

    doc.image(qrBuffer, qrX, qrY, {
        width: qrSize,
        height: qrSize
    });

    label(doc, 'ID único', x, y + 225, width);
    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(safeText(datos.uuid), x + 55, y + 242, {
            width: width - 110,
            align: 'center'
        });

    doc.roundedRect(x + 112, y + 262, 126, 24, 7)
        .fill(COLORS.greenSoft);

    iconShield(doc, x + 120, y + 262, COLORS.green);

    doc.fillColor(COLORS.greenText)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('BOLETO OFICIAL', x + 150, y + 270, {
            width: 82,
            align: 'center'
        });

    doc.fillColor(COLORS.gray700)
        .font('Helvetica')
        .fontSize(8.8)
        .text('Presenta este código QR al ingresar al evento.', x + 22, y + 294, {
            width: width - 44,
            align: 'center'
        });

    dottedLine(doc, x + 22, y + 318, width - 44);

    doc.image(barcode, x + 72, y + 334, {
        width: 180,
        height: 28
    });

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(safeText(datos.uuid), x + 72, y + 366, {
            width: 180,
            align: 'center'
        });

    doc.roundedRect(x + width - 84, y + 345, 62, 27, 8)
        .strokeColor('#86EFAC')
        .lineWidth(1)
        .stroke();

    iconShield(doc, x + width - 77, y + 348, COLORS.green);

    doc.fillColor(COLORS.greenText)
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .text('VÁLIDO', x + width - 47, y + 353);
}

function drawFooter(doc){
    const x = TICKET.x;
    const y = 1032;
    const width = TICKET.width;
    const height = 68;

    doc.save();
    doc.roundedRect(x, y, width, height, TICKET.radius).clip();
    doc.rect(x, y, width, height).fill(COLORS.navy);
    doc.restore();

    doc.rect(x, y, width, 5).fill(COLORS.purple);

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(15)
        .text('EXELARIS', x + 24, y + 24);

    doc.fillColor(COLORS.gray300)
        .font('Helvetica')
        .fontSize(7)
        .text('EVENT MANAGEMENT', x + 24, y + 43);

    line(doc, x + 118, y + 19, x + 118, '#475569', 0.8);

    doc.fillColor('#E5E7EB')
        .font('Helvetica')
        .fontSize(7.6)
        .text('Este boleto es único e intransferible.\nEl código QR solo puede utilizarse una vez.', x + 135, y + 20, {
            width: 155,
            lineGap: 3
        });

    doc.fillColor('#E5E7EB')
        .font('Helvetica')
        .fontSize(7)
        .text('Powered by', x + width - 84, y + 19, {
            width: 60,
            align: 'right'
        });

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text('EXELARIS', x + width - 84, y + 35, {
            width: 60,
            align: 'right'
        });

    doc.fillColor('#C084FC')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(new Date().getFullYear().toString(), x + width - 84, y + 50, {
            width: 60,
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
                console.log(`✅ PDF Profesional generado: ${rutaPDF}`);
                resolve(rutaPDF);
            });

            stream.on('error', error => {
                console.error('❌ Error Stream PDF:', error);
                reject(error);
            });

            doc.pipe(stream);

            const flyer = await descargarImagen(datos.eventoFlyer);
            const barcode = await generarBarcode(datos.uuid);

            drawTicketBackground(doc);
            drawHeader(doc, datos, flyer);
            drawEventInfo(doc, datos);
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
