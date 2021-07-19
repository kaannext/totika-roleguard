const mongoose = require("mongoose");

const totika = mongoose.Schema({
    guild_id: String,
    role_id: String,
    name: String,
    color: String,
    hoist: Boolean,
    position: Number,
    permissions: Number,
    mentionable: Boolean,
    members: Array,
    overwrites: Array
});

module.exports = mongoose.model("allRolesSchema", totika);

// Totika