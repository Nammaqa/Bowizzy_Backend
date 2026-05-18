const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/portfolioController");

// Create Razorpay order for portfolio
router.post("/portfolio/create-order", auth, controller.createOrder);

// Create portfolio project after payment
router.post("/portfolio/create-portfolio", auth, controller.createPortfolio);

// Get all portfolios for user
router.get("/portfolio", auth, controller.getUserPortfolios);

// Get portfolio by ID
router.get("/portfolio/:id", auth, controller.getPortfolioById);

// Update portfolio
router.put("/portfolio/:id", auth, controller.updatePortfolio);

// Delete portfolio
router.delete("/portfolio/:id", auth, controller.deletePortfolio);

module.exports = router;
