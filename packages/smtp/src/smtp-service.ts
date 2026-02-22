import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { SMTPConfig, EmailOptions } from './types';

export class SMTPService {
  private transporter: Transporter;
  private config: SMTPConfig;

  

  constructor(config: SMTPConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });
  }

  

  async sendEmail(options: EmailOptions): Promise<void> {
    await this.transporter.sendMail({
      from: `"${this.config.from.name}" <${this.config.from.email}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }

  

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('SMTP connection verification failed:', error);
      return false;
    }
  }

  

  async close(): Promise<void> {
    this.transporter.close();
  }
}
