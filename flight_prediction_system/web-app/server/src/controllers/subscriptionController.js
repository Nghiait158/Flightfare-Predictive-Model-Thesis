/**
 * Subscription Controller
 * Handles API requests for email notification subscriptions
 */

const db = require('../config/database');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');

class SubscriptionController {
    /**
     * Create a new email subscription
     * POST /api/subscriptions
     *
     * Body: {
     *   email: string,
     *   departure_airport_code: string,
     *   arrival_airport_code: string,
     *   departure_date: string (YYYY-MM-DD),
     *   class_name: string,
     *   notify_on_optimal_time: boolean,
     *   notify_on_price_drop: boolean,
     *   max_price: number
     * }
     */
    async createSubscription(req, res) {
        try {
            const {
                email,
                departure_airport_code,
                arrival_airport_code,
                departure_date,
                class_name,
                notify_on_optimal_time = true,
                notify_on_price_drop = false,
                max_price = null
            } = req.body;

            // Validate required fields
            if (!email || !departure_airport_code || !arrival_airport_code || !departure_date || !class_name) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: email, departure_airport_code, arrival_airport_code, departure_date, class_name'
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid email format'
                });
            }

            // Validate date is in the future
            const flightDate = new Date(departure_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (flightDate < today) {
                return res.status(400).json({
                    success: false,
                    error: 'Departure date must be in the future'
                });
            }

            // Get airport IDs
            const airportQuery = `
                SELECT airport_id, airport_code FROM airports
                WHERE airport_code IN ($1, $2)
            `;
            const airportResult = await db.query(airportQuery, [departure_airport_code, arrival_airport_code]);

            if (airportResult.rows.length !== 2) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid airport codes'
                });
            }

            const departureAirport = airportResult.rows.find(a => a.airport_code === departure_airport_code);
            const arrivalAirport = airportResult.rows.find(a => a.airport_code === arrival_airport_code);

            // Get class ID
            const classQuery = 'SELECT class_id FROM new_classes WHERE class_name = $1';
            const classResult = await db.query(classQuery, [class_name]);

            if (classResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid class name'
                });
            }

            const classId = classResult.rows[0].class_id;

            // Calculate expiration (1 day after flight)
            const expiresAt = new Date(flightDate);
            expiresAt.setDate(expiresAt.getDate() + 1);

            // Create subscription (will fail if duplicate due to UNIQUE constraint)
            const insertQuery = `
                INSERT INTO email_subscriptions (
                    email, departure_airport_id, arrival_airport_id,
                    departure_date, class_id, notify_on_optimal_time,
                    notify_on_price_drop, max_price, expires_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (email, departure_airport_id, arrival_airport_id, departure_date, class_id)
                DO UPDATE SET
                    is_active = true,
                    notify_on_optimal_time = EXCLUDED.notify_on_optimal_time,
                    notify_on_price_drop = EXCLUDED.notify_on_price_drop,
                    max_price = EXCLUDED.max_price,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING subscription_id, created_at
            `;

            const result = await db.query(insertQuery, [
                email,
                departureAirport.airport_id,
                arrivalAirport.airport_id,
                departure_date,
                classId,
                notify_on_optimal_time,
                notify_on_price_drop,
                max_price,
                expiresAt  // Added missing parameter
            ]);

            const subscription = result.rows[0];

            res.status(201).json({
                success: true,
                message: 'Subscription created successfully',
                data: {
                    subscription_id: subscription.subscription_id,
                    email: email,
                    route: `${departure_airport_code} → ${arrival_airport_code}`,
                    departure_date: departure_date,
                    class: class_name,
                    created_at: subscription.created_at
                }
            });

        } catch (error) {
            console.error('Error creating subscription:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create subscription',
                details: error.message
            });
        }
    }

    /**
     * Get user's subscriptions
     * GET /api/subscriptions?email=user@example.com
     */
    async getSubscriptions(req, res) {
        try {
            const { email } = req.query;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Email parameter is required'
                });
            }

            const query = `
                SELECT
                    es.subscription_id,
                    es.email,
                    dep.airport_code as departure_code,
                    dep.city as departure_city,
                    arr.airport_code as arrival_code,
                    arr.city as arrival_city,
                    es.departure_date,
                    nc.class_name,
                    es.notify_on_optimal_time,
                    es.notify_on_price_drop,
                    es.max_price,
                    es.is_active,
                    es.last_notification_sent,
                    es.notification_count,
                    es.created_at
                FROM email_subscriptions es
                JOIN airports dep ON es.departure_airport_id = dep.airport_id
                JOIN airports arr ON es.arrival_airport_id = arr.airport_id
                JOIN new_classes nc ON es.class_id = nc.class_id
                WHERE es.email = $1
                ORDER BY es.departure_date ASC, es.created_at DESC
            `;

            const result = await db.query(query, [email]);

            res.json({
                success: true,
                count: result.rows.length,
                data: result.rows
            });

        } catch (error) {
            console.error('Error fetching subscriptions:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch subscriptions'
            });
        }
    }

    /**
     * Delete/Deactivate a subscription
     * DELETE /api/subscriptions/:id
     */
    async deleteSubscription(req, res) {
        try {
            const { id } = req.params;
            const { email } = req.body; // Verify ownership

            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is required for verification'
                });
            }

            // Deactivate instead of delete (keep for history)
            const query = `
                UPDATE email_subscriptions
                SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE subscription_id = $1 AND email = $2
                RETURNING subscription_id
            `;

            const result = await db.query(query, [id, email]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Subscription not found or unauthorized'
                });
            }

            res.json({
                success: true,
                message: 'Subscription cancelled successfully'
            });

        } catch (error) {
            console.error('Error deleting subscription:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete subscription'
            });
        }
    }

    /**
     * Send test email
     * POST /api/subscriptions/test-email
     */
    async sendTestEmail(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is required'
                });
            }

            const result = await emailService.sendTestEmail(email);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Test email sent successfully',
                    messageId: result.messageId
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: 'Failed to send test email',
                    details: result.error
                });
            }

        } catch (error) {
            console.error('Error sending test email:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to send test email'
            });
        }
    }

    /**
     * Trigger notification check manually (admin/testing)
     * POST /api/subscriptions/check-now
     */
    async triggerCheck(req, res) {
        try {
            const scheduler = require('../services/scheduler');
            const result = await scheduler.runSubscriptionCheckNow();

            res.json({
                success: true,
                message: 'Subscription check completed',
                result: result
            });

        } catch (error) {
            console.error('Error triggering check:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to trigger subscription check'
            });
        }
    }

    /**
     * Get subscription statistics (admin)
     * GET /api/subscriptions/stats
     */
    async getStatistics(req, res) {
        try {
            const stats = await notificationService.getStatistics();

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            console.error('Error fetching statistics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch statistics'
            });
        }
    }

    /**
     * Get notification logs for a subscription
     * GET /api/subscriptions/:id/logs
     */
    async getNotificationLogs(req, res) {
        try {
            const { id } = req.params;

            const query = `
                SELECT
                    log_id,
                    notification_type,
                    subject,
                    recommendation,
                    current_price,
                    optimal_price,
                    savings,
                    status,
                    sent_at,
                    error_message
                FROM notification_logs
                WHERE subscription_id = $1
                ORDER BY sent_at DESC
                LIMIT 20
            `;

            const result = await db.query(query, [id]);

            res.json({
                success: true,
                count: result.rows.length,
                data: result.rows
            });

        } catch (error) {
            console.error('Error fetching notification logs:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch notification logs'
            });
        }
    }
}

module.exports = new SubscriptionController();
