import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

const RECIPIENT_EMAIL =
  process.env.RESEND_RECIPIENT_EMAIL || 'ishani.chakraborty.2005@gmail.com';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, note, actionCount, productName = 'Studio' } = body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Valid email is required' }, { status: 400 });
    }

    const lead = {
      name: name.trim(),
      email: email.trim(),
      note: note ? String(note).trim() : '',
      actionCount: typeof actionCount === 'number' ? actionCount : 0,
      product: String(productName).trim(),
      submittedAt: new Date().toISOString(),
      recipient: RECIPIENT_EMAIL,
    };

    // 1. Console log for immediate local terminal visibility
    console.log('\n======================================================');
    console.log('🎉 [NEW EARLY TESTER APPLICATION]');
    console.log(`👤 Name:      ${lead.name}`);
    console.log(`✉️  Email:     ${lead.email}`);
    if (lead.note) {
      console.log(`💬 Note:      ${lead.note}`);
    }
    console.log(`📊 Actions:   ${lead.actionCount}`);
    console.log(`📬 Send To:   ${RECIPIENT_EMAIL}`);
    console.log(`⏰ Time:      ${lead.submittedAt}`);
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
