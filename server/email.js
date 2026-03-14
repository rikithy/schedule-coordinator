/* eslint-env node */

/**
 * Sends an email using the Google Apps Script Web App.
 * @param {Object} params - to, subject, text, html
 */
const sendEmail = async ({ to, subject, text, html }) => {
  if (!to) {
    console.warn(`Attempted to send email without a recipient address. Subject: "${subject}"`);
    return false;
  }

  const gasUrl = process.env.GAS_MAIL_API_URL;
  
  if (!gasUrl) {
    console.error('Error: GAS_MAIL_API_URL is not set in environment variables.');
    return false;
  }

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, subject, text, html }),
    });

    const result = await response.json();

    if (result.success) {
      // 成功時は静かに成功を返す（ログを汚さない）
      return true;
    } else {
      console.error('GAS Email API error:', result.error);
      return false;
    }
  } catch (err) {
    console.error('Connection error to GAS Email API:', err);
    return false;
  }
};

module.exports = {
  sendEmail,
};