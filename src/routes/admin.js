const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/adminController");

router.get("/admin/users", auth, controller.getAllUsers);
router.get("/admin/interviewers/pending", auth, controller.getPendingInterviewers);
router.get("/admin/interviews", auth, controller.getAllInterviews);
router.get("/admin/priority-interviews", auth, controller.getPriorityInterviews);
router.patch("/admin/interviewers/:user_id/accept", auth, controller.acceptInterviewer);
router.patch("/admin/interviewers/:user_id/ban", auth, controller.banInterviewer);
router.patch("/admin/interviewers/:user_id/review-status", auth, controller.updateInterviewerReviewStatus);
router.patch("/account/:user_id/review-status", auth, controller.updateInterviewerReviewStatus);
router.put("/admin/users/:user_id", controller.updateUser);
router.delete("/admin/users/:user_id", controller.deleteUserAndAssociations);

module.exports = router;

