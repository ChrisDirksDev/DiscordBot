const {Client} = require("discord.js");
const {config} = require("./config.json");
const Repo = require("./repository.js");

//Tracks user IDs with active snail messages
let snailMessageTracker = [];

let repo;
let client;
let cachedUsers = [];
let dbClient;
let nextCommand = null;
let guild13, guildCrex = null; 
let trafficChannel;
let emotes = {
    salt: "",
    booMad: "",
    booPanic: "",
    snail: "🐌",
    blank: "",
    skull: "💀"
    
}
const AdminRank = {
    //Banned from bot usage
    Banned: 0,
    //Default user
    User: 1,
    //Trusted moderators
    Mod: 2,
    //Full control admins
    Admin: 3,
}

//#region Events

initClient = () =>{

    console.log("Init Client");

    client = new Client();

    client.on('ready', () => {
        console.log(`Logged in as ${client.user.username}!`);
        init();
      });
    
    client.on('error', error =>{
        console.log("Discord js error", error);
        client.destroy()
        .then(() => initClient())
        .catch(err => {
            console.log("Error creating new client", err)
        })
    });
    
    client.on('message', msg => {   
    
        //If debug enabled only communicate with the debug server
        if (msg.guild.name !== guildCrex.name && config.debug) {
            return;
        }

        //ignore bot messages
        if (msg.author.bot) {
            return;
        }
    
        try{
            checkMessage(msg);
        }catch(err){
            console.log(err);
        }
    });
    
    client.on('guildMemberAdd', member =>{
        //TODO: Update so configs pull channel for each guild
        if (member.guild.name == guild13.name) {
            trafficChannel.send(`${member.user} has joined **${guild13.name}**`);
            console.log(`${member.user} has joined **${guild13.name}**`);
        }
    });
    
    client.on('guildMemberRemove', member =>{
        //TODO: Update so configs pull channel for each guild
        if (member.guild.name == guild13.name) {
            trafficChannel.send(`**${member.user.tag}** has left **${guild13.name}**`);
            console.log(`**${member.user.tag}** has left **${guild13.name}**`);
        }
    }); 

    client.login(config.token)
    .then(async (res, err) =>{
        if (err != undefined) {
            await sleep(60000);
            initClient();
        }
    })
}

initClient();

//#endregion

//#region Util Functions
sleep = (duration) => {
	return function(){
		return new Promise(function(resolve, reject){
			setTimeout(function(){
				resolve();
			}, duration)
		});
	};
};

log = (data) =>{
    console.log(data);
}

randomIntFromInterval = (min,max) => {
    return Math.floor(Math.random()*(max-min+1)+min);
}
//#endregion

init = () =>{

    repo = new Repo(config);
    nextCommand = Date.now();

    guild13 = client.guilds.find(guild => {
        return guild.name == "Room 13";
    })
    guildCrex = client.guilds.find(guild => {
        return guild.name == "Crexington";
    })

    emotes.blank = guildCrex.emojis.get('446236922587643904')
    trafficChannel =  guild13.channels.find("name", config.trafficChannel)
    emotes.salt = guild13.emojis.get('390313096826060804');
    emotes.booMad = guild13.emojis.get('390312111848292363');
    emotes.booPanic = guild13.emojis.get('390312111856943104');

    if(!(repo.state.Connected)){
        log("Initial Open Connection")
        repo.openConnection();
    }
}

checkMessage = async (msg) => {
    try {

        log(msg.content)
    
        //DB Connection Check
        if(!(repo.state.Connected)){
            log("Parse Message aborted. Db connection down.")
            return;
        }
        let uID = -1;
        let resp = checkCacheByDID(msg.author.id);
        
        //Not Cached
        if(resp){

            uID = resp.id;

        }else{

            //Grab id from db
            let resp = await repo.getIDByDID(msg.author.id);
            uID = resp.Result;
    
            //New user
            if(uID == -1){
               let resp = await repo.addUser(msg.author.id, msg.author.username);
               uID = resp.Result;
            }
            
            //Cache user
            cachedUsers.push({"discordID":msg.author.id, "id":uID, "tag": msg.author.username});
        }
        
        if(msg.content.startsWith(config.commandPrefix) && Date.now() > nextCommand) {
           return parseCommand(msg, uID);
        }
    
        return parseMessage(msg, uID);
    } catch (error) {
        console.log(error);
    } 

};

//#region Commands
parseCommand = async (msg, uID) =>{
    let msgParts = msg.content.split(" ");
    //TODO: look into using slice here
    const command = msgParts[0].replace("!",'');

    switch (command.toLowerCase()) {
        case 'commands':
            if(await restrictCommand(msg, uID, AdminRank.User, true))
                commandCommands(msg);
            break;
        case 'roll':
            if(await restrictCommand(msg, uID, AdminRank.User))
                commandRoll(msg, uID);
            break;
        case '8ball':
            if(await restrictCommand(msg, uID, AdminRank.User))
                command8Ball(msg, uID);
            break;
        case 'rank':
            if(await restrictCommand(msg, uID, AdminRank.User, false))
                commandRank(msg, uID);
            break;
        case 'rankings':
            if(await restrictCommand(msg, uID,AdminRank.User, false))
                commandRankings(msg);
            break;
        case 'add8ball':
            if(await restrictCommand(msg, uID, AdminRank.User, false))
                commandAdd8ball(msg, uID)
            break;
        case 'setadminlevel':
            if(await restrictCommand(msg, uID, AdminRank.Admin, false))
                commandSetAdminLevel(msg, uID)
            break;
        case 'quote':
            if(await restrictCommand(msg, uID, AdminRank.User, false))
                commandQuote(msg, uID)
            break;
        case 'addquote':
            if(await restrictCommand(msg, uID, AdminRank.User, false))
                commandAddQuote(msg, uID)
            break;
        case 'removequote':
            if(await restrictCommand(msg, uID, AdminRank.Mod, false))
                commandRemoveQuote(msg, uID)
            break;
        default:
            console.log('Unknown Command', command.toLowerCase());
            break;
    }
};


restrictCommand = async (msg, uID, requirdAdminLevel = 1, checkChannel = true) =>{
    try {

        if (checkChannel && !config.commandChannels.includes(msg.channel.name)) {
            return false;
        }
    
        let resp = await repo.getAdminLevelByID(uID);
        return (requirdAdminLevel <= resp.Result);

    } catch (error) {
        console.log(error)
        return false;
    }
 }

cmdCooldown = (cd = config.commandCooldown) =>{
    let now = Date.now();
    nextCommand = now + cd;
}

getCommandArgs = (data) => {
    log(data);
    let msgParts = data.trim().split(" ");
    const command = msgParts[0].replace("!",'');
    msgParts.shift();
    return msgParts;
}

commandCommands = async (msg) =>{
    try {
        cmdCooldown(20000)
        let message = "";
        message += "The bot has the following general commands:\n";
        message += "**Dice Rolling**\n";
        message += "!roll - *Rolls a number between 1 and 20*\n";
        message += "!roll [number] - *Rolls a number between 1-number* Ex: !roll 100\n";
        message += "!roll [number1] [number2] - *Rolls a number between number1 - number2* Ex: !roll 0 75\n";
        message += "**8 Ball**\n";
        message += '!8ball ["question?"] - *Responds with an answer to your yes or no question* Ex: !8ball "Will I ever be a pokemon master?"\n';
        message += '!add8ball ["response"] - *Adds the response to the possible replys when asking an 8ball question* Ex: !add8ball "heck no"\n';
        message += "**Rankings**\n";
        message += "!rank - *Displays your rankings in the snail salting activity*\n";
        message += "!rankings - *Displays rankings of the top 10 snail salters*\n";
        message += "**Quotes**\n"
        message += '!quote - *Displays a random quote*\n'
        message += '!addquote [@quotedperson] ["quote"] - *Adds a quote to the database attributed to the supplied person* Ex: !addquote @Crexfu "The burping here is an epidemeic"\n';
        message += 'Have any additional questions or issues with the bot? Let me know <214250794701160448>'
        msg.channel.send(message)
        .then(resp =>{
            resp.delete(20000);
        })

    } catch (error) {
        console.log(error);
    }
}

commandSetAdminLevel = async (msg, uID) => {
    try {
        log("Set Admin Level")
        let mArgs = getCommandArgs(msg.content)
    
        if (mArgs.length !== 2) {
            console.log("invalid arg amount", mArgs.length)
            return
        }

        let userName = mArgs[0].substring(1);

        let filterd = msg.guild.members.filter(member =>{
            return member.displayName == userName;
        })

        if (filterd.size != 1) {
            return;
        }

        let userID = filterd.entries().next().value[0];

        let adminLevel = parseInt(mArgs[1]);

        let resp = await repo.getAdminLevels()

        if (!adminLevel ||!resp.Result.includes(adminLevel)) {
            console.log("invalid args", mArgs)
            return;
        }
   
        repo.getIDByDID(userID)
        .then((resp) =>{
            //If that user is not in the db
            //TODO: force add user to db
            if (resp.Error) {
                throw resp.Error
            }
            return repo.updateAdminLevel(resp.Result, adminLevel)
        })
        .then((resp) =>{
            msg.channel.send("**Admin Level Updated**");
        })
        .catch((err)=>{
            console.log(err);
        })
        
    } catch (error) {
        console.log(error)
    }
}
commandAdd8ball = (msg, uID) =>{
    const reg = /"(.*?)"/;
    const matched = msg.content.match(reg);
    const newMessage = `${matched[1]}`;

    repo.add8BallMessage(newMessage, uID)
    .then((data) =>{
        msg.channel.send(`**8Ball Message Added with ID ${data.Result}**`);
        
    })
    .catch( err =>{
        console.log(err);
    })
    
}

command8Ball = (msg, uID) => {
 
    //there is some encoding bs conversions between MAC , hacky fix
    let content = msg.content.replace("“", '"').replace("”",'"');
    const reg = /"(.*?)\?"/;
    const matched = content.match(reg);
    if(matched == null){
        return;
    }
    cmdCooldown();
    repo.get8BallMessages()
    .then((data)=>{

        if(data.Error !== null){
            log(data.Error)
            return;
        }
        let messages = data.Result;
        let preRound = (Math.random() * (messages.length - 1))
        let index = Math.round(preRound);
        console.log("8Ball response index", index);
        console.log(messages[index]);
        const reply = messages[index];
        msg.channel.send(`${msg.member}, ${reply}.`)

    })
    .catch(err =>{
        console.log(err);
    })
}
Random = (min, max) =>{
    let preRound = (Math.random() * (messages.length - 1))
    let index = Math.round(preRound);
    return index;
}
commandRoll = (msg, uID) => {

    const reg = /-"(.*?)"/;
    const matched = msg.content.match(reg);
    let rollLabel = "";

    let commandString = msg.content;
    if(matched !== null){
        rollLabel = `${matched[1]}\n`
        commandString = msg.content.substring(0, matched.index);
    }

    let mArgs = getCommandArgs(commandString)
    
    //Max 2 arguments
    if(mArgs.length > 2){
        return;
    }

    //Is this a help request
    if(mArgs.length == 1 && mArgs[0] == '?'){
        msg.channel.send(`${msg.member}, !roll (0-20), !roll [num] (0-num), !roll [num1] [num2] (num1-num2), add -"[Title]" at the end to add a title to your roll.`)
        return;
    }
    //check for non int args
    try{
        mArgs.forEach(element => {
            if(isNaN(parseInt(element))){
                throw "";
            }
        });
    }catch(error){
        console.log("Roll: Non int args");
        return;
    }

    cmdCooldown();
    const channel = msg.channel;
    const user = (msg.member.nickname !== null)? msg.member.nickname: msg.author.username;


    //D20
    if(mArgs.length == 0){
        console.log("D20");
        const roll = Math.round(((Math.random() * 20) + 1));
        console.log(roll);
        channel.send(`${rollLabel}Rolling a **D20**\n${user} rolled: **${roll}**`)
        return;
    }

    //Number between 1 and the supplied arg
    if(mArgs.length == 1){
        const size = parseInt(mArgs[0]);
        console.log("d"+size);
        const roll = Math.floor(((Math.random() * size) + 1));
        console.log(roll);
        channel.send(`${rollLabel}Rolling a **D${size}**\n${user} rolled: **${roll}**`)
        return;
    }

    //Number between the two supplied args
    if(mArgs.length == 2){
        const min = parseInt(mArgs[0]);
        const max = parseInt(mArgs[1]);
        console.log(`Rolling a number between ${min} and ${max}`);
        const roll = randomIntFromInterval(min,max);
        console.log(roll);
        channel.send(`${rollLabel}Rolling a number between **${min}** and **${max}**\n${user} rolled: **${roll}**`)
        return;
    }
}

commandRank = (msg, uID) => {
    msg.delete();
    cmdCooldown();
    repo.dbGetRankByID(uID)
    .then((data) =>{

        if(data.Error !== null){
            log("Error Getting Rank");
            log(data.Error);
            return;
        }

        if(data.Result != null){
           return msg.channel.send(`${msg.member}, Your current rank is **${data.Result.rank}**, you have farmed **${data.Result.count}** snails.`)
        }
    })
    .then((msg) =>{
        msg.delete(8000);
    })
    .catch(err =>{
        console.log(err);
    })
}

commandRankings = (msg) =>{
    cmdCooldown(10000);
    msg.delete();
    repo.dbGetRanks()
    .then((data) => {

        if(data.Error !== null){
            log("Error Getting Rank");
            log(data.Error);
            return;
        }

        let output = `Rankings requested by ${msg.member}\n`;
        data.Result.forEach(ranking => {
            output += `Rank **${ranking.rank}** - **${ranking.tag}** - Snails Farmed: **${ranking.count}**.\n`;
        });
        
        return msg.channel.send(output)
    })
    .then((mess) =>{
        mess.delete(10000);
    })
    .catch(err =>{
        console.log(err);
    })

}
//#endregion

//#region Messages
parseMessage = (msg, uID) => {
    
    if(checkforSnail(msg)){
        snailLogic(msg, uID); //Async
        return; 
    }
}

//#region Snail

//We are going to go with the async/await syntax rather than Then chaining
//I think it looks much nicer and reads more like normal programming
snailLogic = async(msg, uID) =>{

    try {
        if(!checkforSnail(msg) || snailMessageTracker.includes(uID)){
            return
        }
    
        let member = msg.member;
        let resp = await repo.getSnailCountByID(uID);

        let snailCount = resp.Result;
        if(snailCount == -1){
            let resp = await repo.addSnailFarmer(uID);
            snailCount = 0;
        }
    
        const snailsInMessage = countSnails(msg.content);
    
        if(snailsInMessage < 8){
            snailCount += snailsInMessage;
            await repo.updateSnails(uID, snailCount);
        }

        const response = await sendSnailMessage(msg, uID)
        saltSnail(response, member, snailCount, uID)

    } catch (error) {
        console.log(error);
    }
}

checkforSnail = (msg) => {
    if(msg.content.includes(emotes.snail)){
        return true;
    }
}

countSnails = (content) =>{
    let regex = new RegExp(emotes.snail, 'g');
    return  content.match(regex).length
 }

sendSnailMessage = async (msg,uID) => {

    let message = "";
    let regex = new RegExp(emotes.snail, 'g');
    const snailCount = msg.content.match(regex).length;

    msg.delete()
    .catch(console.error)
    
    if (snailCount > 8) {
        return msg.channel.send(`Too Many Snails!${emotes.booPanic}`); 
    }

    const spaces = ((snailCount - 1));
    message += `${emotes.blank}`.repeat(spaces);
    message += `${emotes.salt} ${emotes.booMad}\n`;
    message += emotes.snail.repeat(snailCount);

    //add this id to the message tracker
    snailMessageTracker.push(uID);
    return await msg.channel.send(message);
}

async function saltSnail(msg, member, snailCount, uID) {
    let activeMsg = msg
    const regex = new RegExp(emotes.snail, 'g');
    const snails = (msg.content.match(regex) || []).length;

    for (let index = 0; index < snails; index ++) {
        //Create a new promise that will resolve in 1 seconds and wait
        const prom = await new Promise((resolve,reject) => {setTimeout(()=>{resolve()}, 1000)})

        let lastIndex = activeMsg.content.lastIndexOf(`${emotes.snail}`);

        let newMsg;
        if(index == snails - 1){
            newMsg = `${activeMsg.content.substring(0 , lastIndex)}\n${member}, you have farmed **${snailCount}** snails!`;
        }else{
            newMsg = `${activeMsg.content.substring(32 , lastIndex)}`;
        }

        //await here or the active message wont be updated
        await msg.edit(newMsg).then(mess =>{
            activeMsg = mess;
        })
    }
    
    msg.delete(5000)
    .then(()=>{
        //find and remove this id from the message tracker
        let index = snailMessageTracker.indexOf(uID)
        snailMessageTracker.splice(index,1);
    });

}

//#region Quotes
async function commandQuote(msg) {
    try {
        msg.delete();
        cmdCooldown();
        let resp = await repo.getQuotes()

        if (resp.Result.length == 0) {
            return msg.channel.send(`No Quotes`)
        }
        let ids = resp.Result.map(quote =>{
            return quote.ID;
        })
        rand = randomIntFromInterval(0, resp.Result.length-1);
        const chosenQuote = resp.Result[rand];

        let name = "";
        let dID = -1;
        let ret  = checkCacheByID(chosenQuote.User);

        if (!ret) {
            ret = await repo.getDIDByID(chosenQuote.User)
            dID = ret.Result
        }else{
            dID = ret.discordID;
        }

        if(dID != -1){
           name = (await client.fetchUser(dID)).username
        }else{
            name = chosenQuote.Name
        }

        msg.channel.send(`Quote #${chosenQuote.ID}: **${name}** - *"${chosenQuote.Quote}"*`)
        .then(resp =>{
            resp.delete(10000);
        })
        
    } catch (error) {
        console.log(error);
    }

}

checkCacheByID = (id) => {
    //Check for cached users
    let data = null;
    //TODO: Should not be a foreach
    cachedUsers.forEach(element => {
        if(element.id == id){
            console.log("UserCached", element.tag)
            data = element
        }
    });

    return data
}

checkCacheByTag = (tag) => {
    //Check for cached users
    let data = null;
    //TODO: Should not be a foreach
    cachedUsers.forEach(element => {
        if(element.tag == tag){
            console.log("UserCached", element.tag)
            data = element
        }
    });

    return data
}

checkCacheByDID = (DID) => {
    //Check for cached users
    let data = null;
    //TODO: Should not be a foreach
    cachedUsers.forEach(element => {
        if(element.discordID == DID){
            console.log("UserCached", element.tag)
            data = element
        }
    });

    return data
}

async function commandAddQuote(msg, uID) {
    try {
        msg.delete();
        const reg = /"(.*?)"/;
        const matched = msg.cleanContent.match(reg);
        
        let commandString = msg.cleanContent;
        if(!matched){
            console.log("No Valid quote found");
            return;
        }

        let quote = `${matched[1]}`
        commandString = msg.cleanContent.substring(0, matched.index);
        
        let mArgs = getCommandArgs(commandString);
        if (mArgs.length != 1) {
            console.log("Invalid args", mArgs)
            return;
        }

        let userName = mArgs[0].substring(1);

        let filterd = msg.guild.members.filter(member =>{
            return member.displayName == userName;
        })

        if (filterd.size != 1) {
            console.log("No member found with name", userName);
            return;
        }

        let userID = filterd.entries().next().value[0];
        let userTag = filterd.entries().next().value[1].user.tag;
        let mName = filterd.entries().next().value[1].user.username;

        let resp = await repo.getIDByDID(userID)

        let mID = resp.Result;
        if(mID == -1){
            mID = await repo.addUser(userID, mName);
        }

        repo.addQuote( quote, mID, uID, mName)
        .then(resp =>{
            return msg.reply(`Quote added with ID: ${resp.Result}`);
        })
        .then(resp =>{
            resp.delete(5000);
        })

    } catch (error) {
        console.log(error);
    }

}

async function commandRemoveQuote(msg, uID) {
    try {
        msg.delete();
        let mArgs = getCommandArgs(msg.content);
        if (mArgs.length != 1 || isNaN(parseInt(mArgs[0]))) {
            console.log("Invalid args", mArgs)
            return;
        }
        repo.getQuotes()
        .then(resp =>{
            let ids = resp.Result.map(quote =>{
                return quote.ID;
            })

            let valid = ids.includes(parseInt(mArgs[0]));

            if(valid){
               return repo.removeQuote(mArgs[0]);
            }
        })
        .then(resp =>{
            return msg.reply(`Quote removed`);
        })
        .then(resp =>{
            resp.delete(5000);
        })

    } catch (error) {
        console.log(error);
    }

}

//#endregion

//#endregion

//#endregion

