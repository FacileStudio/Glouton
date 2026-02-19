import { resolveMx } from 'dns/promises';
import net from 'net';

const SMTP_TIMEOUT_MS = 10_000;
const PROBE_DOMAIN = process.env.SMTP_HOST ?? 'mail.glouton.app';
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export type VerificationReason =
  | 'syntax_invalid'
  | 'mx_missing'
  | 'smtp_accepted'
  | 'smtp_rejected'
  | 'timeout'
  | 'error';

export interface EmailVerificationResult {
  valid: boolean;
  reason: VerificationReason;
  checkedAt: Date;
}

export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
  const checkedAt = new Date();

  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, reason: 'syntax_invalid', checkedAt };
  }

  const domain = email.split('@')[1];

  let mxHost: string;
  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) {
      return { valid: false, reason: 'mx_missing', checkedAt };
    }
    records.sort((a, b) => a.priority - b.priority);
    mxHost = records[0].exchange;
  } catch {
    return { valid: false, reason: 'mx_missing', checkedAt };
  }

  return smtpProbe(mxHost, email, checkedAt);
}

function smtpProbe(host: string, email: string, checkedAt: Date): Promise<EmailVerificationResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: 25 });
    let step = 0;
    let lineBuffer = '';
    let settled = false;

    const finish = (result: EmailVerificationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ valid: false, reason: 'timeout', checkedAt });
    }, SMTP_TIMEOUT_MS);

    socket.setTimeout(SMTP_TIMEOUT_MS);

    socket.on('data', (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\r\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.substring(0, 3), 10);
        const isMultiline = line[3] === '-';
        if (isMultiline) continue;

        if (step === 0 && code === 220) {
          socket.write(`EHLO ${PROBE_DOMAIN}\r\n`);
          step = 1;
        } else if (step === 1 && code >= 200 && code < 300) {
          socket.write(`MAIL FROM:<probe@${PROBE_DOMAIN}>\r\n`);
          step = 2;
        } else if (step === 2 && code >= 200 && code < 300) {
          socket.write(`RCPT TO:<${email}>\r\n`);
          step = 3;
        } else if (step === 3) {
          socket.write('QUIT\r\n');
          if (code >= 200 && code < 300) {
            finish({ valid: true, reason: 'smtp_accepted', checkedAt });
          } else {
            finish({ valid: false, reason: 'smtp_rejected', checkedAt });
          }
        } else if (step < 3 && code >= 400) {
          finish({ valid: false, reason: 'error', checkedAt });
        }
      }
    });

    socket.on('error', () => {
      finish({ valid: false, reason: 'error', checkedAt });
    });

    socket.on('timeout', () => {
      finish({ valid: false, reason: 'timeout', checkedAt });
    });
  });
}
