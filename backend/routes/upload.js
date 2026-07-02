const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const {
    subirFlyer
} = require('../services/storage');

const router = express.Router();

const upload = multer({

    dest: 'temp/'

});

/*
==================================
SUBIR FLYER
POST /api/upload/flyer
==================================
*/

router.post(
    '/flyer',
    upload.single('flyer'),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({

                    success: false,
                    error: 'No se recibió archivo'

                });

            }

            const url =
    await subirFlyer(
        req.file.path,
        req.file.originalname
    );
            fs.unlinkSync(
                req.file.path
            );

            res.json({

                success: true,

                url

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);

module.exports = router;
