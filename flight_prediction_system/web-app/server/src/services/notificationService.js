/**
 * Notification Service
 * Handles intelligent notification logic:
 * - Checks subscriptions for optimal booking times
 * - Integrates with Python ML API for optimal booking analysis
 * - Sends email notifications via emailService
 */

const db = require('../config/database');
const emailService = require('./emailService');
const axios = require('axios');

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:5000';

class NotificationService {
    /**
     * Process all active subscriptions and send notifications if needed
     */
    async processSubscriptions() {
        console.log('🔄 Starting subscription processing...');

        try {
            // Get all active subscriptions
            const subscriptions = await this.getActiveSubscriptions();
            console.log(`📋 Found ${subscriptions.length} active subscriptions`);

            let sentCount = 0;
            let errorCount = 0;

            // Process each subscription
            for (const subscription of subscriptions) {
                try {
                    const shouldNotify = await this.shouldSendNotification(subscription);

                    if (shouldNotify.send) {
                        await this.sendNotificationForSubscription(subscription, shouldNotify.analysis);
                        sentCount++;
                    }
                } catch (error) {
                    console.error(`❌ Error processing subscription ${subscription.subscription_id}:`, error.message);
                    errorCount++;
                }
            }

            console.log(`✅ Processing complete: ${sentCount} sent, ${errorCount} errors`);

            return {
                total: subscriptions.length,
                sent: sentCount,
                errors: errorCount
            };
        } catch (error) {
            console.error('❌ Failed to process subscriptions:', error);
            throw error;
        }
    }

    /**
     * Get all active subscriptions that need to be checked
     */
    async getActiveSubscriptions() {
        const query = `
            SELECT
                es.*,
                dep_airport.airport_code as departure_code,
                arr_airport.airport_code as arrival_code,
                dep_airport.city as departure_city,
                arr_airport.city as arrival_city,
                nc.class_name
            FROM email_subscriptions es
            JOIN airports dep_airport ON es.departure_airport_id = dep_airport.airport_id
            JOIN airports arr_airport ON es.arrival_airport_id = arr_airport.airport_id
            JOIN new_classes nc ON es.class_id = nc.class_id
            WHERE es.is_active = true
                AND es.departure_date >= CURRENT_DATE
                AND (es.expires_at IS NULL OR es.expires_at > CURRENT_TIMESTAMP)
            ORDER BY es.departure_date ASC
        `;

        const result = await db.query(query);
        return result.rows;
    }

    /**
     * Determine if notification should be sent for a subscription
     *
     * @param {Object} subscription - Subscription record
     * @returns {Object} - { send: boolean, analysis: Object }
     */
    async shouldSendNotification(subscription) {
        try {
            // Calculate days until flight
            const today = new Date();
            const flightDate = new Date(subscription.departure_date);
            const daysUntilFlight = Math.ceil((flightDate - today) / (1000 * 60 * 60 * 24));

            // Skip if flight is too soon or already passed
            if (daysUntilFlight < 0) {
                // Deactivate expired subscription
                await this.deactivateSubscription(subscription.subscription_id);
                return { send: false, reason: 'Flight date passed' };
            }

            // Get optimal booking analysis from ML API
            const route = `${subscription.departure_code}-${subscription.arrival_code}`;
            const analysis = await this.getOptimalBookingAnalysis({
                route: route,
                class_name: subscription.class_name,
                flight_date: subscription.departure_date,
                current_days_before: daysUntilFlight
            });

            if (!analysis) {
                return { send: false, reason: 'Failed to get analysis' };
            }

            // Decision logic for sending notification
            const shouldSend = this.evaluateNotificationCriteria(subscription, analysis);

            return {
                send: shouldSend.send,
                reason: shouldSend.reason,
                analysis: analysis
            };

        } catch (error) {
            console.error('Error in shouldSendNotification:', error);
            return { send: false, reason: error.message };
        }
    }

    /**
     * Evaluate if subscription meets criteria for notification
     */
    evaluateNotificationCriteria(subscription, analysis) {
        // Don't spam: check if we sent a notification recently
        if (subscription.last_notification_sent) {
            const hoursSinceLastNotification = (Date.now() - new Date(subscription.last_notification_sent)) / (1000 * 60 * 60);

            // Don't send more than once per 24 hours
            if (hoursSinceLastNotification < 24) {
                return {
                    send: false,
                    reason: `Last notification sent ${hoursSinceLastNotification.toFixed(1)} hours ago`
                };
            }
        }

        // Limit total notifications per subscription
        if (subscription.notification_count >= 5) {
            return {
                send: false,
                reason: 'Maximum notifications reached'
            };
        }

        // Primary criteria: OPTIMAL status
        if (analysis.status === 'OPTIMAL') {
            return {
                send: true,
                reason: 'Optimal booking time detected!'
            };
        }

        // Secondary criteria: About to become optimal (1-2 days away)
        if (analysis.status === 'WAIT' && analysis.days_to_wait <= 2 && analysis.days_to_wait > 0) {
            return {
                send: true,
                reason: `Optimal time in ${analysis.days_to_wait} day(s)`
            };
        }

        // Urgent criteria: Past optimal and price rising (BUY_NOW)
        if (analysis.status === 'BUY_NOW' && subscription.notification_count === 0) {
            // Only send this once
            return {
                send: true,
                reason: 'Past optimal window - urgent notification'
            };
        }

        // Price drop criteria (if enabled and max_price is set)
        if (subscription.notify_on_price_drop && subscription.max_price) {
            if (analysis.current_price_estimate <= subscription.max_price) {
                return {
                    send: true,
                    reason: `Price dropped to ${analysis.current_price_estimate} (below ${subscription.max_price})`
                };
            }
        }

        return {
            send: false,
            reason: 'No notification criteria met'
        };
    }

    /**
     * Get optimal booking analysis from ML API
     */
    async getOptimalBookingAnalysis({ route, class_name, flight_date, current_days_before }) {
        try {
            const response = await axios.post(`${ML_API_URL}/analyze-optimal-booking`, {
                route: route,
                class_name: class_name,
                flight_date: flight_date,
                current_days_before: current_days_before
            }, {
                timeout: 10000 // 10 second timeout
            });

            return response.data;
        } catch (error) {
            console.error('Failed to get optimal booking analysis:', error.message);
            return null;
        }
    }

    /**
     * Send notification email for a subscription
     */
    async sendNotificationForSubscription(subscription, analysis) {
        try {
            const route = `${subscription.departure_code}-${subscription.arrival_code}`;

            // Send email
            const emailResult = await emailService.sendOptimalTimeNotification({
                to: subscription.email,
                route: route,
                flightDate: subscription.departure_date,
                analysis: analysis,
                flightClass: subscription.class_name
            });

            if (emailResult.success) {
                // Log successful notification
                await this.logNotification({
                    subscription_id: subscription.subscription_id,
                    email_sent_to: subscription.email,
                    notification_type: 'OPTIMAL_TIME',
                    subject: `Optimal booking time for ${route}`,
                    recommendation: analysis.recommendation,
                    current_price: analysis.current_price_estimate,
                    optimal_price: analysis.optimal_price_estimate,
                    savings: analysis.savings,
                    status: 'sent'
                });

                // Update subscription
                await this.updateSubscriptionAfterNotification(subscription.subscription_id);

                console.log(`✅ Notification sent to ${subscription.email} for ${route}`);
            } else {
                // Log failed notification
                await this.logNotification({
                    subscription_id: subscription.subscription_id,
                    email_sent_to: subscription.email,
                    notification_type: 'OPTIMAL_TIME',
                    status: 'failed',
                    error_message: emailResult.error
                });

                console.error(`❌ Failed to send email to ${subscription.email}:`, emailResult.error);
            }

            return emailResult;
        } catch (error) {
            console.error('Error sending notification:', error);
            throw error;
        }
    }

    /**
     * Log notification in database
     */
    async logNotification(log) {
        const query = `
            INSERT INTO notification_logs (
                subscription_id, notification_type, email_sent_to,
                subject, recommendation, current_price, optimal_price,
                savings, status, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING log_id
        `;

        const values = [
            log.subscription_id,
            log.notification_type,
            log.email_sent_to,
            log.subject || null,
            log.recommendation || null,
            log.current_price || null,
            log.optimal_price || null,
            log.savings || null,
            log.status,
            log.error_message || null
        ];

        await db.query(query, values);
    }

    /**
     * Update subscription after sending notification
     */
    async updateSubscriptionAfterNotification(subscriptionId) {
        const query = `
            UPDATE email_subscriptions
            SET last_notification_sent = CURRENT_TIMESTAMP,
                notification_count = notification_count + 1
            WHERE subscription_id = $1
        `;

        await db.query(query, [subscriptionId]);
    }

    /**
     * Deactivate expired subscription
     */
    async deactivateSubscription(subscriptionId) {
        const query = `
            UPDATE email_subscriptions
            SET is_active = false,
                updated_at = CURRENT_TIMESTAMP
            WHERE subscription_id = $1
        `;

        await db.query(query, [subscriptionId]);
        console.log(`🔕 Deactivated subscription ${subscriptionId}`);
    }

    /**
     * Get notification statistics
     */
    async getStatistics() {
        const query = `
            SELECT
                COUNT(*) FILTER (WHERE is_active = true) as active_subscriptions,
                COUNT(*) FILTER (WHERE is_active = false) as inactive_subscriptions,
                COUNT(*) FILTER (WHERE departure_date < CURRENT_DATE) as expired_flights,
                (SELECT COUNT(*) FROM notification_logs WHERE sent_at > CURRENT_DATE) as notifications_today,
                (SELECT COUNT(*) FROM notification_logs WHERE status = 'sent') as total_sent,
                (SELECT COUNT(*) FROM notification_logs WHERE status = 'failed') as total_failed
            FROM email_subscriptions
        `;

        const result = await db.query(query);
        return result.rows[0];
    }
}

module.exports = new NotificationService();
