const mongoose = require("mongoose");

const totika = mongoose.Schema({
    guild_id: String,
    author_id: String,
    timestamp: Number,
    deletedRole: Object
});

module.exports = mongoose.model("nukeSchemaTS", totika);