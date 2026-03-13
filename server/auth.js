require('dotenv').config();
const { google } = require('googleapis');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// We need scopes for Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events', 
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

module.exports = {
  SCOPES,
  
  getOAuth2Client: () => {
    console.log("CLIENT ID FROM ENV:", process.env.GOOGLE_CLIENT_ID);
    console.log("SECRET FROM ENV:", process.env.GOOGLE_CLIENT_SECRET);
    console.log("REDIRECT FROM ENV:", process.env.GOOGLE_REDIRECT_URI);
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback'
    );
  },

  setupAuthRoutes: (app) => {
    // Start OAuth Flow
    app.get('/api/auth/google', (req, res) => {
      const { pid } = req.query; // Participant ID
      if (!pid) return res.status(400).send('Missing participant ID (pid)');

      const oauth2Client = module.exports.getOAuth2Client();

      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // to get refresh_token
        prompt: 'consent', // to ensure we get a refresh token every time
        scope: SCOPES,
        state: pid // Pass participant ID in state
      });
      res.redirect(url);
    });

    // Callback URL
    app.get('/api/auth/google/callback', async (req, res) => {
      const { code, state: pid, error } = req.query;

      if (error) {
        return res.status(400).send(`OAuth error: ${error}`);
      }

      if (!code || !pid) {
        return res.status(400).send('Missing code or state');
      }

      try {
        const oauth2Client = module.exports.getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);
        
        // Save tokens to Participant
        await prisma.participant.update({
          where: { id: pid },
          data: {
            googleAccessToken: tokens.access_token,
            googleRefreshToken: tokens.refresh_token || undefined, 
          }
        });

        // Fetch scheduleId to redirect back to respond page
        const participant = await prisma.participant.findUnique({
          where: { id: pid },
          select: { scheduleId: true }
        });

        if (!participant) {
            return res.status(404).send('Participant not found');
        }

        // Redirect back to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/respond/${participant.scheduleId}/${pid}?auth=success`);

      } catch (err) {
        console.error('Error exchanging token:', err);
        res.status(500).send('Failed to authenticate');
      }
    });
  }
};
