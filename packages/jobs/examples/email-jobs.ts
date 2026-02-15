import type { JobDefinition } from '../src/types';

interface SendEmailData {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

interface SendBulkEmailData {
  recipients: string[];
  subject: string;
  body: string;
}

export const sendEmailJob: JobDefinition<SendEmailData, void> = {
  name: 'send-email',
  processor: async (job) => {
    const { to, subject, body, from } = job.data;

    console.log(`Sending email to ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`From: ${from || 'noreply@example.com'}`);

    await job.updateProgress(50);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await job.updateProgress(100);

    console.log(`Email sent successfully to ${to}`);
  },
  options: {
    concurrency: 5,
  },
};

export const sendBulkEmailJob: JobDefinition<SendBulkEmailData, number> = {
  name: 'send-bulk-email',
  processor: async (job) => {
    const { recipients, subject, body } = job.data;
    let sentCount = 0;

    console.log(`Processing bulk email to ${recipients.length} recipients`);

    /**
     * for
     */
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];

      try {
        console.log(`Sending email ${i + 1}/${recipients.length} to ${recipient}`);

        await new Promise((resolve) => setTimeout(resolve, 500));

        sentCount++;

        await job.updateProgress((i + 1) / recipients.length * 100);
      } catch (error) {
        console.error(`Failed to send email to ${recipient}:`, error);
      }
    }

    console.log(`Bulk email complete: ${sentCount}/${recipients.length} sent`);
    return sentCount;
  },
  options: {
    concurrency: 2,
  },
};
