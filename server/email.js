// nodemailer はもう使いません
// const nodemailer = require('nodemailer');

/**
 * Sends an email using the Google Apps Script Web App.
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

  // GASのウェブアプリURLを環境変数から取得
  const gasUrl = process.env.GAS_MAIL_API_URL;
  
  if (!gasUrl) {
    console.error('Error: GAS_MAIL_API_URL is not set in environment variables.');
    return false;
  }

  
  try {
    // GASのURLに向かってPOSTリクエストを送信
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        text,
        html,
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('Message sent via GAS successfully to:', to);
      return true;
    } else {
      console.error('GAS returned an error:', result.error);
      return false;
    }
  } catch (err) {
    console.error('Error connecting to GAS:', err);
    return false;
  }
};

module.exports = {
  sendEmail,
};