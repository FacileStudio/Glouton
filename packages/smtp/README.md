# @repo/smtp

SMTP email service with professional French cold outreach templates.

## Features

- Nodemailer-based SMTP service
- Pre-built French email templates optimized for cold outreach
- Template variable system
- HTML and text versions of all emails
- Connection verification

## Installation

```bash
bun install
```

## Configuration

Set up environment variables:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM_NAME=Your Name
SMTP_FROM_EMAIL=your-email@gmail.com
```

## Usage

```typescript
import { SMTPService, renderTemplate } from '@repo/smtp';

const smtp = new SMTPService({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  from: {
    name: process.env.SMTP_FROM_NAME,
    email: process.env.SMTP_FROM_EMAIL,
  },
});

const rendered = renderTemplate('introduction', {
  recipientName: 'Jean',
  companyName: 'Acme Corp',
  yourName: 'Marie',
  yourCompany: 'Solutions Pro',
  value: 'Augmenter votre conversion de 30% en 3 mois',
});

if (rendered) {
  await smtp.sendEmail({
    to: 'jean@acme.com',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
```

## Available Templates

- `introduction`: Warm introduction email
- `followUp`: Gentle follow-up reminder
- `valueProposition`: Value-focused pitch with benefits
- `caseStudy`: Results-driven case study email

## Template Variables

Each template requires specific variables. Check `src/templates.ts` for details.
