const QRCode = require('qrcode');

async function generarQR(uuid){

    return await QRCode.toDataURL(uuid);

}

module.exports = generarQR;