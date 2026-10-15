import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';

const RECIPIENT_EMAIL =
  process.env.RESEND_RECIPIENT_EMAIL || 'ishani.chakraborty.2005@gmail.com';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const POPULAR_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me',
  'live.com',
  'aol.com',
];

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'trashmail.com',
  'yopmail.com',
  'dispostable.com',
]);

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function checkDomainTypo(domain: string): string | null {
  for (const pop of POPULAR_DOMAINS) {
    if (domain === pop) return null;
    if (levenshtein(domain, pop) <= 2) return pop;
  }
  return null;
}

async function verifyEmail(email: string): Promise<{ valid: boolean; error?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Please provide a valid email format (e.g. name@example.com).' };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { valid: false, error: 'Email must contain exactly one @ symbol.' };
  }

  const [local, domain] = parts;
  if (local.length < 2) {
    return { valid: false, error: 'Email username must be at least 2 characters long.' };
  }
  if (local.length > 64) {
    return { valid: false, error: 'Email username is too long.' };
  }
  if (domain.length > 255) {
    return { valid: false, error: 'Email domain is too long.' };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, error: 'Temporary or disposable email addresses are not accepted.' };
  }

  // Suggest correction for common domain typos using edit distance
  const suggested = checkDomainTypo(domain);
  if (suggested) {
    return {
      valid: false,
      error: `Did you mean @${suggested} instead of @${domain}?`,
    };
  }

  // DNS MX record verification to confirm domain can receive email
  try {
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DNS_TIMEOUT')), 3000),
      ),
    ]);

    if (mxRecords && mxRecords.length > 0) {
      return { valid: true };
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    const message = (err as Error)?.message;

    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'EREFUSED') {
      try {
        const aRecords = await dns.resolve4(domain);
        if (aRecords && aRecords.length > 0) {
          return { valid: true };
        }
      } catch {
        return {
          valid: false,
          error: `The email domain "${domain}" does not exist or has no active mail servers.`,
        };
      }
      return {
        valid: false,
        error: `The email domain "${domain}" is not configured to receive emails.`,
      };
    }

    if (message === 'DNS_TIMEOUT') {
      console.warn(`DNS lookup timed out for ${domain}, proceeding with format validation.`);
      return { valid: true };
    }

    console.warn(`DNS check skipped for ${domain}:`, message);
    return { valid: true };
  }

  return { valid: true };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, note, actionCount, productName = 'Studio' } = body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ ok: false, error: 'Valid email is required' }, { status: 400 });
    }

    const check = await verifyEmail(email);
    if (!check.valid) {
      return NextResponse.json({ ok: false, error: check.error || 'Invalid email address' }, { status: 400 });
    }

    const lead = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      note: note ? String(note).trim() : '',
      actionCount: typeof actionCount === 'number' ? actionCount : 0,
      product: String(productName).trim(),
      submittedAt: new Date().toISOString(),
      recipient: RECIPIENT_EMAIL,
    };

    // 1. Console log for immediate local terminal visibility
    console.log('\n======================================================');
    console.log('[NEW EARLY TESTER APPLICATION]');
    console.log(`Name:      ${lead.name}`);
    console.log(`Email:     ${lead.email}`);
    if (lead.note) {
      console.log(`Note:      ${lead.note}`);
    }
    console.log(`Actions:   ${lead.actionCount}`);
    console.log(`Send To:   ${RECIPIENT_EMAIL}`);
    console.log(`Time:      ${lead.submittedAt}`);
    console.log('======================================================\n');

    // 2. Persist to local data/beta-testers.json so no lead is ever lost locally
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const filePath = path.join(dataDir, 'beta-testers.json');
      let existing: unknown[] = [];
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        existing = JSON.parse(raw || '[]');
      }
      existing.push(lead);
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
    } catch (saveErr) {
      console.warn('Could not write lead to data/beta-testers.json:', saveErr);
    }

    // 3. Attempt email delivery if RESEND_API_KEY is configured
    const resendApiKey =
      process.env.RESEND_API_KEY ||
      process.env.RESEND_KEY ||
      process.env.RESEND_TOKEN;

    const fromAddress =
      process.env.RESEND_FROM_EMAIL || 'Beta Onboarding <onboarding@resend.dev>';

    let emailSent = false;
    let emailStatus = 'no_api_key';
    let emailError: string | null = null;

    if (resendApiKey) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [RECIPIENT_EMAIL],
            reply_to: lead.email,
            subject: `New ${lead.product} Beta Tester: ${lead.name} (${lead.email})`,
            html: `
              <h2>New ${lead.product} Beta Tester Application</h2>
              <p><strong>Name:</strong> ${lead.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${lead.email}">${lead.email}</a></p>
              ${lead.note ? `<p><strong>Note:</strong> ${lead.note}</p>` : ''}
              <p><strong>Usage Actions:</strong> ${lead.actionCount}</p>
              <p><strong>Submitted At:</strong> ${lead.submittedAt}</p>
            `,
          }),
        });

        if (!emailRes.ok) {
          const errData = await emailRes.text();
          console.error('Resend email error:', errData);
          emailStatus = 'failed';
          emailError = errData;
        } else {
          console.log(`Email sent successfully to ${RECIPIENT_EMAIL} via Resend.`);
          emailSent = true;
          emailStatus = 'sent';
        }
      } catch (emailErr) {
        console.error('Failed to send email via Resend:', emailErr);
        emailStatus = 'exception';
        emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
      }
    } else {
      console.log('[Notice] RESEND_API_KEY not found in environment');
    }

    return NextResponse.json({
      ok: true,
      message: 'Application recorded successfully',
      emailSent,
      emailStatus,
      emailError,
      lead,
    });
  } catch (err) {
    console.error('Error handling beta tester submission:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
