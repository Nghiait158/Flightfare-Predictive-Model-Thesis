/**
 * Subscription Routes
 * API endpoints for email notification subscriptions
 */

const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');

// Create a new subscription
router.post('/', subscriptionController.createSubscription.bind(subscriptionController));

// Get user's subscriptions
router.get('/', subscriptionController.getSubscriptions.bind(subscriptionController));

// Delete/cancel a subscription
router.delete('/:id', subscriptionController.deleteSubscription.bind(subscriptionController));

// Send test email
router.post('/test-email', subscriptionController.sendTestEmail.bind(subscriptionController));

// Trigger notification check manually (admin/testing)
router.post('/check-now', subscriptionController.triggerCheck.bind(subscriptionController));

// Get statistics (admin)
router.get('/stats', subscriptionController.getStatistics.bind(subscriptionController));

// Get notification logs for a subscription
router.get('/:id/logs', subscriptionController.getNotificationLogs.bind(subscriptionController));

module.exports = router;
