const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const bwipjs = require('bwip-js');
const { imageSize } = require('image-size');
/*
==================================================
CONFIGURACIÓN GENERAL
==================================================
*/

const PAGE = {

    width: 390,

    height: 980

};

const COLORS = {

    background: "#F5F5F7",

    white: "#FFFFFF",

    black: "#111827",

    gray: "#6B7280",

    lightGray: "#E5E7EB",

    purple: "#6D28D9",

    gold: "#FACC15",

    blue: "#2563EB",

    green: "#16A34A"

};

/*
==================================================
DESCARGAR IMAGEN
==================================================
*/

async function descargarImagen(url){

    try{

        if(!url){

            return null;

        }

        const response = await axios.get(

            url,

            {

                responseType:"arraybuffer",

                timeout:15000

            }

        );

        const buffer = Buffer.from(response.data);

        const dimensions = imageSize(buffer);

        return {

            buffer,

            width: dimensions.width,

            height: dimensions.height

        };

    }

    catch(error){

        console.log("Imagen no disponible");

        return null;

    }

}
/*
==================================================
GENERAR CODE128
==================================================
*/

async function generarBarcode(texto){

    return await bwipjs.toBuffer({

        bcid:"code128",

        text:texto,

        scale:2,

        height:10,

        includetext:false

    });

}

/*
==================================================
FORMATEAR FECHA
==================================================
*/

function fechaMX(fecha){

    if(!fecha){

        return "";

    }

    try{

        return new Date(fecha)

        .toLocaleDateString(

            "es-MX",

            {

                day:"numeric",

                month:"long",

                year:"numeric"

            }

        );

    }

    catch{

        return fecha;

    }

}

/*
==================================================
FORMATEAR PRECIO
==================================================
*/

function precio(datos){

    return `$${datos.precio} MXN`;

}

/*
==================================================
GENERAR PDF
==================================================
*/

async function generarPDF(datos){

    return new Promise(

        async(resolve,reject)=>{

            try{

                const carpeta = path.join(

                    __dirname,

                    "../pdfs"

                );

                if(!fs.existsSync(carpeta)){

                    fs.mkdirSync(

                        carpeta,

                        {

                            recursive:true

                        }

                    );

                }

                const rutaPDF = path.join(

                    carpeta,

                    `boleto-${datos.folio}.pdf`

                );

                const doc = new PDFDocument({

                    size:[

                        PAGE.width,

                        PAGE.height

                    ],

                    margin:0,

                    info:{

                        Title:datos.eventoNombre,

                        Author:"EXELARIS",

                        Subject:"Boleto Digital",

                        Creator:"EXELARIS EVENTOS"

                    }

                });

                const stream = fs.createWriteStream(

                    rutaPDF

                );

                doc.pipe(stream);

                /*
                ==========================================
                FONDO
                ==========================================
                */

                doc.rect(

                    0,

                    0,

                    PAGE.width,

                    PAGE.height

                )

                .fill(

                    COLORS.background

                );

                /*
                ==========================================
                DESCARGAR FLYER
                ==========================================
                */

                const flyer = await descargarImagen(

                    datos.eventoFlyer

                );
                /*
==================================================
DIBUJAR IMAGEN TIPO COVER
==================================================
*/

/*
==================================================
DIBUJAR IMAGEN COVER
==================================================
*/

function dibujarCover(

    doc,

    image,

    x,

    y,

    width,

    height

){

    const scale = Math.max(

        width / image.width,

        height / image.height

    );

    const newWidth = image.width * scale;

    const newHeight = image.height * scale;

    const posX = x - ((newWidth - width) / 2);

    const posY = y - ((newHeight - height) / 2);

    doc.save();

    doc.rect(

        x,

        y,

        width,

        height

    ).clip();

    doc.image(

        image.buffer,

        posX,

        posY,

        {

            width: newWidth,

            height: newHeight

        }

    );

    doc.restore();

}

                /*
                ==========================================
                CONTINÚA PARTE 2
                ==========================================
                */
                /*
==================================================
HEADER PREMIUM
==================================================
*/

const HEADER_HEIGHT = 210;

/*
==================================================
FLYER
==================================================
*/

if(flyer){

    dibujarCover(

        doc,

        flyer,

        0,

        0,

        PAGE.width,

        HEADER_HEIGHT

    );

}else{

    doc.rect(

        0,

        0,

        PAGE.width,

        HEADER_HEIGHT

    )

    .fill(COLORS.black);

}

/*
==================================================
OVERLAY
==================================================
*/

doc.save();

doc.rect(

    0,

    0,

    PAGE.width,

    HEADER_HEIGHT

)

.fillOpacity(.45)

.fill("#000000");

doc.restore();

/*
==================================================
LOGO EMPRESA
==================================================
*/

doc.circle(

    28,

    28,

    15

)

.fill(COLORS.white);

doc.fillColor(COLORS.black)

.font("Helvetica-Bold")

.fontSize(15)

.text(

    "E",

    23,

    20

);

/*
==================================================
EXELARIS
==================================================
*/

doc.fillColor(COLORS.white)

.font("Helvetica-Bold")

.fontSize(18)

.text(

    "EXELARIS",

    52,

    14

);

doc.font("Helvetica")

.fontSize(8)

.text(

    "EVENT MANAGEMENT",

    52,

    34

);

/*
==================================================
BADGE VIP
==================================================
*/

const badgeColor =

datos.tipo==="VIP"

?COLORS.gold

:COLORS.blue;

const badgeText =

datos.tipo==="VIP"

?COLORS.black

:COLORS.white;

doc.roundedRect(

    300,

    18,

    72,

    28,

    8

)

.fill(

    badgeColor

);

doc.fillColor(

    badgeText

)

.font("Helvetica-Bold")

.fontSize(13)

.text(

    datos.tipo,

    323,

    27

);

/*
==================================================
NOMBRE DEL EVENTO
==================================================
*/

doc.fillColor(COLORS.white)

.font("Helvetica-Bold")

.fontSize(34)

.text(

    datos.eventoNombre,

    20,

    105,

    {

        width:180

    }

);

/*
==================================================
FECHA
==================================================
*/

doc.fillColor(COLORS.white)

.font("Helvetica")

.fontSize(11)

.text(

    fechaMX(

        datos.eventoFecha

    ),

    22,

    168

);

/*
==================================================
LÍNEA MORADA
==================================================
*/

doc.rect(

    0,

    HEADER_HEIGHT-4,

    PAGE.width,

    4

)

.fill(

    COLORS.purple

);

/*
==================================================
CONTINÚA PARTE 3
==================================================
*/
/*
==================================================
CARD INFORMACIÓN DEL EVENTO
==================================================
*/

const cardX = 18;
const cardY = 225;
const cardWidth = 354;
const cardHeight = 170;

doc.roundedRect(

    cardX,

    cardY,

    cardWidth,

    cardHeight,

    16

)

.fill(COLORS.white);

/*
==================================================
TÍTULO
==================================================
*/

doc.fillColor(COLORS.purple)
.font("Helvetica-Bold")
.fontSize(15)
.text(

    "INFORMACIÓN DEL EVENTO",

    cardX + 45,

    cardY + 18

);

/*
==================================================
ICONO
==================================================
*/

doc.roundedRect(

    cardX + 15,

    cardY + 15,

    18,

    18,

    4

)

.stroke(COLORS.purple);

/*
==================================================
SEPARADOR
==================================================
*/

doc.moveTo(

    cardX + 15,

    cardY + 45

)

.lineTo(

    cardX + cardWidth - 15,

    cardY + 45

)

.lineWidth(.5)

.strokeColor(COLORS.lightGray)

.stroke();

/*
==================================================
FILA FECHA
==================================================
*/

doc.fillColor(COLORS.gray)
.font("Helvetica")
.fontSize(9)
.text(

    "FECHA",

    cardX + 28,

    cardY + 62

);

doc.fillColor(COLORS.black)
.font("Helvetica-Bold")
.fontSize(11)
.text(

    fechaMX(datos.eventoFecha),

    cardX + 120,

    cardY + 62

);

/*
==================================================
FILA HORA
==================================================
*/

doc.fillColor(COLORS.gray)
.font("Helvetica")
.fontSize(9)
.text(

    "HORA",

    cardX + 28,

    cardY + 85

);

doc.fillColor(COLORS.black)
.font("Helvetica-Bold")
.fontSize(11)
.text(

    datos.eventoHora,

    cardX + 120,

    cardY + 85

);

/*
==================================================
FILA LUGAR
==================================================
*/

doc.fillColor(COLORS.gray)
.font("Helvetica")
.fontSize(9)
.text(

    "LUGAR",

    cardX + 28,

    cardY + 108

);

doc.fillColor(COLORS.black)
.font("Helvetica-Bold")
.fontSize(11)
.text(

    datos.eventoLugar,

    cardX + 120,

    cardY + 108,

    {

        width:180

    }

);

/*
==================================================
FILA DIRECCIÓN
==================================================
*/

doc.fillColor(COLORS.gray)
.font("Helvetica")
.fontSize(9)
.text(

    "DIRECCIÓN",

    cardX + 28,

    cardY + 132

);

doc.fillColor(COLORS.black)
.font("Helvetica")
.fontSize(10)
.text(

    datos.eventoDireccion,

    cardX + 120,

    cardY + 132,

    {

        width:180

    }

);

/*
==================================================
FILA CIUDAD
==================================================
*/

doc.fillColor(COLORS.gray)
.font("Helvetica")
.fontSize(9)
.text(

    "CIUDAD",

    cardX + 28,

    cardY + 155

);

doc.fillColor(COLORS.black)
.font("Helvetica")
.fontSize(10)
.text(

    datos.eventoCiudad,

    cardX + 120,

    cardY + 155

);

/*
==================================================
CONTINÚA PARTE 4
==================================================
*/
/*
==================================================
CARD TITULAR DEL BOLETO
==================================================
*/

const buyerX = 18;
const buyerY = 415;
const buyerWidth = 354;
const buyerHeight = 95;

doc.roundedRect(

    buyerX,

    buyerY,

    buyerWidth,

    buyerHeight,

    16

)

.fill("#F8FAFC");

/*
==================================================
ICONO PERSONA
==================================================
*/

doc.circle(

    buyerX + 24,

    buyerY + 26,

    8

)

.strokeColor(COLORS.purple)

.lineWidth(1.5)

.stroke();

doc.moveTo(

    buyerX + 16,

    buyerY + 42

)

.lineTo(

    buyerX + 32,

    buyerY + 42

)

.lineWidth(1.5)

.strokeColor(COLORS.purple)

.stroke();

/*
==================================================
TÍTULO
==================================================
*/

doc.fillColor(COLORS.purple)

.font("Helvetica-Bold")

.fontSize(15)

.text(

    "TITULAR DEL BOLETO",

    buyerX + 45,

    buyerY + 18

);

/*
==================================================
SEPARADOR
==================================================
*/

doc.moveTo(

    buyerX + 15,

    buyerY + 48

)

.lineTo(

    buyerX + buyerWidth - 15,

    buyerY + 48

)

.lineWidth(.5)

.strokeColor(COLORS.lightGray)

.stroke();

/*
==================================================
NOMBRE
==================================================
*/

doc.fillColor(COLORS.black)

.font("Helvetica-Bold")

.fontSize(20)

.text(

    datos.nombre || "SIN NOMBRE",

    buyerX + 18,

    buyerY + 60,

    {

        width:320

    }

);

/*
==================================================
TIPO DE BOLETO
==================================================
*/

doc.roundedRect(

    buyerX + 255,

    buyerY + 18,

    80,

    24,

    8

)

.fill(

    datos.tipo === "VIP"

    ? COLORS.gold

    : COLORS.blue

);

doc.fillColor(

    datos.tipo === "VIP"

    ? COLORS.black

    : COLORS.white

)

.font("Helvetica-Bold")

.fontSize(11)

.text(

    datos.tipo,

    buyerX + 280,

    buyerY + 25

);

/*
==================================================
CONTINÚA PARTE 5
==================================================
*/
/*
==================================================
CARD RESUMEN
==================================================
*/

const infoY = 530;

doc.roundedRect(

    18,

    infoY,

    354,

    58,

    14

)

.fill(COLORS.white);

/*
==================================================
ICONO FOLIO
==================================================
*/

doc.fillColor(COLORS.purple)
.font("Helvetica-Bold")
.fontSize(12)
.text(

    "B",

    35,

    infoY + 16

);

doc.fillColor(COLORS.gray)
.font("Helvetica")
.fontSize(8)
.text(

    "FOLIO",

    60,

    infoY + 12

);

doc.fillColor(COLORS.black)
.font("Helvetica-Bold")
.fontSize(11)
.text(

    datos.folio,

    60,

    infoY + 28

);

/*
==================================================
SEPARADOR
==================================================
*/

doc.moveTo(

    185,

    infoY + 10

)

.lineTo(

    185,

    infoY + 48

)

.lineWidth(.5)

.strokeColor(COLORS.lightGray)

.stroke();

/*
==================================================
PRECIO
==================================================
*/

doc.fillColor(COLORS.purple)
.font("Helvetica-Bold")
.fontSize(12)
.text(

    "#",

    205,

    infoY + 16

);

doc.fillColor(COLORS.gray)
.font("Helvetica")
.fontSize(8)
.text(

    "PRECIO",

    228,

    infoY + 12

);

doc.fillColor(COLORS.black)
.font("Helvetica-Bold")
.fontSize(11)
.text(

    precio(datos),

    228,

    infoY + 28

);

/*
==================================================
CONTINÚA PARTE 6
==================================================
*/
/*
==================================================
CARD ACCESO
==================================================
*/

const qrY = 605;

doc.roundedRect(

    18,

    qrY,

    354,

    220,

    18

)

.fill(COLORS.white);

/*
==================================================
TÍTULO
==================================================
*/

doc.fillColor(COLORS.purple)

.font("Helvetica-Bold")

.fontSize(16)

.text(

    "ACCESO AL EVENTO",

    95,

    qrY + 18

);

/*
==================================================
SUBTÍTULO
==================================================
*/

doc.fillColor(COLORS.gray)

.font("Helvetica")

.fontSize(9)

.text(

    "Presenta este código al ingresar.",

    92,

    qrY + 40

);

/*
==================================================
QR
==================================================
*/

const qrBase64 =

datos.qr.replace(

    /^data:image\/png;base64,/,

    ""

);

const qrBuffer =

Buffer.from(

    qrBase64,

    "base64"

);

doc.image(

    qrBuffer,

    120,

    qrY + 62,

    {

        width:150,

        height:150

    }

);

/*
==================================================
SELLO OFICIAL
==================================================
*/

doc.roundedRect(

    120,

    qrY + 220,

    150,

    22,

    8

)

.fill(COLORS.green);

doc.fillColor(COLORS.white)

.font("Helvetica-Bold")

.fontSize(10)

.text(

    "BOLETO OFICIAL",

    154,

    qrY + 227

);

/*
==================================================
UUID
==================================================
*/

doc.fillColor(COLORS.gray)

.font("Helvetica")

.fontSize(7)

.text(

    datos.uuid,

    40,

    qrY + 250,

    {

        width:310,

        align:"center"

    }

);

/*
==================================================
GENERAR CODE128
==================================================
*/

const barcode =

await generarBarcode(

    datos.uuid

);

/*
==================================================
CODE128
==================================================
*/

doc.image(

    barcode,

    85,

    qrY + 268,

    {

        width:220,

        height:32

    }

);

/*
==================================================
CONTINÚA PARTE 7
==================================================
*/
/*
==================================================
FOOTER
==================================================
*/

const footerY = PAGE.height - 50;

/*
==================================================
FONDO
==================================================
*/

doc.rect(

    0,

    footerY,

    PAGE.width,

    50

)

.fill(COLORS.black);

/*
==================================================
EMPRESA
==================================================
*/

doc.fillColor(COLORS.white)

.font("Helvetica-Bold")

.fontSize(11)

.text(

    "EXELARIS",

    18,

    footerY + 10

);

doc.fillColor("#D1D5DB")

.font("Helvetica")

.fontSize(7)

.text(

    "EVENT MANAGEMENT",

    18,

    footerY + 25

);

/*
==================================================
LEYENDA
==================================================
*/

doc.fillColor("#D1D5DB")

.font("Helvetica")

.fontSize(7)

.text(

    "Este boleto es único e intransferible.",

    135,

    footerY + 10,

    {

        width:220,

        align:"right"

    }

);

doc.text(

    "El código QR solo puede utilizarse una vez.",

    135,

    footerY + 22,

    {

        width:220,

        align:"right"

    }

);

/*
==================================================
VERSIÓN
==================================================
*/

doc.fillColor("#6B7280")

.font("Helvetica")

.fontSize(6)

.text(

    "EXELARIS Ticket System v3.0",

    18,

    footerY + 40

);

/*
==================================================
AÑO
==================================================
*/

doc.text(

    new Date().getFullYear().toString(),

    330,

    footerY + 40,

    {

        width:40,

        align:"right"

    }

);

/*
==================================================
CONTINÚA PARTE 8
==================================================
*/
/*
==================================================
FINALIZAR PDF
==================================================
*/

doc.end();

/*
==================================================
ESPERAR ESCRITURA
==================================================
*/

stream.on(

    "finish",

    ()=>{

        console.log(

            `✅ PDF generado: ${rutaPDF}`

        );

        resolve(

            rutaPDF

        );

    }

);

/*
==================================================
ERROR STREAM
==================================================
*/

stream.on(

    "error",

    (error)=>{

        console.error(

            "❌ Error Stream PDF:",

            error

        );

        reject(

            error

        );

    }

);

}catch(error){

    console.error(

        "❌ Error PDF:",

        error

    );

    reject(

        error

    );

}

}

);

}

/*
==================================================
EXPORTAR
==================================================
*/

module.exports = generarPDF;
