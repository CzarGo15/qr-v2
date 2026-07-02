/*
====================================================
EXELARIS Tickets v2.0
Archivo: app.js
Actualización:
- VIP mínimo 4 y máximo 8
- General sin tope operativo por ahora
- Envío al backend con comprador + boletos personalizados
====================================================
*/

const EstadoCompra = {
    evento:null,
    general:0,
    vip:0,
    comprador:{
        nombre:'',
        correo:'',
        telefono:''
    },
    asistentes:[]
};

document.addEventListener('DOMContentLoaded', async()=>{

    try{

        await cargarComponentes();
        await inicializarApp();

        document.getElementById('app-loader').style.display = 'none';
        document.getElementById('app').classList.remove('hidden');

    }catch(error){

        console.error(error);

        document.getElementById('app-loader').innerHTML = `
            <div class="loader-card">
                <div class="loader-logo">!</div>
                <p>Error al cargar EXELARIS</p>
            </div>
        `;

    }

});

async function inicializarApp(){

    const eventos = await Api.obtenerEventos();
    const eventoActivo = eventos.find(evento => evento.activo === true);

    if(!eventoActivo){
        throw new Error('No hay evento activo');
    }

    EstadoCompra.evento = eventoActivo;

    renderEvento(eventoActivo);
    inicializarContadores();
    inicializarFormularioComprador();
    inicializarBotonCompra();
    actualizarResumen();

}

function renderEvento(evento){

    const flyer = evento.flyer || 'img/placeholder.jpg';

    const heroBg = document.querySelector('[data-hero-bg]');

    if(heroBg){
        heroBg.style.backgroundImage = `url('${flyer}')`;
    }

    document.querySelectorAll('[data-evento-nombre]').forEach(el=>{
        el.textContent = evento.nombre || 'Evento EXELARIS';
    });

    document.querySelectorAll('[data-evento-fecha]').forEach(el=>{
        el.textContent = evento.fecha || '';
    });

    document.querySelectorAll('[data-evento-hora]').forEach(el=>{
        el.textContent = evento.hora || '';
    });

    document.querySelectorAll('[data-evento-lugar]').forEach(el=>{
        el.textContent = evento.lugar || '';
    });

    document.querySelectorAll('[data-evento-direccion]').forEach(el=>{
        el.textContent = evento.direccion || '';
    });

    document.querySelectorAll('[data-evento-ciudad]').forEach(el=>{
        el.textContent = evento.ciudad || '';
    });

    document.querySelectorAll('[data-precio-general]').forEach(el=>{
        el.textContent = `$${evento.precioGeneral || 0} MXN`;
    });

    document.querySelectorAll('[data-precio-vip]').forEach(el=>{
        el.textContent = `$${evento.precioVIP || 0} MXN`;
    });

}

function inicializarContadores(){

    document.querySelectorAll('[data-ticket-control]').forEach(control=>{

        const tipo = control.dataset.ticketControl;
        const menos = control.querySelector('[data-minus]');
        const mas = control.querySelector('[data-plus]');
        const valor = control.querySelector('[data-value]');

        menos.addEventListener('click',()=>{

            if(tipo === 'vip'){

                if(EstadoCompra.vip <= 4){
                    EstadoCompra.vip = 0;
                }else{
                    EstadoCompra.vip--;
                }

            }else{

                EstadoCompra.general = Math.max(
                    0,
                    EstadoCompra.general - 1
                );

            }

            valor.textContent = EstadoCompra[tipo];
            actualizarResumen();
            renderAsistentes();

        });

        mas.addEventListener('click',()=>{

            if(tipo === 'vip'){

                if(EstadoCompra.vip === 0){
                    EstadoCompra.vip = 4;
                }else if(EstadoCompra.vip < 8){
                    EstadoCompra.vip++;
                }else{
                    alert('VIP permite máximo 8 boletos por mesa reservada');
                }

            }else{

                EstadoCompra.general++;

            }

            valor.textContent = EstadoCompra[tipo];
            actualizarResumen();
            renderAsistentes();

        });

    });

}

function inicializarFormularioComprador(){

    const nombre = document.getElementById('compradorNombre');
    const correo = document.getElementById('compradorCorreo');
    const telefono = document.getElementById('compradorTelefono');

    [nombre,correo,telefono].forEach(input=>{

        input.addEventListener('input',()=>{

            EstadoCompra.comprador.nombre = nombre.value.trim();
            EstadoCompra.comprador.correo = correo.value.trim();
            EstadoCompra.comprador.telefono = telefono.value.trim();

        });

    });

}

function inicializarBotonCompra(){

    const boton = document.getElementById('btnContinuarPago');

    if(!boton){
        return;
    }

    boton.addEventListener('click',procesarCompra);

}

function renderAsistentes(){

    const contenedor = document.getElementById('asistentesLista');

    if(!contenedor){
        return;
    }

    const boletos = construirBoletosBase();

    EstadoCompra.asistentes = boletos.map((boleto,index)=>{

        return {
            tipo:boleto.tipo,
            nombre:EstadoCompra.asistentes[index]?.nombre || ''
        };

    });

    contenedor.innerHTML = '';

    if(EstadoCompra.asistentes.length === 0){

        contenedor.innerHTML = `
            <p class="text-slate-500 font-semibold">
                Selecciona boletos para capturar asistentes.
            </p>
        `;

        return;

    }

    EstadoCompra.asistentes.forEach((asistente,index)=>{

        const card = document.createElement('div');
        card.className = 'asistente-card';

        card.innerHTML = `
            <div class="field">
                <label>Boleto ${index + 1} - ${asistente.tipo}</label>
                <input
                    type="text"
                    placeholder="Nombre del asistente. Si lo dejas vacío se usará el comprador."
                    value="${asistente.nombre}"
                    data-asistente-index="${index}"
                >
            </div>
        `;

        contenedor.appendChild(card);

    });

    contenedor.querySelectorAll('[data-asistente-index]').forEach(input=>{

        input.addEventListener('input',()=>{

            const index = Number(input.dataset.asistenteIndex);
            EstadoCompra.asistentes[index].nombre = input.value.trim();

        });

    });

}

function actualizarResumen(){

    const evento = EstadoCompra.evento;

    if(!evento){
        return;
    }

    const totalGeneral = EstadoCompra.general * (evento.precioGeneral || 0);
    const totalVip = EstadoCompra.vip * (evento.precioVIP || 0);
    const total = totalGeneral + totalVip;

    document.querySelectorAll('[data-resumen-general]').forEach(el=>{
        el.textContent = EstadoCompra.general;
    });

    document.querySelectorAll('[data-resumen-vip]').forEach(el=>{
        el.textContent = EstadoCompra.vip;
    });

    document.querySelectorAll('[data-resumen-total]').forEach(el=>{
        el.textContent = `$${total} MXN`;
    });

}

function construirBoletosBase(){

    const boletos = [];

    for(let i = 0; i < EstadoCompra.general; i++){
        boletos.push({ tipo:'General' });
    }

    for(let i = 0; i < EstadoCompra.vip; i++){
        boletos.push({ tipo:'VIP' });
    }

    return boletos;

}

function validarCompra(){

    const total = EstadoCompra.general + EstadoCompra.vip;

    if(total === 0){
        return 'Selecciona al menos un boleto';
    }

    if(EstadoCompra.vip > 0 && (EstadoCompra.vip < 4 || EstadoCompra.vip > 8)){
        return 'VIP se vende por mesa reservada: mínimo 4 y máximo 8 boletos';
    }

    if(!EstadoCompra.comprador.nombre){
        return 'Captura el nombre del comprador';
    }

    if(!EstadoCompra.comprador.correo){
        return 'Captura el correo del comprador';
    }

    const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        EstadoCompra.comprador.correo
    );

    if(!correoValido){
        return 'Captura un correo válido';
    }

    return null;

}

function construirPayloadCompra(){

    const boletosBase = construirBoletosBase();

    const boletos = boletosBase.map((boleto,index)=>{

        const asistente = EstadoCompra.asistentes[index];

        return {
            tipo:boleto.tipo,
            nombre:asistente?.nombre || EstadoCompra.comprador.nombre
        };

    });

    return {
        comprador:{
            nombre:EstadoCompra.comprador.nombre,
            correo:EstadoCompra.comprador.correo,
            telefono:EstadoCompra.comprador.telefono
        },
        boletos
    };

}

async function procesarCompra(){

    const error = validarCompra();

    if(error){
        alert(error);
        return;
    }

    const boton = document.getElementById('btnContinuarPago');
    const textoOriginal = boton.textContent;

    try{

        boton.disabled = true;
        boton.textContent = 'Generando boletos...';

        const payload = construirPayloadCompra();
        const respuesta = await Api.comprarBoletos(payload);

        if(!respuesta.success){
            throw new Error(respuesta.error || 'No se pudo generar la compra');
        }

        const folios = respuesta.boletos
            .map(boleto=>boleto.folio)
            .join(', ');

        alert(
            `Compra generada correctamente.\n\nFolios: ${folios}\n\nCorreo: ${respuesta.correo?.metodo || 'no_enviado'}`
        );

    }catch(errorCompra){

        console.error(errorCompra);
        alert(errorCompra.message);

    }finally{

        boton.disabled = false;
        boton.textContent = textoOriginal;

    }

}

function irACompra(){

    document
        .getElementById('boletos')
        .scrollIntoView({ behavior:'smooth' });

}
