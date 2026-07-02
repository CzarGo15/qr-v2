/*
====================================================
EXELARIS Tickets
Archivo: backend/services/email.js

Resend:
- 1 correo por compra
- Links de descarga siempre
- Adjuntos solo si el peso total <= EMAIL_MAX_ATTACHMENTS_MB
====================================================
*/

const fs = require('fs');
const path = require('path');

function dineroMX(valor){
    return Number(valor || 0).toLocaleString('es-MX',{
        style:'currency',
        currency:'MXN'
    });
}

function escaparHTML(texto){
    return String(texto || '')
        .replaceAll('&','&amp;')
        .replaceAll('<','&lt;')
        .replaceAll('>','&gt;')
        .replaceAll('"','&quot;')
        .replaceAll("'","&#039;");
}

function obtenerPesoArchivosMB(boletos){
    const totalBytes = boletos.reduce((sum,boleto)=>{
        if(boleto.rutaPDF && fs.existsSync(boleto.rutaPDF)){
            return sum + fs.statSync(boleto.rutaPDF).size;
        }

        return sum;
    },0);

    return {
        totalBytes,
        totalMB: Number((totalBytes / 1024 / 1024).toFixed(2))
    };
}

function generarHTML({
    compra,
    comprador,
    evento,
    boletos,
    adjuntaPDFs
}){
    const filasBoletos = boletos.map((boleto,index)=>`
        <tr>
            <td style="padding:12px;border-bottom:1px solid #E5E7EB;">
                ${index + 1}
            </td>
            <td style="padding:12px;border-bottom:1px solid #E5E7EB;">
                <strong>${escaparHTML(boleto.folio)}</strong><br>
                <span style="color:#6B7280;">${escaparHTML(boleto.nombre)}</span>
            </td>
            <td style="padding:12px;border-bottom:1px solid #E5E7EB;">
                ${escaparHTML(boleto.tipo)}
            </td>
            <td style="padding:12px;border-bottom:1px solid #E5E7EB;text-align:right;">
                <a href="${boleto.pdfUrl}" style="color:#6D28D9;font-weight:bold;">
                    Descargar
                </a>
            </td>
        </tr>
    `).join('');

    return `
    <div style="
        margin:0;
        padding:0;
        background:#F3F4F6;
        font-family:Arial,Helvetica,sans-serif;
        color:#111827;
    ">
        <div style="
            max-width:680px;
            margin:0 auto;
            padding:28px 16px;
        ">
            <div style="
                background:#111827;
                color:white;
                padding:28px;
                border-radius:24px 24px 0 0;
            ">
                <div style="font-size:13px;letter-spacing:2px;color:#C4B5FD;font-weight:bold;">
                    EXELARIS EVENT MANAGEMENT
                </div>
                <h1 style="margin:12px 0 0;font-size:28px;">
                    Gracias por tu compra
                </h1>
                <p style="margin:10px 0 0;color:#CBD5E1;">
                    Tus boletos digitales han sido generados correctamente.
                </p>
            </div>

            <div style="
                background:white;
                padding:28px;
                border-radius:0 0 24px 24px;
                box-shadow:0 18px 50px rgba(15,23,42,.08);
            ">
                <p>
                    Hola <strong>${escaparHTML(comprador.nombre)}</strong>,
                    te compartimos el resumen de tu compra.
                </p>

                <div style="
                    margin:22px 0;
                    padding:18px;
                    border-radius:18px;
                    background:#F8FAFC;
                    border:1px solid #E5E7EB;
                ">
                    <p style="margin:0 0 8px;">
                        <strong>Evento:</strong> ${escaparHTML(evento.nombre)}
                    </p>
                    <p style="margin:0 0 8px;">
                        <strong>Fecha:</strong> ${escaparHTML(evento.fecha)} ${escaparHTML(evento.hora || '')}
                    </p>
                    <p style="margin:0 0 8px;">
                        <strong>Lugar:</strong> ${escaparHTML(evento.lugar)}
                    </p>
                    <p style="margin:0 0 8px;">
                        <strong>Compra:</strong> ${escaparHTML(compra.compraId)}
                    </p>
                    <p style="margin:0;">
                        <strong>Total:</strong> ${dineroMX(compra.total)}
                    </p>
                </div>

                <h2 style="font-size:20px;margin:26px 0 12px;">
                    Tus boletos
                </h2>

                <table style="
                    width:100%;
                    border-collapse:collapse;
                    border:1px solid #E5E7EB;
                    border-radius:16px;
                    overflow:hidden;
                ">
                    <thead>
                        <tr style="background:#F8FAFC;">
                            <th align="left" style="padding:12px;">#</th>
                            <th align="left" style="padding:12px;">Folio / Titular</th>
                            <th align="left" style="padding:12px;">Tipo</th>
                            <th align="right" style="padding:12px;">PDF</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filasBoletos}
                    </tbody>
                </table>

                <p style="margin-top:22px;color:#4B5563;line-height:1.6;">
                    ${adjuntaPDFs
                        ? 'También adjuntamos los PDFs de tus boletos a este correo.'
                        : 'Por el peso de los archivos, este correo incluye únicamente enlaces de descarga.'}
                </p>

                <div style="
                    margin-top:24px;
                    padding:16px;
                    border-radius:16px;
                    background:#FEF3C7;
                    color:#92400E;
                    font-size:14px;
                    line-height:1.6;
                ">
                    Presenta tu boleto digital o impreso al ingresar. Cada QR es único y solo puede utilizarse una vez.
                </div>

                <p style="
                    margin-top:28px;
                    color:#6B7280;
                    font-size:12px;
                    text-align:center;
                ">
                    EXELARIS EVENT MANAGEMENT
                </p>
            </div>
        </div>
    </div>
    `;
}

async function enviarCompraPorCorreo({
    compra,
    comprador,
    evento,
    boletos
}){
    if(!process.env.RESEND_API_KEY){
        throw new Error('RESEND_API_KEY no configurado');
    }

    if(!comprador?.correo){
        throw new Error('Correo del comprador no disponible');
    }

    const { Resend } = await import('resend');

    const resend = new Resend(
        process.env.RESEND_API_KEY
    );

    const limiteMB = Number(
        process.env.EMAIL_MAX_ATTACHMENTS_MB || 20
    );

    const peso = obtenerPesoArchivosMB(boletos);

    const adjuntaPDFs =
        peso.totalMB <= limiteMB &&
        boletos.every(boleto => boleto.rutaPDF && fs.existsSync(boleto.rutaPDF));

    const attachments = adjuntaPDFs
        ? boletos.map(boleto => ({
            filename: `boleto-${boleto.folio}.pdf`,
            content: fs.readFileSync(boleto.rutaPDF).toString('base64')
        }))
        : [];

    const from =
        process.env.RESEND_FROM ||
        'EXELARIS Eventos <onboarding@resend.dev>';

    const html = generarHTML({
        compra,
        comprador,
        evento,
        boletos,
        adjuntaPDFs
    });
    const respuesta = await resend.emails.send({
    from,
    to: [comprador.correo],
    subject: `Tus boletos EXELARIS - ${evento.nombre}`,
    html,
    attachments
    });

    console.log('📧 Respuesta de Resend:');
    console.log(respuesta);

    if(respuesta.error){

        throw new Error(
            respuesta.error.message ||
            'Resend no pudo enviar el correo'
        );

}

console.log('✅ Correo enviado con Resend');

return {
    enviado:true,
    metodo: adjuntaPDFs ? 'adjuntos_y_links' : 'solo_links',
    pesoAdjuntosMB: peso.totalMB,
    resendId: respuesta?.data?.id || null
};
   
}

module.exports = enviarCompraPorCorreo;
