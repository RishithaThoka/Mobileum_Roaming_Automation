const nodemailer = require('nodemailer');
const { v4: uuid } = require('uuid');
const db = require('../db');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function getTransport() {
  const dns = require('dns').promises;
  let ipv4Host = process.env.SMTP_HOST;
  
  try {
    // Manually force IPv4 resolution
    const lookup = await dns.lookup(process.env.SMTP_HOST, { family: 4 });
    ipv4Host = lookup.address;
  } catch (e) {
    console.warn('DNS lookup failed for SMTP host, falling back to original', e.message);
  }

  return nodemailer.createTransport({
    host: ipv4Host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    ignoreTLS: false,
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      servername: process.env.SMTP_HOST, // Required so Google SSL matches smtp.gmail.com instead of the IP
      rejectUnauthorized: true,
    },
  });
}

async function sendApprovalEmail({ approvalStepId, toEmail, approverName, roleTitle, documentTitle, operatorName, docType, diffItems, approveUrl, rejectUrl, viewUrl }) {
  const rows = diffItems.map(i =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e2da;font-family:monospace;font-size:12px;color:#555;">${i.field_path}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e2da;color:#b23b3b;text-decoration:line-through;">${i.old_value ?? '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e2da;color:#1c7a4d;font-weight:600;">${i.new_value ?? '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e2da;">
        <span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${
          i.severity === 'critical' ? '#fbe4e2;color:#a12b1f' : i.severity === 'major' ? '#fdf0d5;color:#8a5a00' : '#e7f0ea;color:#2f6b47'
        };">${i.severity.toUpperCase()}</span>
      </td>
    </tr>`
  ).join('');

  const subject = `[Action Required] ${docType} update from ${operatorName} — ${roleTitle} sign-off needed`;

  const html = `
  <div style="font-family:Segoe UI, Arial, sans-serif; max-width:680px; margin:0 auto; color:#2b2b2b;">
    <div style="background:#14213d;padding:20px 28px;border-radius:8px 8px 0 0;">
      <span style="color:#f5f0e6;font-size:18px;font-weight:700;letter-spacing:0.3px;">Roaming Document Control Center</span>
    </div>
    <div style="border:1px solid #e5e2da;border-top:none;border-radius:0 0 8px 8px;padding:28px;">
      <p style="font-size:15px;">Hello ${approverName || roleTitle},</p>
      <p style="font-size:14px;line-height:1.5;">
        <strong>${operatorName}</strong> has submitted an updated <strong>${docType}</strong> document
        (<em>${documentTitle}</em>). The following changes fall within your domain
        (<strong>${roleTitle}</strong>) and require your approval before the document can proceed.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <thead>
          <tr style="background:#f4f1ea;text-align:left;">
            <th style="padding:8px 12px;">Field</th>
            <th style="padding:8px 12px;">Previous</th>
            <th style="padding:8px 12px;">New</th>
            <th style="padding:8px 12px;">Severity</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin:24px 0;">
        <a href="${approveUrl}" style="background:#1c7a4d;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:12px;">Approve</a>
        <a href="${rejectUrl}" style="background:#a12b1f;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;">Reject</a>
      </div>
      <p style="font-size:12px;color:#777;">Or review the full change record in the portal: <a href="${viewUrl}">${viewUrl}</a></p>
      <p style="font-size:11px;color:#999;margin-top:24px;">This message contains only the fields relevant to your domain. Other approvers in this workflow see only their own scope.</p>
    </div>
  </div>`;

  const logId = uuid();
  let mode = 'simulated';
  let error = null;

  if (isConfigured()) {
    try {
      const transport = await getTransport();
      await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: toEmail,
        subject,
        html,
      });
      mode = 'sent';
    } catch (err) {
      mode = 'failed';
      error = err.message;
    }
  }

  db.prepare(`INSERT INTO email_log (id, approval_step_id, to_email, subject, body, mode, error) VALUES (?,?,?,?,?,?,?)`)
    .run(logId, approvalStepId, toEmail, subject, html, mode, error);

  return { mode, error, logId };
}

module.exports = { sendApprovalEmail, isConfigured };
