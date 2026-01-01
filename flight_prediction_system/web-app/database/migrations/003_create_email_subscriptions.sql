-- Migration: Create email_subscriptions table for price alert notifications
-- Date: 2026-01-01
-- Description: Allow users to subscribe to email notifications when AI detects optimal booking times

-- Create email_subscriptions table
CREATE TABLE IF NOT EXISTS email_subscriptions (
    subscription_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    departure_airport_id INTEGER REFERENCES airports(airport_id),
    arrival_airport_id INTEGER REFERENCES airports(airport_id),
    departure_date DATE NOT NULL,
    class_id INTEGER REFERENCES new_classes(class_id),

    -- Notification preferences
    notify_on_optimal_time BOOLEAN DEFAULT true,
    notify_on_price_drop BOOLEAN DEFAULT false,
    max_price DECIMAL(12,2), -- Maximum price user is willing to pay

    -- Tracking
    is_active BOOLEAN DEFAULT true,
    last_notification_sent TIMESTAMP,
    notification_count INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP, -- Auto-deactivate after flight date + 1 day

    -- Ensure user can't create duplicate subscriptions
    UNIQUE(email, departure_airport_id, arrival_airport_id, departure_date, class_id)
);

-- Create notification_logs table to track all sent emails
CREATE TABLE IF NOT EXISTS notification_logs (
    log_id SERIAL PRIMARY KEY,
    subscription_id INTEGER REFERENCES email_subscriptions(subscription_id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- 'OPTIMAL_TIME', 'PRICE_DROP', 'WEEKLY_REPORT'
    email_sent_to VARCHAR(255) NOT NULL,

    -- Email content summary
    subject VARCHAR(500),
    recommendation TEXT,
    current_price DECIMAL(12,2),
    optimal_price DECIMAL(12,2),
    savings DECIMAL(12,2),

    -- Status tracking
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'failed', 'bounced'
    error_message TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_subscriptions_email ON email_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_email_subscriptions_active ON email_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_email_subscriptions_departure_date ON email_subscriptions(departure_date);
CREATE INDEX IF NOT EXISTS idx_email_subscriptions_route ON email_subscriptions(departure_airport_id, arrival_airport_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_subscription ON notification_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON notification_logs(sent_at);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_email_subscriptions_updated_at
    BEFORE UPDATE ON email_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE email_subscriptions IS 'Stores user subscriptions for flight price alert notifications via email';
COMMENT ON TABLE notification_logs IS 'Logs all email notifications sent to users';
COMMENT ON COLUMN email_subscriptions.notify_on_optimal_time IS 'Send email when AI detects optimal booking time (default behavior)';
COMMENT ON COLUMN email_subscriptions.notify_on_price_drop IS 'Send email when price drops below max_price threshold';
COMMENT ON COLUMN email_subscriptions.max_price IS 'Maximum acceptable price - used for price drop alerts';
