const crypto = require("crypto");
const razorpay = require("../utils/razorpay");
const MockInterview = require("../models/MockInterview");
const BankDetails = require("../models/bankDetails");
const User = require("../models/User");
const CandidateReview = require("../models/candidateReview");
const MockInterviewInterviewerReview = require("../models/mockInterviewInterviewerReview");
const { createGoogleMeeting } = require("../services/googleMeetService");

const validStatuses = ["confirmed", "cancelled_by_interviewer", "cancelled_by_candidate", "pending"];
const validTypes = ["online", "offline"];

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.createBooking = async (req, res) => {
    try {
        const candidate_id = req.user.user_id;
        const {
            start_time_utc,
            end_time_utc,
            interview_type,
            job_role,
            resume_url,
            experience_months,
            amount,
            skills,
            meeting_link
        } = req.body;

        if (!start_time_utc || !end_time_utc) {
            return res.status(400).json({ message: "start_time_utc and end_time_utc are required" });
        }

        if (!interview_type || !validTypes.includes(interview_type)) {
            return res.status(400).json({ message: "interview_type must be 'online' or 'offline'" });
        }

        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            return res.status(400).json({ message: "Valid amount is required" });
        }

        const startUtc = new Date(start_time_utc);
        const endUtc = new Date(end_time_utc);

        if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
            return res.status(400).json({ message: "Invalid date format for start_time_utc or end_time_utc" });
        }

        if (startUtc >= endUtc) {
            return res.status(400).json({ message: "start_time_utc must be before end_time_utc" });
        }

        let normalizedSkills = null;
        if (skills) {
            if (Array.isArray(skills)) {
                normalizedSkills = skills.map((skill) => String(skill).trim()).filter(Boolean).join(", ");
            } else {
                normalizedSkills = String(skills).split(",").map((skill) => skill.trim()).filter(Boolean).join(", ");
            }
        }

        const paise = Math.round(Number(amount) * 100);

        let order;
        try {
            order = await razorpay.orders.create({
                amount: paise,
                currency: "INR",
                receipt: `mock_interview_${Date.now()}`
            });
        } catch (razorpayError) {
            console.error("createBooking Razorpay error:", razorpayError);
            return res.status(500).json({ message: "Razorpay order creation failed", error: razorpayError.message });
        }

        const booking = await MockInterview.query().insert({
            candidate_id,
            interviewer_id: null,
            interview_status: "pending",
            start_time_utc: startUtc.toISOString(),
            end_time_utc: endUtc.toISOString(),
            meeting_link: interview_type === "online" ? (meeting_link || null) : null,
            interview_type,
            job_role: job_role || null,
            payment_status: "pending",
            resume_url: resume_url || null,
            experience_months: experience_months ? Number(experience_months) : null,
            skills: normalizedSkills,
            amount: Number(amount),
            razorpay_order_id: order.id
        });

        return res.status(201).json({ booking, order });
    } catch (err) {
        console.error("createBooking error:", err);
        return res.status(500).json({ message: "Error creating mock interview booking" });
    }
};

exports.fetchInterviews = async (req, res) => {
    try {
        const interviewer_id = Number(req.params.user_id);
        const { experience_months, skills, job_role } = req.query;

        const query = MockInterview.query()
            .whereNull('interviewer_id')
            .whereNot('candidate_id', interviewer_id);

        if (experience_months) {
            const experienceValue = Number(experience_months);
            if (isNaN(experienceValue)) {
                return res.status(400).json({ message: 'experience_months must be a number' });
            }
            query.where('experience_months', '<', experienceValue);
        }

        if (job_role) {
            const normalizedRole = String(job_role).trim().toLowerCase();
            if (normalizedRole.length === 0) {
                return res.status(400).json({ message: 'job_role query must be provided' });
            }
            query.whereRaw('LOWER(job_role) = ?', [normalizedRole]);
        }

        if (skills) {
            const skillList = String(skills)
                .split(',')
                .map((skill) => skill.trim().toLowerCase())
                .filter(Boolean);

            if (skillList.length === 0) {
                return res.status(400).json({ message: 'skills query must contain at least one skill' });
            }

            query.where(function () {
                skillList.forEach((skill) => {
                    const escapedSkill = escapeRegex(skill);
                    this.orWhereRaw("LOWER(skills) ~ ?", [`(^|,\\s*)${escapedSkill}(\\s*,|$)`]);
                });
            });
        }

        const interviews = await query.orderBy('created_at', 'desc');

        return res.json(interviews);
    } catch (err) {
        console.error('fetchInterviews error:', err);
        return res.status(500).json({ message: 'Error fetching mock interviews' });
    }
};

exports.acceptBooking = async (req, res) => {
    try {
        const booking_id = Number(req.params.id);
        const { interviewer_id } = req.body;
        const currentUserId = Number(req.user.user_id);
        const pathUserId = Number(req.params.user_id);

        if (!interviewer_id || isNaN(Number(interviewer_id))) {
            return res.status(400).json({ message: 'interviewer_id is required and must be a number' });
        }

        if (currentUserId !== Number(interviewer_id) || currentUserId !== pathUserId) {
            return res.status(403).json({ message: 'Unauthorized to accept this booking' });
        }

        const booking = await MockInterview.query().findById(booking_id);
        if (!booking) {
            return res.status(404).json({ message: 'Mock interview booking not found' });
        }

        if (booking.interviewer_id) {
            return res.status(409).json({ message: 'Mock interview booking already accepted' });
        }

        if (booking.candidate_id === Number(interviewer_id)) {
            return res.status(400).json({ message: 'Interviewer cannot be the same as candidate' });
        }

        let meetingLink = null;
        if (booking.interview_type === 'online') {
            meetingLink = await createGoogleMeeting({ startTimeUtc: booking.start_time_utc });
        }

        const updatedBooking = await MockInterview.query().patchAndFetchById(booking_id, {
            interviewer_id: Number(interviewer_id),
            interview_status: 'confirmed',
            meeting_link: meetingLink,
            updated_at: new Date().toISOString()
        });

        return res.json({ message: 'Booking accepted', booking: updatedBooking });
    } catch (err) {
        console.error('acceptBooking error:', err);
        return res.status(500).json({ message: 'Error accepting mock interview booking' });
    }
};

exports.verifyPayment = async (req, res) => {
    try {
        const candidate_id = req.user.user_id;
        const {
            mock_interview_id,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        if (!mock_interview_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ message: "mock_interview_id, razorpay_order_id, razorpay_payment_id and razorpay_signature are required" });
        }

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expected = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        const booking = await MockInterview.query().findById(mock_interview_id);
        if (!booking || booking.candidate_id !== candidate_id) {
            return res.status(404).json({ message: "Mock interview booking not found" });
        }

        if (expected !== razorpay_signature) {
            await MockInterview.query()
                .patch({ payment_status: "failed", updated_at: new Date().toISOString() })
                .where({ mock_interview_id });
            return res.status(400).json({ message: "Payment verification failed" });
        }

        const updatedBooking = await MockInterview.query().patchAndFetchById(mock_interview_id, {
            payment_status: "confirmed",
            interview_status: "confirmed",
            razorpay_payment_id,
            razorpay_signature,
            updated_at: new Date().toISOString()
        });

        return res.json({ message: "Payment verified", booking: updatedBooking });
    } catch (err) {
        console.error("verifyPayment error:", err);
        return res.status(500).json({ message: "Error verifying payment" });
    }
};

exports.getBookingById = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { id } = req.params;

        const booking = await MockInterview.query().findById(id);
        if (!booking) {
            return res.status(404).json({ message: "Mock interview booking not found" });
        }

        if (booking.candidate_id !== userId && booking.interviewer_id !== userId) {
            return res.status(403).json({ message: "Forbidden" });
        }

        return res.json(booking);
    } catch (err) {
        console.error("getBookingById error:", err);
        return res.status(500).json({ message: "Error fetching booking" });
    }
};

exports.getBookingsByUser = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const bookings = await MockInterview.query()
            .where(function () {
                this.where("candidate_id", userId).orWhere("interviewer_id", userId);
            })
            .orderBy("created_at", "desc");

        return res.json(bookings);
    } catch (err) {
        console.error("getBookingsByUser error:", err);
        return res.status(500).json({ message: "Error fetching bookings" });
    }
};

exports.getAcceptedInterviews = async (req, res) => {
    try {
        const currentUserId = Number(req.user.user_id);
        const pathUserId = Number(req.params.user_id);

        if (currentUserId !== pathUserId) {
            return res.status(403).json({ message: "Forbidden" });
        }

        const acceptedBookings = await MockInterview.query()
            .where(function () {
                this.where("candidate_id", currentUserId).orWhere("interviewer_id", currentUserId);
            })
            .andWhere("interview_status", "confirmed")
            .orderBy("created_at", "desc");

        return res.json(acceptedBookings);
    } catch (err) {
        console.error("getAcceptedInterviews error:", err);
        return res.status(500).json({ message: "Error fetching accepted interviews" });
    }
};

exports.getAllBookings = async (req, res) => {
    try {
        const bookings = await MockInterview.query().orderBy("created_at", "desc");
        return res.json(bookings);
    } catch (err) {
        console.error("getAllBookings error:", err);
        return res.status(500).json({ message: "Error fetching mock interview bookings" });
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { id } = req.params;

        const booking = await MockInterview.query().findById(id);
        if (!booking) {
            return res.status(404).json({ message: "Mock interview booking not found" });
        }

        if (booking.interview_status && booking.interview_status.startsWith('cancelled')) {
            return res.status(409).json({ message: "Booking already cancelled" });
        }

        let cancelledBy;
        let updateObj = { updated_at: new Date().toISOString() };

        if (booking.candidate_id === userId) {
            cancelledBy = "candidate";
            updateObj.interview_status = "cancelled_by_candidate";
            updateObj.cancelled_by = "candidate";

            // Check hours remaining until start_time_utc
            const startTime = new Date(booking.start_time_utc);
            const now = new Date();
            const hoursRemaining = (startTime - now) / (1000 * 60 * 60);

            // If more than 3 hours: add 50% refund to credits
            if (hoursRemaining > 3) {
                const refundAmount = Math.round(Number(booking.amount) * 0.5);
                
                // Get current user credits and add refund
                const user = await User.query().findById(booking.candidate_id);
                const currentCredits = Number(user.credits || 0);
                
                await User.query().patch({ credits: currentCredits + refundAmount })
                    .where("user_id", booking.candidate_id);
            }
        } else if (booking.interviewer_id === userId) {
            cancelledBy = "interviewer";
            updateObj.interview_status = "cancelled_by_interviewer";
            updateObj.cancelled_by = "interviewer";
            updateObj.priority_status = "priority";
        } else {
            return res.status(403).json({ message: "Forbidden" });
        }

        const updatedBooking = await MockInterview.query().patchAndFetchById(id, updateObj);

        return res.json({ message: "Booking cancelled", booking: updatedBooking });
    } catch (err) {
        console.error("cancelBooking error:", err);
        return res.status(500).json({ message: "Error cancelling booking" });
    }
};

// Candidate-only cancel endpoint
// exports.cancelBookingByCandidate = async (req, res) => {
//     try {
//         const userId = req.user.user_id;
//         const { id } = req.params;

//         const booking = await MockInterview.query().findById(id);
//         if (!booking) {
//             return res.status(404).json({ message: "Mock interview booking not found" });
//         }

//         if (booking.candidate_id !== userId) {
//             return res.status(403).json({ message: "Only the candidate who booked can cancel this interview" });
//         }

//         if (booking.interview_status && booking.interview_status.startsWith('cancelled')) {
//             return res.status(409).json({ message: "Booking already cancelled" });
//         }

//         // Check hours remaining until start_time_utc
//         const startTime = new Date(booking.start_time_utc);
//         const now = new Date();
//         const hoursRemaining = (startTime - now) / (1000 * 60 * 60);

//         // If more than 3 hours: add 50% refund to credits
//         if (hoursRemaining > 3) {
//             const refundAmount = Number(booking.amount) * 0.5;
            
//             // Get current user credits and add refund
//             const user = await User.query().findById(booking.candidate_id);
//             const currentCredits = Number(user.credits || 0);
            
//             await User.query().patch({ credits: currentCredits + refundAmount })
//                 .where("user_id", booking.candidate_id);
//         }

//         const updatedBooking = await MockInterview.query().patchAndFetchById(id, {
//             interview_status: "cancelled_by_candidate",
//             cancelled_by: "candidate",
//             updated_at: new Date().toISOString()
//         });

//         return res.json({ message: "Booking cancelled by candidate", booking: updatedBooking });
//     } catch (err) {
//         console.error("cancelBookingByCandidate error:", err);
//         return res.status(500).json({ message: "Error cancelling booking" });
//     }
// };

exports.submitBankDetails = async (req, res) => {
    try {
        const user_id = req.user.user_id;
        const {
            bank_name,
            account_holder_name,
            account_number,
            ifsc_code,
            account_type,
            branch_name,
            document_url
        } = req.body;

        // Validate required fields
        if (!bank_name || !account_holder_name || !account_number || !ifsc_code || !account_type || !branch_name) {
            return res.status(400).json({ message: "All bank details are required" });
        }

        // Validate account type
        const validAccountTypes = ["Savings Account", "Current Account"];
        if (!validAccountTypes.includes(account_type)) {
            return res.status(400).json({ message: "Invalid account_type" });
        }

        // Prevent duplicate bank account for same IFSC and account number
        const existingBankAccount = await BankDetails.query().findOne({
            account_number,
            ifsc_code
        });

        if (existingBankAccount) {
            return res.status(409).json({ message: "Bank account with this account number and IFSC already exists" });
        }

        // Create bank details record
        const bankDetails = await BankDetails.query().insert({
            user_id,
            bank_name,
            account_holder_name,
            account_number,
            ifsc_code,
            account_type,
            branch_name,
            document_url: document_url || null
        });

        // Update user to pending approval for interviewer verification
        await User.query().patch({
            is_interviewer_verified: "requesting"
        }).where({ user_id });

        return res.status(201).json({
            message: "Bank details submitted successfully. Pending approval.",
            bank_details: bankDetails
        });
    } catch (err) {
        console.error("submitBankDetails error:", err);
        return res.status(500).json({ message: "Error submitting bank details" });
    }
};

exports.checkBankDetailsSubmitted = async (req, res) => {
    try {
        const user_id = req.user.user_id;

        const bankDetails = await BankDetails.query()
            .where({ user_id })
            .first();

        return res.json({
            submitted: Boolean(bankDetails),
            bank_details: bankDetails || null
        });
    } catch (err) {
        console.error("checkBankDetailsSubmitted error:", err);
        return res.status(500).json({ message: "Error checking bank details submission status" });
    }
};

exports.getVerificationStatus = async (req, res) => {
    try {
        const user_id = req.user.user_id;

        const user = await User.query()
            .select("user_id", "is_verified", "is_interviewer_verified", "user_type")
            .findById(user_id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const bankDetails = await BankDetails.query()
            .where({ user_id })
            .first();

        const isFullyVerified = user.is_verified === true &&
            (user.is_interviewer_verified === true || user.is_interviewer_verified === "true") &&
            user.user_type === "interviewer";

        return res.json({
            user_id,
            is_fully_verified_interviewer: isFullyVerified,
            verification_status: {
                is_verified: user.is_verified || false,
                is_interviewer_verified: user.is_interviewer_verified || "pending",
                user_type: user.user_type || "regular",
                bank_details_submitted: Boolean(bankDetails)
            },
            missing_requirements: [
                user.is_verified === false ? "Account verification pending" : null,
                !user.is_interviewer_verified || user.is_interviewer_verified === "pending" ? "Interviewer verification pending" : null,
                user.user_type !== "interviewer" ? "Not set as interviewer user type" : null,
                !bankDetails ? "Bank details not submitted" : null
            ].filter(Boolean)
        });
    } catch (err) {
        console.error("getVerificationStatus error:", err);
        return res.status(500).json({ message: "Error fetching verification status" });
    }
};

exports.validateInterviewer = async (req, res) => {
    try {
        const user_id = req.user.user_id;

        const user = await User.query()
            .select("user_id", "is_verified", "is_interviewer_verified", "user_type")
            .findById(user_id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if user is verified and interviewer
        const isVerifiedInterviewer = user.is_verified === true &&
            (user.is_interviewer_verified === true || user.is_interviewer_verified === "true") &&
            user.user_type === "interviewer";

        if (!isVerifiedInterviewer) {
            return res.status(403).json({
                message: "User is not a verified interviewer",
                is_verified: user.is_verified,
                is_interviewer_verified: user.is_interviewer_verified,
                user_type: user.user_type
            });
        }

        return res.json({
            message: "User is a verified interviewer",
            is_verified_interviewer: true,
            user_id,
            user_type: user.user_type
        });
    } catch (err) {
        console.error("validateInterviewer error:", err);
        return res.status(500).json({ message: "Error validating interviewer" });
    }
};

exports.isInterviewer = async (req, res) => {
    try {
        const user_id = req.user.user_id;

        const user = await User.query()
            .select("user_id", "user_type", "is_interviewer_verified")
            .findById(user_id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isInterviewer = user.user_type === "interviewer";
        const isVerifiedInterviewer = isInterviewer &&
            (user.is_interviewer_verified === true || user.is_interviewer_verified === "true");

        return res.json({
            user_id,
            is_interviewer: isInterviewer,
            is_verified_interviewer: isVerifiedInterviewer,
            user_type: user.user_type,
            is_interviewer_verified: user.is_interviewer_verified
        });
    } catch (err) {
        console.error("isInterviewer error:", err);
        return res.status(500).json({ message: "Error checking interviewer status" });
    }
};

exports.submitCandidateReview = async (req, res) => {
    try {
        const data = req.body;
        const interviewer_id = req.user.user_id;

        if (!interviewer_id) {
            return res.status(403).json({ message: "Invalid user. Access denied" });
        }
    
        const requiredFields = [
            "mock_interview_id",
            "candidate_id",
            "communication_skills",
            "technical_knowledge",
            "problem_solving_analytical_skills",
            "relevant_experience_skills",
            "adaptability_learning_ability",
            "cultural_team_fit",
            "overall_impression",
            "final_comments",
            "final_recommendation",
            "communication_skills_rating",
            "technical_knowledge_rating",
            "problem_solving_analytical_skills_rating",
            "relevant_experience_skills_rating",
            "adaptability_learning_ability_rating",
            "cultural_team_fit_rating",
            "overall_impression_rating"
        ];

        for (const field of requiredFields) {
            if (data[field] === undefined || data[field] === null || data[field] === "") {
                return res.status(400).json({ message: `Missing required field: ${field}` });
            }
            if (field.endsWith('_rating') && (Number(data[field]) < 1 || Number(data[field]) > 5)) {
                return res.status(400).json({ message: "Rating value must be between 1 and 5" });
            }
        }

        const mockInterview = await MockInterview.query().findById(data.mock_interview_id);
        if (!mockInterview) {
            return res.status(404).json({ message: "Mock interview booking not found" });
        }

        if (mockInterview.interviewer_id !== Number(interviewer_id)) {
            return res.status(403).json({ message: "Only the assigned interviewer can submit a review" });
        }

        if (mockInterview.candidate_id !== Number(data.candidate_id)) {
            return res.status(400).json({ message: "Candidate ID does not match the booking" });
        }

        const existingReview = await CandidateReview
            .query()
            .findOne({ mock_interview_id: data.mock_interview_id, interviewer_id });

        if (existingReview) {
            return res.status(409).json({ message: "Review already exists for this mock interview" });
        }

        const newReview = await CandidateReview.query().insert({
            mock_interview_id: data.mock_interview_id,
            candidate_id: Number(data.candidate_id),
            interviewer_id: Number(interviewer_id),
            communication_skills: data.communication_skills,
            technical_knowledge: data.technical_knowledge,
            problem_solving_analytical_skills: data.problem_solving_analytical_skills,
            relevant_experience_skills: data.relevant_experience_skills,
            adaptability_learning_ability: data.adaptability_learning_ability,
            cultural_team_fit: data.cultural_team_fit,
            overall_impression: data.overall_impression,
            final_comments: data.final_comments,
            final_recommendation: data.final_recommendation,
            communication_skills_rating: Number(data.communication_skills_rating),
            technical_knowledge_rating: Number(data.technical_knowledge_rating),
            problem_solving_analytical_skills_rating: Number(data.problem_solving_analytical_skills_rating),
            relevant_experience_skills_rating: Number(data.relevant_experience_skills_rating),
            adaptability_learning_ability_rating: Number(data.adaptability_learning_ability_rating),
            cultural_team_fit_rating: Number(data.cultural_team_fit_rating),
            overall_impression_rating: Number(data.overall_impression_rating),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        const markCandidateFeedbacked = await MockInterview.query().patchAndFetchById(data.mock_interview_id, {
            candidate_feedback_given: true,
            updated_at: new Date().toISOString()
        });

        return res.status(201).json({ message: "Candidate review submitted successfully", review: newReview });
    } catch (err) {
        console.error("submitCandidateReview error:", err);
        return res.status(500).json({ message: "Error submitting candidate review" });
    }
};

exports.submitInterviewerReview = async (req, res) => {
    try {
        const data = req.body;
        const interviewer_id = req.user.user_id;

        if (!interviewer_id) {
            return res.status(403).json({ message: "Invalid user. Access denied" });
        }

        const requiredFields = [
            "mock_interview_id",
            "candidate_id",
            "professionalism_conduct",
            "clarity_of_questions",
            "knowledge_of_role",
            "engagement_during_interview",
            "timeliness_organization",
            "overall_experience",
            "final_comments",
            "professionalism_conduct_rating",
            "clarity_of_questions_rating",
            "knowledge_of_role_rating",
            "engagement_during_interview_rating",
            "timeliness_organization_rating",
            "overall_experience_rating"
        ];

        for (const field of requiredFields) {
            if (data[field] === undefined || data[field] === null || data[field] === "") {
                return res.status(400).json({ message: `Missing required field: ${field}` });
            }
            if (field.endsWith('_rating') && (Number(data[field]) < 1 || Number(data[field]) > 5)) {
                return res.status(400).json({ message: "Rating value must be between 1 and 5" });
            }
        }

        const mockInterview = await MockInterview.query().findById(data.mock_interview_id);
        if (!mockInterview) {
            return res.status(404).json({ message: "Mock interview booking not found" });
        }

       

        if (mockInterview.candidate_id !== Number(data.candidate_id)) {
            return res.status(400).json({ message: "Candidate ID does not match the booking" });
        }

        const existingReview = await MockInterviewInterviewerReview
            .query()
            .findOne({ mock_interview_id: data.mock_interview_id, interviewer_id });

        if (existingReview) {
            return res.status(409).json({ message: "Interviewer review already exists for this mock interview" });
        }

        const newReview = await MockInterviewInterviewerReview.query().insert({
            mock_interview_id: data.mock_interview_id,
            candidate_id: Number(data.candidate_id),
            interviewer_id: Number(interviewer_id),
            professionalism_conduct: data.professionalism_conduct,
            clarity_of_questions: data.clarity_of_questions,
            knowledge_of_role: data.knowledge_of_role,
            engagement_during_interview: data.engagement_during_interview,
            timeliness_organization: data.timeliness_organization,
            overall_experience: data.overall_experience,
            final_comments: data.final_comments,
            professionalism_conduct_rating: Number(data.professionalism_conduct_rating),
            clarity_of_questions_rating: Number(data.clarity_of_questions_rating),
            knowledge_of_role_rating: Number(data.knowledge_of_role_rating),
            engagement_during_interview_rating: Number(data.engagement_during_interview_rating),
            timeliness_organization_rating: Number(data.timeliness_organization_rating),
            overall_experience_rating: Number(data.overall_experience_rating),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        const markInterviewerFeedbacked = await MockInterview.query().patchAndFetchById(data.mock_interview_id, {
            interviewer_feedback_given: true,
            updated_at: new Date().toISOString()
        });

        return res.status(201).json({ message: "Interviewer review submitted successfully", review: newReview });
    } catch (err) {
        console.error("submitInterviewerReview error:", err);
        return res.status(500).json({ message: "Error submitting interviewer review" });
    }
};
