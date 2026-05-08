const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const IMPERSONATE_USER = "contactus@wizzybox.com";
// helo
async function createGoogleMeeting({ startTimeUtc }) {
  try {
    const serviceAccountPath = path.join(
      __dirname, "..", "..",
      "bowizzy-ai-assistant-78b798e213f8.json"
    );
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"],
      subject: IMPERSONATE_USER, // impersonate the workspace user
    });

    const calendar = google.calendar({ version: "v3", auth });

    const startDate = new Date(startTimeUtc);
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

    const event = await calendar.events.insert({
      calendarId: IMPERSONATE_USER,
      conferenceDataVersion: 1, // 👈 tells Google to generate a Meet link
      requestBody: {
        summary: "Bowizzy Mock Interview",
        description: "Interview scheduled via Bowizzy",
        start: { dateTime: startDate.toISOString(), timeZone: "UTC" },
        end: { dateTime: endDate.toISOString(), timeZone: "UTC" },
        conferenceData: {
          createRequest: {
            requestId: `bowizzy-${Date.now()}`, // 👈 must be unique per request
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });

    // Extract the Meet link from the created event
    const meetLink = event.data.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video"
    )?.uri;

    if (!meetLink) throw new Error("Meet link not generated");

    return meetLink;

  } catch (error) {
    console.error("Error creating Google Meet:", error.message);
    throw error;
  }
}

exports.createGoogleMeeting = createGoogleMeeting;