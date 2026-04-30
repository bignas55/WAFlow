import nodemailer from "nodemailer";
import { logger } from "./logger";

/**
 * Email Service
 * Handles all email notifications (password reset, approvals, trial warnings, etc.)
 * Uses NodeMailer for SMTP or console fallback in development
 */

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor() {
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   * Uses SMTP config from environment or console in development
   */
  private initializeTransporter() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || "587");
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      logger.warn("EMAIL", "SMTP not configured. Emails will be logged to console");
      this.isConfigured = false;
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      this.isConfigured = true;
      logger.info("EMAIL", "Email service initialized successfully");
    } catch (error) {
      logger.error("EMAIL", "Failed to initialize email transporter", error as Error);
      this.isConfigured = false;
    }
  }

  /**
   * Send email via SMTP or console fallback
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      if (!this.isConfigured || !this.transporter) {
        // Fallback: log to console in development
        console.log("\n=== EMAIL NOTIFICATION ===");
        console.log(`To: ${options.to}`);
        console.log(`Subject: ${options.subject}`);
        console.log(`\n${options.text || options.html}`);
        console.log("==========================\n");
        return true;
      }

      const result = await this.transporter.sendMail({
        from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      logger.info("EMAIL", `Email sent to ${options.to}`, {
        messageId: result.messageId,
        subject: options.subject,
      });

      return true;
    } catch (error) {
      logger.error("EMAIL", `Failed to send email to ${options.to}`, error as Error, {
        subject: options.subject,
      });
      return false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, resetLink: string): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #25D366;">Reset Your Password</h2>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <p>
          <a href="${resetLink}" style="background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `;

    return this.sendEmail({
      to: email,
      subject: "Reset Your Password — WAFlow",
      html,
      text: `Reset your password here: ${resetLink}`,
    });
  }

  /**
   * Send user approval notification
   */
  async sendApprovalNotification(email: string, userName: string): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #25D366;">Account Approved!</h2>
        <p>Hi ${userName},</p>
        <p>Your WAFlow account has been approved and your trial is now active.</p>
        <p>You can now:</p>
        <ul>
          <li>Connect your WhatsApp number</li>
          <li>Configure your AI receptionist</li>
          <li>Start receiving and managing customer conversations</li>
        </ul>
        <p>
          <a href="${process.env.APP_URL}" style="background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Get Started
          </a>
        </p>
      </div>
    `;

    return this.sendEmail({
      to: email,
      subject: "Your WAFlow Account is Ready!",
      html,
      text: "Your account has been approved. Log in to get started.",
    });
  }

  /**
   * Send trial expiration warning
   */
  async sendTrialWarningEmail(email: string, userName: string, daysRemaining: number): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">Your Trial Expires Soon</h2>
        <p>Hi ${userName},</p>
        <p>Your WAFlow trial expires in <strong>${daysRemaining} days</strong>.</p>
        <p>To continue using WAFlow after your trial ends, please upgrade your plan.</p>
        <p>
          <a href="${process.env.APP_URL}/billing" style="background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Pricing Plans
          </a>
        </p>
        <p style="color: #666; font-size: 12px;">All your data will be safe. Upgrade anytime to keep your conversations and customers.</p>
      </div>
    `;

    return this.sendEmail({
      to: email,
      subject: `Your Trial Expires in ${daysRemaining} Days`,
      html,
      text: `Your trial expires in ${daysRemaining} days. Visit ${process.env.APP_URL}/billing to upgrade.`,
    });
  }

  /**
   * Send booking confirmation email
   */
  async sendBookingConfirmationEmail(
    email: string,
    customerName: string,
    serviceName: string,
    date: string,
    time: string
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #25D366;">Booking Confirmed!</h2>
        <p>Hi ${customerName},</p>
        <p>Your booking has been confirmed.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Service:</strong> ${serviceName}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Time:</strong> ${time}</p>
        </div>
        <p style="color: #666; font-size: 12px;">If you need to reschedule or cancel, please contact us as soon as possible.</p>
      </div>
    `;

    return this.sendEmail({
      to: email,
      subject: `Booking Confirmation — ${serviceName}`,
      html,
      text: `Your booking for ${serviceName} on ${date} at ${time} has been confirmed.`,
    });
  }

  /**
   * Send daily summary email
   */
  async sendDailySummaryEmail(
    email: string,
    userName: string,
    stats: {
      messagesReceived: number;
      messagesReplied: number;
      appointmentsBooked: number;
      appointmentsCompleted: number;
    }
  ): Promise<boolean> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #25D366;">Daily Summary</h2>
        <p>Hi ${userName},</p>
        <p>Here's what happened today on WAFlow:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
              <p style="color: #666; margin: 0; font-size: 12px;">MESSAGES</p>
              <p style="color: #25D366; font-size: 24px; font-weight: bold; margin: 5px 0;">${stats.messagesReceived}</p>
              <p style="color: #666; font-size: 12px; margin: 0;">received</p>
            </div>
            <div>
              <p style="color: #666; margin: 0; font-size: 12px;">APPOINTMENTS</p>
              <p style="color: #25D366; font-size: 24px; font-weight: bold; margin: 5px 0;">${stats.appointmentsBooked}</p>
              <p style="color: #666; font-size: 12px; margin: 0;">booked</p>
            </div>
          </div>
        </div>
        <p>
          <a href="${process.env.APP_URL}" style="background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Dashboard
          </a>
        </p>
      </div>
    `;

    return this.sendEmail({
      to: email,
      subject: "Your Daily Summary — WAFlow",
      html,
      text: `Daily Summary: ${stats.messagesReceived} messages, ${stats.appointmentsBooked} appointments`,
    });
  }
}

export const emailService = new EmailService();
