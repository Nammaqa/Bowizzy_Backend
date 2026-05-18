const razorpay = require("../utils/razorpay");
const crypto = require("crypto");
const Portfolio = require("../models/Portfolio");
const UserPayment = require("../models/UserPayment");

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
      razorpay_payment_id:order.payments ? order.payments[0]?.id : null,
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
      order:order
    });

  } catch (err) {
    console.error("Portfolio createOrder error:", err);
    return res.status(500).json({ message: "Order creation failed" });
  }
};

// CREATE PORTFOLIO PROJECT
exports.createPortfolio = async (req, res) => {
  try {
    const { name, description, portfolio_type, order_id, credits_used,razorpay_payment_id,razorpay_signature } = req.body;
    const user_id = req.user.user_id;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: "Portfolio name is required" });
    }

    if (!portfolio_type) {
      return res.status(400).json({ message: "Portfolio type is required" });
    }

    if (!order_id) {
      return res.status(400).json({ message: "Order ID is required" });
    }

    // Verify payment exists and belongs to user
    const payment = await UserPayment.query().findOne({
      razorpay_order_id: order_id,
      user_id
    });

    if (!payment) {
      return res.status(400).json({ message: "Payment not found or invalid" });
    }
    await UserPayment.query().patch({
      razorpay_payment_id,
      razorpay_signature,
      status: "success"
    }).where({ razorpay_order_id: order_id });

    // Create portfolio record
    const portfolio = await Portfolio.query().insert({
      user_id,
      portfolio_name: name,
      description: description || null,
      portfolio_type,
      razorpay_order_id: order_id,
      paid_amount: payment.amount,
      credits_used: credits_used ? Number(credits_used) : 0,
      status: "completed"
    });

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

// UPDATE PORTFOLIO
exports.updatePortfolio = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;
    const { name, description, portfolio_type } = req.body;

    const portfolio = await Portfolio.query().findOne({
      portfolio_id: id,
      user_id
    });

    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    const updated = await Portfolio.query()
      .patch({
        portfolio_name: name || portfolio.portfolio_name,
        description: description !== undefined ? description : portfolio.description,
        portfolio_type: portfolio_type || portfolio.portfolio_type
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
