const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/aiEnhanceController");

// Enhance the career objective / about section
// Body: { userInput, skills: string[], experiences: [], projects: [] }
router.post("/enhance/career-objective", auth, controller.enhanceCareerObjective);

// Enhance a project's roles & responsibilities
// Body: { rolesInput, projectTitle, projectType, description }
router.post(
  "/enhance/roles-responsibilities",
  auth,
  controller.enhanceRolesResponsibilities
);

// Enhance the technical summary
// Body: { userInput, skills: string[] }
router.post("/enhance/technical-summary", auth, controller.enhanceTechnicalSummary);

module.exports = router;
