const {Client} = require('pg')

module.exports = class Repo {

    constructor({DbConnection}){
        this.state = {
            "Connected": false,
            "RetryCooldown": Date.now(),
            "ConnectionConfig":{
                "user": DbConnection.user,
                "host": DbConnection.host,
                "database": DbConnection.database,
                "password": DbConnection.password,
                "port": DbConnection.port
            },
            "PingInterval": {}
        }

        this.state.PingInterval = setInterval(async () =>{
            try {
                let resp = await this.ping()
                console.log(resp);
                if(resp.Error !== null || !resp.Result){
                    log("Connection Down. Attempting to open.");
                    let resp = await repo.openConnection();
                    if (resp.Result) {
                        console.log("Connection Established");
                    }else{
                        console.log(resp.Error);
                    }
                }
                
            } catch (error) {
                console.log(error);
            }
        }, 60000)
    };


    //#region DB Connection
     async openConnection(){
        try {
            this.client = new Client({
                user: this.state.ConnectionConfig.user,
                host: this.state.ConnectionConfig.host,
                database: this.state.ConnectionConfig.database,
                password: this.state.ConnectionConfig.password,
                port: this.state.ConnectionConfig.port,
            });
    
            console.log("Attempting Database Connection");

            await this.client.connect();
            await this.ping()
            if (!this.state.Connected) {
                 this.state.RetryCooldown = Date.now() + 300000;
            }else{
                await this.client.query("SET SCHEMA 'public'")
                .then((res, err) => {
                    if (err == null) {
                        console.log("DB Schema set to 'Public'");
                        this.state.Connected = true;
                    }else{
                        throw err;
                    }
                });
            }
            return {"Result": this.state.Connected, "Error": null}
        } catch (error) {
            await this.closeConnection();
            return {"Result": null, "Error": error}
        }
    }

    async ping(){
        try {
            console.log("Ping", new Date().toLocaleTimeString())
            await this.client.query('SELECT NOW()')
            .then((res, err) => {
                if (err == null) {
                    console.log("Ping Successfull");
                    this.state.Connected = true;
                }else{
                    throw err;
                }
            });
            return {"Result": this.state.Connected, "Error": null}
        } catch (error) {
            console.log("Ping Failed");
            console.log(error);
            await this.closeConnection(); 
            return {"Result": null, "Error": error}
        }
    }

    async closeConnection(){
        try {
            await this.client.end()
            .then( () => {this.state.Connected = false; console.log("Database Connection Closed");});
            return {"Result": 1, "Error": null}
        } catch (error) {
            this.state.Connected = false;
            console.log("Error Closing Connection", error);
            return {"Result":-1, "Error": error}
        }
    }
    //#endregion

    async dbGetIDByDID(user){
        try {
            console.log("GetIDByTag", user)
            const resp = await this.client.query(`SELECT * from "GetIDByTag"('${user}')`);
            let id = -1;
            if(resp.rowCount > 0){
               id = parseInt(resp.rows[0].GetIDByTag);
               console.log("UserExists", id)
               return {"Result":id, "Error": null}
            }else{
                return {"Result":id, "Error": "No User Found"}
            }
        } catch (error) {
            await this.closeConnection();
            throw error;
        }
    }

    async dbGetSnailCountByID(id){
        try {
            console.log("CheckForSnailStats", id)
            const resp = await this.client.query(`SELECT * from "GetSnailCountByID"('${id}')`);
            let count = -1;
            if(resp.rowCount > 0){
                count = parseInt(resp.rows[0].GetSnailCountByID);
                console.log("HasStats", count);
            }else{
                console.log("New Farmer");
            }
            return {"Result":count, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        }
    }
    
    async addUser(tag){
        try {
            console.log("addUser")
            const resp = await this.client.query(`SELECT * from "AddUser"('${tag}')`);
            let uID = resp.rows[0].AddUser;

            return {"Result":uID, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 
    }

    async addSnailFarmer(id){
        try {
            console.log("addSnailFarmer", id)
            const resp = await this.client.query(`SELECT * from "AddSnailFarmer"('${id}')`);
            return {"Result":1, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 
    }

    async updateSnails(id, num){
        console.log("updateSnails", id, num)
        try {
            const resp = await this.client.query(`SELECT * from "UpdateSnails"('${id}','${num}')`)
            return {"Result":1, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 
    }

    async dbGetRankByID(id){
        try {
            console.log("GetRankByID", id)
            const resp = await this.client.query(`SELECT * from "GetRankByID"('${id}')`);
            let rank, tag, count;
            if(resp.rowCount > 0){
                count = parseInt(resp.rows[0].snailCount);
                tag = resp.rows[0].UserTag;
                rank = parseInt(resp.rows[0].rnum);
                console.log("Rank",tag, rank, count);
            }else{
                console.log("No Rank");
            }
            
            return {"Result":{"count":count, "tag": tag, "rank":rank}, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 
    }

    async dbGetRanks(){
        try {
            console.log("GetRanks")
            const resp = await this.client.query(`SELECT * from "GetRanks"()`);
            let ranks = [];
            if(resp.rowCount > 0){
                ranks = resp.rows.map(row => {
                    let count = parseInt(row.snailCount);
                    let tag = row.UserTag;
                    let rank = parseInt(row.rnum);
                    return {"count":count, "tag": tag, "rank":rank};
                });
                console.log("Ranks", ranks);
            }else{
                throw "No Ranking Data"
            }

            return {"Result":ranks, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        }
    }

    async getAdminLevelByID(id){
        try {
            console.log("getAdminLevelByID", id)
            const resp = await this.client.query(`SELECT * from "GetAdminLevelByID"('${id}')`);
            let adminLevel = 1;
            if(resp.rowCount > 0){
                adminLevel = parseInt(resp.rows[0].GetAdminLevelByID);
                console.log("AdminLevel",adminLevel);
            }else{
                throw "Failed to retrive admin level"
            }
            
            return {"Result": adminLevel, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 
    }

    async getAdminLevels(){
        try {
            console.log("getAdminLevels")
            const resp = await this.client.query(`SELECT * from "GetAdminLevels"()`);
            if(resp.rowCount = 0){
                throw "No Levels Found";
            }
            
            let adminLevels = [];
            adminLevels = resp.rows.map(row =>{
                return parseInt(row.adminLevel);
            })

            console.log(adminLevels);
            return {"Result": adminLevels, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 
    }

    async add8BallMessage(msg, uID){
        try {
            console.log("add8BallMessage", msg)
            const resp = await this.client.query(`SELECT * from "GetAdminLevels"('${msg}','${uID}')`);
            return {"Result":resp.row[0].GetAdminLevels, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 
    }

    async get8BallMessages(){
        try {
            console.log("get8BallMessages")
            const resp = await this.client.query(`SELECT * from "Get8BallMessages"()`);
            let messages = [];
            if(resp.rowCount > 0){
                messages = resp.rows.map(row => {
                    return row.message;
                });
                console.log("Ranks", messages);
            }else{
                return {"Result":null, "Error": "No Messages"}
            }

            return {"Result":messages, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        }
    }

    async updateAdminLevel(id, level){
        console.log("updateAdminLevel", id, level)
        try {
            const resp = await this.client.query(`SELECT * from "UpdateAdminLevel"('${id}','${level}')`)
            return {"Result":1, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 

    }

    async getQuotes(){
        console.log("GetQuotes")
        try {
            const resp = await this.client.query(`SELECT * from "GetQuotes"()`)
            let quotes = resp.rows.map( row =>{
                return {
                    "ID": row.quoteID,
                    "User": row.attributedTo,
                    "Quote": row.quoteText
                }
            })

            return {"Result":quotes, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 

    }

    async getQuoteByID(id){
        console.log("GetQuoteByID")
        try {
            const resp = await this.client.query(`SELECT * from "GetQuoteByID"(${id})`)
            if(!(resp.rowCount > 0)){
                return {"Result":-1, "Error":`No quote found with id: ${id}`}
            }else{
                let id = resp.rows[0].quoteID;
                let user = resp.rows[0].attributedTo;
                let quote = resp.rows[0].quoteText;
                return {"Result":{ "ID": id, "User":user, "Quote":quote}, "Error": null}

            }
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 

    }

    async addQuote(user, quote, uID){
        console.log("AddQuote", user, quote)
        try {
            const resp = await this.client.query(`SELECT * from "AddQuote"('${user}','${quote}','${uID}')`)
            return {"Result":resp.rows[0].AddQuote, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 

    }

    async removeQuote(id){
        console.log("RemoveQuote", id)
        try {
            const resp = await this.client.query(`SELECT * from "RemoveQuote"('${id}')`)
            return {"Result":1, "Error": null}
        } catch (error) {
            await this.closeConnection(); 
            throw error;
        } 

    }
    //#endregion

}