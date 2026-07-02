const generarQR = require('./services/qr');
const generarPDF = require('./services/pdf');

async function prueba() {

    const qr = await generarQR(
        'EXL-123456'
    );

    const pdf = await generarPDF({

        nombre: 'Cesar GO',

        correo: 'czargo15@gmail.com',

        folio: 1,

        tipo: 'VIP',

        uuid: 'EXL-123456',

        qr

    });

    console.log(pdf);

}

prueba();