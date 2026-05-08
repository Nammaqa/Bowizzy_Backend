const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const IMPERSONATE_USER = "contactus@wizzybox.com";

async function createGoogleMeeting({ startTimeUtc }) {
  try {
    // Load service account credentials from environment variable or file
    let serviceAccount;
    
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      // Use environment variable (for Vercel and production)
      serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    } else {
      // Fallback to file (for local development)
      const serviceAccountPath = path.join(
        __dirname,
        "..",
        "..",
        "bowizzy-ai-assistant-84d029637a02.json"
      );
      serviceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, "utf8")
      );
    }

    // Create JWT client with domain-wide delegation
    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/meetings.space.created",
      ],
      subject: IMPERSONATE_USER,
    });

    const calendar = google.calendar({ version: "v3", auth });
    const meet = google.meet({ version: "v2", auth });

    // Create a Google Meet space
    const meetSpace = await meet.spaces.create({
      requestBody: {},
    });

    const meetUri = meetSpace.data.meetingUri;

    // Calculate end time (30 minutes after start)
    const startDate = new Date(startTimeUtc);
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

    const eventBody = {
      summary: "Bowizzy Mock Interview",
      description: "Interview scheduled via Bowizzy",
      start: {
        dateTime: startDate.toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: "Asia/Kolkata",
      },
      conferenceData: {
        entryPoints: [
          {
            entryPointType: "video",
            uri: meetUri,
            label: "Google Meet",
          },
        ],
        conferenceSolution: {
          key: {
            type: "hangoutsMeet",
          },
          name: "Google Meet",
        },
      },
    };

    // Create calendar event
    await calendar.events.insert({
      calendarId: IMPERSONATE_USER,
      conferenceDataVersion: 1,
      resource: eventBody,
    });

    return meetUri;
  } catch (error) {
    console.error("Error creating Google Meet:", error.message);
    throw error;
  }
}

exports.createGoogleMeeting = createGoogleMeeting;
