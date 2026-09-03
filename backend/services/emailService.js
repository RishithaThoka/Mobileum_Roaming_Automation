const nodemailer = require('nodemailer');
const sgMail    = require('@sendgrid/mail');
const { v4: uuid } = require('uuid');
const db = require('../db');

function isConfigured() {
  return !!(process.env.SENDGRID_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

async function getTransport() {
  const dns = require('dns').promises;
  let ipv4Host = process.env.SMTP_HOST;

  try {
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
  });
}

async function sendApprovalEmail({
  approvalStepId, toEmail, approverName, roleTitle,
  documentTitle, operatorName, docType, diffItems,
  approveUrl, rejectUrl, viewUrl,
}) {
  const logId = uuid();
  const subject = `Action Required: Review ${docType} changes for ${operatorName}`;

  const changesHtml = diffItems.slice(0, 15).map(i => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i.field_path}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i.change_type}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i.old_value || '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i.new_value || '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;color:${i.severity === 'critical' ? '#dc2626' : i.severity === 'major' ? '#d97706' : '#059669'}">${(i.severity || 'minor').toUpperCase()}</td>
    </tr>`).join('');

  const html = `
    <!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f4f1ea;padding:24px;margin:0;">
    <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="background:#0F172A;padding:28px 36px;">
        <h1 style="color:#38BDF8;margin:0;font-size:20px;">Roaming Control Center</h1>
        <p style="color:#94A3B8;margin:8px 0 0;font-size:14px;">Approval Request</p>
      </div>
      <div style="padding:32px 36px;">
        <p style="color:#334155;font-size:16px;">Dear ${approverName || roleTitle},</p>
        <p style="color:#334155;">You have been assigned to review <strong>${docType}</strong> document changes for operator <strong>${operatorName}</strong>.</p>
        <p style="color:#334155;"><strong>Document:</strong> ${documentTitle}</p>
        ${diffItems.length > 0 ? `
        <h3 style="color:#0F172A;border-bottom:2px solid #E2E8F0;padding-bottom:8px;">Changes Requiring Your Review (${diffItems.length})</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#F1F5F9;">
            <th style="padding:10px 8px;text-align:left;">Field</th>
            <th style="padding:10px 8px;text-align:left;">Type</th>
            <th style="padding:10px 8px;text-align:left;">Before</th>
            <th style="padding:10px 8px;text-align:left;">After</th>
            <th style="padding:10px 8px;text-align:left;">Severity</th>
          </tr></thead><tbody>${changesHtml}</tbody>
        </table>` : '<p style="color:#64748B;">No specific changes were flagged for your category.</p>'}
        <div style="margin:32px 0;display:flex;gap:12px;">
          <a href="${approveUrl}" style="background:#059669;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">✓ Approve</a>
          <a href="${rejectUrl}" style="background:#DC2626;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-left:12px;">✗ Reject</a>
          <a href="${viewUrl}"  style="background:#0EA5E9;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-left:12px;">View Full Diff</a>
        </div>
        <p style="color:#94A3B8;font-size:12px;margin-top:24px;">This email was sent by the Roaming Document Control Center. Do not reply to this email.</p>
      </div>
    </div></body></html>`;

  let mode  = 'simulated';
  let error = null;

  if (isConfigured()) {
    try {
      if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        await sgMail.send({
          to: toEmail,
          from: process.env.SMTP_FROM || 'noreply@roaming-control.local',
          subject,
          html,
        });
        mode = 'sent (sendgrid)';
      } else {
        const transport = await getTransport();
        await transport.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: toEmail,
          subject,
          html,
        });
        mode = 'sent (smtp)';
      }
    } catch (err) {
      mode  = 'failed';
      error = err.response ? err.response.body.errors[0].message : err.message;
    }
  }

  await db('email_log').insert({
    id: logId,
    approval_step_id: approvalStepId,
    to_email: toEmail,
    subject,
    body: html,
    mode,
    error,
  });

  return { mode, error, logId };
}

module.exports = { sendApprovalEmail, isConfigured };
