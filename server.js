require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit:'25mb' }));
app.use(express.urlencoded({ extended:true }));

app.get('/', (req,res) => {
    res.json({
        success:true,
        sistema:'EXELARIS Tickets API',
        estado:'Activo'
    });
});

app.get('/health', (req,res) => {
    res.json({
        success:true,
        message:'API funcionando'
    });
});

/*
====================================================
Rutas API
====================================================
*/

app.use('/api/eventos', require('./backend/routes/eventos'));
app.use('/api/boletos', require('./backend/routes/boletos'));
app.use('/api/validar', require('./backend/routes/validar'));
app.use('/api/upload', require('./backend/routes/upload'));
app.use('/api/dashboard', require('./backend/routes/dashboard'));
app.use('/api/compras', require('./backend/routes/compras'));
app.use('/api/taquilla', require('./backend/routes/taquilla'));
app.use('/api/lotes', require('./backend/routes/lotes'));
app.use('/api/lotes-impresion', require('./backend/routes/lotesImpresion'));
app.use('/api/acceso', require('./backend/routes/acceso'));
app.use('/api/inventario', require('./backend/routes/inventario'));
app.use('/api/clientes', require('./backend/routes/clientes'));

/*
====================================================
Seguridad / Login Admin
====================================================
*/

app.use('/api/auth', require('./backend/routes/auth'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Servidor EXELARIS corriendo en puerto ${PORT}`);
});
