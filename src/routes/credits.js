const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/creditsController");

router.get(
  "/credits/:user_id",
  auth,
  controller.getUserCredits
);

router.get(
  "/credits",
  auth,
  controller.getAllUsersCredits
);

router.post(
  "/credits/:user_id/add",
  auth,
  controller.addCredits
);

router.post(
  "/credits/:user_id/deduct",
  auth,
  controller.deductCredits
);

router.put(
  "/credits/:user_id",
  auth,
  controller.updateCredits
);

router.post(
  "/credits/:user_id/create-order",
  auth,
  controller.createCreditPurchaseOrder
);

router.post(
  "/credits/:user_id/verify-payment",
  auth,
  controller.verifyCreditPurchase
);

router.get(
  "/credits/history/:user_id",
  auth,
  controller.getCreditHistory
);
module.exports = router;
