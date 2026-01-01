/**
 * Email Notification Service
 * Handles sending email notifications using Gmail SMTP
 *
 * Setup Instructions:
 * 1. Create a Gmail account or use existing one
 * 2. Enable 2-Step Verification: https://myaccount.google.com/security
 * 3. Create App Password: https://myaccount.google.com/apppasswords
 * 4. Add to .env file:
 *    EMAIL_USER=your.email@gmail.com
 *    EMAIL_APP_PASSWORD=your-16-char-app-password
 *    EMAIL_FROM_NAME=Flight Price Alert System
 */

const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        // Initialize transporter with Gmail SMTP
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            }
        });

        this.fromEmail = process.env.EMAIL_USER;
        this.fromName = process.env.EMAIL_FROM_NAME || 'Flight Price Alert';
    }

    /**
     * Verify email service connection
     */
    async verifyConnection() {
        try {
            await this.transporter.verify();
            console.log('✅ Email service is ready to send emails');
            return true;
        } catch (error) {
            console.error('❌ Email service connection failed:', error.message);
            return false;
        }
    }

    /**
     * Send optimal booking time notification
     *
     * @param {Object} params - Email parameters
     * @param {string} params.to - Recipient email
     * @param {string} params.route - Flight route (e.g., "SGN-HAN")
     * @param {string} params.flightDate - Flight date
     * @param {Object} params.analysis - Optimal booking analysis result
     */
    async sendOptimalTimeNotification({ to, route, flightDate, analysis, flightClass }) {
        try {
            const [departure, arrival] = route.split('-');

            // Format numbers
            const formatVND = (num) => new Intl.NumberFormat('vi-VN').format(num);

            // Determine status message
            let statusMessage = '';
            let actionRecommendation = '';

            if (analysis.status === 'OPTIMAL') {
                statusMessage = '🎯 <strong>ĐÂY LÀ THỜI ĐIỂM TỐI ưu ĐỂ MUA VÉ!</strong>';
                actionRecommendation = '<p style="background-color: #d4edda; padding: 15px; border-left: 4px solid #28a745; margin: 20px 0;">📌 <strong>Khuyến nghị:</strong> Bạn nên đặt vé ngay hôm nay để có được giá tốt nhất!</p>';
            } else if (analysis.status === 'WAIT') {
                statusMessage = '⏰ Chưa phải lúc tốt nhất để mua vé';
                actionRecommendation = `<p style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">📌 <strong>Khuyến nghị:</strong> Nên đợi thêm ${analysis.days_to_wait} ngày (đến ${analysis.optimal_date}) để có giá tốt hơn!</p>`;
            } else { // BUY_NOW
                statusMessage = '⚠️ Bạn đã bỏ lỡ thời điểm tối ưu';
                actionRecommendation = '<p style="background-color: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">📌 <strong>Khuyến nghị:</strong> Nên mua vé ngay để tránh giá tăng thêm!</p>';
            }

            const emailHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thông báo thời điểm đặt vé tối ưu</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">✈️ Thông Báo Giá Vé Máy Bay</h1>
            <p style="color: #ffffff; margin: 10px 0 0 0; opacity: 0.9;">Hệ thống AI phát hiện thời điểm đặt vé tối ưu</p>
        </div>

        <!-- Main Content -->
        <div style="padding: 30px;">
            <!-- Flight Info -->
            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                <h2 style="margin: 0 0 15px 0; color: #333; font-size: 18px;">📍 Thông tin chuyến bay</h2>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; color: #666;">Tuyến bay:</td>
                        <td style="padding: 8px 0; color: #333; font-weight: bold;">${departure} → ${arrival}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #666;">Ngày bay:</td>
                        <td style="padding: 8px 0; color: #333; font-weight: bold;">${new Date(flightDate).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #666;">Hạng vé:</td>
                        <td style="padding: 8px 0; color: #333; font-weight: bold;">${flightClass}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #666;">Còn lại:</td>
                        <td style="padding: 8px 0; color: #333; font-weight: bold;">${analysis.current_days_before} ngày</td>
                    </tr>
                </table>
            </div>

            <!-- Status Message -->
            <div style="text-align: center; margin: 30px 0;">
                <h2 style="color: #667eea; font-size: 20px; margin: 0;">${statusMessage}</h2>
            </div>

            <!-- Price Analysis -->
            <div style="background-color: #f0f7ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">💰 Phân tích giá vé</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 10px 0; color: #666;">Giá hiện tại:</td>
                        <td style="padding: 10px 0; color: #333; font-weight: bold; text-align: right;">${formatVND(analysis.current_price_estimate)} VNĐ</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; color: #666;">Giá tối ưu dự kiến:</td>
                        <td style="padding: 10px 0; color: #28a745; font-weight: bold; text-align: right;">${formatVND(analysis.optimal_price_estimate)} VNĐ</td>
                    </tr>
                    <tr style="border-top: 2px solid #dee2e6;">
                        <td style="padding: 10px 0; color: #666; font-weight: bold;">Tiết kiệm:</td>
                        <td style="padding: 10px 0; color: ${analysis.savings >= 0 ? '#28a745' : '#dc3545'}; font-weight: bold; font-size: 18px; text-align: right;">
                            ${analysis.savings >= 0 ? '+' : ''}${formatVND(analysis.savings)} VNĐ (${analysis.savings_percent}%)
                        </td>
                    </tr>
                </table>
            </div>

            <!-- Recommendation -->
            ${actionRecommendation}

            <!-- Optimal Booking Info -->
            <div style="background-color: #fff9e6; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #ffd700;">
                <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">📊 Chi tiết phân tích</h3>
                <p style="margin: 5px 0; color: #666;">
                    <strong>Thời điểm tối ưu:</strong> ${analysis.optimal_days_before} ngày trước ngày bay
                </p>
                <p style="margin: 5px 0; color: #666;">
                    <strong>Ngày đặt vé tối ưu:</strong> ${new Date(analysis.optimal_date).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p style="margin: 5px 0; color: #666;">
                    <strong>Độ tin cậy:</strong> ${analysis.confidence} (${analysis.confidence_score}/100)
                </p>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.WEB_APP_URL || 'http://localhost:3000'}"
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                          color: #ffffff; text-decoration: none; padding: 15px 40px;
                          border-radius: 25px; font-weight: bold; font-size: 16px;">
                    🔍 Xem Chi Tiết Trên Website
                </a>
            </div>

            <!-- Footer Info -->
            <div style="border-top: 1px solid #dee2e6; margin-top: 30px; padding-top: 20px; color: #6c757d; font-size: 12px;">
                <p style="margin: 5px 0;">💡 <strong>Lưu ý:</strong> Phân tích này dựa trên dữ liệu lịch sử và mô hình AI. Giá vé thực tế có thể thay đổi theo thời gian thực.</p>
                <p style="margin: 5px 0;">📧 Bạn nhận được email này vì đã đăng ký nhận thông báo giá vé.</p>
                <p style="margin: 5px 0;">🔕 <a href="${process.env.WEB_APP_URL || 'http://localhost:3000'}/unsubscribe" style="color: #667eea;">Hủy đăng ký</a></p>
            </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 12px;">
            <p style="margin: 0;">© 2026 Flight Price Alert System. Powered by AI.</p>
        </div>
    </div>
</body>
</html>
            `;

            const mailOptions = {
                from: `"${this.fromName}" <${this.fromEmail}>`,
                to: to,
                subject: `${analysis.status === 'OPTIMAL' ? '🎯' : analysis.status === 'WAIT' ? '⏰' : '⚠️'} Thông báo giá vé ${departure}-${arrival} | ${analysis.recommendation.split('.')[0]}`,
                html: emailHTML,
                // Plain text fallback
                text: `
Thông Báo Giá Vé Máy Bay

Tuyến bay: ${departure} → ${arrival}
Ngày bay: ${flightDate}
Hạng vé: ${flightClass}
Còn lại: ${analysis.current_days_before} ngày

${statusMessage}

Phân tích giá vé:
- Giá hiện tại: ${formatVND(analysis.current_price_estimate)} VNĐ
- Giá tối ưu dự kiến: ${formatVND(analysis.optimal_price_estimate)} VNĐ
- Tiết kiệm: ${formatVND(analysis.savings)} VNĐ (${analysis.savings_percent}%)

Khuyến nghị: ${analysis.recommendation}

Thời điểm tối ưu: ${analysis.optimal_days_before} ngày trước ngày bay
Ngày đặt vé tối ưu: ${analysis.optimal_date}
Độ tin cậy: ${analysis.confidence} (${analysis.confidence_score}/100)

---
Bạn nhận được email này vì đã đăng ký nhận thông báo giá vé.
                `
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email sent successfully to ${to}: ${info.messageId}`);

            return {
                success: true,
                messageId: info.messageId,
                sentTo: to
            };

        } catch (error) {
            console.error('❌ Failed to send email:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send test email to verify setup
     */
    async sendTestEmail(to) {
        try {
            const mailOptions = {
                from: `"${this.fromName}" <${this.fromEmail}>`,
                to: to,
                subject: '✅ Test Email - Flight Price Alert System',
                html: `
                    <h2>Email Service Test</h2>
                    <p>Congratulations! Your email notification service is working correctly.</p>
                    <p>You can now receive flight price alerts.</p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toISOString()}</p>
                `
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Test email sent to ${to}: ${info.messageId}`);

            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Failed to send test email:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
module.exports = new EmailService();
