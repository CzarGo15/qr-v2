const fs = require('fs');
const path = require('path');

/*
====================================================
EXELARIS Tickets v2.0
Archivo: services/email.js
Servicio: Resend
Regla: 1 correo por compra, links siempre,
adjuntos solo si el total pesa <= 20 MB.
====================================================
*/

const LIMITE_ADJUNTOS_MB = Number(
    process.env.EMAIL_MAX_ATTACHMENTS_MB || 20
);

const LIMITE_ADJUNTOS_BYTES =
    LIMITE_ADJUNTOS_MB * 1024 * 1024;

function escaparHTML(valor = ''){

    return String(valor)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#039;');

}

function formatoMoneda(valor = 0){

    return Number(valor || 0)
        .toLocaleString('es-MX',{
            style:'currency',
            currency:'MXN'
        });

}

function calcularPesoPDFs(boletos = []){

    let totalBytes = 0;

    for(const boleto of boletos){

        if(!boleto.pdfPath){
            continue;
        }

        if(!fs.existsSync(boleto.pdfPath)){
            continue;
        }

        const stat = fs.statSync(boleto.pdfPath);

        totalBytes += stat.size;

    }

    return totalBytes;

}

function construirLinksBoletos(boletos = []){

    return boletos.map((boleto,index)=>{

        const titular = escaparHTML(boleto.nombre || 'Asistente');
        const folio = escaparHTML(boleto.folio || `Boleto ${index + 1}`);
        const tipo = escaparHTML(boleto.tipo || 'General');
        const url = escaparHTML(boleto.pdfUrl || '#');

        return `
            <tr>
                <td style="padding:14px 0;border-bottom:1px solid #E5E7EB;">
                    <strong style="display:block;color:#111827;font-size:15px;">
                        ${folio} · ${tipo}
                    </strong>
                    <span style="display:block;color:#64748B;font-size:13px;margin-top:3px;">
                        ${titular}
                    </span>
                </td>
                <td style="padding:14px 0;border-bottom:1px solid #E5E7EB;text-align:right;">
                    <a href="${url}" style="
                        display:inline-block;
                        background:#6D28D9;
                        color:#FFFFFF;
                        text-decoration:none;
                        padding:10px 14px;
                        border-radius:999px;
                        font-size:13px;
                        font-weight:700;
                    ">
                        Descargar
                    </a>
                </td>
            </tr>
        `;

    }).join('');

}

function construirHTML({ compra, comprador, evento, boletos, adjuntosIncluidos }){

    const nombreComprador = escaparHTML(comprador.nombre || 'Cliente');
    const eventoNombre = escaparHTML(evento.nombre || 'Evento EXELARIS');
    const eventoFecha = escaparHTML(evento.fecha || '');
    const eventoHora = escaparHTML(evento.hora || '');
    const eventoLugar = escaparHTML(evento.lugar || '');
    const compraId = escaparHTML(compra.compraId || '');
    const total = formatoMoneda(compra.total || 0);

    const avisoAdjuntos = adjuntosIncluidos
        ? 'También adjuntamos tus boletos en PDF a este correo.'
        : 'Tus boletos están disponibles mediante los enlaces de descarga.';

    return `
    <div style="margin:0;padding:0;background:#F8FAFC;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <div style="max-width:680px;margin:0 auto;padding:28px 16px;">

            <div style="background:#020617;border-radius:28px;padding:34px 28px;color:#FFFFFF;">
                <div style="font-size:13px;letter-spacing:.22em;color:#C4B5FD;font-weight:700;">
                    EXELARIS EVENT MANAGEMENT
                </div>

                <h1 style="margin:18px 0 8px;font-size:32px;line-height:1.05;">
                    Gracias por tu compra
                </h1>

                <p style="margin:0;color:#CBD5E1;font-size:15px;line-height:1.6;">
                    Hola <strong style="color:#FFFFFF;">${nombreComprador}</strong>, tu compra fue registrada correctamente.
                </p>
            </div>

            <div style="background:#FFFFFF;border-radius:24px;padding:28px;margin-top:18px;border:1px solid #E5E7EB;">
                <h2 style="margin:0 0 16px;font-size:22px;">
                    ${eventoNombre}
                </h2>

                <p style="margin:0 0 8px;color:#475569;">
                    <strong>Fecha:</strong> ${eventoFecha} · ${eventoHora}
                </p>

                <p style="margin:0 0 8px;color:#475569;">
                    <strong>Lugar:</strong> ${eventoLugar}
                </p>

                <p style="margin:0 0 8px;color:#475569;">
                    <strong>Compra:</strong> ${compraId}
                </p>

                <p style="margin:0;color:#475569;">
                    <strong>Total:</strong> ${total}
                </p>
            </div>

            <div style="background:#FFFFFF;border-radius:24px;padding:28px;margin-top:18px;border:1px solid #E5E7EB;">
                <h2 style="margin:0 0 8px;font-size:22px;">
                    Tus boletos
                </h2>

                <p style="margin:0 0 18px;color:#64748B;line-height:1.6;">
                    ${avisoAdjuntos} Presenta el código QR de cada boleto al ingresar al evento.
                </p>

                <table style="width:100%;border-collapse:collapse;">
                    ${construirLinksBoletos(boletos)}
                </table>
            </div>

            <p style="text-align:center;color:#94A3B8;font-size:12px;margin-top:22px;line-height:1.6;">
                Este correo fue generado automáticamente por EXELARIS Tickets.<br>
                Si tienes dudas, responde a este correo o contacta a EXELARIS.
            </p>

        </div>
    </div>
    `;

}

function construirAdjuntos(boletos = []){

    const adjuntos = [];

    for(const boleto of boletos){

        if(!boleto.pdfPath){
            continue;
        }

        if(!fs.existsSync(boleto.pdfPath)){
            continue;
        }

        const pdfBuffer = fs.readFileSync(boleto.pdfPath);

        adjuntos.push({
            filename:`boleto-${boleto.folio}.pdf`,
            content:pdfBuffer.toString('base64')
        });

    }

    return adjuntos;

}

async function enviarCompra(datos){

    const {
        compra,
        comprador,
        evento,
        boletos
    } = datos;

    if(!process.env.RESEND_API_KEY){

        console.log('📧 RESEND_API_KEY no configurada. Correo omitido.');

        return {
            enviado:false,
            metodo:'resend_no_configurado',
            pesoAdjuntosMB:0,
            adjuntosIncluidos:false
        };

    }

    const pesoBytes = calcularPesoPDFs(boletos);
    const pesoAdjuntosMB = Number((pesoBytes / 1024 / 1024).toFixed(2));
    const adjuntosIncluidos = pesoBytes <= LIMITE_ADJUNTOS_BYTES;

    const attachments = adjuntosIncluidos
        ? construirAdjuntos(boletos)
        : [];

    const { Resend } = await import('resend');

    const resend = new Resend(
        process.env.RESEND_API_KEY
    );

    const respuesta = await resend.emails.send({

        from:
            process.env.RESEND_FROM || 'EXELARIS Eventos <onboarding@resend.dev>',

        to:[
            comprador.correo
        ],

        subject:
            `Tus boletos para ${evento.nombre || 'EXELARIS'}`,

        html:construirHTML({
            compra,
            comprador,
            evento,
            boletos,
            adjuntosIncluidos
        }),

        attachments

    });

    console.log('📧 Correo de compra enviado:', respuesta);

    return {
        enviado:true,
        metodo:adjuntosIncluidos ? 'adjuntos_y_links' : 'solo_links',
        pesoAdjuntosMB,
        adjuntosIncluidos,
        resendId:respuesta?.data?.id || respuesta?.id || null
    };

}

module.exports = {
    enviarCompra
};
