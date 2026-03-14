/* eslint-env node */
console.log('EMAIL MODULE LOADED'); // ★サーバー起動時にこのログが出るか確認

/**
 * Sends an email using the Google Apps Script Web App.
 */
const sendEmail = async ({ to, subject, text, html }) => {
  console.log('--- sendEmail function START ---'); // ★関数が呼ばれたら出力
  console.log('Recipient (to):', to);
  console.log('Subject:', subject);
  
  if (!to) {
    console.warn(`Attempted to send email without a recipient address. Subject: "${subject}"`);
    return false;
  }

  const gasUrl = process.env.GAS_MAIL_API_URL;
  // ★環境変数がRenderに正しく反映されているか確認
  console.log('Using GAS URL:', gasUrl ? 'FOUND (Success)' : 'NOT FOUND (Check Render Settings)');
  
  if (!gasUrl) {
    return false;
  }

  try {
    console.log('Attempting to fetch GAS URL...');
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
    console.log('GAS response received:', JSON.stringify(result)); // ★GASからの返事を確認

    if (result.success) {
      console.log('Message sent via GAS successfully to:', to);
      return true;
    } else {
      console.error('GAS returned an error:', result.error);
      return false;
    }
  } catch (err) {
    console.error('Error connecting to GAS:', err); // ★通信エラーがあれば出力
    return false;
  } finally {
    console.log('--- sendEmail function END ---');
  }
};

module.exports = {
  sendEmail,
};