/**
 * Scheduler Service
 * Manages cron jobs for automated notification processing
 *
 * Uses node-cron for scheduling tasks
 * Default: Check subscriptions every 6 hours (at 6am, 12pm, 6pm, 12am)
 */

const cron = require('node-cron');
const notificationService = require('./notificationService');

class Scheduler {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    /**
     * Start all scheduled jobs
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ Scheduler is already running');
            return;
        }

        console.log('🕐 Starting scheduler...');

        // Job 1: Process subscriptions every 6 hours
        // Cron pattern: "0 */6 * * *" = At minute 0 past every 6th hour (0:00, 6:00, 12:00, 18:00)
        const subscriptionJob = cron.schedule('0 */6 * * *', async () => {
            console.log('⏰ Running scheduled subscription check...');
            try {
                const result = await notificationService.processSubscriptions();
                console.log('✅ Subscription check completed:', result);
            } catch (error) {
                console.error('❌ Subscription check failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'Asia/Ho_Chi_Minh' // Vietnam timezone
        });

        this.jobs.set('subscriptionCheck', subscriptionJob);

        // Job 2: Cleanup expired subscriptions daily at 2am
        const cleanupJob = cron.schedule('0 2 * * *', async () => {
            console.log('🧹 Running daily cleanup...');
            try {
                await this.cleanupExpiredSubscriptions();
                console.log('✅ Cleanup completed');
            } catch (error) {
                console.error('❌ Cleanup failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'Asia/Ho_Chi_Minh'
        });

        this.jobs.set('dailyCleanup', cleanupJob);

        // Job 3: Log statistics every day at 8am
        const statsJob = cron.schedule('0 8 * * *', async () => {
            console.log('📊 Generating daily statistics...');
            try {
                const stats = await notificationService.getStatistics();
                console.log('📊 Daily Stats:', stats);
            } catch (error) {
                console.error('❌ Stats generation failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'Asia/Ho_Chi_Minh'
        });

        this.jobs.set('dailyStats', statsJob);

        this.isRunning = true;
        console.log('✅ Scheduler started successfully with', this.jobs.size, 'jobs');
        console.log('📋 Scheduled jobs:');
        console.log('  - Subscription check: Every 6 hours (0:00, 6:00, 12:00, 18:00)');
        console.log('  - Cleanup expired: Daily at 2:00 AM');
        console.log('  - Statistics log: Daily at 8:00 AM');
    }

    /**
     * Stop all scheduled jobs
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ Scheduler is not running');
            return;
        }

        console.log('🛑 Stopping scheduler...');

        this.jobs.forEach((job, name) => {
            job.stop();
            console.log(`  ✓ Stopped: ${name}`);
        });

        this.jobs.clear();
        this.isRunning = false;

        console.log('✅ Scheduler stopped');
    }

    /**
     * Run subscription check manually (for testing or on-demand)
     */
    async runSubscriptionCheckNow() {
        console.log('▶️ Running subscription check manually...');
        try {
            const result = await notificationService.processSubscriptions();
            console.log('✅ Manual subscription check completed:', result);
            return result;
        } catch (error) {
            console.error('❌ Manual subscription check failed:', error);
            throw error;
        }
    }

    /**
     * Cleanup expired subscriptions
     */
    async cleanupExpiredSubscriptions() {
        const db = require('../config/database');

        // Deactivate subscriptions for flights that have already departed
        const query = `
            UPDATE email_subscriptions
            SET is_active = false,
                updated_at = CURRENT_TIMESTAMP
            WHERE is_active = true
                AND departure_date < CURRENT_DATE
            RETURNING subscription_id
        `;

        const result = await db.query(query);
        console.log(`🧹 Deactivated ${result.rows.length} expired subscriptions`);

        return result.rows.length;
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            jobCount: this.jobs.size,
            jobs: Array.from(this.jobs.keys())
        };
    }

    /**
     * Add a custom job
     */
    addJob(name, cronExpression, task, options = {}) {
        if (this.jobs.has(name)) {
            console.log(`⚠️ Job "${name}" already exists. Use removeJob first.`);
            return false;
        }

        const job = cron.schedule(cronExpression, task, {
            scheduled: true,
            timezone: options.timezone || 'Asia/Ho_Chi_Minh',
            ...options
        });

        this.jobs.set(name, job);
        console.log(`✅ Added job: ${name}`);
        return true;
    }

    /**
     * Remove a job
     */
    removeJob(name) {
        const job = this.jobs.get(name);
        if (!job) {
            console.log(`⚠️ Job "${name}" not found`);
            return false;
        }

        job.stop();
        this.jobs.delete(name);
        console.log(`✅ Removed job: ${name}`);
        return true;
    }
}

// Export singleton instance
const scheduler = new Scheduler();
module.exports = scheduler;
