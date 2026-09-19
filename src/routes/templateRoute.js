// routes/templates.js
const router = require('express').Router();
const auth = require('../middleware/authMiddleware'); 
const templateController = require('../controllers/templateController');

router.get('/templates', auth, templateController.listTemplates);
router.post('/templates/:id/use', auth, templateController.useTemplate);
router.post('/documents/:id/save-as-template', auth, templateController.saveAsTemplate);

module.exports = router;