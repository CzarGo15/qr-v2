/*
====================================================
EXELARIS Tickets v2.0
Archivo: components.js
====================================================
*/

const componentes = [
    { id:"hero", archivo:"hero.html" },
    { id:"evento", archivo:"evento.html" },
    { id:"boletos", archivo:"boletos.html" },
    { id:"comprador", archivo:"comprador.html" },
    { id:"asistentes", archivo:"asistentes.html" },
    { id:"resumen", archivo:"resumen.html" },
    { id:"footer", archivo:"footer.html" }
];

async function cargarComponente(id,archivo){
    const response = await fetch(`components/${archivo}`);

    if(!response.ok){
        throw new Error(`No se pudo cargar ${archivo}`);
    }

    const html = await response.text();

    document.getElementById(id).innerHTML = html;
}

async function cargarComponentes(){
    for(const componente of componentes){
        await cargarComponente(
            componente.id,
            componente.archivo
        );
    }
}
