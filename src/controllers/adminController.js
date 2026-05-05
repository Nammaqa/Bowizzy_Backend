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
      InterviewSlot.query().delete().where("candidate_id", user_id),
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
const User = require("../models/User");
const UserSubscription = require("../models/UserSubscription");
const InterviewSlot = require("../models/interviewSlot");
const UserPayment = require("../models/UserPayment");
const Pricing = require("../models/Pricing");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const ExcelJS = require("exceljs");

exports.getInterviewerRequests = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const list = await User.query()
      .select(
        "users.user_id",
        "users.email",
        "users.user_type",
        "users.is_interviewer_verified",
        "users.created_at",
        "users.updated_at"
      )
      .where('is_interviewer_verified', 'requesting')
      .withGraphFetched('[personal_details, skills, education_details, work_experience, job_roles, bank_details]')
      .orderBy('user_id', 'asc');

    return res.json(list);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching interviewer requests" });
  }
};

exports.verifyInterviewer = async (req, res) => {
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
      return res.status(404).json({ message: "Interviewer not found" });
    }

    return res.json({ message: "Interviewer verified successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error verifying interviewer" });
  }
};

exports.approveInterviewer = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const list = await User.query()
      .select(
        "users.user_id",
        "users.email",
        "users.user_type",
        "users.is_interviewer_verified",
        "users.created_at",
        "users.updated_at"
      )
      .where('is_interviewer_verified', 'true')
      .withGraphFetched('[personal_details, skills, education_details, work_experience, job_roles, bank_details]')
      .orderBy('user_id', 'asc');

    return res.json(list);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching interviewer requests" });
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
        "users.created_at",
        "users.updated_at"
      )
      .withGraphFetched('[personal_details, skills, education_details, work_experience, job_roles, bank_details]')
      .orderBy('user_id', 'asc');

    return res.json(list);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching interviewer requests" });
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

    return res.json({ message: "User updated successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating user" });
  }
};

exports.getUserPlanStats = async (req, res) => {
  try {
    // admin only
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const totalUsers = await UserSubscription.query().resultSize();

    const freeUsers = await UserSubscription.query()
      .where("plan_type", "free")
      .resultSize();

    const plusUsers = await UserSubscription.query()
      .where("plan_type", "plus")
      .resultSize();

    const premiumUsers = await UserSubscription.query()
      .where("plan_type", "premium")
      .resultSize();

    return res.json({
      total_users: totalUsers,
      free_users: freeUsers,
      plus_users: plusUsers,
      premium_users: premiumUsers
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching user stats" });
  }
};

exports.getInterviewSlots = async (req, res) => {
  try {
    const {
      from,
      to,
      mode,
      status,
      job_role,
      page,
      limit
    } = req.query;

    const query = InterviewSlot.query()
      .select(
        "interview_slots.*",

        "users.user_id as candidate_user_id",
        "users.email as candidate_email",
        "users.user_type as candidate_user_type",
        "users.is_interviewer_verified as candidate_is_interviewer_verified",

        "personal_details.first_name as candidate_first_name",
        "personal_details.last_name as candidate_last_name",
        "personal_details.profile_photo_url as candidate_profile_photo_url",
        "personal_details.linkedin_url as candidate_linkedin_url",
        "personal_details.mobile_number as candidate_mobile_number"
      )
      .leftJoin("users", "interview_slots.candidate_id", "users.user_id")
      .leftJoin("personal_details", "users.user_id", "personal_details.user_id")
      .whereNot("candidate_id", req.user.user_id)
      .orderBy("start_time_utc", "asc");

    if (status) {
      query.where("interview_status", status);
    } else {
      query.where("interview_status", "open");
    }

    if (mode) {
      const modes = mode.split(",").map((m) => m.trim()).filter(Boolean);
      if (modes.length === 1) {
        query.whereRaw("LOWER(interview_mode) = LOWER(?)", [modes[0]]);
      } else if (modes.length > 1) {
        const lcModes = modes.map((m) => m.toLowerCase());
        query.whereRaw(
          `LOWER(interview_mode) IN (${lcModes.map(() => "?").join(",")})`,
          lcModes
        );
      }
    }

    if (job_role) {
      query.whereRaw("LOWER(job_role) LIKE LOWER(?)", [`%${job_role}%`]);
    }

    if (from || to) {
      let fromDate = null;
      let toDate = null;

      if (from) {
        fromDate = new Date(from);
        if (isNaN(fromDate.getTime())) {
          return res.status(400).json({ message: "Invalid 'from' date" });
        }
      }

      if (to) {
        toDate = new Date(to);
        if (isNaN(toDate.getTime())) {
          return res.status(400).json({ message: "Invalid 'to' date" });
        }
        // include entire 'to' day
        toDate.setHours(23, 59, 59, 999);
      }

      if (fromDate && toDate) {
        query.whereBetween("start_time_utc", [fromDate.toISOString(), toDate.toISOString()]);
      } else if (fromDate) {
        query.where("start_time_utc", ">=", fromDate.toISOString());
      } else if (toDate) {
        query.where("start_time_utc", "<=", toDate.toISOString());
      }
    }

    // pagination: if page/limit provided, use Objection's page (page is 1-based)
    const pageNum = page ? parseInt(page, 10) : null;
    const pageLimit = limit ? parseInt(limit, 10) : null;

    if (pageNum && pageLimit) {
      // Objection page uses zero-based page index
      const result = await query.page(pageNum - 1, pageLimit);
      return res.status(200).json({ total: result.total, results: result.results });
    }

    const rows = await query;
    return res.status(200).json(rows);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching interview slots" });
  }
};

exports.getTotalRevenue = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { type } = req.query;

    let query = UserPayment.query()
      .where("status", "success");

    if (type === "day") {
      query.whereRaw("DATE(created_at) = CURRENT_DATE");
    }

    if (type === "month") {
      query.whereRaw("DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)");
    }

    if (type === "year") {
      query.whereRaw("DATE_TRUNC('year', created_at) = DATE_TRUNC('year', CURRENT_DATE)");
    }

    const result = await query.sum("amount as total");

    const totalRevenue = Number(result[0].total || 0);

    return res.json({
      type: type || "all",
      total_revenue: totalRevenue
    });

  } catch (err) {
    console.error("Revenue error:", err);
    res.status(500).json({ message: "Failed to fetch revenue" });
  }
};

exports.getUserWiseRevenue = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const data = await UserPayment.query()
      .select("user_id")
      .sum("amount as total_paid")
      .where("status", "success")
      .groupBy("user_id")
      .orderBy("total_paid", "desc");

    const formatted = data.map(row => ({
      user_id: row.user_id,
      total_paid: Number(row.total_paid)
    }));

    return res.json(formatted);

  } catch (err) {
    console.error("User revenue error:", err);
    res.status(500).json({ message: "Failed to fetch user revenue" });
  }
};

exports.createPrice = async (req, res) => {
  try {
    const { bowizzy_plan_type, amount } = req.body;

    const price = await Pricing.query().insert({
      bowizzy_plan_type,
      amount
    });

    return res.json(price);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creating price" });
  }
};

exports.getPrices = async (req, res) => {
  try {
    const { bowizzy_plan_type } = req.query;

    let query = Pricing.query().orderBy("id", "asc");

    if (bowizzy_plan_type) {
      query = query.where("bowizzy_plan_type", bowizzy_plan_type);
    }

    const prices = await query;
    return res.json(prices);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching prices" });
  }
};

exports.getPriceById = async (req, res) => {
  try {
    const { id } = req.params;

    const price = await Pricing.query().findById(id);

    if (!price) {
      return res.status(404).json({ message: "Price not found" });
    }

    return res.json(price);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching price" });
  }
};

exports.updatePrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, is_active } = req.body;

    const updatedRow = await Pricing.query()
      .patchAndFetchById(id, { amount, is_active });

    if (!updatedRow) {
      return res.status(404).json({ message: "Price not found" });
    }

    return res.json({
      message: "Price updated successfully",
      data: updatedRow
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error updating price" });
  }
};

exports.deletePrice = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Pricing.query().deleteById(id);

    if (!deleted) {
      return res.status(404).json({ message: "Price not found" });
    }

    return res.json({ message: "Price deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error deleting price" });
  }
};

exports.createPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.query().insert(req.body);
    return res.json(plan);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error creating plan" });
  }
};

exports.getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.query()
      .where("is_active", true)
      .orderBy("id", "asc");

    return res.json(plans);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error fetching plans" });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedPlan = await SubscriptionPlan.query()
      .patchAndFetchById(id, req.body);

    if (!updatedPlan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    return res.json({
      message: "Plan updated successfully",
      data: updatedPlan
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error updating plan" });
  }
};

exports.deletePlan = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await SubscriptionPlan.query().deleteById(id);

    if (!deleted) {
      return res.status(404).json({ message: "Plan not found" });
    }

    return res.json({ message: "Plan deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error deleting plan" });
  }
};

exports.getPlanById = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.query().findById(req.params.id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ message: "Error fetching plan" });
  }
};

exports.exportUsersToExcel = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { fromDate, toDate } = req.query;

    let query = User.query()
      .select(
        "users.user_id",
        "users.email",
        "users.user_type",
        "users.is_interviewer_verified",
        "users.is_verified",
        "users.created_at",
        "users.updated_at"
      )
      .withGraphFetched('[personal_details, skills, education_details, work_experience, job_roles]')
      .orderBy('user_id', 'asc');

    if (fromDate || toDate) {
      if (fromDate) {
        const from = new Date(fromDate);
        if (isNaN(from.getTime())) {
          return res.status(400).json({ message: "Invalid 'fromDate' format. Use ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.SSSZ" });
        }
        query.where("users.created_at", ">=", from.toISOString());
      }

      if (toDate) {
        const to = new Date(toDate);
        if (isNaN(to.getTime())) {
          return res.status(400).json({ message: "Invalid 'toDate' format. Use ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.SSSZ" });
        }
        to.setHours(23, 59, 59, 999);
        query.where("users.created_at", "<=", to.toISOString());
      }
    }

    const list = await query;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Users");

    worksheet.columns = [
      { header: "User ID", key: "user_id", width: 15 },
      { header: "Email", key: "email", width: 30 },
      { header: "User Type", key: "user_type", width: 15 },
      { header: "Interviewer Verified", key: "is_interviewer_verified", width: 20 },
      { header: "Job Roles", key: "job_roles", width: 30 },
      { header: "Created At", key: "created_at", width: 25 },
      { header: "Updated At", key: "updated_at", width: 25 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };

    list.forEach((user) => {
      const row = {
        user_id: user.user_id,
        email: user.email,
        user_type: user.user_type,
        is_interviewer_verified: user.is_interviewer_verified || "no",
        job_roles: user.job_roles?.map(j => j.job_role_name).join(", ") || "",
        created_at: new Date(user.created_at).toLocaleString(),
        updated_at: new Date(user.updated_at).toLocaleString()
      };

      worksheet.addRow(row);
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="users_${new Date().toISOString().split('T')[0]}.xlsx"`);

    return res.send(buffer);

  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ message: "Error exporting users to Excel" });
  }
};

exports.getAllUsersWithBankDetails = async (req, res) => {
  try {
    // Get all bank details with user info
    const records = await BankDetails.query()
      .joinRelated('user')
      .select(
        'bank_details.*',
        'user.user_id',
        'user.user_type',
        'user.first_name',
        'user.last_name',
        'user.email',
        'user.is_verified'
      );

    // For each user, fetch company names and institution names
    const userIds = records.map(r => r.user_id);

    // Get work experience for all users
    const WorkExperience = require('../models/WorkExperience');
    const workExp = await WorkExperience.query()
      .whereIn('user_id', userIds)
      .select('user_id', 'company_name');

    // Get education details for all users
    const Education = require('../models/Education');
    const education = await Education.query()
      .whereIn('user_id', userIds)
      .select('user_id', 'institution_name');

    // Group company names and institution names by user_id
    const companyMap = {};
    workExp.forEach(w => {
      if (!companyMap[w.user_id]) companyMap[w.user_id] = [];
      companyMap[w.user_id].push(w.company_name);
    });

    const institutionMap = {};
    education.forEach(e => {
      if (!institutionMap[e.user_id]) institutionMap[e.user_id] = [];
      institutionMap[e.user_id].push(e.institution_name);
    });

    // Attach company and institution names to each record
    const enriched = records.map(r => ({
      ...r,
      company_names: companyMap[r.user_id] || [],
      institution_names: institutionMap[r.user_id] || []
    }));

    return res.status(200).json(enriched);
  } catch (err) {
    console.error("Error fetching users with bank details: ", err);
    return res.status(500).json({ message: "Error fetching users with bank details" });
  }
}

exports.getAcceptedInterviews = async (req, res) => {
  try {
    const interviews = await InterviewSchedule.query()
      .select(
        'interview_schedules.interview_schedule_id',
        'interview_schedules.meeting_link',
        'interview_schedules.interview_mode',
        'interview_schedules.interview_status',
        'interview_schedules.end_time_utc',

        'interview_schedules.start_time_utc as date_time',
        'candidate_user.first_name as candidate_first_name',
        'candidate_user.last_name as candidate_last_name',
        'interviewer_user.first_name as interviewer_first_name',
        'interviewer_user.last_name as interviewer_last_name'
      )
      .leftJoin('users as candidate_user', 'interview_schedules.candidate_id', 'candidate_user.user_id')
      .leftJoin('users as interviewer_user', 'interview_schedules.interviewer_id', 'interviewer_user.user_id')
      // .where("interview_schedules.interview_status", "confirmed")
      .orderBy("interview_schedules.start_time_utc", "desc");
    return res.status(200).json(interviews);
  } catch (err) {
    console.error("Error fetching accepted interviews: ", err);
    return res.status(500).json({ message: "Error fetching accepted interviews" });
  }
}
