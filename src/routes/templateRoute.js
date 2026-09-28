const router = require('express').Router();
const multer = require('multer');
const auth = require('../middleware/authMiddleware'); 
const templateController = require('../controllers/templateController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/templates', auth, templateController.listTemplates);
router.get('/templates/:id', auth, templateController.getTemplate);
router.get('/templates/:id/download', auth, templateController.downloadTemplate);
router.post('/templates/upload', auth, upload.single('pdf_file'), templateController.uploadTemplate);
router.post('/templates/:id/use', auth, templateController.useTemplate);
router.delete('/templates/:id', auth, templateController.deleteTemplate);
router.post('/documents/:id/save-as-template', auth, templateController.saveAsTemplate);

module.exports = router;