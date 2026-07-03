/*
====================================================
EXELARIS Tickets
Archivo: backend/services/pdf.js
Versión: Ticket Premium v5

Diseño:
- Boleto digital vertical moderno.
- Estilo ticket profesional con proporción móvil.
- Logo EXELARIS opcional desde URL.
- Flyer de evento tipo cover.
- Iconos vectoriales dibujados directamente en PDFKit.
- Sin emojis ni fuentes externas para evitar caracteres rotos.
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
    width: 390,
    height: 980
};

const MARGIN = 18;

const TICKET = {
    x: 18,
    y: 16,
    width: PAGE.width - 36,
    height: PAGE.height - 32,
    radius: 22
};

const COLORS = {
    page: '#F3F4F6',
    white: '#FFFFFF',
    black: '#050816',
    navy: '#07111F',
    navy2: '#0B1220',
    text: '#111827',
    muted: '#64748B',
    mutedDark: '#475569',
    border: '#E5E7EB',
    borderDark: '#CBD5E1',
    soft: '#F8FAFC',
    purple: '#7C3AED',
    purpleDark: '#4C1D95',
    purpleSoft: '#F3E8FF',
    blue: '#2563EB',
    gold: '#FACC15',
    goldDark: '#B45309',
    goldSoft: '#FEF3C7',
    green: '#16A34A',
    greenDark: '#15803D',
    greenSoft: '#DCFCE7'
};

const DEFAULT_LOGO_URL =
    process.env.EXELARIS_LOGO_URL ||
    'https://scontent.fmtt1-2.fna.fbcdn.net/v/t39.30808-6/417434020_303688476055215_1445176769765197732_n.jpg?stp=dst-jpg_tt6&cstp=mx1200x1200&ctp=s1200x1200&_nc_cat=106&ccb=1-7&_nc_sid=6ee11a&_nc_ohc=YyVJPTkcb8QQ7kNvwGFWl7n&_nc_oc=AdrulZ-DhKZuH9AHhgMSWTZxkb_o1FalOu5O8d_ld0z7FXDsxSzoDCNVXGKBJew-Hps&_nc_zt=23&_nc_ht=scontent.fmtt1-2.fna&_nc_gid=MRarGnq32d0GV-KTkvqf8g&_nc_ss=7b289&oh=00_AQBnU-r90DMY5lXjMsyPi7mKI84oUFgKivYfdYW0-pBDog&oe=6A4DEDFB';

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

function uppercase(value){
    return safeText(value).toUpperCase();
}

function truncate(value, max){
    const text = safeText(value);

    if(text.length <= max){
        return text;
    }

    return text.slice(0, max - 1) + '…';
}

function isVIP(tipo){
    return uppercase(tipo) === 'VIP';
}

function tipoLabel(tipo){
    return isVIP(tipo) ? 'VIP' : 'General';
}

function tipoBg(tipo){
    return isVIP(tipo) ? COLORS.gold : COLORS.blue;
}

function tipoColor(tipo){
    return isVIP(tipo) ? COLORS.black : COLORS.white;
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

function qrBufferFromBase64(qr){
    const base64 = safeText(qr).replace(/^data:image\/png;base64,/, '');
    return Buffer.from(base64, 'base64');
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

function imageCover(doc, image, x, y, width, height){
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

function imageContain(doc, image, x, y, width, height){
    const scale = Math.min(
        width / image.width,
        height / image.height
    );

    const newWidth = image.width * scale;
    const newHeight = image.height * scale;

    const posX = x + ((width - newWidth) / 2);
    const posY = y + ((height - newHeight) / 2);

    doc.image(image.buffer, posX, posY, {
        width: newWidth,
        height: newHeight
    });
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
DIBUJO BASE
====================================================
*/

function shadow(doc, x, y, width, height, radius = 18, opacity = 0.10){
    doc.save();
    doc.opacity(opacity);
    doc.fillColor('#000000');
    doc.roundedRect(x, y + 6, width, height, radius).fill();
    doc.restore();
}

function card(doc, x, y, width, height, radius = 16, fill = COLORS.white, withShadow = true){
    if(withShadow){
        shadow(doc, x, y, width, height, radius, 0.06);
    }

    doc.save();
    doc.fillColor(fill);
    doc.roundedRect(x, y, width, height, radius).fill();
    doc.restore();
}

function line(doc, x1, y, x2, color = COLORS.border, width = 0.8){
    doc.save();
    doc.strokeColor(color);
    doc.lineWidth(width);
    doc.moveTo(x1, y).lineTo(x2, y).stroke();
    doc.restore();
}

function pill(doc, text, x, y, width, height, bg, color, fontSize = 10){
    doc.save();
    doc.roundedRect(x, y, width, height, height / 2).fill(bg);
    doc.fillColor(color)
        .font('Helvetica-Bold')
        .fontSize(fontSize)
        .text(safeText(text), x, y + ((height - fontSize) / 2) - 1, {
            width,
            align: 'center'
        });
    doc.restore();
}

function sectionLabel(doc, text, x, y, color = COLORS.purple){
    doc.fillColor(color)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(uppercase(text), x, y, {
            characterSpacing: 0.8
        });
}

function dotted(doc, x, y, width){
    doc.save();
    doc.strokeColor(COLORS.borderDark);
    doc.lineWidth(1);
    doc.dash(4, { space: 4 });
    doc.moveTo(x, y).lineTo(x + width, y).stroke();
    doc.undash();
    doc.restore();
}

/*
====================================================
ICONOS VECTORIALES
====================================================
*/

function iconCalendar(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.7);
    doc.roundedRect(x + 2, y + 5, 18, 17, 3).stroke();
    doc.moveTo(x + 2, y + 10).lineTo(x + 20, y + 10).stroke();
    doc.moveTo(x + 7, y + 3).lineTo(x + 7, y + 7).stroke();
    doc.moveTo(x + 15, y + 3).lineTo(x + 15, y + 7).stroke();
    doc.restore();
}

function iconClock(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.7);
    doc.circle(x + 11, y + 13, 9).stroke();
    doc.moveTo(x + 11, y + 13).lineTo(x + 11, y + 7).stroke();
    doc.moveTo(x + 11, y + 13).lineTo(x + 16, y + 15).stroke();
    doc.restore();
}

function iconLocation(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.8);
    doc.circle(x + 12, y + 10, 7).stroke();
    doc.circle(x + 12, y + 10, 2.4).stroke();
    doc.moveTo(x + 7, y + 15).lineTo(x + 12, y + 24).stroke();
    doc.moveTo(x + 17, y + 15).lineTo(x + 12, y + 24).stroke();
    doc.restore();
}

function iconCity(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.5);
    doc.rect(x + 3, y + 10, 5, 13).stroke();
    doc.rect(x + 11, y + 5, 7, 18).stroke();
    doc.rect(x + 21, y + 12, 5, 11).stroke();
    doc.moveTo(x + 1, y + 23).lineTo(x + 28, y + 23).stroke();
    doc.restore();
}

function iconUser(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.8);
    doc.circle(x + 12, y + 9, 6).stroke();
    doc.roundedRect(x + 3, y + 20, 18, 9, 5).stroke();
    doc.restore();
}

function iconTicket(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.7);
    doc.roundedRect(x + 2, y + 6, 24, 16, 3).stroke();
    doc.circle(x + 2, y + 14, 3).fill(COLORS.white).stroke(color);
    doc.circle(x + 26, y + 14, 3).fill(COLORS.white).stroke(color);
    doc.moveTo(x + 14, y + 8).lineTo(x + 14, y + 20).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.restore();
}

function iconTag(doc, x, y, color){
    doc.save();
    doc.strokeColor(color).lineWidth(1.7);
    doc.moveTo(x + 4, y + 14)
        .lineTo(x + 15, y + 4)
        .lineTo(x + 27, y + 16)
        .lineTo(x + 16, y + 27)
        .closePath()
        .stroke();
    doc.circle(x + 16, y + 11, 2).stroke();
    doc.restore();
}

function iconShield(doc, x, y, color){
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

function iconCrown(doc, x, y, color){
    doc.save();
    doc.fillColor(color);
    doc.moveTo(x + 2, y + 20)
        .lineTo(x + 5, y + 8)
        .lineTo(x + 12, y + 14)
        .lineTo(x + 19, y + 5)
        .lineTo(x + 26, y + 14)
        .lineTo(x + 33, y + 8)
        .lineTo(x + 36, y + 20)
        .closePath()
        .fill();
    doc.rect(x + 5, y + 23, 31, 4).fill();
    doc.restore();
}

/*
====================================================
SECCIONES
====================================================
*/

function drawPage(doc){
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.page);

    shadow(
        doc,
        TICKET.x,
        TICKET.y,
        TICKET.width,
        TICKET.height,
        TICKET.radius,
        0.16
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
    Notches laterales.
    */
    doc.save();
    doc.fillColor(COLORS.page);
    doc.circle(TICKET.x, 430, 14).fill();
    doc.circle(TICKET.x + TICKET.width, 430, 14).fill();
    doc.restore();
}

function drawHeader(doc, datos, flyer, logo){
    const x = TICKET.x;
    const y = TICKET.y;
    const width = TICKET.width;
    const height = 300;

    doc.save();

    doc.roundedRect(x, y, width, height, TICKET.radius).clip();

    /*
    Top dark.
    */
    doc.rect(x, y, width, 72).fill(COLORS.navy);

    /*
    Flyer.
    */
    if(flyer){
        imageCover(doc, flyer, x, y + 72, width, height - 72);
    }else{
        const g = doc.linearGradient(x, y + 72, x + width, y + height);
        g.stop(0, COLORS.purpleDark);
        g.stop(1, COLORS.black);
        doc.rect(x, y + 72, width, height - 72).fill(g);
    }

    /*
    Overlay inferior.
    */
    doc.opacity(0.36);
    doc.rect(x, y + 72, width, height - 72).fill('#000000');
    doc.opacity(1);

    doc.restore();

    /*
    Logo / marca.
    */
    if(logo){
        doc.save();
        doc.roundedRect(x + 20, y + 15, 122, 42, 8).clip();
        imageContain(doc, logo, x + 20, y + 15, 122, 42);
        doc.restore();
    }else{
        doc.circle(x + 38, y + 36, 18).fill(COLORS.white);

        doc.fillColor(COLORS.black)
            .font('Helvetica-Bold')
            .fontSize(21)
            .text('E', x + 31, y + 26);

        doc.fillColor(COLORS.white)
            .font('Helvetica-Bold')
            .fontSize(18)
            .text('EXELARIS', x + 66, y + 20);

        doc.fillColor('#E5E7EB')
            .font('Helvetica')
            .fontSize(8)
            .text('EVENT MANAGEMENT', x + 67, y + 42);
    }

    /*
    Tipo.
    */
    const badgeX = x + width - 88;
    const badgeY = y + 20;

    doc.roundedRect(badgeX, badgeY, 68, 34, 9).fill(tipoBg(datos.tipo));

    if(isVIP(datos.tipo)){
        iconCrown(doc, badgeX + 7, badgeY + 4, COLORS.black);
        doc.fillColor(COLORS.black)
            .font('Helvetica-Bold')
            .fontSize(14)
            .text('VIP', badgeX + 38, badgeY + 12);
    }else{
        doc.fillColor(COLORS.white)
            .font('Helvetica-Bold')
            .fontSize(11)
            .text('General', badgeX, badgeY + 12, {
                width: 68,
                align: 'center'
            });
    }

    /*
    Nombre evento.
    */
    const eventName = safeText(datos.eventoNombre, 'Evento EXELARIS');
    const parts = eventName.split(' ');

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(36)
        .text(parts[0] || eventName, x + 28, y + 132, {
            width: 205
        });

    doc.fillColor('#C084FC')
        .font('Helvetica-Bold')
        .fontSize(36)
        .text(parts.slice(1).join(' ') || '', x + 28, y + 174, {
            width: 220
        });

    iconCalendar(doc, x + 31, y + 232, '#C084FC');

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(fechaMX(datos.eventoFecha), x + 64, y + 236, {
            width: 220
        });

    /*
    Línea de acento.
    */
    const g = doc.linearGradient(x, y + height - 4, x + width, y + height - 4);
    g.stop(0, COLORS.purple);
    g.stop(0.6, COLORS.blue);
    g.stop(1, COLORS.gold);

    doc.rect(x, y + height - 5, width, 5).fill(g);
}

function drawOfficialBadge(doc){
    const x = 109;
    const y = 286;
    const width = 172;
    const height = 42;

    shadow(doc, x, y, width, height, 12, 0.13);

    doc.roundedRect(x, y, width, height, 12)
        .fill(COLORS.navy);

    doc.roundedRect(x, y, width, height, 12)
        .strokeColor(COLORS.gold)
        .lineWidth(1.3)
        .stroke();

    iconShield(doc, x + 18, y + 8, COLORS.gold);

    doc.fillColor(COLORS.gold)
        .font('Helvetica-Bold')
        .fontSize(13)
        .text('BOLETO OFICIAL', x + 52, y + 14);
}

function drawEventInfo(doc, datos){
    const x = TICKET.x + 28;
    const y = 350;
    const width = TICKET.width - 56;
    const height = 178;

    card(doc, x, y, width, height, 12, COLORS.white, false);

    doc.roundedRect(x, y, width, height, 12)
        .strokeColor(COLORS.border)
        .lineWidth(0.8)
        .stroke();

    const rows = [
        { icon: iconCalendar, label: 'Fecha', value: fechaMX(datos.eventoFecha) },
        { icon: iconClock, label: 'Hora', value: safeText(datos.eventoHora, 'No disponible') },
        { icon: iconLocation, label: 'Lugar', value: safeText(datos.eventoLugar, 'No disponible') },
        { icon: iconLocation, label: 'Dirección', value: safeText(datos.eventoDireccion, 'No disponible') },
        { icon: iconCity, label: 'Ciudad', value: safeText(datos.eventoCiudad, 'No disponible') }
    ];

    rows.forEach((row, index) => {
        const rowY = y + 17 + (index * 31);

        row.icon(doc, x + 18, rowY - 2, COLORS.navy);

        doc.fillColor(COLORS.text)
            .font('Helvetica-Bold')
            .fontSize(8)
            .text(row.label.toUpperCase(), x + 52, rowY + 4, {
                width: 70
            });

        doc.fillColor(COLORS.text)
            .font('Helvetica')
            .fontSize(10.5)
            .text(row.value, x + 123, rowY + 3, {
                width: width - 140
            });

        if(index < rows.length - 1){
            line(doc, x + 16, rowY + 27, x + width - 16, COLORS.border);
        }
    });
}

function drawHolder(doc, datos){
    const x = TICKET.x + 28;
    const y = 548;
    const width = TICKET.width - 56;
    const height = 74;

    card(doc, x, y, width, height, 10, COLORS.navy, true);

    iconUser(doc, x + 26, y + 22, COLORS.gold);

    doc.fillColor(COLORS.gold)
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .text('TITULAR DEL BOLETO', x + 76, y + 22, {
            characterSpacing: 1
        });

    doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(18)
        .text(truncate(datos.nombre || 'SIN NOMBRE', 28), x + 76, y + 40, {
            width: width - 100
        });
}

function drawFolioPrice(doc, datos){
    const x = TICKET.x + 28;
    const y = 640;
    const width = TICKET.width - 56;
    const height = 60;

    card(doc, x, y, width, height, 10, COLORS.white, false);

    doc.roundedRect(x, y, width, height, 10)
        .strokeColor(COLORS.border)
        .lineWidth(0.9)
        .stroke();

    iconTicket(doc, x + 20, y + 17, COLORS.navy);

    doc.fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('FOLIO', x + 58, y + 16);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(safeText(datos.folio, 'EXL-000000'), x + 58, y + 32, {
            width: 100
        });

    line(doc, x + width / 2, y + 13, x + width / 2, COLORS.borderDark, 1);

    iconTag(doc, x + width / 2 + 26, y + 15, COLORS.navy);

    doc.fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('PRECIO', x + width / 2 + 62, y + 16);

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(precioMX(datos.precio), x + width / 2 + 62, y + 32, {
            width: 98
        });
}

function drawAccess(doc, datos, barcode){
    const x = TICKET.x + 28;
    const y = 718;
    const width = TICKET.width - 56;
    const height = 202;

    doc.fillColor(COLORS.text)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('ID ÚNICO DE ACCESO', x, y, {
            width,
            align: 'center'
        });

    doc.fillColor(COLORS.black)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(safeText(datos.uuid), x, y + 17, {
            width,
            align: 'center'
        });

    const qrBuffer = qrBufferFromBase64(datos.qr);
    const qrSize = 116;
    const qrX = x + (width - qrSize) / 2;
    const qrY = y + 39;

    doc.roundedRect(qrX - 7, qrY - 7, qrSize + 14, qrSize + 14, 8)
        .strokeColor(COLORS.gold)
        .lineWidth(1)
        .stroke();

    doc.image(qrBuffer, qrX, qrY, {
        width: qrSize,
        height: qrSize
    });

    doc.image(barcode, x + 52, y + 169, {
        width: width - 104,
        height: 28
    });

    pill(
        doc,
        'VÁLIDO',
        x + (width - 78) / 2,
        y + 147,
        78,
        26,
        COLORS.green,
        COLORS.white,
        12
    );
}

function drawFooter(doc){
    const x = TICKET.x;
    const y = PAGE.height - 92;
    const width = TICKET.width;
    const height = 76;

    doc.save();
    doc.roundedRect(x, y, width, height, 18).fill(COLORS.navy);
    doc.restore();

    doc.rect(x, y, width, 4).fill(COLORS.purple);

    iconShield(doc, x + 24, y + 26, COLORS.gold);

    doc.fillColor(COLORS.white)
        .font('Helvetica')
        .fontSize(9)
        .text(
            'Este boleto es único e intransferible.\\nPresenta este código al ingresar al evento.',
            x + 64,
            y + 25,
            {
                width: 235,
                lineGap: 3
            }
        );
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
                console.log(`✅ PDF Ticket Premium v5 generado: ${rutaPDF}`);
                resolve(rutaPDF);
            });

            stream.on('error', error => {
                console.error('❌ Error Stream PDF:', error);
                reject(error);
            });

            doc.pipe(stream);

            const flyer = await descargarImagen(datos.eventoFlyer);
            const logo = await descargarImagen(DEFAULT_LOGO_URL);
            const barcode = await generarBarcode(datos.uuid);

            drawPage(doc);
            drawHeader(doc, datos, flyer, logo);
            drawOfficialBadge(doc);
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
