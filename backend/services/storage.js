/*
====================================================
EXELARIS Tickets
Archivo: backend/services/storage.js
====================================================
*/

const { Storage } = require('@google-cloud/storage');
const path = require('path');

const storage = new Storage({
    credentials: JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT
    ),
    projectId: 'sistemaqr-a4d32'
});

const bucket = storage.bucket(
    'sistemaqr-a4d32.firebasestorage.app'
);

/*
==================================
SUBIR PDF
==================================
*/

async function subirPDF(rutaPDF, folio){

    try{

        const nombreArchivo =
            `boletos/${folio}.pdf`;

        await bucket.upload(
            rutaPDF,
            {
                destination:nombreArchivo,
                resumable:false,
                metadata:{
                    contentType:'application/pdf',
                    contentDisposition:`inline; filename="${folio}.pdf"`
                }
            }
        );

        const file =
            bucket.file(nombreArchivo);

        const [urlFirmada] =
            await file.getSignedUrl({
                action:'read',
                expires:'01-01-2035'
            });

        return urlFirmada;

    }catch(error){

        console.error(
            '❌ ERROR STORAGE PDF:',
            error
        );

        throw error;

    }

}

/*
==================================
SUBIR FLYER
==================================
*/

async function subirFlyer(
    rutaImagen,
    nombreOriginal
){

    try{

        const extension =
            path.extname(
                nombreOriginal || ''
            );

        const nombreArchivo =
            `flyers/evento-${Date.now()}${extension}`;

        await bucket.upload(
            rutaImagen,
            {
                destination:nombreArchivo,
                resumable:false,
                metadata:{
                    contentType:'image/jpeg'
                }
            }
        );

        const file =
            bucket.file(nombreArchivo);

        const [urlFirmada] =
            await file.getSignedUrl({
                action:'read',
                expires:'01-01-2035'
            });

        return urlFirmada;

    }catch(error){

        console.error(
            '❌ ERROR STORAGE FLYER:',
            error
        );

        throw error;

    }

}

module.exports = {
    subirPDF,
    subirFlyer
};
