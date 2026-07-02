const express = require('express');
const db = require('../firebase');

const router = express.Router();

/*
==================================
CONSULTAR BOLETO
POST /api/validar/buscar
==================================
*/

router.post('/buscar', async (req, res) => {

    try {

        const { uuid } = req.body;

        console.log('================================');
        console.log('BUSCANDO QR:', uuid);
        console.log('================================');

        if (!uuid) {

            return res.status(400).json({
                success: false,
                error: 'UUID requerido'
            });

        }

        const doc = await db
            .collection('boletos')
            .doc(uuid)
            .get();

        if (!doc.exists) {

            console.log('❌ BOLETO NO ENCONTRADO');

            return res.json({
                success: false,
                error: 'BOLETO NO ENCONTRADO'
            });

        }

        const boleto = doc.data();

        console.log('FOLIO:', boleto.folio);
        console.log('ESTADO:', boleto.estado);
        console.log('UUID:', boleto.uuid);

        const estado = String(
            boleto.estado || ''
        )
        .trim()
        .toLowerCase();

        if (estado === 'usado') {

            console.log('🚫 BOLETO YA UTILIZADO');

            return res.json({
                success: false,
                usado: true,
                error: 'BOLETO YA UTILIZADO',
                boleto
            });

        }

        console.log('✅ BOLETO ACTIVO');

        return res.json({
            success: true,
            boleto
        });

    } catch (error) {

        console.error(
            'ERROR BUSCAR:',
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message
        });

    }

});

/*
==================================
CONFIRMAR ACCESO
POST /api/validar/confirmar
==================================
*/

router.post('/confirmar', async (req, res) => {

    try {

        const {
            uuid,
            validador
        } = req.body;

        console.log(
            'CONFIRMANDO:',
            uuid
        );

        const ref = db
            .collection('boletos')
            .doc(uuid);

        const doc = await ref.get();

        if (!doc.exists) {

            return res.json({
                success: false,
                error: 'BOLETO NO ENCONTRADO'
            });

        }

        const boleto = doc.data();

        const estado = String(
            boleto.estado || ''
        )
        .trim()
        .toLowerCase();

        if (estado === 'usado') {

            console.log(
                '🚫 INTENTO DE REUSO'
            );

            return res.json({
                success: false,
                error: 'BOLETO YA UTILIZADO'
            });

        }

        await ref.update({

            estado: 'usado',

            validadoPor: validador,

            fechaValidacion: new Date()

        });

        console.log(
            '✅ ACCESO REGISTRADO:',
            boleto.folio
        );

        return res.json({
            success: true,
            mensaje: 'ACCESO REGISTRADO'
        });

    } catch (error) {

        console.error(
            'ERROR CONFIRMAR:',
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message
        });

    }

});

module.exports = router;
