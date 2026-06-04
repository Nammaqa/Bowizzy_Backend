const razorpay = require("../utils/razorpay");
const crypto = require("crypto");
const Portfolio = require("../models/Portfolio");
const UserPayment = require("../models/UserPayment");
const User = require("../models/User");

// CREATE RAZORPAY ORDER FOR PORTFOLIO
exports.createOrder = async (req, res) => {
  try {
    const { amount, credits_used, portfolio_type } = req.body;
    const user_id = req.user.user_id;

    // Validate input
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    if (!portfolio_type) {
      return res.status(400).json({ message: "Portfolio type is required" });
    }

    // Check if user has enough credits
    if (credits_used && Number(credits_used) > 0) {
      const user = await User.query().findById(user_id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.credits < Number(credits_used)) {
        return res.status(400).json({
          message: "Insufficient credits",
          available_credits: user.credits,
          credits_requested: Number(credits_used)
        });
      }
    }

    // Razorpay needs paise
    const paise = Math.round(Number(amount) * 100);

    const order = await razorpay.orders.create({
      amount: paise,
      currency: "INR",
      receipt: `portfolio_${Date.now()}`
    });

    // Store order details in database
    await UserPayment.query().insert({
      user_id,
      razorpay_order_id: order.id,
      razorpay_payment_id: order.payments ? order.payments[0]?.id : null,
      amount: Number(amount),
      currency: "INR",
      status: "created",
      plan_type: "portfolio",
      credits_applied: credits_used ? Number(credits_used) : 0
    });

    return res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      order
    });

  } catch (err) {
    console.error("Portfolio createOrder error:", err);
    return res.status(500).json({ message: "Order creation failed" });
  }
};

// VALIDATE DOMAIN
exports.validateDomain = async (req, res) => {
  try {
    const { domain } = req.body;
    const user_id = req.user.user_id;

    if (!domain) {
      return res.status(400).json({ message: "Domain is required" });
    }

    // Check if domain already exists
    const existingPortfolio = await Portfolio.query().findOne({ domain });

    if (existingPortfolio) {
      return res.json({
        available: false,
        message: "Domain already exists"
      });
    }

    return res.json({
      available: true,
      message: "Domain is available"
    });

  } catch (err) {
    console.error("Portfolio validateDomain error:", err);
    return res.status(500).json({ message: "Domain validation failed" });
  }
};

// CREATE PORTFOLIO PROJECT
exports.createPortfolio = async (req, res) => {
  try {
    const {
      portfolio_name,
      description,
      portfolio_type,
      order_id,
      domain,
      credits_used,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;
    const user_id = req.user.user_id;

    console.log("createPortfolio request body:", req.body);

    // Validate required fields
    if (!portfolio_name) {
      return res.status(400).json({ message: "Portfolio name is required" });
    }

    if (!portfolio_type) {
      return res.status(400).json({ message: "Portfolio type is required" });
    }

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Validate domain if provided
    if (domain) {
      const existingPortfolio = await Portfolio.query().findOne({ user_id, domain });
      if (existingPortfolio) {
        return res.status(400).json({ message: "Domain already exists for this portfolio" });
      }
    }

    // Verify payment exists and belongs to user
    const payment = await UserPayment.query().findOne({
      razorpay_order_id: order_id,
      user_id
    });

    if (!payment) {
      return res.status(400).json({ message: "Payment not found or invalid" });
    }

    // Re-validate credits at creation time (guard against race conditions)
    const creditsToDeduct = credits_used ? Number(credits_used) : 0;
    if (creditsToDeduct > 0) {
      const user = await User.query().findById(user_id);
      if (!user || user.credits < creditsToDeduct) {
        return res.status(400).json({
          message: "Insufficient credits",
          available_credits: user?.credits ?? 0,
          credits_requested: creditsToDeduct
        });
      }
    }

    // Update payment record
    await UserPayment.query().patch({
      razorpay_payment_id,
      razorpay_signature,
      status: "success"
    }).where({ razorpay_order_id: order_id });

    // Create portfolio record
    const portfolio = await Portfolio.query().insert({
      user_id,
      portfolio_name: portfolio_name || null,
      description: description || null,
      portfolio_type,
      razorpay_order_id: order_id,
      domain: domain || null,
      paid_amount: payment.amount,
      credits_used: creditsToDeduct,
      status: "completed"
    });
    console.log("Credits to deduct:", creditsToDeduct);
    // Deduct credits from user
    if (creditsToDeduct > 0) {
      // ✅ DECREASE CREDITS FROM USER TABLE
      await UserPayment.query().knex()('users')
        .where({ user_id: payment.user_id })
        .decrement('credits', Number(credits_used));
    }

    return res.status(201).json({
      message: "Portfolio created successfully",
      portfolio
    });

  } catch (err) {
    console.error("Portfolio createPortfolio error:", err);
    return res.status(500).json({ message: "Portfolio creation failed" });
  }
};

// GET ALL PORTFOLIOS FOR USER
exports.getUserPortfolios = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const portfolios = await Portfolio.query().where({ user_id });

    return res.json(portfolios);

  } catch (err) {
    console.error("Portfolio getUserPortfolios error:", err);
    return res.status(500).json({ message: "Error fetching portfolios" });
  }
};

// GET PORTFOLIO BY ID
exports.getPortfolioById = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;

    const portfolio = await Portfolio.query().findOne({
      portfolio_id: id,
      user_id
    });

    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    return res.json(portfolio);

  } catch (err) {
    console.error("Portfolio getPortfolioById error:", err);
    return res.status(500).json({ message: "Error fetching portfolio" });
  }
};

// GET PORTFOLIO BY ID (PUBLIC)
exports.getPortfolioByIdPublic = async (req, res) => {
  try {
    const { id } = req.params;

    const portfolio = await Portfolio.query().findOne({
      portfolio_id: id
    });

    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    return res.json(portfolio);

  } catch (err) {
    console.error("Portfolio getPortfolioByIdPublic error:", err);
    return res.status(500).json({ message: "Error fetching portfolio" });
  }
};

// UPDATE PORTFOLIO
exports.updatePortfolio = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;
    const { portfolio_name, description, portfolio_type, portfolio_json, domain } = req.body;

    const portfolio = await Portfolio.query().findOne({
      portfolio_id: id,
      user_id
    });

    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    // Validate domain if provided and different from current
    if (domain && domain !== portfolio.domain) {
      const existingPortfolio = await Portfolio.query().findOne({ user_id, domain });
      if (existingPortfolio) {
        return res.status(400).json({ message: "Domain already exists for this portfolio" });
      }
    }

    const updated = await Portfolio.query()
      .patch({
        portfolio_name: portfolio_name || portfolio.portfolio_name,
        description: description !== undefined ? description : portfolio.description,
        portfolio_type: portfolio_type || portfolio.portfolio_type,
        portfolio_json: portfolio_json || null,
        domain: domain !== undefined ? domain : portfolio.domain
      })
      .where({ portfolio_id: id });

    return res.json({
      message: "Portfolio updated successfully",
      portfolio: updated
    });

  } catch (err) {
    console.error("Portfolio updatePortfolio error:", err);
    return res.status(500).json({ message: "Error updating portfolio" });
  }
};

// DELETE PORTFOLIO
exports.deletePortfolio = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;

    const portfolio = await Portfolio.query().findOne({
      portfolio_id: id,
      user_id
    });

    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    await Portfolio.query().delete().where({ portfolio_id: id });

    return res.json({ message: "Portfolio deleted successfully" });

  } catch (err) {
    console.error("Portfolio deletePortfolio error:", err);
    return res.status(500).json({ message: "Error deleting portfolio" });
  }
};