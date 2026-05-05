const InterviewSlot = require("../models/interviewSlot");
const InterviewSchedule = require("../models/interviewSchedule");
const CandidateReview = require("../models/candidateReview");
const InterviewerReview = require("../models/interviewerReview");
const BankDetails = require("../models/bankDetails");
const User = require("../models/User");
const SaveSlot = require("../models/saveSlot");
const { createGoogleMeeting } = require("../services/googleMeetService");
const { sendCandidateInterviewEmail, sendInterviewerInterviewEmail } = require("../utils/emailService");

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);


// Checks for interview overlapping and open status of interview slot
async function checkInterviewerConflictFull(trx, interviewerId, startTimeUtc, endTimeUtc) {
  const startISO = dayjs(startTimeUtc).startOf('minute').toISOString();
  const endISO = dayjs(endTimeUtc).startOf('minute').toISOString();

  const isBlocking = (status) => String(status).toLowerCase() !== 'open';

  // RANGE OVERLAP in interview_schedules
  const scheduleOverlaps = await trx('interview_schedules')
    .select('*')
    .where('interviewer_id', interviewerId)
    .andWhere(function () {
      this.whereRaw('ts_range && tstzrange(?, ?, \'[)\')', [startISO, endISO]);
    });

  if (scheduleOverlaps && scheduleOverlaps.length > 0) {
    const blockingRows = scheduleOverlaps.filter(r => isBlocking(r.interview_status));
    if (blockingRows.length > 0) {
      return { conflict: true, reason: 'schedule_overlap', rows: blockingRows };
    }
  }

  // SAME-DAY + EXACT SAME START TIME (IST local day)
  const localStart = dayjs(startTimeUtc).tz('Asia/Kolkata');
  const dayStartUtcISO = localStart.startOf('day').utc().toISOString();
  const dayEndUtcISO = localStart.endOf('day').utc().toISOString();
  const startISOeq = dayjs(startTimeUtc).startOf('minute').toISOString();

  const scheduleSameTime = await trx('interview_schedules')
    .select('*')
    .where('interviewer_id', interviewerId)
    .andWhere('start_time_utc', startISOeq)
    .andWhereBetween('start_time_utc', [dayStartUtcISO, dayEndUtcISO]);

  if (scheduleSameTime && scheduleSameTime.length > 0) {
    const blockingRows = scheduleSameTime.filter(r => isBlocking(r.interview_status));
    if (blockingRows.length > 0) {
      return { conflict: true, reason: 'schedule_same_day_time', rows: blockingRows };
    }
  }

  return { conflict: false };
}


// Function to create interview schedule for a give slot
exports.create = async (req, res) => {
  try {
    const interviewer_id = req.user?.user_id;
    if (!interviewer_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { interview_slot_id } = req.body;
    if (!interview_slot_id) {
      return res.status(400).json({ message: "Interview slot ID is required" });
    }

    const knex = InterviewSchedule.knex();

    // verify interviewer
    const userRow = await User.query()
      .select("is_verified")
      .where({ user_id: interviewer_id })
      .first();

    if (!userRow) {
      return res.status(404).json({ message: "Interviewer user not found" });
    }

    if (!userRow.is_verified) {
      return res.status(403).json({ message: "Interviewer not verified" });
    }

    const createdSchedule = await knex.transaction(async (trx) => {
      // lock slot
      const slotRow = await trx("interview_slots")
        .where({ interview_slot_id })
        .forUpdate()
        .first();

      if (!slotRow) {
        const e = new Error("Interview slot not found");
        e.status = 404;
        throw e;
      }

      if (slotRow.interview_status !== "open") {
        const e = new Error("Slot is not available");
        e.status = 400;
        throw e;
      }

      // conflict check
      const conflict = await checkInterviewerConflictFull(
        trx,
        interviewer_id,
        slotRow.start_time_utc,
        slotRow.end_time_utc
      );

      if (conflict.conflict) {
        const e = new Error("Interviewer conflict");
        e.status = 409;
        throw e;
      }

      // ✅ CREATE GOOGLE MEET
      const meetLink = await createGoogleMeeting({
        startTimeUtc: slotRow.start_time_utc
      });

      // create schedule
      const [schedule] = await trx("interview_schedules")
        .insert({
          interview_slot_id,
          interviewer_id,
          candidate_id: slotRow.candidate_id,
          interview_status: "confirmed",
          start_time_utc: slotRow.start_time_utc,
          end_time_utc: slotRow.end_time_utc,
          interview_mode: slotRow.interview_mode,
          meeting_link: meetLink,
          meeting_type: "google-meet",
          created_at: knex.raw("now()"),
          updated_at: knex.raw("now()")
        })
        .returning("*");

      // update slot
      await trx("interview_slots")
        .where({ interview_slot_id })
        .update({
          interview_status: "confirmed",
          updated_at: knex.raw("now()")
        });

      // remove saved slots
      await trx("saved_slots")
        .where({ interview_slot_id })
        .del();

      return schedule;
    });

    return res.status(201).json(createdSchedule);

  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: "Error creating interview schedule" });
  }
};


// Function to get one particular interview schedule details
exports.getById = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { id } = req.params;

    // Only verified users can access interview slots & schedules
    const userVerificationInfo = await User.query()
      .where({ user_id })
      .select('is_verified')
      .first();

    if(!userVerificationInfo){
      return res.status(404).json({ message: "Interviewer user not found" })
    }

    if(!userVerificationInfo.is_verified){
      return res.status(401).json({ message: "Interviewer is not verified. Access denied." })
    }

    // Step 1: Get the interview schedule with meeting link
    const schedule = await InterviewSchedule.query()
      .where({
        interviewer_id: user_id,
        interview_schedule_id: id
      })
      .first();

    if (!schedule) {
      return res.status(404).json({ message: "Interview schedule not found" });
    }

    // Step 2: Get interview slot details
    const slotId = schedule.interview_slot_id;
    const interviewSlot = await InterviewSlot.query()
      .findById(slotId);

    if (!interviewSlot) {
      return res.status(404).json({ message: "Interview slot not found" });
    }

    // Step 3: Get candidate info
    let candidateInfo = null;
    if (interviewSlot.candidate_id) {
      const candidate = await User.query()
        .select('user_id')
        .findById(interviewSlot.candidate_id)
        .withGraphFetched('[personal_details, work_experience]');

      if (candidate) {
        candidateInfo = {
          user_id: candidate.user_id,
          personal_details: candidate.personal_details || null,
          work_experience: candidate.work_experience || []
        };
      }
    }

    // Step 4: Get interviewer info
    let interviewerInfo = null;
    if (schedule.interviewer_id) {
      const interviewer = await User.query()
        .select('user_id', 'first_name', 'last_name', 'email')
        .findById(schedule.interviewer_id);

      if (interviewer) {
        interviewerInfo = {
          user_id: interviewer.user_id,
          first_name: interviewer.first_name,
          last_name: interviewer.last_name,
          email: interviewer.email
        };
      }
    }

    // Return schedule with meeting_link + slot data + candidate + interviewer
    return res.status(200).json({
      ...schedule,
      interview_slot: interviewSlot,
      candidate: candidateInfo,
      interviewer: interviewerInfo
    });

  } catch(err) {
    return res.status(500).json({ message: "Error fetching interview slot" });
  }
};


// Function to get all the interview schedulings
exports.getAll = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { mode } = req.query;

    // Only verified users can access interview schedules
    const userVerificationInfo = await User.query()
      .where({ user_id })
      .select('is_verified')
      .first();

    if(!userVerificationInfo){
      return res.status(404).json({ message: "User not found" })
    }

    if(!userVerificationInfo.is_verified){
      return res.status(401).json({ message: "User is not verified. Access denied." })
    }

    let list;
    if(mode)
    {
      list = await InterviewSchedule.query()
      .where({ interview_mode: mode })
      .select('interview_schedule_id', 'interview_slot_id', 'interviewer_id', 'candidate_id', 'interview_status', 'start_time_utc', 'end_time_utc', 'interview_mode', 'meeting_link', 'meeting_type', 'created_at', 'updated_at')
      .orderBy("start_time_utc", "asc");
    }
    else{
      list = await InterviewSchedule.query()
      .where({ interview_status: "open" })
      .select('interview_schedule_id', 'interview_slot_id', 'interviewer_id', 'candidate_id', 'interview_status', 'start_time_utc', 'end_time_utc', 'interview_mode', 'meeting_link', 'meeting_type', 'created_at', 'updated_at')
      .orderBy("start_time_utc", "asc");
    }
    
    return res.status(200).json(list);

  } catch(err) {
    return res.status(500).json({ message: "Error fetching interview Schedulings" });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { mode } = req.query;

    // Only verified users can accept a interview slot
    const userVerificationInfo = await User.query()
      .where({ user_id })
      .select('is_verified')
      .first();

    if(!userVerificationInfo){
      return res.status(404).json({ message: "User not found" })
    }

    if(!userVerificationInfo.is_verified){
      return res.status(401).json({ message: "User is not verified. Access denied." })
    }

    let list;

    if(mode){
      list = await InterviewSchedule.query()
      .where({ interviewer_id: user_id,
        interview_mode: mode
       })
      .orderBy("start_time_utc", "asc");
    }
    else{
      list = await InterviewSchedule.query()
      .where({ interviewer_id: user_id })
      .orderBy("start_time_utc", "asc");
    }

    if (!list || list.length === 0) {
      return res.status(200).json([]);
    }

    const slotIds = Array.from(new Set(list.map(s => s.interview_slot_id).filter(Boolean)));
    const scheduleIds = list.map(s => s.interview_schedule_id);
    const candidateIds = Array.from(new Set(list.map(s => s.candidate_id).filter(Boolean)));

    const slots = slotIds.length > 0 ? await InterviewSlot.query()
      .whereIn('interview_slot_id', slotIds)
      .select('interview_slot_id', 'interview_code', 'job_role', 'experience', 'skills', 'resume_url') : [];

    const slotsById = slots.reduce((acc, sl) => { acc[sl.interview_slot_id] = sl; return acc; }, {});

    // Fetch candidate names in one query
    const candidates = candidateIds.length > 0 ? await User.query()
      .whereIn('user_id', candidateIds)
      .select('user_id', 'first_name', 'last_name') : [];

    const candidateMap = candidates.reduce((acc, c) => { acc[c.user_id] = c; return acc; }, {});

    // Fetch candidate reviews by interview_schedule_id
    const candidateReviews = scheduleIds.length > 0 ? await CandidateReview.query()
      .whereIn('interview_schedule_id', scheduleIds) : [];

    // Fetch interviewer reviews by interview_schedule_id
    const interviewerReviews = scheduleIds.length > 0 ? await InterviewerReview.query()
      .whereIn('interview_schedule_id', scheduleIds) : [];

    // Create maps for quick lookup
    const candidateReviewMap = {};
    const interviewerReviewMap = {};
    const interviewerFeedbackMap = {};

    candidateReviews.forEach(cr => {
      candidateReviewMap[cr.interview_schedule_id] = cr;
    });

    interviewerReviews.forEach(ir => {
      interviewerReviewMap[ir.interview_schedule_id] = ir;
      interviewerFeedbackMap[ir.interview_schedule_id] = true;
    });

    const enriched = list.map(s => ({
      ...s,
      interview_code: slotsById[s.interview_slot_id] ? slotsById[s.interview_slot_id].interview_code : null,
      job_role: slotsById[s.interview_slot_id] ? slotsById[s.interview_slot_id].job_role : null,
      experience: slotsById[s.interview_slot_id] ? slotsById[s.interview_slot_id].experience : null,
      skills: slotsById[s.interview_slot_id] ? slotsById[s.interview_slot_id].skills : null,
      resume_url: slotsById[s.interview_slot_id] ? slotsById[s.interview_slot_id].resume_url : null,
      candidate_name: candidateMap[s.candidate_id]
        ? `${candidateMap[s.candidate_id].first_name || ''} ${candidateMap[s.candidate_id].last_name || ''}`.trim()
        : null,
      candidate_review: candidateReviewMap[s.interview_schedule_id] || null,
      interviewer_review: interviewerReviewMap[s.interview_schedule_id] || null,
      candidateFeedbackProvided: !!candidateReviewMap[s.interview_schedule_id],
      interviewerFeedbackProvided: interviewerFeedbackMap[s.interview_schedule_id] || false,
    }));

    return res.status(200).json(enriched);

  } catch(err) {
    return res.status(500).json({ message: "Error fetching interview schedules" });
  }
};


// Function to get interview schedule by ID with full candidate details and skills
exports.getScheduleWithCandidateDetails = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { interview_schedule_id } = req.params;

    // Only verified users can access
    const userVerificationInfo = await User.query()
      .where({ user_id })
      .select('is_verified')
      .first();

    if(!userVerificationInfo){
      return res.status(404).json({ message: "User not found" })
    }

    if(!userVerificationInfo.is_verified){
      return res.status(401).json({ message: "User is not verified. Access denied." })
    }

    // Get the interview schedule
    const schedule = await InterviewSchedule.query()
      .findById(interview_schedule_id);

    if (!schedule) {
      return res.status(404).json({ message: "Interview schedule not found" });
    }

    // Get candidate details with all relations
    const candidate = await User.query()
      .findById(schedule.candidate_id)
      .withGraphFetched('[personal_details, skills, education_details, work_experience]')
      .select('user_id', 'email', 'first_name', 'last_name', 'phone_number', 'linkedin_url', 'is_verified');

    // Return schedule with candidate details
    return res.status(200).json({
      ...schedule,
      candidate: candidate || null
    });

  } catch(err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching interview schedule with candidate details" });
  }
};


// Function to get all interview schedules for a candidate with interviewer details and interview slot data
exports.getCandidateSchedules = async (req, res) => {
  try {
    const candidate_id = req.user.user_id;
    const { mode, status } = req.query;

    // Only verified users can access
    const userVerificationInfo = await User.query()
      .where({ user_id: candidate_id })
      .first();

    if(!userVerificationInfo){
      return res.status(404).json({ message: "User not found" })
    }

    let query = InterviewSchedule.query()
      .where({ candidate_id });

    if(mode){
      query.where({ interview_mode: mode });
    }

    if(status){
      query.where({ interview_status: status });
    }

    const schedules = await query.orderBy("start_time_utc", "asc");

    if (!schedules || schedules.length === 0) {
      return res.status(200).json([]);
    }

    // Get all interviewer IDs, slot IDs, and schedule IDs
    const interviewerIds = schedules.map(s => s.interviewer_id).filter(Boolean);
    const slotIds = schedules.map(s => s.interview_slot_id).filter(Boolean);
    const scheduleIds = schedules.map(s => s.interview_schedule_id);

    // Fetch all interviewer details in one query
    const interviewers = interviewerIds.length > 0 ? await User.query()
      .whereIn('user_id', interviewerIds)
      .select('user_id', 'email', 'first_name', 'last_name', 'phone_number', 'linkedin_url') : [];

    // Fetch all interview slots in one query
    const slots = slotIds.length > 0 ? await InterviewSlot.query()
      .whereIn('interview_slot_id', slotIds)
      .select('interview_slot_id', 'interview_code', 'job_role', 'experience', 'interview_mode', 'skills', 'resume_url') : [];

    // Fetch all interviewer reviews in one query
    const interviewerReviews = scheduleIds.length > 0 ? await InterviewerReview.query()
      .whereIn('interview_schedule_id', scheduleIds)
      .select('interview_schedule_id') : [];

    // Create maps by user_id and slot_id
    const interviewerMap = {};
    interviewers.forEach(i => {
      interviewerMap[i.user_id] = i;
    });

    const slotMap = {};
    slots.forEach(s => {
      slotMap[s.interview_slot_id] = s;
    });

    // Create map for interviewer feedback
    const interviewerFeedbackMap = {};
    interviewerReviews.forEach(ir => {
      interviewerFeedbackMap[ir.interview_schedule_id] = true;
    });

    // Enrich each schedule with interviewer and slot details, and feedback status
    const enriched = schedules.map(schedule => ({
      ...schedule,
      interviewer: interviewerMap[schedule.interviewer_id] || null,
      interview_slot: slotMap[schedule.interview_slot_id] || null,
      isInterviewerFeedbackgiven: interviewerFeedbackMap[schedule.interview_schedule_id] || false
    }));

    return res.status(200).json(enriched);

  } catch(err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching candidate interview schedules" });
  }
};


// Function to cancel the interview schedule by interviewer
exports.cancel = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { id } = req.params;

    // Only verified users can accept a interview slot
    const userVerificationInfo = await User.query()
      .where({ user_id })
      .select('is_verified')
      .first();

    if(!userVerificationInfo){
      return res.status(404).json({ message: "User not found" })
    }

    if(!userVerificationInfo.is_verified){
      return res.status(401).json({ message: "User is not verified. Access denied." })
    }

    // Find schedule and ensure it belongs to this interviewer
    const schedule = await InterviewSchedule.query()
      .findOne({ interviewer_id: user_id, interview_schedule_id: id });

    if (!schedule) {
      return res.status(404).json({ message: "Interview schedule not found" });
    }

    // Only confirmed schedules can be cancelled
    if (String(schedule.interview_status) !== "confirmed") {
      return res.status(400).json({
        message: "Only schedules with status 'confirmed' can be cancelled"
      });
    }

    const knex = InterviewSchedule.knex();

    let updatedSlot;

    // Transaction to update both schedule and slot atomically
    await knex.transaction(async (trx) => {
      // Cancel the schedule
      const updatedSchedules = await trx("interview_schedules")
        .where({
          interview_schedule_id: id,
          interviewer_id: user_id
        })
        .update({
          interview_status: "cancelled",
          updated_at: knex.raw("now()")
        });

      if (!updatedSchedules) {
        throw new Error("Failed to update interview_schedule");
      }

      // Update the related slot:
      // - set status back to 'open'
      // - set priority to 'high'
      // - update priority_updated and updated_at timestamps
      updatedSlot = await trx("interview_slots")
        .where({ interview_slot_id: schedule.interview_slot_id })
        .update({
          interview_status: "open",
          priority: "high",
          priority_updated: knex.raw("now()"),
          updated_at: knex.raw("now()")
        });

      if (!updatedSlot) {
        throw new Error("Failed to update interview_slot");
      }
    });

    return res.status(200).json({ message: "Interview schedule cancelled successfully", updatedSlot: updatedSlot });
  } catch(err) {
    return res.status(500).json({ message: "Error cancelling interview schedule" });
  }
};


exports.createBankAccountInfo = async (req, res) => {
  try{
    const user_id = req.user.user_id;
    const data = req.body;

    if( !data.bank_name || !data.account_holder_name || !data.account_number || !data.ifsc_code || !data.account_type || !data.branch_name )
    {
      return res.status(400).json({ message: "Bank name, and other account related info like account number, IFSC code,.... are required" })
    }

    const record = await BankDetails.query().insert({
      ...data,
      user_id
    });

    return res.status(201).json(record)

  }catch(err){
    return res.status(500).json({ message: "Error creating bank details" })
  }
}

exports.getAllBankInfoByUser = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const bankInfo = await BankDetails.query()
      .where({ user_id });

    if (bankInfo.length === 0) {
      return res.status(404).json({ message: "No bank account info found" });
    }

    return res.status(200).json(bankInfo);

  } catch (err) {
    return res.status(500).json({ message: "Error fetching bank account info" });
  }
};

exports.getBankAccountDetails = async (req, res) => {
  try{
    const user_id = req.user.user_id;
    const { bank_id } = req.params;

    const bankInfo = await BankDetails.query()
      .where({ user_id, bank_id })
      .first();

    if(!bankInfo){
      return res.status(404).json({ message: "Bank account info not found" })
    }

    return res.status(200).json(bankInfo)

  }catch(err){
    return res.status(500).json({ message: "Error fetching bank account info" })
  }
}

exports.updateBankAccountDetails = async (req, res) => {
  try{
    const user_id = req.user.user_id;
    const data = req.body;
    const { bank_id } = req.params;

    const updatedAccountInfo = await BankDetails.query()
        .where({ user_id, bank_id })
        .update({
          ...data,
          updated_at: BankDetails.knex().raw("now()")})
          .returning("*")
          .first();

    if(!updatedAccountInfo){
      return res.status(404).json({ message: "Bank account info not found" })
    }

  return res.status(200).json(updatedAccountInfo)

  }catch(err){
    return res.status(500).json({ message: "Error updating bank account info" })
  }
}

exports.deleteBankAccountDetails = async (req, res) => {
  try{
    const user_id = req.user.user_id;
    const { bank_id } = req.params;

    const deleted = await BankDetails.query()
      .where({ user_id, bank_id })
      .delete();

    if (!deleted) {
      return res.status(404).json({ message: "Bank account info not found" });
    }

    return res.status(200).json({ message: "Deleted successfully" });

  }catch(err){
    return res.status(500).json({ message: "Error deleting bank account info" })
  }
}


exports.getUserVerificationStatus = async (req, res) => {
  try{
    const user_id = req.user.user_id;

    const userVerificationInfo = await User.query()
      .where({ user_id })
      .select('is_verified')
      .first();

    if(!userVerificationInfo){
      return res.status(404).json({ message: "User not found" })
    }

    return res.status(200).json(userVerificationInfo);
    
  }catch(err){
    return res.status(500).json({ message: "Error fetching user verification info" });
  }
}


// Function to get the interview slots
  exports.getInterviewSlots = async (req, res) => {
    try {
      // console.log("TOKEN USER ID:", req.user.user_id);

      const slots = await InterviewSlot.query()
        .where("interview_status", "open")
        .whereNot("candidate_id", req.user.user_id)
        .orderBy("start_time_utc", "asc");

      return res.status(200).json(slots);
    } catch (err) {
      return res.status(500).json({ message: "Error fetching interview slots" });
    }
  };

exports.getCount = async (req, res) => {
  try{
    const candidate_id = req.user.user_id;

    const count = await InterviewSchedule.query()
      .where({ candidate_id })
      .andWhere({ interview_status: "completed" })
      .resultSize();

    return res.status(200).json({ completed_interviews: count });
  }catch(err){
    return res.status(500).json({ message: "Error counting completed interviews" });
  }
}

exports.saveSlot = async (req, res) => {
  try{
    const interviewer_id = req.user.user_id;
    const { interview_slot_id, interview_priority } = req.body;

    // Ensure interviewer exists and is verified
    const userRow = await User.query().select('is_verified').where({ user_id: interviewer_id }).first();
    if (!userRow) return res.status(404).json({ message: 'Interviewer user not found' });
    if (!userRow.is_verified) return res.status(403).json({ message: 'Interviewer not verified. Access denied' });

    if(!interview_slot_id || !interview_priority)
    {
      return res.status(400).json({ message: "Interview slot ID and priority are required" })
    }

    const slotInfo = await InterviewSlot.query()
      .select("interview_status")
      .findById(interview_slot_id);

    if (!slotInfo) {
      return res.status(404).json({ message: "Interview slot not found" });
    }

    if(slotInfo.interview_status !== "open")
    {
      return res.status(409).json({ message: "Interview is already committed by other interviewer" })
    }

    const savedSlotRecord = await SaveSlot.query()
      .where({ interviewer_id })
      .andWhere({ interview_slot_id }).first();

    if(savedSlotRecord){
      return res.status(409).json({ message: "This interview slot is already saved by the user" })
    }

    const record = await SaveSlot.query().insert({
      interviewer_id,
      interview_slot_id,
      interview_priority
    });

    return res.status(200).json(record);


  }catch(err){
    return res.status(500).json({ message: "Error saving interview slot" });
  }
}


exports.removeSavedSlot = async (req, res) => {
  try{
    const interviewer_id = req.user.user_id;
    const { saved_slot_id } = req.params

    // Ensure interviewer exists and is verified
    const userRow = await User.query().select('is_verified').where({ user_id: interviewer_id }).first();
    if (!userRow) return res.status(404).json({ message: 'Interviewer user not found' });
    if (!userRow.is_verified) return res.status(403).json({ message: 'Interviewer not verified. Access denied' });

    if(!saved_slot_id){
      return res.status(400).json({ message: "Saved slot ID is required" })
    }

    const deleted = await SaveSlot.query()
      .where({ saved_slot_id, interviewer_id })
      .delete();

    if (!deleted) {
      return res.status(404).json({ message: "Saved slot info not found" });
    }

    return res.status(200).json({ message: "Removed successfully" });    

  }catch(err){
    return res.status(500).json({ message: "Error Removing saved slot" })
  }
}

exports.getSavedSlotsByUser = async (req, res) => {
  try{
    const interviewer_id = req.user.user_id;

    // Ensure interviewer exists and is verified
    const userRow = await User.query().select('is_verified').where({ user_id: interviewer_id }).first();
    if (!userRow) return res.status(404).json({ message: 'Interviewer user not found' });
    if (!userRow.is_verified) return res.status(403).json({ message: 'Interviewer not verified. Access denied' });

    const savedSlots = await SaveSlot.query()
      .where({ interviewer_id })
      .orderBy('created_at', 'desc');

    if (!savedSlots || savedSlots.length === 0) {
      return res.status(200).json([]);
    }

    const slotIds = Array.from(new Set(savedSlots.map(s => s.interview_slot_id).filter(Boolean)));

    const slots = slotIds.length > 0 ? await InterviewSlot.query().whereIn('interview_slot_id', slotIds) : [];

    const schedules = slotIds.length > 0 ? await InterviewSchedule.query()
      .whereIn('interview_slot_id', slotIds)
      .orderBy('start_time_utc', 'asc') : [];

    const slotsById = slots.reduce((acc, sl) => { acc[sl.interview_slot_id] = sl; return acc; }, {});
    const schedulesBySlot = schedules.reduce((acc, sch) => {
      acc[sch.interview_slot_id] = acc[sch.interview_slot_id] || [];
      acc[sch.interview_slot_id].push(sch);
      return acc;
    }, {});

    const list = savedSlots.map(s => ({
      ...s,
      interview_slot: slotsById[s.interview_slot_id] || null,
      interview_schedules: schedulesBySlot[s.interview_slot_id] || []
    }));

    return res.status(200).json(list);

  }catch(err){
    return res.status(200).json({ message: "Error fetching saved slots" })
  }
}

// exports.getSavedSlotById = async (req, res) => {
//   try{
//     const interviewer_id = req.user.user_id;
//     const { saved_slot_id } = req.params;

//     // Ensure interviewer exists and is verified
//     const userRow = await User.query().select('is_verified').where({ user_id: interviewer_id }).first();
//     if (!userRow) return res.status(404).json({ message: 'Interviewer user not found' });
//     if (!userRow.is_verified) return res.status(403).json({ message: 'Interviewer not verified. Access denied' });

//     const slotInfo = await SaveSlot.query()
//       .select("interview_slot_id")
//       .where({ interviewer_id, saved_slot_id })
//       .first();

//     if (!slotInfo) {
//       return res.status(404).json({ message: "Interview slot not found" });
//     }

//     const interview_slot_id = slotInfo.interview_slot_id;

//     const scheduleInfo = await InterviewSlot.query()
//       .where({ interview_slot_id })
//       .first();

//     return res.status(200).json(scheduleInfo)

//   }catch(err){
//     return res.status(500).json({ message: "Error fetching interview schedule info" })
//   }
// }

exports.getInterviewSlotById = async (req, res) => {
  try {
    const { interview_slot_id } = req.params;

    const slot = await InterviewSlot.query()
      .where({ interview_slot_id })
      .first();

    if (!slot) {
      return res.status(404).json({ message: "Interview slot not found" });
    }

    return res.status(200).json(slot);

  } catch (err) {
    return res.status(500).json({ message: "Error fetching interview slot" });
  }
};

exports.getNextInterview = async (req, res) => {
  try{
    const candidate_id = req.user.user_id;

    const nextInterviewSchedule = await InterviewSchedule.query()
      .where('candidate_id', candidate_id)
      .andWhere('interview_status', 'confirmed')
      .andWhere('start_time_utc', '>=', InterviewSchedule.raw('now()'))
      .orderBy('start_time_utc', 'asc')
      .first();

    if(!nextInterviewSchedule){
      return res.status(404).json({ message: "No upcoming interview schedules found" })
      }
    
      return res.status(200).json(nextInterviewSchedule);

  }catch(err){
    return res.status(500).json({ message: "Error fetching next interview schedule" });
  }
}

// Get interviews starting in 2 hours with candidate and interviewer emails (No Auth)
exports.getInterviewsStartingIn2Hours = async (req, res) => {
  try {
    const now = dayjs.utc();
    const twoHoursLater = now.add(2, 'hours');

    const interviews = await InterviewSchedule.query()
      .select('interview_schedules.*', 'candidate.email as candidate_email', 'candidate.first_name as candidate_first_name', 'candidate.last_name as candidate_last_name', 'interviewer.email as interviewer_email', 'interviewer.first_name as interviewer_first_name', 'interviewer.last_name as interviewer_last_name')
      .join('users as candidate', 'interview_schedules.candidate_id', '=', 'candidate.user_id')
      .join('users as interviewer', 'interview_schedules.interviewer_id', '=', 'interviewer.user_id')
      .where('interview_schedules.interview_status', 'confirmed')
      .andWhereBetween('interview_schedules.start_time_utc', [now.toISOString(), twoHoursLater.toISOString()])
      .orderBy('interview_schedules.start_time_utc', 'asc');

    // Get interview slot details for each interview
    const slotIds = interviews.map(i => i.interview_slot_id).filter(Boolean);
    const slots = slotIds.length > 0 ? await InterviewSlot.query()
      .whereIn('interview_slot_id', slotIds)
      .select('interview_slot_id', 'job_role', 'experience', 'resume_url') : [];

    const slotsById = slots.reduce((acc, sl) => { acc[sl.interview_slot_id] = sl; return acc; }, {});

    // Format times and send emails
    const enrichedInterviews = [];

    for (const interview of interviews) {
      const slotInfo = slotsById[interview.interview_slot_id];
      const startTime = dayjs(interview.start_time_utc).tz('Asia/Kolkata').format('dddd, MMMM D, YYYY - h:mm A');
      const endTime = dayjs(interview.end_time_utc).tz('Asia/Kolkata').format('h:mm A');
      const candidateName = `${interview.candidate_first_name || ''} ${interview.candidate_last_name || ''}`.trim();
      const interviewerName = `${interview.interviewer_first_name || ''} ${interview.interviewer_last_name || ''}`.trim();

      enrichedInterviews.push({
        ...interview,
        formatted_start_time: startTime,
        formatted_end_time: endTime,
        candidate_name: candidateName,
        interviewer_name: interviewerName,
        job_role: slotInfo?.job_role,
        experience: slotInfo?.experience,
        resume_url: slotInfo?.resume_url
      });

      // Send email to candidate
      try {
        await sendCandidateInterviewEmail(interview.candidate_email, {
          startTime,
          endTime,
          interviewerName,
          meetingLink: interview.meeting_link,
          jobRole: slotInfo?.job_role,
          experience: slotInfo?.experience,
          interviewMode: interview.interview_mode
        });
        console.log(`✓ Candidate email sent to: ${interview.candidate_email}`);
      } catch (emailErr) {
        console.error(`✗ Failed to send candidate email to ${interview.candidate_email}:`, emailErr.message);
      }

      // Send email to interviewer
      try {
        await sendInterviewerInterviewEmail(interview.interviewer_email, {
          startTime,
          endTime,
          candidateName,
          candidateEmail: interview.candidate_email,
          meetingLink: interview.meeting_link,
          jobRole: slotInfo?.job_role,
          experience: slotInfo?.experience,
          interviewMode: interview.interview_mode,
          resumeUrl: slotInfo?.resume_url
        });
        console.log(`✓ Interviewer email sent to: ${interview.interviewer_email}`);
      } catch (emailErr) {
        console.error(`✗ Failed to send interviewer email to ${interview.interviewer_email}:`, emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      count: enrichedInterviews.length,
      message: `Found ${enrichedInterviews.length} interview(s) starting in 2 hours. Emails sent to ${enrichedInterviews.length * 2} recipients.`,
      data: enrichedInterviews
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Error fetching interviews starting in 2 hours"
    });
  }
};

exports.updateInterviewAsCompleted = async (req, res) => {
  try {
    const { interview_schedule_id } = req.params;

    if (!interview_schedule_id) {
      return res.status(400).json({
        message: "interview_schedule_id is required"
      });
    }

    const interviewSchedule = await InterviewSchedule.query()
      .findById(interview_schedule_id);

    if (!interviewSchedule) {
      return res.status(404).json({
        message: "Interview schedule not found"
      });
    }

    if (interviewSchedule.interview_status !== "confirmed") {
      return res.status(409).json({
        message: "Only confirmed interviews can be marked as completed"
      });
    }

    const interview_slot_id = interviewSchedule.interview_slot_id;

    let updatedSchedule;
    let updatedSlot;

    await InterviewSchedule.transaction(async (trx) => {

      updatedSchedule = await InterviewSchedule.query(trx)
        .patchAndFetchById(
          interview_schedule_id,
          { interview_status: "completed" }
        );

      updatedSlot = await InterviewSlot.query(trx)
        .patchAndFetchById(
          interview_slot_id,
          { interview_status: "completed" }
        );
    });

    return res.status(200).json({
      message: "Interview marked as completed successfully",
      interview_schedule: updatedSchedule,
      interview_slot: updatedSlot
    });

  } catch (err) {
    return res.status(500).json({
      message: "Error updating interview as completed"
    });
  }
};

