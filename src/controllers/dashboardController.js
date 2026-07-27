const PersonalDetails = require("../models/PersonalDetails");
const Education = require("../models/Education");
const WorkExperience = require("../models/WorkExperience");
const Project = require("../models/Project");
const Skill = require("../models/Skill");
const Link = require("../models/Link");
const Certificate = require("../models/Certificate");

const hasValue = value =>
  value !== null &&
  value !== undefined &&
  (typeof value !== "string" || value.trim() !== "");

const isTrue = value =>
  value === true || value === 1 || value === "1" || value === "true";

exports.getProfileProgress = async (req, res) => {
  try {
    const user_id = req.params.user_id;

    const totalSections = 6;
    let completed = 0;

    let completedSectionsList = [];
    let pendingSectionsList = [];

    const personal = await PersonalDetails.query().findOne({ user_id });

    if (personal) {
      const meaningfulFields = [
        personal.address,
        personal.country,
        personal.state,
        personal.city,
        personal.pincode,
        personal.languages_known,
        personal.nationality,
        personal.passport_number,
        personal.profile_photo_url
      ];

      const hasRealData = meaningfulFields.some(v => v && v !== "");

      if (hasRealData) {
        completed++;
        completedSectionsList.push("personal_details");
      } else {
        pendingSectionsList.push("personal_details");
      }
    } else {
      pendingSectionsList.push("personal_details");
    }

    const education = await Education.query().where({ user_id });
    const isCurrentlyPursuing = education.some(record =>
      isTrue(record.currently_pursuing)
    );

    if (education.length > 0) {
      completed++;
      completedSectionsList.push("education");
    } else {
      pendingSectionsList.push("education");
    }

    // Keep all six sections equally weighted. When a user is currently
    // pursuing a degree, Work Details are not required and receive their full
    // section credit automatically.
    if (isCurrentlyPursuing) {
      completed++;
      completedSectionsList.push("experience");
    } else {
      const workExperience = await WorkExperience.query().where({ user_id });

      if (workExperience.length > 0) {
        completed++;
        completedSectionsList.push("experience");
      } else {
        pendingSectionsList.push("experience");
      }
    }

    const projects = await Project.query().where({ user_id });
    if (projects.length > 0) {
      completed++;
      completedSectionsList.push("projects");
    } else {
      pendingSectionsList.push("projects");
    }

    const skills = await Skill.query().where({ user_id });
    const links = await Link.query().where({ user_id }).whereNot('link_type', 'linkedin');

    if (skills.length > 0 || links.length > 0) {
      completed++;
      completedSectionsList.push("skills_links");
    } else {
      pendingSectionsList.push("skills_links");
    }

    const certificates = await Certificate.query().where({ user_id });
    const hasCertification = certificates.some(certificate =>
      [
        certificate.certificate_type,
        certificate.certificate_title,
        certificate.domain,
        certificate.certificate_provided_by,
        certificate.date,
        certificate.description,
        certificate.file_url
      ].some(hasValue)
    );

    if (hasCertification) {
      completed++;
      completedSectionsList.push("certifications");
    } else {
      pendingSectionsList.push("certifications");
    }

    const percentage = Math.round((completed / totalSections) * 100);

    return res.json({
      user_id,
      completedSections: completed,
      totalSections,
      percentage,
      completedSectionsList,
      pendingSectionsList
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error calculating progress" });
  }
};
