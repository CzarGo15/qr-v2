const EstadoCompra = {
    evento:null,
    general:0,
    vip:0,
    comprador:{
        nombre:"",
        correo:"",
        telefono:""
    },
    yoSoyAsistente:true,
    asistentes:[]
};

document.addEventListener("DOMContentLoaded", async()=>{

    try{

        await cargarComponentes();
        await inicializarApp();

        document.getElementById("app-loader").style.display = "none";
        document.getElementById("app").classList.remove("hidden");

    }catch(error){

        console.error(error);

        document.getElementById("app-loader").innerHTML = `
            <div class="loader-card">
                <div class="loader-logo">!</div>
                <p>${error.message || 'Error al cargar EXELARIS'}</p>
            </div>
        `;

    }

});

async function inicializarApp(){

    const eventos = await Api.obtenerEventos();
    const eventoActivo = eventos.find(evento => evento.activo === true);

    if(!eventoActivo){
        throw new Error("No hay evento activo");
    }

    EstadoCompra.evento = eventoActivo;

    renderEvento(eventoActivo);
    inicializarContadores();
    inicializarFormularioComprador();
    inicializarOpcionAsistente();
    inicializarCompra();
    actualizarResumen();
    renderAsistentes();

}

function renderEvento(evento){

    const flyer = evento.flyer || "img/placeholder.jpg";

    const heroBg = document.querySelector("[data-hero-bg]");
    if(heroBg){
        heroBg.style.backgroundImage = `url('${flyer}')`;
    }

    document.querySelectorAll("[data-evento-nombre]").forEach(el=>{
        el.textContent = evento.nombre || "Evento EXELARIS";
    });

    document.querySelectorAll("[data-evento-fecha]").forEach(el=>{
        el.textContent = evento.fecha || "";
    });

    document.querySelectorAll("[data-evento-hora]").forEach(el=>{
        el.textContent = evento.hora || "";
    });

    document.querySelectorAll("[data-evento-lugar]").forEach(el=>{
        el.textContent = evento.lugar || "";
    });

    document.querySelectorAll("[data-evento-direccion]").forEach(el=>{
        el.textContent = evento.direccion || "";
    });

    document.querySelectorAll("[data-evento-ciudad]").forEach(el=>{
        el.textContent = evento.ciudad || "";
    });

    document.querySelectorAll("[data-precio-general]").forEach(el=>{
        el.textContent = `$${evento.precioGeneral || 0} MXN`;
    });

    document.querySelectorAll("[data-precio-vip]").forEach(el=>{
        el.textContent = `$${evento.precioVIP || 0} MXN`;
    });

}

function inicializarContadores(){

    document.querySelectorAll("[data-ticket-control]").forEach(control=>{

        const tipo = control.dataset.ticketControl;

        const menos = control.querySelector("[data-minus]");
        const mas = control.querySelector("[data-plus]");
        const valor = control.querySelector("[data-value]");

        menos.addEventListener("click",()=>{

            if(tipo === "vip"){
                if(EstadoCompra.vip <= 4){
                    EstadoCompra.vip = 0;
                }else{
                    EstadoCompra.vip--;
                }
            }else{
                EstadoCompra.general = Math.max(0, EstadoCompra.general - 1);
            }

            valor.textContent = EstadoCompra[tipo];

            actualizarResumen();
            renderAsistentes();

        });

        mas.addEventListener("click",()=>{

            if(tipo === "vip"){
                if(EstadoCompra.vip === 0){
                    EstadoCompra.vip = 4;
                }else if(EstadoCompra.vip < 8){
                    EstadoCompra.vip++;
                }else{
                    alert("VIP permite máximo 8 boletos por mesa reservada");
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

    const nombre = document.getElementById("compradorNombre");
    const correo = document.getElementById("compradorCorreo");
    const telefono = document.getElementById("compradorTelefono");

    [nombre,correo,telefono].forEach(input=>{

        input.addEventListener("input",()=>{

            EstadoCompra.comprador.nombre = nombre.value.trim();
            EstadoCompra.comprador.correo = correo.value.trim();
            EstadoCompra.comprador.telefono = telefono.value.trim();

            renderAsistentes();

        });

    });

}

function inicializarOpcionAsistente(){

    const checkbox = document.getElementById("yoSoyAsistente");

    if(!checkbox){
        return;
    }

    checkbox.checked = EstadoCompra.yoSoyAsistente;

    checkbox.addEventListener("change",()=>{

        EstadoCompra.yoSoyAsistente = checkbox.checked;

        renderAsistentes();

    });

}

function inicializarCompra(){

    const boton = document.querySelector("[data-accion-comprar]");

    if(!boton){
        return;
    }

    boton.addEventListener("click", confirmarCompra);

}

function obtenerTiposSeleccionados(){

    const tipos = [];

    for(let i = 0; i < EstadoCompra.general; i++){
        tipos.push("General");
    }

    for(let i = 0; i < EstadoCompra.vip; i++){
        tipos.push("VIP");
    }

    return tipos;

}

function renderAsistentes(){

    const contenedor = document.getElementById("asistentesLista");

    if(!contenedor){
        return;
    }

    const tipos = obtenerTiposSeleccionados();
    const total = tipos.length;

    if(total === 0){
        contenedor.innerHTML = `
            <p class="text-slate-500 font-semibold">
                Selecciona boletos para capturar asistentes.
            </p>
        `;
        EstadoCompra.asistentes = [];
        return;
    }

    EstadoCompra.asistentes = tipos.map((tipo,index)=>{

        const anterior = EstadoCompra.asistentes[index] || {};

        if(index === 0 && EstadoCompra.yoSoyAsistente){
            return {
                tipo,
                nombre: EstadoCompra.comprador.nombre,
                bloqueado:true
            };
        }

        return {
            tipo,
            nombre: anterior.bloqueado ? "" : (anterior.nombre || ""),
            bloqueado:false
        };

    });

    contenedor.innerHTML = "";

    EstadoCompra.asistentes.forEach((asistente,index)=>{

        const card = document.createElement("div");
        card.className = asistente.bloqueado
            ? "asistente-card locked"
            : "asistente-card";

        if(asistente.bloqueado){

            card.innerHTML = `
                <div class="field">
                    <label>Boleto ${index + 1} - ${asistente.tipo}</label>
                    <input
                        type="text"
                        value="${asistente.nombre || 'Se usará el nombre del comprador'}"
                        disabled
                    >
                    <div class="asistente-note">
                        Este boleto quedará a nombre del comprador.
                    </div>
                </div>
            `;

        }else{

            card.innerHTML = `
                <div class="field">
                    <label>Boleto ${index + 1} - ${asistente.tipo}</label>
                    <input
                        type="text"
                        placeholder="Nombre del asistente"
                        value="${asistente.nombre || ''}"
                        data-asistente-index="${index}"
                    >
                </div>
            `;

        }

        contenedor.appendChild(card);

    });

    contenedor.querySelectorAll("[data-asistente-index]").forEach(input=>{

        input.addEventListener("input",()=>{

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

    document.querySelectorAll("[data-resumen-general]").forEach(el=>{
        el.textContent = EstadoCompra.general;
    });

    document.querySelectorAll("[data-resumen-vip]").forEach(el=>{
        el.textContent = EstadoCompra.vip;
    });

    document.querySelectorAll("[data-resumen-total]").forEach(el=>{
        el.textContent = `$${total} MXN`;
    });

}

function validarCompra(){

    const total = EstadoCompra.general + EstadoCompra.vip;

    if(total === 0){
        return "Selecciona al menos un boleto";
    }

    if(EstadoCompra.vip > 0 && (EstadoCompra.vip < 4 || EstadoCompra.vip > 8)){
        return "VIP es mesa reservada: mínimo 4 y máximo 8 boletos";
    }

    if(!EstadoCompra.comprador.nombre){
        return "Captura el nombre del comprador";
    }

    if(!EstadoCompra.comprador.correo){
        return "Captura el correo del comprador";
    }

    return null;

}

function construirPayload(){

    const boletos = EstadoCompra.asistentes.map(asistente => ({
        tipo: asistente.tipo,
        nombre: asistente.nombre || EstadoCompra.comprador.nombre
    }));

    return {
        comprador:{
            nombre: EstadoCompra.comprador.nombre,
            correo: EstadoCompra.comprador.correo,
            telefono: EstadoCompra.comprador.telefono
        },
        boletos
    };

}

function generarLinksBoletosHTML(boletos){

    if(!Array.isArray(boletos) || boletos.length === 0){
        return "";
    }

    return boletos.map(boleto => `
        <div style="
            margin-top:14px;
            padding:14px;
            border-radius:14px;
            background:#FFFFFF;
            color:#064E3B;
            border:1px solid #A7F3D0;
        ">
            <strong>${boleto.folio}</strong> - ${boleto.nombre}<br>
            <span style="font-size:13px;">${boleto.tipo}</span><br>
            <a
                href="${boleto.pdfUrl}"
                target="_blank"
                rel="noopener noreferrer"
                style="display:inline-block;margin-top:8px;color:#047857;text-decoration:underline;font-weight:900;"
            >
                Abrir / descargar boleto PDF
            </a>
        </div>
    `).join("");

}

async function confirmarCompra(){

    const error = validarCompra();

    if(error){
        alert(error);
        return;
    }

    const boton = document.querySelector("[data-accion-comprar]");
    const resultado = document.getElementById("resultadoCompra");

    try{

        boton.disabled = true;
        boton.textContent = "Generando boletos...";

        const payload = construirPayload();

        const data = await Api.comprarBoletos(payload);

<<<<<<< HEAD
        const linksBoletos = generarLinksBoletosHTML(data.boletos);

        resultado.style.display = "block";
        resultado.innerHTML = `
            Compra generada correctamente.<br>
            Compra: ${data.compraId}<br>
            Boletos: ${data.total}<br>
            Correo: ${data.correo?.enviado ? "Enviado" : "No enviado"}<br>
            <br>
            ${linksBoletos}
        `;
=======
       const linksBoletos = data.boletos.map(boleto => `
    <div style="margin-top:10px;">
        <strong>${boleto.folio}</strong> - ${boleto.nombre}<br>
        <a
            href="${boleto.pdfUrl}"
            target="_blank"
            style="color:#065F46;text-decoration:underline;"
        >
            Abrir / descargar boleto PDF
        </a>
    </div>
`).join('');

resultado.style.display = "block";
resultado.innerHTML = `
    Compra generada correctamente.<br>
    Compra: ${data.compraId}<br>
    Boletos: ${data.total}<br>
    Correo: ${data.correo?.enviado ? "Enviado" : "No enviado"}<br>
    <br>
    ${linksBoletos}
`;
>>>>>>> 4560f1ac930ea18c2ee4157ea93d8b0d47a89a46

        resultado.scrollIntoView({
            behavior:"smooth",
            block:"center"
        });

    }catch(error){

        console.error(error);
        alert(error.message || "No se pudo generar la compra");

    }finally{

        boton.disabled = false;
        boton.textContent = "Generar boletos";

    }

}

function irACompra(){

    document
        .getElementById("boletos")
        .scrollIntoView({ behavior:"smooth" });

}
