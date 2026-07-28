const User = require("../models/User");
const PersonalDetails = require("../models/PersonalDetails");
const UserSubscription = require("../models/UserSubscription");
const Link = require("../models/Link");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const admin = require("../firebase");
const knex = require("../db/knex"); 

function generateCouponCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let random = "";
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `WIZZY-${year}${month}-${random}`;
}

const normalizeEmail = (email) => (email || "").trim().toLowerCase();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOtpToEmail = async (email, otp, options = {}) => {
  const {
    subject = "[Bowizzy] Verify Your Email",
    title = "Bowizzy Email Verification",
    message = "Please use the OTP below to verify your email address for Bowizzy."
  } = options;
  const mailServiceUrl = "https://bowizzy-mail-service.vercel.app/api/send-email";
  const bypassHeader = "clRAc3bjRwnrpqGZgac1fy7zaDUmwp7u";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0;">
        <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; padding: 32px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <h2 style="color: #007bff; margin-bottom: 12px;">${title}</h2>
          <p>Hello,</p>
          <p>${message}</p>
          <div style="background: #f0f0f0; border: 1px solid #007bff; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #007bff;">${otp}</div>
          <p>This OTP is valid for 10 minutes.</p>
          <p>Thank you,<br />The Bowizzy Team</p>
        </div>
      </body>
    </html>
  `;

  const response = await fetch(mailServiceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vercel-protection-bypass": bypassHeader,
    },
    body: JSON.stringify({
      to: email,
      subject,
      html: htmlContent,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mail service error: ${response.statusText}`);
  }

  return true;
};

exports.authHandler = async (req, res) => {
  try {
    const { type } = req.body;

    if (type === "signup") {
      const {
        email,
        password,
        user_type,
        first_name,
        middle_name,
        last_name,
        phone_number,
        gender,
        date_of_birth,
        linkedin_url,
        coupon_code 
      } = req.body;

      const requiredFields = [
        "email",
        "password",
        "first_name",
        "last_name",
        "phone_number"
      ];

      let missing = [];
      requiredFields.forEach((field) => {
        if (!req.body[field]) missing.push(field);
      });

      if (missing.length > 0) {
        return res.status(400).json({
          message: "Missing required fields",
          missing
        });
      }

      const exists = await User.query().findOne({ email });
      if (exists)
        return res.status(400).json({ message: "Email already exists" });

      const existsPhone = await User.query().findOne({ phone_number });
      if (existsPhone)
        return res
          .status(400)
          .json({ message: "Phone number already exists" });

      const password_hash = await bcrypt.hash(password, 10);

      const myCouponCode = generateCouponCode();

      const user = await User.query().insert({
        email,
        password_hash,
        user_type: user_type || "regular",
        first_name,
        last_name,
        phone_number,
        gender,
        coupon_code: myCouponCode
      });

      // Initialize credits - start with 20 if referral coupon, else 0
      let initialCredits = 0;
      if (coupon_code) {
        const trimmedCoupon = coupon_code.trim().toUpperCase();
        console.log("Looking for coupon:", trimmedCoupon);
        
        const refUser = await User.query().findOne({
          coupon_code: trimmedCoupon
        });

        console.log("Referral user found:", refUser ? refUser.user_id : "NOT FOUND");

        if (refUser) {
          try {
            const incrementResult = await knex("user_credits")
              .where({ user_id: refUser.user_id })
              .increment("credits", 20);

            console.log("Referrer credits incremented:", incrementResult);

            initialCredits = 20;
          } catch (err) {
            console.error("Error incrementing referrer credits:", err);
          }
        }
      }

      await knex("user_credits").insert({
        user_id: user.user_id,
        credits: initialCredits
      });

      await PersonalDetails.query().insert({
        user_id: user.user_id,
        first_name,
        last_name,
        middle_name,
        email,
        mobile_number: phone_number,
        gender: gender || "",
        date_of_birth: date_of_birth || null,
        linkedin_url: linkedin_url || null
      });

      if (linkedin_url) {
        try {
          await Link.query().insert({
            user_id: user.user_id,
            url: linkedin_url,
            link_type: "linkedin"
          });
        } catch (err) {
          console.error("Failed to save link:", err);
        }
      }

      await UserSubscription.query().insert({
        user_id: user.user_id,
        plan_type: "free",
        start_date: new Date(),
        end_date: null,
        status: "active"
      });

      return res.status(201).json({
        message: "Signup successful",
        user_id: user.user_id,
        email: user.email,
        coupon_code: myCouponCode
      });
    }

    if (type === "login") {
      const { email, password } = req.body;

      const user = await User.query().findOne({ email });
      if (!user)
        return res.status(401).json({ message: "Invalid credentials" });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match)
        return res.status(401).json({ message: "Invalid credentials" });

      const token = jwt.sign(
        { user_id: user.user_id, user_type: user.user_type },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      await User.query()
        .patch({ current_token: token })
        .where({ user_id: user.user_id });

      return res.json({
        message: "Login successful",
        user_id: user.user_id,
        email: user.email,
        user_type: user.user_type,
        token
      });
    }

    if (type === "google") {
      const { idToken } = req.body;
      if (!idToken)
        return res.status(400).json({ message: "idToken required" });

      const decoded = await admin.auth().verifyIdToken(idToken);
      const email = decoded.email;

      let user = await User.query().findOne({ email });

      if (!user) {
        const myCouponCode = generateCouponCode();

        user = await User.query().insert({
          email,
          password_hash: "",
          user_type: "regular",
          coupon_code: myCouponCode
        });

        await knex("user_credits").insert({
          user_id: user.user_id,
          credits: 0
        });

        await PersonalDetails.query().insert({
          user_id: user.user_id,
          email
        });

        await UserSubscription.query().insert({
          user_id: user.user_id,
          plan_type: "free",
          start_date: new Date(),
          end_date: null,
          status: "active"
        });
      }

      const token = jwt.sign(
        { user_id: user.user_id, user_type: user.user_type },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      return res.json({
        message: "Google login successful",
        user_id: user.user_id,
        email: user.email,
        token
      });
    }

    return res.status(400).json({
      message: "Invalid type. Must be one of: signup | login | google"
    });
  } catch (err) {
    console.error("Auth Error:", err);
    res.status(500).json({ message: "Authentication failed" });
  }
};

exports.sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);

    const existingUser = await User.query().findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    const otp = generateOTP();

    const [otpVerification] = await knex.transaction(async (trx) => {
      await trx("otp_verifications")
        .where({ email: normalizedEmail })
        .del();

      return trx("otp_verifications")
        .insert({
          email: normalizedEmail,
          otp,
        })
        .returning(["id"]);
    });

    try {
      await sendOtpToEmail(normalizedEmail, otp);
    } catch (error) {
      await knex("otp_verifications")
        .where({ id: otpVerification.id })
        .del();
      throw error;
    }

    return res.status(200).json({
      message: "OTP sent successfully to your email",
      email: normalizedEmail,
      expiresIn: "10 minutes"
    });
  } catch (err) {
    console.error("Send email OTP Error:", err);
    return res.status(500).json({ message: "Failed to send OTP" });
  }
};

exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = normalizeEmail(email);
    const storedOTP = await knex("otp_verifications")
      .where({ email: normalizedEmail })
      .orderBy("created_at", "desc")
      .first();

    if (!storedOTP) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    const expiryTime = new Date(storedOTP.created_at).getTime() + 10 * 60 * 1000;

    if (Date.now() > expiryTime) {
      await knex("otp_verifications").where({ id: storedOTP.id }).del();
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    if (storedOTP.otp !== String(otp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await knex("otp_verifications").where({ id: storedOTP.id }).del();

    return res.status(200).json({
      message: "Email OTP verified successfully",
      email: normalizedEmail
    });
  } catch (err) {
    console.error("Verify email OTP Error:", err);
    return res.status(500).json({ message: "Failed to verify OTP" });
  }
};

exports.sendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await User.query().findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    const otp = generateOTP();

    const [otpVerification] = await knex.transaction(async (trx) => {
      await trx("otp_verifications")
        .where({ email: normalizedEmail })
        .del();

      return trx("otp_verifications")
        .insert({
          email: normalizedEmail,
          otp,
        })
        .returning(["id"]);
    });

    try {
      await sendOtpToEmail(normalizedEmail, otp, {
        subject: "[Bowizzy] Reset Your Password",
        title: "Bowizzy Password Reset",
        message: "Please use the OTP below to reset your password for Bowizzy."
      });
    } catch (error) {
      await knex("otp_verifications")
        .where({ id: otpVerification.id })
        .del();
      throw error;
    }

    return res.status(200).json({
      message: "Password reset OTP sent successfully to your email",
      email: normalizedEmail,
      expiresIn: "10 minutes"
    });
  } catch (err) {
    console.error("Send forgot password OTP Error:", err);
    return res.status(500).json({ message: "Failed to send password reset OTP" });
  }
};

exports.verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = normalizeEmail(email);
    const storedOTP = await knex("otp_verifications")
      .where({ email: normalizedEmail })
      .orderBy("created_at", "desc")
      .first();

    if (!storedOTP) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    const expiryTime = new Date(storedOTP.created_at).getTime() + 10 * 60 * 1000;

    if (Date.now() > expiryTime) {
      await knex("otp_verifications").where({ id: storedOTP.id }).del();
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    if (storedOTP.otp !== String(otp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await knex("otp_verifications").where({ id: storedOTP.id }).del();

    return res.status(200).json({
      message: "Password reset OTP verified successfully",
      email: normalizedEmail
    });
  } catch (err) {
    console.error("Verify forgot password OTP Error:", err);
    return res.status(500).json({ message: "Failed to verify password reset OTP" });
  }
};

exports.changeForgotPassword = async (req, res) => {
  try {
    const { email, otp, new_password, password } = req.body;
    const newPassword = new_password || password;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, and new password are required" });
    }

    const normalizedEmail = normalizeEmail(email);
    const storedOTP = await knex("otp_verifications")
      .where({ email: normalizedEmail })
      .orderBy("created_at", "desc")
      .first();

    if (!storedOTP) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    const expiryTime = new Date(storedOTP.created_at).getTime() + 10 * 60 * 1000;

    if (Date.now() > expiryTime) {
      await knex("otp_verifications").where({ id: storedOTP.id }).del();
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    if (storedOTP.otp !== String(otp)) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const user = await User.query().findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await User.query().patch({ password_hash }).where({ user_id: user.user_id });

    await knex("otp_verifications").where({ id: storedOTP.id }).del();

    return res.status(200).json({
      message: "Password changed successfully"
    });
  } catch (err) {
    console.error("Change forgot password Error:", err);
    return res.status(500).json({ message: "Failed to change password" });
  }
};

exports.checkCouponCode = async (req, res) => {
  try {
    const { coupon_code } = req.body;

    if (!coupon_code) {
      return res.status(400).json({
        message: "Coupon code is required",
        exists: false
      });
    }

    const user = await User.query().findOne({ coupon_code });

    if (user) {
      return res.json({
        message: "Coupon code exists",
        exists: true,
        coupon_code: coupon_code
      });
    } else {
      return res.status(404).json({
        message: "Coupon code does not exist",
        exists: false,
        coupon_code: coupon_code
      });
    }
  } catch (err) {
    console.error("Coupon Check Error:", err);
    res.status(500).json({
      message: "Failed to check coupon code",
      exists: false
    });
  }
};
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.query().findOne({ email });

    if (!user || user.user_type !== "admin") {
      return res.status(401).json({
        message: "Admin not found"
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      { user_id: user.user_id, user_type: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    await User.query()
      .patch({ current_token: token })
      .where({ user_id: user.user_id });

    return res.json({
      message: "Admin login successful",
      user_id: user.user_id,
      email: user.email,
      user_type: user.user_type,
      token
    });

  } catch (err) {
    console.error("Admin Login Error:", err);
    res.status(500).json({ message: "Admin login failed" });
  }
};