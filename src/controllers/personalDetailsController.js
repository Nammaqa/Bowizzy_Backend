const PersonalDetails = require("../models/PersonalDetails");

exports.create = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const exists = await PersonalDetails.query().findOne({ user_id });
    if (exists) {
      return res.status(400).json({
        message: "Personal details already exist. Please use update instead."
      });
    }

    const data = req.body;
    data.user_id = user_id;

    if (data.languages_known && typeof data.languages_known === "string") {
      try { data.languages_known = JSON.parse(data.languages_known); } catch {}
    }

    const record = await PersonalDetails.query().insert(data);
    res.status(201).json(record);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating personal details" });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const record = await PersonalDetails.query().findOne({ user_id });
    if (!record) return res.status(404).json({ message: "No details found" });

    res.json(record);

  } catch (err) {
    res.status(500).json({ message: "Error fetching details" });
  }
};

exports.getById = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { id } = req.params;

    const record = await PersonalDetails.query()
      .findOne({ user_id, personal_id: id });

    if (!record) return res.status(404).json({ message: "No personal details found" });

    res.json(record);

  } catch (err) {
    res.status(500).json({ message: "Error fetching record" });
  }
};

exports.update = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { id } = req.params;
    const data = req.body;

    if (data.languages_known && typeof data.languages_known === "string") {
      try { data.languages_known = JSON.parse(data.languages_known); } catch {}
    }

    const updated = await PersonalDetails.query()
      .patchAndFetchById(id, data)
      .where({ user_id });

    if (!updated) {
      return res.status(404).json({ message: "No personal details found" });
    }

    res.json(updated);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating details" });
  }
};

exports.remove = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { id } = req.params;

    const deleted = await PersonalDetails.query()
      .delete()
      .where({ user_id, personal_id: id });

    if (!deleted) return res.status(404).json({ message: "No personal details found" });

    res.json({ message: "Deleted successfully" });

  } catch (err) {
    res.status(500).json({ message: "Error deleting data" });
  }
};

exports.getAll = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const list = await PersonalDetails.query().where({ user_id });

    if (list.length === 0) {
      return res.status(404).json({ message: "No personal details found" });
    }

    res.json(list);

  } catch (err) {
    res.status(500).json({ message: "Error fetching data" });
  }
};

// Store OTPs in memory (with expiry)
const otpStore = {};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTPEmail = async (email, otp) => {
  const mailServiceUrl = "https://bowizzy-mail-service.vercel.app/api/send-email";
  const bypassHeader = "clRAc3bjRwnrpqGZgac1fy7zaDUmwp7u";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f5f5f5;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header h1 {
          color: #007bff;
          margin: 0;
          font-size: 24px;
        }
        .content {
          color: #333;
          line-height: 1.6;
        }
        .otp-box {
          background-color: #f0f0f0;
          border: 2px solid #007bff;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          margin: 30px 0;
        }
        .otp-code {
          font-size: 32px;
          font-weight: bold;
          color: #007bff;
          letter-spacing: 5px;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
          font-size: 12px;
          color: #666;
          text-align: center;
        }
        .warning {
          background-color: #fff3cd;
          border: 1px solid #ffc107;
          padding: 15px;
          border-radius: 4px;
          margin: 20px 0;
          color: #856404;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Bowizzy</h1>
          <p>Personal Details Change Verification</p>
        </div>

        <div class="content">
          <p>Hello,</p>
          
          <p>You requested to change your personal details on Bowizzy. To complete this request, please use the One-Time Password (OTP) below:</p>

          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>

          <p><strong>OTP Details:</strong></p>
          <ul>
            <li>This OTP is valid for 10 minutes only</li>
            <li>Do not share this OTP with anyone</li>
            <li>Each OTP can only be used once</li>
          </ul>

          <div class="warning">
            <strong>⚠️ Security Notice:</strong> If you did not request this change, please ignore this email or contact our support team immediately.
          </div>

          <p>Thank you for using Bowizzy!</p>

          <p>
            Best regards,<br>
            <strong>The Bowizzy Team</strong>
          </p>
        </div>

        <div class="footer">
          <p>This is an automated message from Bowizzy. Please do not reply to this email.</p>
          <p>&copy; 2026 Bowizzy. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const response = await fetch(mailServiceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vercel-protection-bypass": bypassHeader,
      },
      body: JSON.stringify({
        to: email,
        subject: "[Bowizzy] Personal Details Change Request",
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      throw new Error(`Mail service error: ${response.statusText}`);
    }

    return true;
  } catch (err) {
    console.error("Error sending OTP email:", err);
    throw err;
  }
};

exports.sendOTP = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    // Fetch user email
    const User = require("../models/User");
    const user = await User.query().findById(user_id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.email) {
      return res.status(400).json({ message: "User email not found" });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiryTime = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore[user_id] = { otp, expiryTime };

    // Send email
    await sendOTPEmail(user.email, otp);

    res.status(200).json({
      message: "OTP sent successfully to your email",
      email: user.email,
      expiresIn: "10 minutes",
    });
  } catch (err) {
    console.error("Error sending OTP:", err);
    res.status(500).json({ message: "Error sending OTP. Please try again." });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const storedOTP = otpStore[user_id];

    if (!storedOTP) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    if (Date.now() > storedOTP.expiryTime) {
      delete otpStore[user_id];
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    if (storedOTP.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP verified successfully, delete it
    delete otpStore[user_id];

    res.status(200).json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    res.status(500).json({ message: "Error verifying OTP" });
  }
};

exports.updatePersonalDetailsWithOTP = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { otp, personalDetails } = req.body;

    // Validate required fields
    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    if (!personalDetails) {
      return res.status(400).json({ message: "Personal details are required" });
    }

    const {
      first_name,
      middle_name,
      last_name,
      email,
      mobile_number,
      date_of_birth,
      gender,
    } = personalDetails;

    // Verify OTP
    const storedOTP = otpStore[user_id];

    if (!storedOTP) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    if (Date.now() > storedOTP.expiryTime) {
      delete otpStore[user_id];
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    if (storedOTP.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // OTP verified, proceed with update
    delete otpStore[user_id];

    // Get the personal details record for this user
    const personalDetailsRecord = await PersonalDetails.query().findOne({ user_id });

    if (!personalDetailsRecord) {
      return res.status(404).json({ message: "Personal details not found" });
    }

    // Prepare update data
    const updateData = {};
    if (first_name !== undefined) updateData.first_name = first_name;
    if (middle_name !== undefined) updateData.middle_name = middle_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (email !== undefined) updateData.email = email;
    if (mobile_number !== undefined) updateData.mobile_number = mobile_number;
    if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth;
    if (gender !== undefined) updateData.gender = gender?.toLowerCase?.();

    // Update personal details
    const updated = await PersonalDetails.query()
      .patchAndFetchById(personalDetailsRecord.personal_id, updateData);

    res.status(200).json({
      message: "Personal details updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("Error updating personal details with OTP:", err);
    res.status(500).json({ message: "Error updating personal details" });
  }
};
exports.profileData = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    
    // Fetch personal details (contains name info)
    const personalDetails = await PersonalDetails.query().findOne({ user_id });
    
    // Fetch user (contains image)
    const User = require("../models/User");
    const user = await User.query().findById(user_id);
    
    if (!personalDetails || !user) {
      return res.status(404).json({ message: "Profile data not found" });
    }
    
    // Construct response with name and image
    const profileData = {
      name: {
        first_name: personalDetails.first_name,
        middle_name: personalDetails.middle_name,
        last_name: personalDetails.last_name,
      },
      image: personalDetails.profile_photo_url || null,
      isWelcomeBonusRedeemed: user.welcomeBonusRedeemed,
      credits: user.credits || 0,
      coupon_code: user.coupon_code || null,
    };
    
    res.json(profileData);

  } catch (err) {
    console.error("Error fetching profile data:", err);
    res.status(500).json({ message: "Error fetching profile data" });
  }
}