/*
====================================================
EXELARIS Tickets
Archivo: server.js
Usar este archivo si Render ejecuta backend/server.js.
====================================================
*/

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { requireRole } = require('./middleware/adminAuth');

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
app.use('/api/auth', require('./routes/auth'));
app.use('/api/eventos', require('./routes/eventos'));
app.use('/api/boletos', require('./routes/boletos'));

/* Admin protegido */
app.use('/api/upload', requireRole(['admin']), require('./routes/upload'));
app.use('/api/dashboard', requireRole(['admin']), require('./routes/dashboard'));
app.use('/api/compras', requireRole(['admin','taquilla']), require('./routes/compras'));
app.use('/api/taquilla', requireRole(['admin','taquilla']), require('./routes/taquilla'));
app.use('/api/lotes', requireRole(['admin']), require('./routes/lotes'));
app.use('/api/acceso', requireRole(['admin','validador']), require('./routes/acceso'));
app.use('/api/validar', requireRole(['admin','validador']), require('./routes/validar'));
app.use('/api/inventario', requireRole(['admin']), require('./routes/inventario'));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Servidor EXELARIS corriendo en puerto ${PORT}`);
});
