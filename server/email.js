const nodemailer = require('nodemailer');

// Create a reusable transporter object using the default SMTP transport
const createTransporter = async () => {
  // If production SMTP credentials are provided, use them
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Otherwise, use Ethereal Email for safe local testing
  console.log('No SMTP credentials found in environment. Falling back to Ethereal Email for testing.');
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: testAccount.user, // generated ethereal user
      pass: testAccount.pass, // generated ethereal password
    },
  });
};

/**
 * Sends an email using the configured transporter.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 * @param {string} html - HTML body (optional)
 */
const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) {
    console.warn(`Attempted to send email without a recipient address. Subject: "${subject}"`);
    return false;
  }

  try {
    const transporter = await createTransporter();
    
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Schedule Sync" <noreply@schedulesync.app>', // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log('Message sent: %s', info.messageId);
    
    // If using Ethereal, log the preview URL specifically so the developer can see the sent email
    if (info.messageId && nodemailer.getTestMessageUrl(info)) {
      console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }
    return true;
  } catch (err) {
    console.error('Error sending email:', err);
    return false;
  }
};

module.exports = {
  sendEmail,
};
