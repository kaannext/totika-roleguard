const mongoose = require("mongoose");

const totika = mongoose.Schema({
    guild_id: String,
    minute: Number,
    hour: Number
});

module.exports = mongoose.model("nukeConfig", totika);