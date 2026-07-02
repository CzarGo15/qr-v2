const API_BASE_URL = "https://fiestaretro-api.onrender.com";
const Api = {
  async obtenerEventos(){
    const response = await fetch(`${API_BASE_URL}/api/eventos`);
    if(!response.ok){ throw new Error("No se pudieron cargar los eventos"); }
    return await response.json();
  },
  async comprarBoletos(payload){
    const response = await fetch(`${API_BASE_URL}/api/boletos/comprar`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    return await response.json();
  }
};
