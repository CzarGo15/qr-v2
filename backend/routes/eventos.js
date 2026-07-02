const express = require('express');
const db = require('../firebase');

const router = express.Router();

/*
==================================
LISTAR EVENTOS
GET /api/eventos
==================================
*/

router.get('/', async (req, res) => {

    try {

        const snapshot =
            await db
                .collection('eventos')
                .get();

        const eventos = [];

        snapshot.forEach(doc => {

            eventos.push({

                id: doc.id,

                ...doc.data()

            });

        });

        res.json(eventos);

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            error: error.message

        });

    }

});

/*
==================================
OBTENER EVENTO
GET /api/eventos/:id
==================================
*/

router.get('/:id', async (req, res) => {

    try {

        const doc =
            await db
                .collection('eventos')
                .doc(req.params.id)
                .get();

        if (!doc.exists) {

            return res.status(404).json({

                success: false,
                error: 'Evento no encontrado'

            });

        }

        res.json({

            id: doc.id,

            ...doc.data()

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            error: error.message

        });

    }

});

/*
==================================
CREAR EVENTO
POST /api/eventos
==================================
*/

router.post('/', async (req, res) => {

    try {

        const evento = {

            ...req.body,

            fechaCreacion:
                new Date()

        };

        const docRef =
            await db
                .collection('eventos')
                .add(evento);

        res.json({

            success: true,

            id: docRef.id

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            error: error.message

        });

    }

});

/*
==================================
ACTUALIZAR EVENTO
PUT /api/eventos/:id
==================================
*/

router.put('/:id', async (req, res) => {

    try {

        await db
            .collection('eventos')
            .doc(req.params.id)
            .update(req.body);

        res.json({

            success: true

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            error: error.message

        });

    }

});

/*
==================================
ELIMINAR EVENTO
DELETE /api/eventos/:id
==================================
*/

router.delete('/:id', async (req, res) => {

    try {

        await db
            .collection('eventos')
            .doc(req.params.id)
            .delete();

        res.json({

            success: true

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,
            error: error.message

        });

    }

});

module.exports = router;
