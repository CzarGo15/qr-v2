/*
====================================================
EXELARIS Tickets
Archivo: server.js
Usar este archivo si Render ejecuta "node server.js" desde raíz.
====================================================
*/

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { requireRole } = require('./backend/middleware/adminAuth');

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

/* Público */
app.use('/api/auth', require('./backend/routes/auth'));
app.use('/api/eventos', require('./backend/routes/eventos'));
app.use('/api/boletos', require('./backend/routes/boletos'));

/* Admin protegido */
app.use('/api/upload', requireRole(['admin']), require('./backend/routes/upload'));
app.use('/api/dashboard', requireRole(['admin']), require('./backend/routes/dashboard'));
app.use('/api/compras', requireRole(['admin','taquilla']), require('./backend/routes/compras'));
app.use('/api/taquilla', requireRole(['admin','taquilla']), require('./backend/routes/taquilla'));
app.use('/api/lotes', requireRole(['admin']), require('./backend/routes/lotes'));
app.use('/api/acceso', requireRole(['admin','validador']), require('./backend/routes/acceso'));
app.use('/api/validar', requireRole(['admin','validador']), require('./backend/routes/validar'));
app.use('/api/inventario', requireRole(['admin']), require('./backend/routes/inventario'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Servidor EXELARIS corriendo en puerto ${PORT}`);
});
