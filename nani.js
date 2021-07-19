const { Client, Permissions, GuildAuditLogsEntry, MessageEmbed, GuildMember, TextChannel, Role, Guild, GuildChannel } = require('discord.js');
const client = new Client();
const mongoose = require('mongoose')
const moment = require('moment')
moment.locale("tr");
const { gray, red, green } = require('colorette')
const { chunk } = require('lodash');
const humanizeDuration = require('humanize-duration')
const ayar = require('./settings');
/**
 * @type { Client[] } Bots
 */
const Bots = [];

let embed = new MessageEmbed().setColor("RANDOM").setTimestamp().setFooter("Totika Was Here!").setTitle("Rol Koruma")

mongoose.connect(ayar.mongodb, { useNewUrlParser: true, useUnifiedTopology: true }).then(() => {
    console.log(`Mongodb veritabanına başarıyla bağlandı.`);
}).catch((err) => {
    console.log(red("Mongodb veritbanına bağlanamıyor. Hata:" + err.message));
});

client.login(ayar.mainToken);

const preRole = require('./models/allRoles');

client.on("ready", () => {

            let guild = client.guilds.cache.get(ayar.sunucuID);
            if (!guild) {
                throw new Error("settings.js de girdiğiniz sunucu idi geçersiz!")
            }

            getBackup(guild);

	console.log(`${gray(`[${moment().format("YYYY-MM-DD HH:mm:ss")}]`)} ${green(`[${client.user.username}]` + "Başarıyla bağlandı")}`);
				
    ayar.tokens.forEach((token, index) => {
        const bot = new Client();

        bot.login(token).then(() => {
            Bots.push(bot);
            bot.on("ready", async () => {
			console.log(`${gray(`[${moment().format("YYYY-MM-DD HH:mm:ss")}]`)} ${bot.user.tag} Destekçi bot olarak aktif`)
            });
        }).catch(() => {
            console.log(`${++index}. Token bozuk`)
        })


        bot.on("roleDelete", async(deletedRole) => {
            if (deletedRole.guild.id != ayar.sunucuID) return;
            /**
             * @type { GuildAuditLogsEntry } entry
             */
            const entry = (await deletedRole.guild.fetchAuditLogs({ type: "ROLE_DELETE" })).entries.first();
            if (!entry) return;
        
            if (entry && ![deletedRole.guild.ownerID, ...ayar.whitelistMembers].includes(entry.executor.id)) {
        
                let yetkili = deletedRole.guild.members.cache.get(entry.executor.id);
                yetkili.ban({ reason: "Rol Silme - Totika Guard" })
            }
        });
    })
});

Array.prototype.remove = function() {
    var what, a = arguments,
        L = a.length,
        ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

client.on("channelUpdate", async(oldCh, newCh) => {
    if (newCh.type == "dm") return;

    /**
     * @type { GuildAuditLogsEntry } entry
     */
    const entry = await oldCh.guild.fetchAuditLogs({ limit: 5, type: "CHANNEL_OVERWRITE_UPDATE" }).then(e => e.entries.first());
    /**
     * @type { GuildAuditLogsEntry } entry2
     */
    const entry2 = await oldCh.guild.fetchAuditLogs({ limit: 5, type: "CHANNEL_OVERWRITE_DELETE" }).then(e => e.entries.first());

    if (entry2 && Date.now() - entry2.createdTimestamp < 1000) {
        const role_id = entry2.changes[0].old;
        const res = await preRole.findOne({ guild_id: newCh.guild.id, role_id })
        if (!res || !res.overwrites.length) return;

        const isExits = res.overwrites.findIndex(elem => elem.id == newCh.id);

        if (isExits >= 0) {
            await res.overwrites.splice(isExits, 1);
            await preRole.updateOne({ guild_id: newCh.guild.id, role_id }, { $set: { overwrites: res.overwrites } })
        }
    }

    if (entry && Date.now() - entry.createdTimestamp < 1000) {
        const changes = entry.changes;
        const diff = newCh.permissionOverwrites.find(perm => {
            const oldBitfield = oldCh.permissionOverwrites.get(perm.id)[changes[0].key].bitfield;
            const newBitfield = perm[changes[0].key].bitfield;

            return perm.type == "role" && oldBitfield != newBitfield;
        });

        if (!diff) return;

        const res = await preRole.findOne({ guild_id: newCh.guild.id, role_id: diff.id });

        if (res) {
            const chRes = res.overwrites.find(elem => elem.id == newCh.id);

            if (chRes) {
                chRes.allow = new Permissions(diff["allow"].bitfield).toArray();
                chRes.deny = new Permissions(diff["deny"].bitfield).toArray();
                await preRole.updateOne({ guild_id: newCh.guild.id, role_id: diff.id }, { $set: { overwrites: res.overwrites } });
            } else {
                let variable;
                const perm = newCh.permissionOverwrites.get(diff.id);
                const obj = { id: newCh.id, allow: perm.allow.toArray(), deny: perm.deny.toArray() };
                if (!res.overwrites.length) {
                    variable = [obj];
                } else {
                    res.overwrites.push(obj);
                    variable = res.overwrites;
                }

                await preRole.updateOne({ guild_id: newCh.guild.id, role_id: diff.id }, { $set: { overwrites: variable } })
            }
        }
    };

})

client.on("guildMemberUpdate", async(oldMember, newMember) => {
    if (newMember.guild.id != ayar.sunucuID) return;

    if (newMember.roles.cache.size > oldMember.roles.cache.size) {
        const addedRole = newMember.roles.cache.find(rol => !oldMember.roles.cache.has(rol.id));

        const res = await preRole.findOne({ guild_id: oldMember.guild.id, role_id: addedRole.id });
        if (res) {
            if (res.members.some(r => r === newMember.id)) return;
            res.members.push(newMember.id);
            res.save();
        }

    } else {
        const removedRole = oldMember.roles.cache.find(rol => !newMember.roles.cache.has(rol.id));
        const entry = await newMember.guild.fetchAuditLogs({ type: "ROLE_DELETE" }).then(e => e.entries.first());
        if (Date.now() - entry.createdTimestamp > 0) return;

        if (removedRole) {
            const res = await preRole.findOne({ guild_id: oldMember.guild.id, role_id: removedRole.id });

            if (res) {
                res.members.remove(newMember.id);
                res.save();
            }
        }
    }
});

client.on("roleUpdate", (oldRole, newRole) => {
    getBackup(oldRole.guild, newRole);
})

const pre = require('./models/nuke');

client.on("roleCreate", async role => {
    if (role.guild.id != ayar.sunucuID) return;
    if (client.ignoredLog) {
        client.ignoredLog = false;
        return;
    }

    new preRole({
        guild_id: role.guild.id,
        role_id: role.id,
        name: role.name,
        color: role.hexColor,
        members: role.members.map(mem => mem.id),
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions,
        mentionable: role.mentionable,
        overwrites: []
    }).save();

})

client.on("roleDelete", async(deletedRole) => {
    if (deletedRole.guild.id != ayar.sunucuID) return;

    const log_channel = deletedRole.guild.channels.cache.get(ayar.logChannelId);

    /**
     * @type { GuildAuditLogsEntry } entry
     */
    const entry = (await deletedRole.guild.fetchAuditLogs({ type: "ROLE_DELETE" })).entries.first();
    if (!entry) return;

    if (entry && ![deletedRole.guild.ownerID, ...ayar.whitelistMembers].includes(entry.executor.id)) {

        const deletedRoleData = await preRole.findOne({ guild_id: deletedRole.guild.id, role_id: deletedRole.id });
        if (!deletedRoleData) return;

        let nani = new pre({
            guild_id: deletedRole.guild.id,
            author_id: entry.executor.id,
            timestamp: entry.createdTimestamp,
            deletedRole: {
                name: deletedRole.name,
                color: deletedRole.hexColor,
                hoist: deletedRole.hoist,
                position: deletedRoleData.position,
                permissions: deletedRole.permissions,
                mentionable: deletedRole.mentionable,
                members: deletedRoleData.members,
                overwrites: deletedRoleData.overwrites
            }
        });

        await nani.save();

        const res = await pre.find({ guild_id: deletedRole.guild.id, author_id: entry.executor.id });
        const resConfig = await pre.findOne({ guild_id: deletedRole.guild.id });
        const minuteCount = resConfig ? resConfig.minute : 3;
        const hourCount = resConfig ? resConfig.hour : 10;

        const inMinuteCount = res.filter(data => (Date.now() - data.timestamp) <= 60000);
        const inHourCount = res.filter(data => (Date.now() - data.timestamp) <= 60000 * 60);

        let yetkili = deletedRole.guild.members.cache.get(entry.executor.id);

        if (inMinuteCount.length >= minuteCount) {
            if (yetkili) {
                makeAction(yetkili, { time: false, limit: minuteCount, data: inMinuteCount })
            }
        }

        if (inHourCount >= 10) {
            if (yetkili) {
                makeAction(yetkili, { time: false, limit: hourCount, data: inHourCount })
            }
        }
    }

    if (log_channel) {
        log_channel.send(embed.setDescription(`${entry ? entry.executor : "Bilinmeyen"} (\`${entry ? entry.id : "Bilinmeyen"}\`) tarafından ${deletedRole.name} (\`${deletedRole.id}\`) rolü silindi rolü silen kişi sunucudan yasaklandı.`));
        return;
    }
});

/**
 * @param { GuildMember } member 
 */

async function makeAction(member, data) {
    const managedRoles = member.roles.cache.filter(x => x.managed).map(y => y.id);
    await member.roles.set(managedRoles).catch(() => {});
    const reason = "ROL SİLME SINIRI GEÇİLDİ";
    const action = ayar.action.toLowerCase();
    let response;
    let emoji = ":x:"

    /**
     * @type { TextChannel } ch
     */
    let ch = member.guild.channels.cache.get(ayar.logChannelId);
/*
    if (action == "ban") {
        member.ban({ reason }).then(() => {
            response = "yasaklandı";
            emoji = "🔨"
        }).catch(() => {
            response = "yasaklanamadı";
            console.log(`${member.user.tag} YASAKLANAMADI`);
        });
    } else if (action == "kick") {
        member.kick(reason).then(() => {
            response = "sunucudan atıldı";
            emoji = "👢";
        }).catch(() => {
            response = "sunucudan atılamadı";
        })
    } else if (["jail", "mute"].some(r => r == action)) {
        await member.roles.add(ayar.actionRoleId).then(() => {
            emoji = (action == "jail" ? "⛓️" : "🔇");
            response = (action == "jail" ? "jaillendi" : "susturuldu");
        }).catch(() => {
            response = action == "jail" ? "jaillenemedi" : "susturulamadı";
        })
    }
*/
    if (ch) {
        ch.send(`Rol silme sınırı aşıldı: ${member.user.tag} tarafından ${data.short ? "uzun bir süre" : "kısa bir süre"}içinde ${data.limit} rol silindi ve Yasaklandı. \nSilinen Roller:\n\`\`\`yml\n${data.data.map(elem => elem.deletedRole.name).join('\n')}\`\`\``);
    }
}

const deletedCount = 0;

client.on("message", async(message) => {

    if (message.channel.type == "dm" || message.author.bot) return;
    const prefix = ayar.prefix;
    const cmd = message.content.slice(prefix.length)
    const command = cmd.trim().split(/ /g)[0];
    const args = cmd.split(/ +/g).slice(1);

    if (message.content.startsWith(prefix)) {
        if (["anticap", "ancap", "ancaps", "limits"].some(r => r == command)) {
            const pre = require('./models/nukeConfig');

            const res = await pre.findOne({ guild_id: message.guild.id });

            if (!args[0]) {
                const embed = new MessageEmbed()
                    .setColor("RANDOM")
                    .setAuthor(message.author.tag, message.author.avatarURL({ dynamic: true }))
                    .addField("Argümanlar:", `[A] Dakika: ${res ? res.minute : 3}\n[B] Saat: ${res ? res.hour : 10}`)
                    .setFooter(`Örnek bir kullanım: ${ayar.prefix}anticap a 5`)
                message.channel.send(embed)
                return;
            };

            if (args[0] == "a") {
                if (!args[1] || isNaN(Number(args[1]))) {
                    message.reply(`Başarıyla Rol Silme Limit Ayarlandı.`);
                    return
                }

            } else if (args[0] == "b") {
                if (!args[1] || isNaN(Number(args[1]))) {
                  //  if(!args[1]) return message.react("❌")
                    message.reply(`Başarıyla Rol Silme Limit Ayarlandı.`);
                    return

                }

            }

        } else if ([`backup`, `kurulum`,`rolkur`].some(r => r == command)) {

            if (!args[0]) return message.channel.send(`Geçerli bir rol idi belirtmelisin`);

            let role = message.guild.roles.cache.get(args[0]);

            let res = await preRole.findOne({ guild_id: message.guild.id, role_id: args[0] });

            if (role || !res) {
                message.channel.send(`Girdiğiniz değere ait veri bulunamadı.`)
                return;
            };

            if (!message.guild.me.hasPermission("MANAGE_ROLES")) {
                return message.channel.send('❌ Bot "**Rolleri Yönet**" yetkisine sahip değil!')
            }

            let response = "✅ Rol oluşturuldu";

            let createdRole = await message.guild.roles.create({
                data: {
                    name: res.name,
                    color: res.color,
                    hoist: res.hoist,
                    permissions: res.permissions,
                    position: res.position,
                    mentionable: res.mentionable
                }
            }).catch(noop);

            if (!createdRole) {
                response = "❌ Rol oluşturulamadı";
                message.channel.send(response).catch(noop);
                return;
            }

            client.ignoredLog = "aru";
            res.role_id = createdRole.id;
            res.save();

            let msg = await message.channel.send(response)

            if (!res.members.length) {
                message.channel.send(`Girdiğiniz role sahip üye(ler) bulunamadı`)
                return;
            };

            response += `\nℹ️ \`${res.members.length}\` *üyeye dağıtılmaya başlanıyor...*`
            await msg.edit(response).catch(noop);

            const chunkCount = res.members.length < Bots.length ? res.members.length : res.members.length / Bots.length;
            let members = chunk(res.members, chunkCount);
            console.log(members)
            let index = 0;

            for (let elem of members) {
                for (let chunkedMember of elem) {
                    let guild = Bots[index].guilds.cache.get(ayar.sunucuID);
                    if (guild) {
                        const member = guild.members.cache.get(chunkedMember);

                        if (member) {
                            setTimeout(async() => {
                                try {
                                    //FIXME: ERROR BREAK 
                                    //My role isn't high enough to assign members to this role.
                                    await member.roles.add(createdRole.id).catch(noop);
                                    ++deletedCount;
                                } catch (e) {

                                }
                            }, 1250)
                        }

                    } else {
                        let errorMsg = "settings.js de girdiğiniz sunucu id si geçersiz!";
                        response += `\n❌ Roller dağıtılırken bir sorun oluştu: \`${errorMsg}\``;
                        msg.edit(response)
                        throw new Error(errorMsg)
                    }
                }
                ++index;
            }

            // const failedCount = 0 //res.members.length - successCount;

            const channelPerms = res.overwrites;

            if (channelPerms.length) {
                /**
                 * @type { GuildChannel } ch
                 */

                let out = Date.now();

                setTimeout(() => {
                    channelPerms.forEach(data => {
                        const ch = message.guild.channels.cache.get(data.id);
                        if(ch) {
                            let perms = {};
                            data.allow.forEach(perm => {
                                perms[perm] = true;
                            });
    
                            data.deny.forEach(perm => {
                                perms[perm] = false;
                            });
    
                            console.log(perms);
                            console.log(humanizeDuration(out - Date.now()));
    
                            ch.updateOverwrite(createdRole, perms).catch(console.error);
                        }
                    });
                })

            }
        } else if (["info", "bilgi"].some(r => r == command)) {
            message.channel.send(new MessageEmbed()
                .setColor("RANDOM")
                .setDescription(`{kaç dk kaldıysa} \`{current}/max\``))
        }
    }
})

function noop() {

}

/**
 * 
 * @param { Guild } guild 
 * @param { Role } role 
 */

async function getBackup(guild, role) {

    if (role) {
        let res = await preRole.findOne({ guild_id: guild.id, role_id: role.id });
        if (res) {
            res.name = role.name;
            res.color = role.hexColor;
            res.hoist = role.hoist;
            res.position = role.position;
            res.permissions = role.permissions;
            res.mentionable = role.mentionable;
            return;
        }
    }

    await preRole.deleteMany({});

    guild.roles.cache.filter(role => role.name != "@everyone" && !role.managed).forEach(async role => {
        const overwrites = [];
        guild.channels.cache.filter(ch => ch.permissionOverwrites.has(role.id)).forEach(channel => {
            let channelPerm = channel.permissionOverwrites.get(role.id);
            let toPush = { id: channel.id, allow: channelPerm.allow.toArray(), deny: channelPerm.deny.toArray() };
            overwrites.push(toPush);
        });

        new preRole({
            guild_id: guild.id,
            role_id: role.id,
            name: role.name,
            color: role.hexColor,
            members: role.members.map(mem => mem.id),
            hoist: role.hoist,
            position: role.position,
            permissions: role.permissions,
            mentionable: role.mentionable,
            overwrites: overwrites
        }).save();

    })
}
