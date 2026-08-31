const InterviewSchedule = require("../models/interviewSchedule");
const PersonalDetails = require("../models/PersonalDetails");
const Skill = require("../models/Skill");
const Education = require("../models/Education");
const WorkExperience = require("../models/WorkExperience");
const Project = require("../models/Project");
const Certificate = require("../models/Certificate");
const Link = require("../models/Link");
const SaveSlot = require("../models/saveSlot");
const JobRole = require("../models/JobRole");
const BankDetails = require("../models/bankDetails");
const TechnicalSummary = require("../models/TechnicalSummary");
const UserCredits = require("../models/UserCredits");
const UserVerificationRequest = require("../models/userVerificationRequest");
const ResumeTemplate = require("../models/ResumeTemplate");
const CandidateReview = require("../models/candidateReview");
const InterviewerReview = require("../models/interviewerReview");
const User = require("../models/User");
const UserSubscription = require("../models/UserSubscription");
const InterviewSlot = require("../models/interviewSlot");
const UserPayment = require("../models/UserPayment");
const MockInterview = require("../models/MockInterview");
const MockInterviewInterviewerReview = require("../models/mockInterviewInterviewerReview");

exports.deleteUserAndAssociations = async (req, res) => {
  try {
    const { user_id } = req.params;
    const candidateSlots = await InterviewSlot.query().select('interview_slot_id').where('candidate_id', user_id);
    const slotIds = candidateSlots.map(s => s.interview_slot_id);

    if (slotIds.length > 0) {
      await InterviewSchedule.query().delete().whereIn('interview_slot_id', slotIds);
    }

    await Promise.all([
      PersonalDetails.query().delete().where("user_id", user_id),
      Skill.query().delete().where("user_id", user_id),
      Education.query().delete().where("user_id", user_id),
      WorkExperience.query().delete().where("user_id", user_id),
      Project.query().delete().where("user_id", user_id),
      Certificate.query().delete().where("user_id", user_id),
      Link.query().delete().where("user_id", user_id),
      SaveSlot.query().delete().where("interviewer_id", user_id),
      JobRole.query().delete().where("user_id", user_id),
      BankDetails.query().delete().where("user_id", user_id),
      TechnicalSummary.query().delete().where("user_id", user_id),
      UserCredits.query().delete().where("user_id", user_id),
      UserSubscription.query().delete().where("user_id", user_id),
      UserPayment.query().delete().where("user_id", user_id),
      UserVerificationRequest.query().delete().where("user_id", user_id),
      ResumeTemplate.query().delete().where("user_id", user_id),
      CandidateReview.query().delete().where("candidate_id", user_id),
      InterviewerReview.query().delete().where("interviewer_id", user_id),
      InterviewSlot.query().delete().where("candidate_id", user_id)
    ]);

    const deleted = await User.query().deleteById(user_id);
    if (!deleted) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ message: "User and all related data deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting user and associations" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const list = await User.query()
      .select(
        "users.user_id",
        "users.email",
        "users.first_name",
        "users.last_name",
        "users.user_type",
        "users.is_interviewer_verified",
        "users.is_verified",
        "users.is_interviewer_banned",
        "users.review_status",
        "users.created_at",
        "users.updated_at"
      )
      .withGraphFetched('[personal_details, skills, education_details, work_experience, job_roles, bank_details]')
      .orderBy('user_id', 'asc');

    return res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching users" });
  }
};

exports.getPendingInterviewers = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const list = await User.query()
      .select(
        "users.user_id",
        "users.email",
        "users.first_name",
        "users.last_name",
        "users.user_type",
        "users.is_interviewer_verified",
        "users.is_verified",
        "users.is_interviewer_banned",
        "users.review_status",
        "users.created_at",
        "users.updated_at"
      )
      .where("users.user_type", "regular")
      .where("users.is_interviewer_verified", "requesting")
      .join("bank_details", "users.user_id", "bank_details.user_id")
      .withGraphFetched('[personal_details, skills, education_details, work_experience, job_roles, bank_details]')
      .orderBy('user_id', 'asc');

    return res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching pending interviewers" });
  }
};

exports.getPriorityInterviews = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const list = await MockInterview.query()
      .where("cancelled_by", "interviewer")
      .andWhere("interview_status", "cancelled_by_interviewer")
      .orderBy("updated_at", "desc");

    return res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching priority interviews" });
  }
};

exports.getAllInterviews = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const list = await MockInterview.query()
      .orderBy("created_at", "desc");

    const mockInterviewIds = list.map((mi) => mi.mock_interview_id);

    const [candidateReviews, interviewerReviews] = mockInterviewIds.length > 0
      ? await Promise.all([
          CandidateReview.query().whereIn("mock_interview_id", mockInterviewIds),
          MockInterviewInterviewerReview.query().whereIn("mock_interview_id", mockInterviewIds)
        ])
      : [[], []];

    const candidateReviewMap = candidateReviews.reduce((acc, review) => {
      acc[review.mock_interview_id] = review;
      return acc;
    }, {});

    const interviewerReviewMap = interviewerReviews.reduce((acc, review) => {
      acc[review.mock_interview_id] = review;
      return acc;
    }, {});

    const enriched = list.map((mi) => ({
      ...mi,
      candidate_review: candidateReviewMap[mi.mock_interview_id] || null,
      interviewer_review: interviewerReviewMap[mi.mock_interview_id] || null
    }));

    return res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching all interviews" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { user_id } = req.params;
    const {
      name,
      email,
      user_type,
      is_interviewer_verified,
      is_verified
    } = req.body;

    const user = await User.query().findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.$query().patch({
      name,
      email,
      user_type,
      is_interviewer_verified,
      is_verified
    });
    await MockInterview.query().patch({ candidate_id: null }).where('candidate_id', user_id);

    return res.json({ message: "User updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user" });
  }
};

exports.acceptInterviewer = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { user_id } = req.params;

    const updated = await User.query()
      .patch({ is_interviewer_verified: true })
      .where({
        user_id,
        user_type: "interviewer"
      });

    if (updated === 0) {
      return res.status(404).json({ message: "Interviewer not found or not an interviewer" });
    }

    // If this interviewer was involved in mock interviews as a candidate,
    // clear those candidate references to avoid inconsistent associations.
    

    return res.json({ message: "Interviewer accepted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error accepting interviewer" });
  }
};

exports.banInterviewer = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { user_id } = req.params;
    const { is_banned } = req.body;

    if (typeof is_banned !== "boolean") {
      return res.status(400).json({ message: "is_banned must be a boolean" });
    }

    const updated = await User.query()
      .patch({ is_interviewer_banned: is_banned })
      .where({ user_id, user_type: "regular" });

    if (updated === 0) {
      return res.status(404).json({ message: "Interviewer not found or not an interviewer" });
    }

    return res.json({
      message: is_banned ? "Interviewer banned successfully" : "Interviewer unbanned successfully"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating interviewer ban status" });
  }
};

exports.updateInterviewerReviewStatus = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { review_status } = req.body;

    const requesterId   = req.user?.user_id;
    const requesterType = req.user?.user_type;

    // Defensive: if the token payload is missing user_id, fail loudly
    // instead of silently 403-ing.
    if (!requesterId) {
      return res.status(401).json({
        message: "Invalid session payload. Please log in again."
      });
    }

    const isAdmin      = requesterType === "admin";
    const isSelfUpdate = String(user_id) === String(requesterId);

    if (!isAdmin && !isSelfUpdate) {
      return res.status(403).json({
        message: "You can only change the review status of your own account."
      });
    }

    const ALLOWED_STATUSES = ["active", "under_review"];
    if (!ALLOWED_STATUSES.includes(review_status)) {
      return res.status(400).json({
        message: "review_status must be 'active' or 'under_review'"
      });
    }


    // Look the user up first so we can distinguish "no such user"
    // from "nothing changed". The old code's `user_type: 'regular'`
    // filter caused a misleading 404 for any other user_type.
    const targetUser = await User.query().findById(user_id);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser.review_status === review_status) {
      return res.json({
        message: `Account is already ${review_status}`,
        user_id: targetUser.user_id,
        review_status
      });
    }

    await User.query().findById(user_id).patch({ review_status });

    return res.json({
      message:
        review_status === "under_review"
          ? "Account has been placed under review"
          : "Account has been reactivated",
      user_id: targetUser.user_id,
      review_status
    });
  } catch (err) {
    console.error("updateInterviewerReviewStatus:", err);
    res.status(500).json({ message: "Error updating account review status" });
  }
};