const User = require("../models/user");

exports.setupProfile = async (req, res) => {
  console.log("called setup profile");
  const user = await User.findOne({ email: req.user.email }).catch(e =>
    console.error(`Exception in setupProfile ${e}`)
  );
  if (!user) {
    return console.error(`User not found, seems like the DB is down`);
  }
  // check for req.body params, omitting now
  let newProfile = {
    photo: {
      name: "",
      buffer: ""
    },
    education_details: [{}]
  };
  newProfile.education_details = [{ any: "ok" }];
  newProfile.photo.name = res.locals.file_name;
  newProfile.photo.buffer = req.file.buffer.toString("base64");
  user.profile = newProfile;
  await user.save();
  res.json({ msg: "ok" });
};

exports.getProfile = async (req, res) => {
  console.log("called get profile");
  const user = await User.findOne({ email: req.user.email }).catch(e =>
    console.error(`Exception in setupProfile ${e}`)
  );
  if (!user) {
    return console.error(`User not found, seems like the DB is down`);
  }
  res.json(user.profile);
};

exports.addProfileEdu = async (req, res) => {
  console.log("called add profile edu");
  const user = await User.findOne({ email: req.user.email }).catch(e =>
    console.error(`Exception in setupProfile ${e}`)
  );
  if (!user) {
    return console.error(`User not found, seems like the DB is down`);
  }
  await User.updateOne(
    { email: req.user.email },
    { $push: { "profile.education_details": { test: "ok" } } }
  );
  await user.save();
  res.json({ msg: "ok" });
};

exports.updateProfilePhoto = async (req, res) => {
  console.log("called update profile photo");
  const user = await User.findOne({ email: req.user.email }).catch(e =>
    console.error(`Exception in setupProfile ${e}`)
  );
  if (!user) {
    return console.error(`User not found, seems like the DB is down`);
  }
  user.profile.photo.name = res.locals.file_name;
  user.profile.photo.buffer = req.file.buffer.toString("base64");
  user.save();
};

exports.deleteProfileEdu = async (req, res) => {
  console.log("called delete profile edu");
  const user = await User.findOne({ email: req.user.email }).catch(e =>
    console.error(`Exception in setupProfile ${e}`)
  );
  if (!user) {
    return console.error(`User not found, seems like the DB is down`);
  }
  req.body.eduDels.forEach(edu => {
    delete user.profile.education_details[edu];
  });
  user.save();
  res.json({ msg: "ok" });
};

exports.updateSocial = async (req, res) => {
  // let user = await User.findOne({ email: req.user.email });
};
exports.removeSocial = async (req, res) => {
  let social = req.body.social;
  let user = await User.findOne({ email: req.user.email });
  if (user != null) {
    // found user
    console.log(
      `Request to remove social ${social} for user ${req.user.email}`
    );
    let couldRemove = false;
    Object.keys(user.auth).forEach(currAuth => {
      console.log(currAuth);
      if (currAuth != social) {
        Object.keys(user.auth[currAuth]).forEach(currKey => {
          console.log(currKey);
          if (currKey == "$init") return;
          let currVal = user.auth[currAuth][currKey];
          if (currVal == undefined || currVal == "" || currVal == "false") {
            // monkaS
          } else {
            couldRemove = true;
          }
        });
      }
    });
    if (!couldRemove) {
      return res.json({
        error: "looks like this is your only id, cannot delete",
        status: false
      });
    }
    if (user.auth[social] != undefined || user.auth[social].id != "") {
      const authKeys = Object.keys(user.auth[social]);
      authKeys.forEach(key => {
        user.auth[social][key] = "";
      });
      await user.save();
      return res.json({ message: "ok", status: true });
    }
  }
};

exports.setProfileName = async (req, res) => {
  const user = await User.findOne({ email: req.user.email }).catch(e => {
    console.error(`Error : ${e}`);
    return res.render("displayError", { error: `error : ${e}` });
  });
  if (user == null) {
    return res.render("displayError", { error: `no such user` });
  }
  user.name = req.body.fullName;
  await user.save();
  res.json({ msg: `Name set: ${req.body.fullName}` });
};
