const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticateToken } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authenticateToken);

// GET /api/tickets - Get all tickets with filters
router.get('/', (req, res) => ticketController.getTickets(req, res));

// GET /api/tickets/:ticketId - Get single ticket
router.get('/:ticketId', (req, res) => ticketController.getTicketById(req, res));

// POST /api/tickets/:ticketId/assign - Assign ticket to admin
router.post('/:ticketId/assign', (req, res) => ticketController.assignTicket(req, res));

// PUT /api/tickets/:ticketId - Update ticket
router.put('/:ticketId', (req, res) => ticketController.updateTicket(req, res));

// POST /api/tickets/:ticketId/messages - Add message to ticket
router.post('/:ticketId/messages', (req, res) => ticketController.addMessage(req, res));

// DELETE /api/tickets/:ticketId - Delete ticket
router.delete('/:ticketId', (req, res) => ticketController.deleteTicket(req, res));

module.exports = router;
