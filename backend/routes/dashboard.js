const express = require('express');
const db = require('../firebase');

const router = express.Router();

/*
==================================
ESTADÍSTICAS
GET /api/dashboard/estadisticas
==================================
*/

router.get('/estadisticas', async (req, res) => {

    try {

        const snapshot =
            await db
                .collection('boletos')
                .get();

        let total = 0;
        let vip = 0;
        let general = 0;
        let usados = 0;
        let activos = 0;
        let ingresos = 0;

        snapshot.forEach(doc => {

            const boleto = doc.data();

            total++;

            ingresos += boleto.precio || 0;

            if (boleto.tipo === 'VIP') {
                vip++;
            } else {
                general++;
            }

            if (boleto.estado === 'usado') {
                usados++;
            } else {
                activos++;
            }

        });

        return res.json({

            success: true,

            estadisticas: {

                total,
                vip,
                general,
                usados,
                activos,
                ingresos

            }

        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

/*
==================================
LISTAR BOLETOS
GET /api/dashboard/boletos
==================================
*/

router.get('/boletos', async (req, res) => {

    try {

        const snapshot =
            await db
                .collection('boletos')
                .orderBy(
                    'fechaCompra',
                    'desc'
                )
                .get();

        const boletos = [];

        snapshot.forEach(doc => {

            boletos.push(doc.data());

        });

        return res.json({

            success: true,

            total: boletos.length,

            boletos

        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

/*
==================================
BUSCAR BOLETO
GET /api/dashboard/buscar/:folio
==================================
*/

router.get('/buscar/:folio', async (req, res) => {

    try {

        const { folio } = req.params;

        const snapshot =
            await db
                .collection('boletos')
                .where(
                    'folio',
                    '==',
                    folio
                )
                .get();

        if (snapshot.empty) {

            return res.json({

                success: false,

                error: 'BOLETO NO ENCONTRADO'

            });

        }

        let boleto = null;

        snapshot.forEach(doc => {

            boleto = doc.data();

        });

        return res.json({

            success: true,

            boleto

        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

module.exports = router;
