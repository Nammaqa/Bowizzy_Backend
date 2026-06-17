const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/mockInterviewController");

// Booking APIs
router.post("/users/:user_id/mock-interview/bookings", auth, controller.createBooking);
router.post("/users/:user_id/mock-interview/bookings/verify-payment", auth, controller.verifyPayment);
router.get("/users/:user_id/mock-interview/bookings", auth, controller.getBookingsByUser);
router.get("/users/:user_id/mock-interview/bookings/:id", auth, controller.getBookingById);
router.put("/users/:user_id/mock-interview/bookings/:id/cancel", auth, controller.cancelBooking);
router.put("/users/:user_id/mock-interview/bookings/:id/accept", auth, controller.acceptBooking);
router.get("/users/:user_id/mock-interview/accepted-interviews", auth, controller.getAcceptedInterviews);
router.post("/users/:user_id/mock-interview/candidate-review", auth, controller.submitCandidateReview);
router.post("/users/:user_id/mock-interview/interviewer-review", auth, controller.submitInterviewerReview);
router.get("/mock-interview/bookings", auth, controller.getAllBookings);
router.get("/users/:user_id/mock-interview/fetch-interviews", auth, controller.fetchInterviews);

// Interviewer verification APIs
router.post("/users/:user_id/mock-interview/interviewer/bank-details", auth, controller.submitBankDetails);
router.get("/users/:user_id/mock-interview/interviewer/bank-details/status", auth, controller.checkBankDetailsSubmitted);
router.get("/users/:user_id/mock-interview/interviewer/verification-status", auth, controller.getVerificationStatus);
router.get("/users/:user_id/mock-interview/validate-interviewer", auth, controller.validateInterviewer);
router.get("/users/:user_id/mock-interview/is-interviewer", auth, controller.isInterviewer);

module.exports = router;
