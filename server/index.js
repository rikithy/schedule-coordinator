require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { sendEmail } = require('./email');
const { setupAuthRoutes } = require('./auth');
setupAuthRoutes(app);

// ============================================================================
// SCHEDULE CRUD
// ============================================================================

// Create schedule
app.post('/api/schedules', async (req, res) => {
  const { title, description, startDate, endDate, durationMinutes, organizerName, organizerEmail } = req.body;
  if (!title || !startDate || !endDate || !durationMinutes) {
    return res.status(400).json({ error: 'title, startDate, endDate, durationMinutes are required' });
  }

  try {
    const schedule = await prisma.schedule.create({
      data: {
        title,
        description: description || '',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        durationMinutes: Number(durationMinutes),
        organizerName: organizerName || 'Organizer',
        organizerEmail: organizerEmail || '',
        status: 'open',
      },
    });
    res.status(201).json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

// List all schedules
app.get('/api/schedules', async (_req, res) => {
  try {
    const schedules = await prisma.schedule.findMany({
      include: {
        participants: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const schedulesWithCounts = schedules.map(s => {
      const responded = s.participants.filter(p => p.responded).length;
      return { 
        ...s, 
        participantCount: s.participants.length, 
        respondedCount: responded 
      };
    });
    res.json(schedulesWithCounts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Get schedule by ID
app.get('/api/schedules/:id', async (req, res) => {
  try {
    const schedule = await prisma.schedule.findUnique({
      where: { id: req.params.id },
      include: { participants: true },
    });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Update schedule (partial)
app.patch('/api/schedules/:id', async (req, res) => {
  const { title, description, startDate, endDate, durationMinutes } = req.body;
  
  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (startDate !== undefined) updateData.startDate = new Date(startDate);
  if (endDate !== undefined) updateData.endDate = new Date(endDate);
  if (durationMinutes !== undefined) updateData.durationMinutes = Number(durationMinutes);

  try {
    const schedule = await prisma.schedule.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json(schedule);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Schedule not found' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// Delete schedule
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    await prisma.schedule.delete({
      where: { id: req.params.id },
    });
    // Prisma config delete: Cascade takes care of participants and availability blocks
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Schedule not found' });
    console.error(err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// ============================================================================
// PARTICIPANTS
// ============================================================================

// Invite participant
app.post('/api/schedules/:id/participants', async (req, res) => {
  const { name, email } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  try {
    const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const participant = await prisma.participant.create({
      data: {
        scheduleId: schedule.id,
        name,
        email: email || '',
        token: uuidv4().replace(/-/g, '').slice(0, 12),
        responded: false,
      },
    });

    // Send invitation email if an email was provided
    if (participant.email) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const respondLink = `${frontendUrl}/respond/${schedule.id}/${participant.id}`;
      
      const emailContent = `
        <p>こんにちは、${participant.name}さん。</p>
        <p>「<strong>${schedule.title}</strong>」のスケジュール調整に招待されました。</p>
        <p>以下のリンクから空き時間（NG時間）を回答してください：</p>
        <p><a href="${respondLink}">${respondLink}</a></p>
        
        <p>主催者: ${schedule.organizerName} ${schedule.organizerEmail ? `(${schedule.organizerEmail})` : ''}</p>
      `;
      
      // Async dispatch (don't block the API response)
      sendEmail({
        to: participant.email,
        subject: `【Schedule Sync】スケジュールの調整依頼: ${schedule.title}`,
        html: emailContent,
        text: `「${schedule.title}」のスケジュール調整に招待されました。\n以下のリンクから回答してください：\n${respondLink}`
      });
    }

    res.status(201).json(participant);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

// Get participants for schedule
app.get('/api/schedules/:id/participants', async (req, res) => {
  try {
    const participants = await prisma.participant.findMany({
      where: { scheduleId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(participants);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

// Send reminder (sends email)
app.post('/api/schedules/:id/participants/:pid/remind', async (req, res) => {
  try {
    const participant = await prisma.participant.findFirst({
      where: { id: req.params.pid, scheduleId: req.params.id },
      include: { schedule: true }
    });

    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const emailResult = await sendEmail({
      to: participant.email,
      subject: `[リマインド] 【Schedule Sync】スケジュール回答のお願い: ${participant.schedule.title}`,
      html: `
        <h2>スケジュール回答のリマインド</h2>
        <p>${participant.name}様</p>
        <p>「${participant.schedule.title}」への回答がまだ完了していないようです。</p>
        <p>以下のURLより、ご都合の良い日時をご入力ください。</p>
        <a href="${process.env.FRONTEND_URL}/respond/${participant.id}">${process.env.FRONTEND_URL}/respond/${participant.id}</a>
      `,
      text: `
        スケジュール回答のリマインド
        ${participant.name}様
        「${participant.schedule.title}」への回答がまだ完了していないようです。
        以下のURLより、ご都合の良い日時をご入力ください。
        ${process.env.FRONTEND_URL}/respond/${participant.id}
      `
    });

    res.json({ success: true, message: `Reminder sent to ${participant.name}` });
  } catch (err) {
    console.error('Error in remind route:', err);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
}); // ← この }); が漏れていないか特に注意してください！

// Send reminder to all unresponded
app.post('/api/schedules/:id/remind-all', async (req, res) => {
  try {
    const unresponded = await prisma.participant.findMany({
      where: { scheduleId: req.params.id, responded: false, email: { not: '' } },
      include: { schedule: true }
    });
    
    if (unresponded.length === 0) {
      return res.json({ success: true, count: 0, message: 'No participants to remind valid with emails' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Track successfully sent count
    let sentCount = 0;

    // Dispatch emails concurrently
    await Promise.all(unresponded.map(async (participant) => {
      const respondLink = `${frontendUrl}/respond/${participant.schedule.id}/${participant.id}`;
      const emailContent = `
        <p>${participant.name}さん、こんにちは。</p>
        <p>「<strong>${participant.schedule.title}</strong>」のスケジュール調整のリマインダーです。</p>
        <p>まだ回答がお済みでないようですので、以下のリンクからご入力をお願いいたします：</p>
        <p><a href="${respondLink}">${respondLink}</a></p>
      `;

      const success = await sendEmail({
        to: participant.email,
        subject: `[リマインド] 【Schedule Sync】スケジュール回答のお願い: ${participant.schedule.title}`,
        html: emailContent,
        text: `${participant.name}さん\n「${participant.schedule.title}」のスケジュール回答のお願い\n以下のリンクから回答してください：\n${respondLink}`
      });
      
      if (success) sentCount++;
    }));

    res.json({ success: true, count: sentCount, message: `Reminders sent to ${sentCount} participants` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send bulk reminders' });
  }
});

// ============================================================================
// AVAILABILITY (NG blocks / busy blocks)
// ============================================================================

// Submit availability (NG time blocks for manual mode)
app.post('/api/participants/:pid/availability', async (req, res) => {
  const { blocks, inputMethod } = req.body;
  if (!blocks || !Array.isArray(blocks)) {
    return res.status(400).json({ error: 'blocks array is required' });
  }

  try {
    const participant = await prisma.participant.findUnique({ where: { id: req.params.pid } });
    if (!participant) return res.status(404).json({ error: 'Participant not found' });

    // Transaction to replace blocks and update participant status
    await prisma.$transaction(async (tx) => {
      // Remove old availability for this participant
      await tx.availabilityBlock.deleteMany({
        where: { participantId: participant.id },
      });

      // Add new blocks
      if (blocks.length > 0) {
        await tx.availabilityBlock.createMany({
          data: blocks.map((block) => ({
            participantId: participant.id,
            start: new Date(block.start),
            end: new Date(block.end),
            type: 'busy',
          })),
        });
      }

      await tx.participant.update({
        where: { id: participant.id },
        data: {
          responded: true,
          inputMethod: inputMethod || 'manual',
        },
      });
    });

    res.json({ success: true, blockCount: blocks.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit availability' });
  }
});

// Get availability for a participant
app.get('/api/participants/:pid/availability', async (req, res) => {
  try {
    const blocks = await prisma.availabilityBlock.findMany({
      where: { participantId: req.params.pid },
    });
    res.json(blocks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// ============================================================================
// SLOT FINDING ENGINE (CORE)
// ============================================================================

app.get('/api/schedules/:id/slots', async (req, res) => {
  try {
    const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const participants = await prisma.participant.findMany({
      where: { scheduleId: schedule.id, responded: true },
    });

    if (participants.length === 0) {
      return res.json({ slots: [], message: 'No participants have responded yet' });
    }

    const startDate = new Date(schedule.startDate);
    const endDate = new Date(schedule.endDate);
    endDate.setHours(23, 59, 59, 999);
    const durationMs = schedule.durationMinutes * 60 * 1000;
    const stepMs = 60 * 60 * 1000; // 1-hour steps

    // Gather all busy blocks per participant
    const busyByParticipant = {};
    const availabilities = await prisma.availabilityBlock.findMany({
      where: { participantId: { in: participants.map(p => p.id) } },
    });

    participants.forEach(p => {
      busyByParticipant[p.id] = availabilities
        .filter(a => a.participantId === p.id)
        .map(a => ({ start: a.start.getTime(), end: a.end.getTime() }));
    });

    const isBusy = (participantId, windowStart, windowEnd) => {
      const blocks = busyByParticipant[participantId] || [];
      return blocks.some(b => b.start < windowEnd && b.end > windowStart);
    };

    const slots = [];
    let currentDay = new Date(startDate);
    currentDay.setHours(0, 0, 0, 0);

    while (currentDay <= endDate) {
      const dayStart = new Date(currentDay);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(currentDay);
      dayEnd.setHours(24, 0, 0, 0);

      let windowStart = dayStart.getTime();
      while (windowStart + durationMs <= dayEnd.getTime()) {
        const windowEnd = windowStart + durationMs;
        let availableCount = 0;
        const availableParticipants = [];
        const unavailableParticipants = [];

        participants.forEach(p => {
          if (isBusy(p.id, windowStart, windowEnd)) {
            unavailableParticipants.push({ id: p.id, name: p.name });
          } else {
            availableCount++;
            availableParticipants.push({ id: p.id, name: p.name });
          }
        });

        slots.push({
          start: new Date(windowStart).toISOString(),
          end: new Date(windowEnd).toISOString(),
          availableCount,
          totalParticipants: participants.length,
          percentage: Math.round((availableCount / participants.length) * 100),
          availableParticipants,
          unavailableParticipants,
        });

        windowStart += stepMs;
      }

      currentDay.setDate(currentDay.getDate() + 1);
    }

    slots.sort((a, b) => b.percentage - a.percentage || new Date(a.start) - new Date(b.start));
    res.json({ slots, totalParticipants: participants.length, respondedCount: participants.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate slots' });
  }
});

// Get all participants' availability for a schedule (for visualization)
app.get('/api/schedules/:id/availability-overview', async (req, res) => {
  try {
    const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const participants = await prisma.participant.findMany({
      where: { scheduleId: schedule.id },
      include: { availability: true },
    });

    const overview = participants.map(p => ({
      id: p.id,
      name: p.name,
      responded: p.responded,
      inputMethod: p.inputMethod,
      blocks: p.availability.map(a => ({ start: a.start.toISOString(), end: a.end.toISOString() })),
    }));

    res.json({
      schedule: { startDate: schedule.startDate, endDate: schedule.endDate, durationMinutes: schedule.durationMinutes },
      participants: overview,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// ============================================================================
// CALENDAR INTEGRATION
// ============================================================================
const { google } = require('googleapis');

// Fetch list of accessible calendars for the participant
app.get('/api/participants/:pid/calendar/list', async (req, res) => {
  try {
    const participant = await prisma.participant.findUnique({ where: { id: req.params.pid } });
    if (!participant || !participant.googleAccessToken) {
      return res.status(401).json({ error: 'Not authenticated with Google Calendar' });
    }

    const { getOAuth2Client } = require('./auth');
    const auth = getOAuth2Client();
    auth.setCredentials({
      access_token: participant.googleAccessToken,
      refresh_token: participant.googleRefreshToken
    });
    
    // Auto refresh token saving logic
    auth.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { googleRefreshToken: tokens.refresh_token, googleAccessToken: tokens.access_token }
        });
      } else if (tokens.access_token) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { googleAccessToken: tokens.access_token }
        });
      }
    });

    const calendar = google.calendar({ version: 'v3', auth });
    
    // Fetch user's calendars (exclude hidden/deleted ones)
    const response = await calendar.calendarList.list({
      showHidden: false,
    });

    const calendarList = response.data.items.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor
    }));

    res.json(calendarList);
  } catch (err) {
    console.error('Calendar list lookup error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar list' });
  }
});

app.post('/api/participants/:pid/calendar/freebusy', async (req, res) => {
  const { start, end, calendarIds } = req.body;
  if (!start || !end) return res.status(400).json({ error: 'start and end dates are required' });
  
  // Default to primary if no specific calendars are provided
  const targetCals = (calendarIds && Array.isArray(calendarIds) && calendarIds.length > 0) 
    ? calendarIds 
    : ['primary'];

  try {
    const participant = await prisma.participant.findUnique({ where: { id: req.params.pid } });
    if (!participant || !participant.googleAccessToken) {
      return res.status(401).json({ error: 'Not authenticated with Google Calendar' });
    }

    const { getOAuth2Client } = require('./auth');
    const auth = getOAuth2Client();
    auth.setCredentials({
      access_token: participant.googleAccessToken,
      refresh_token: participant.googleRefreshToken
    });
    
    auth.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { googleRefreshToken: tokens.refresh_token, googleAccessToken: tokens.access_token }
        });
      } else if (tokens.access_token) {
        await prisma.participant.update({
          where: { id: participant.id },
          data: { googleAccessToken: tokens.access_token }
        });
      }
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Request freebusy for all requested calendar IDs
    const items = targetCals.map(id => ({ id }));

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(start).toISOString(),
        timeMax: new Date(end).toISOString(),
        items: items
      }
    });

    // Aggregate busy blocks across all requested calendars
    let aggregatedBusyBlocks = [];
    if (response.data.calendars) {
      Object.values(response.data.calendars).forEach(cal => {
        if (cal.busy && cal.busy.length > 0) {
          aggregatedBusyBlocks = aggregatedBusyBlocks.concat(cal.busy);
        }
      });
    }

    res.json({ busy: aggregatedBusyBlocks });
  } catch (err) {
    console.error('FreeBusy lookup error:', err);
    res.status(500).json({ error: 'Failed to fetch freebusy data' });
  }
});

// ============================================================================
// FINALIZE
// ============================================================================

app.post('/api/schedules/:id/finalize', async (req, res) => {
  const { start, end } = req.body;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });

  try {
    const schedule = await prisma.schedule.update({
      where: { id: req.params.id },
      data: {
        status: 'finalized',
        finalizedStart: new Date(start),
        finalizedEnd: new Date(end),
      },
      include: {
        participants: true
      }
    });

    // Create Google Calendar events for participants who connected
    for (const participant of schedule.participants) {
      if (participant.googleAccessToken) {
        try {
          const { getOAuth2Client } = require('./auth');
          const auth = getOAuth2Client();
          auth.setCredentials({
            access_token: participant.googleAccessToken,
            refresh_token: participant.googleRefreshToken
          });
          
          const calendar = google.calendar({ version: 'v3', auth });
          await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
              summary: schedule.title,
              description: schedule.description || 'Scheduled via Schedule Sync',
              start: { dateTime: new Date(start).toISOString() },
              end: { dateTime: new Date(end).toISOString() },
            }
          });
        } catch (e) {
          console.error(`Failed to create event for ${participant.email || participant.name}:`, e);
        }
      }
    }

    res.json({
      success: true,
      schedule,
      message: 'Schedule finalized. Google Calendar events created for authenticated participants.',
    });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Schedule not found' });
    console.error(err);
    res.status(500).json({ error: 'Failed to finalize schedule' });
  }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
